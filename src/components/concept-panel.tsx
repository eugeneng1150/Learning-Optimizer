"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";

import { ConceptEdgeRecord, ConceptRecord, ModuleRecord } from "@/lib/types";

interface ConceptPanelProps {
  concept?: ConceptRecord;
  modules: ModuleRecord[];
  relatedEdges: ConceptEdgeRecord[];
  onMutate: () => Promise<void>;
}

export function ConceptPanel({ concept, modules, relatedEdges, onMutate }: ConceptPanelProps) {
  const [title, setTitle] = useState(concept?.title ?? "");
  const [summary, setSummary] = useState(concept?.summary ?? "");
  const [status, setStatus] = useState<ConceptRecord["status"]>(concept?.status ?? "active");
  const [isPending, startTransition] = useTransition();
  const [similarModules, setSimilarModules] = useState<Array<{ moduleId: string; title: string; score: number; reasons: string[] }>>([]);

  useEffect(() => {
    setTitle(concept?.title ?? "");
    setSummary(concept?.summary ?? "");
    setStatus(concept?.status ?? "active");
  }, [concept]);

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
          status
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
