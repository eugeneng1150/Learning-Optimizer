"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";

import { ConceptEdgeRecord, ConceptRecord, FamiliarityRating, ModuleRecord, RetrievalAnswer } from "@/lib/types";

interface ConceptPanelProps {
  concept?: ConceptRecord;
  familiarityRating?: FamiliarityRating;
  modules: ModuleRecord[];
  relatedEdges: ConceptEdgeRecord[];
  onMutate: () => Promise<void>;
}

const familiarityOptions: Array<{ value: FamiliarityRating; label: string }> = [
  { value: 1, label: "1 - New" },
  { value: 2, label: "2 - Rough" },
  { value: 3, label: "3 - Partial" },
  { value: 4, label: "4 - Solid" },
  { value: 5, label: "5 - Fluent" }
];

export function ConceptPanel({ concept, familiarityRating, modules, relatedEdges, onMutate }: ConceptPanelProps) {
  const [title, setTitle] = useState(concept?.title ?? "");
  const [summary, setSummary] = useState(concept?.summary ?? "");
  const [status, setStatus] = useState<ConceptRecord["status"]>(concept?.status ?? "active");
  const [familiarity, setFamiliarity] = useState<FamiliarityRating | "">(familiarityRating ?? "");
  const [isPending, startTransition] = useTransition();
  const [isQueryPending, startQueryTransition] = useTransition();
  const [similarModules, setSimilarModules] = useState<Array<{ moduleId: string; title: string; score: number; reasons: string[] }>>([]);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResult, setRagResult] = useState<RetrievalAnswer | null>(null);

  useEffect(() => {
    setTitle(concept?.title ?? "");
    setSummary(concept?.summary ?? "");
    setStatus(concept?.status ?? "active");
    setFamiliarity(familiarityRating ?? "");
    setRagQuery("");
    setRagResult(null);
  }, [concept, familiarityRating]);

  useEffect(() => {
    async function loadSimilarity() {
      if (!concept?.moduleIds[0]) {
        setSimilarModules([]);
        return;
      }

      const response = await fetch(`/api/modules/${concept.moduleIds[0]}/similar`);
      if (!response.ok) {
        setSimilarModules([]);
        return;
      }

      const data = (await response.json()) as Array<{ moduleId: string; title: string; score: number; reasons: string[] }>;
      setSimilarModules(data);
    }

    void loadSimilarity();
  }, [concept]);

  if (!concept) {
    return (
      <aside className="panel detail-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Concept detail</p>
            <h2>Select a node</h2>
          </div>
        </div>
        <p className="muted">
          Pick any concept from the graph to inspect grounded evidence, similar modules, and the study status used by
          the review scheduler.
        </p>
      </aside>
    );
  }

  const conceptId = concept.id;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      await fetch(`/api/concepts/${conceptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          status,
          familiarityRating: familiarity || undefined
        })
      });

      await onMutate();
    });
  }

  async function handlePinEdge(edgeId: string, pinned: boolean) {
    startTransition(async () => {
      await fetch(`/api/edges/${edgeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned })
      });

      await onMutate();
    });
  }

  async function handleAskEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ragQuery.trim()) {
      return;
    }

    startQueryTransition(async () => {
      const response = await fetch(`/api/concepts/${conceptId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragQuery })
      });

      const data = (await response.json()) as RetrievalAnswer | { error?: string };
      if (!response.ok) {
        setRagResult({
          query: ragQuery,
          answer: data && "error" in data ? data.error ?? "Evidence lookup failed." : "Evidence lookup failed.",
          matches: [],
          processor: "heuristic"
        });
        return;
      }

      setRagResult(data as RetrievalAnswer);
    });
  }

  return (
    <aside className="panel detail-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Concept detail</p>
          <h2>{concept.title}</h2>
        </div>
        <span className={`status-pill status-${concept.status}`}>{concept.status}</span>
      </div>

      <form className="form-grid" onSubmit={handleSave}>
        <label className="full-width">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="full-width">
          Summary
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={5} />
        </label>
        <label className="full-width">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as ConceptRecord["status"])}>
            <option value="active">active</option>
            <option value="confusing">confusing</option>
            <option value="mastered">mastered</option>
          </select>
        </label>
        <label className="full-width">
          Familiarity
          <select
            value={familiarity}
            onChange={(event) =>
              setFamiliarity(event.target.value ? (Number(event.target.value) as FamiliarityRating) : "")
            }
          >
            <option value="">Rate this concept</option>
            {familiarityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small>Lower ratings stay closer to the review queue. Higher ratings push review and default quizzes later.</small>
        </label>
        <button className="action-button" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save concept"}
        </button>
      </form>

      <div className="subpanel">
        <h3>Evidence</h3>
        <ul className="compact-list">
          {concept.evidenceRefs.map((ref) => (
            <li key={ref.id}>
              <strong>{ref.sourceId}</strong>
              <span>{ref.excerpt}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="subpanel">
        <h3>Ask These Notes</h3>
        <form className="form-grid" onSubmit={handleAskEvidence}>
          <label className="full-width">
            Grounded question
            <textarea
              value={ragQuery}
              onChange={(event) => setRagQuery(event.target.value)}
              rows={3}
              placeholder={`Ask something specific about ${concept.title.toLowerCase()}`}
            />
          </label>
          <button className="ghost-button" type="submit" disabled={isQueryPending || !ragQuery.trim()}>
            {isQueryPending ? "Searching notes..." : "Search notes"}
          </button>
        </form>

        {ragResult ? (
          <div className="compact-list">
            <div>
              <strong>{ragResult.processor === "gemini" ? "Gemini-grounded answer" : "Retrieved note answer"}</strong>
              <span>{ragResult.answer}</span>
            </div>
            {ragResult.fallbackReason ? (
              <div>
                <strong>Fallback</strong>
                <span>{ragResult.fallbackReason}</span>
              </div>
            ) : null}
            <div>
              <strong>Retrieved evidence</strong>
              <ul className="compact-list">
                {ragResult.matches.map((match) => (
                  <li key={match.chunkId}>
                    <strong>
                      {match.sourceId} · {Math.round(match.score * 100)}%
                    </strong>
                    <span>{match.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="muted">Ask a question and the app will retrieve the most relevant chunks for this concept.</p>
        )}
      </div>

      <div className="subpanel">
        <h3>Modules</h3>
        <ul className="compact-list">
          {concept.moduleIds.map((moduleId) => {
            const moduleRecord = modules.find((item) => item.id === moduleId);
            return <li key={moduleId}>{moduleRecord?.title ?? moduleId}</li>;
          })}
        </ul>
      </div>

      <div className="subpanel">
        <h3>Connected edges</h3>
        <ul className="compact-list">
          {relatedEdges.slice(0, 6).map((edge) => (
            <li key={edge.id}>
              <span>
                {edge.type} · weight {edge.weight}
              </span>
              <button className="ghost-button" type="button" onClick={() => handlePinEdge(edge.id, edge.pinned)}>
                {edge.pinned ? "Unpin" : "Pin"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="subpanel">
        <h3>Cross-module similarity</h3>
        <ul className="compact-list">
          {similarModules.length ? (
            similarModules.map((moduleRecord) => (
              <li key={moduleRecord.moduleId}>
                <span>
                  {moduleRecord.title} · {Math.round(moduleRecord.score * 100)}%
                </span>
                <span>{moduleRecord.reasons.join(", ")}</span>
              </li>
            ))
          ) : (
            <li>No other modules overlap yet.</li>
          )}
        </ul>
      </div>
    </aside>
  );
}
