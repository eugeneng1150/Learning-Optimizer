"use client";

import { useEffect, useState, useTransition } from "react";

import { DashboardSnapshot } from "@/lib/app";
import { GraphCanvas } from "@/components/graph-canvas";
import { IntakePanel } from "@/components/intake-panel";
import { ConceptPanel } from "@/components/concept-panel";
import { StudyQueue } from "@/components/study-queue";
import { QuizPanel } from "@/components/quiz-panel";
import { ReminderPanel } from "@/components/reminder-panel";
import { FamiliarityStage } from "@/components/familiarity-stage";
import { SourceCreationResult } from "@/lib/types";

interface DashboardShellProps {
  initialSnapshot: DashboardSnapshot;
}

type StageId = "upload" | "map" | "familiarity" | "quiz" | "review";

const STAGES: Array<{
  id: StageId;
  label: string;
  kicker: string;
  description: string;
}> = [
  {
    id: "upload",
    label: "Upload",
    kicker: "Stage 1",
    description: "Add notes and generate the first study map."
  },
  {
    id: "map",
    label: "Map",
    kicker: "Stage 2",
    description: "Check the concept structure before moving forward."
  },
  {
    id: "familiarity",
    label: "Familiarity",
    kicker: "Stage 3",
    description: "Mark what feels weak, partial, or already solid."
  },
  {
    id: "quiz",
    label: "Quiz",
    kicker: "Stage 4",
    description: "Test recall against the current map."
  },
  {
    id: "review",
    label: "Review",
    kicker: "Stage 5",
    description: "Keep momentum with the due queue and reminders."
  }
];

export function DashboardShell({ initialSnapshot }: DashboardShellProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeStage, setActiveStage] = useState<StageId>(() => getInitialStage(initialSnapshot));
  const [selectedConceptId, setSelectedConceptId] = useState(initialSnapshot.graph.nodes[0]?.id);
  const [lastAction, setLastAction] = useState<string | null>(
    initialSnapshot.graph.nodes.length ? "Notes are already processed. Start from the mindmap." : null
  );
  const [lastIngestionResult, setLastIngestionResult] = useState<SourceCreationResult | null>(null);
  const [ratedConceptIds, setRatedConceptIds] = useState<Set<string>>(
    () => new Set(initialSnapshot.conceptRecords.filter((concept) => concept.status !== "active").map((concept) => concept.id))
  );
  const [isRefreshing, startTransition] = useTransition();

  const selectedConcept = snapshot.conceptRecords.find((concept) => concept.id === selectedConceptId);
  const selectedFamiliarity = snapshot.conceptFamiliarities.find((record) => record.conceptId === selectedConceptId);
  const relatedEdges = snapshot.edgeRecords.filter(
    (edge) => edge.sourceConceptId === selectedConceptId || edge.targetConceptId === selectedConceptId
  );
  const hasSources = snapshot.sources.length > 0;
  const hasMap = snapshot.graph.nodes.length > 0;
  const ratedCount = snapshot.conceptRecords.filter((concept) => ratedConceptIds.has(concept.id)).length;
  const currentStage = STAGES.find((stage) => stage.id === activeStage)!;
  const activeStageIndex = STAGES.findIndex((stage) => stage.id === activeStage);
  const highPriorityCount = snapshot.conceptRecords.filter((concept) => concept.status === "confusing").length;
  const comfortableCount = snapshot.conceptRecords.filter((concept) => concept.status === "mastered").length;
  const completedStageCount = countCompletedStages(snapshot, hasMap, ratedCount);
  const progressPercent = Math.max(20, Math.round((completedStageCount / STAGES.length) * 100));
  const stageFacts = getStageFacts(activeStage, snapshot, ratedCount, highPriorityCount, comfortableCount);

  async function refreshSnapshot() {
    const response = await fetch("/api/dashboard");
    const data = (await response.json()) as DashboardSnapshot;
    setSnapshot(data);
  }

  async function handleGenerateQuiz(conceptIds?: string[]) {
    const response = await fetch("/api/quizzes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptIds })
    });
    const quizzes = (await response.json()) as DashboardSnapshot["quizzes"];
    setSnapshot((current) => ({
      ...current,
      quizzes
    }));
    await refreshSnapshot();
    setLastAction(
      conceptIds?.length
        ? "Generated a quiz round for a focused concept."
        : "Generated a fresh quiz set from the current concept map."
    );
    setActiveStage("quiz");
  }

  function refreshInTransition() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        await refreshSnapshot();
        resolve();
      });
    });
  }

  useEffect(() => {
    if (selectedConceptId && snapshot.graph.nodes.some((node) => node.id === selectedConceptId)) {
      return;
    }

    setSelectedConceptId(snapshot.graph.nodes[0]?.id);
  }, [selectedConceptId, snapshot.graph.nodes]);

  useEffect(() => {
    setRatedConceptIds((current) => {
      const validIds = new Set(snapshot.conceptRecords.map((concept) => concept.id));
      const next = new Set(Array.from(current).filter((conceptId) => validIds.has(conceptId)));

      snapshot.conceptRecords.forEach((concept) => {
        if (concept.status !== "active") {
          next.add(concept.id);
        }
      });

      return next;
    });
  }, [snapshot.conceptRecords]);

  async function handleRateConcept(conceptId: string, status: "active" | "confusing" | "mastered") {
    const response = await fetch(`/api/concepts/${conceptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      setLastAction("Familiarity update failed.");
      return;
    }

    setRatedConceptIds((current) => {
      const next = new Set(current);
      next.add(conceptId);
      return next;
    });
    setLastAction("Familiarity triage saved. Continue when the map looks right.");
    await refreshInTransition();
  }

  function handleOpenStage(stageId: StageId) {
    if (!isStageAvailable(stageId, hasSources, hasMap)) {
      return;
    }

    setActiveStage(stageId);
  }

  function handleSourceCreated(result: SourceCreationResult) {
    setLastIngestionResult(result);
    setLastAction(describeSourceCreation(result));
    setActiveStage("map");
  }

  const stageCards = STAGES.map((stage, index) => ({
    ...stage,
    index,
    available: isStageAvailable(stage.id, hasSources, hasMap),
    badge: getStageBadge(stage.id, snapshot, ratedCount),
    current: stage.id === activeStage
  }));

  return (
    <main className="page-shell">
      <section className="hero guided-hero hero-compact">
        <div className="hero-main">
          <p className="eyebrow">Learning Optimizer</p>
          <div className="hero-heading-row">
            <h1>Study one step at a time.</h1>
            <span className="panel-badge">{currentStage.kicker}</span>
          </div>
          <p className="hero-copy">
            Keep one clear task on screen: add notes, check the map, rate confidence, test recall, then return to
            review.
          </p>
          <div className="hero-progress">
            <div className="hero-progress-label">
              <strong>{completedStageCount}/5 stages active</strong>
              <span>{currentStage.kicker} is open now</span>
            </div>
            <div className="hero-progress-track" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="hero-message">
            <strong>{currentStage.label}</strong>
            <span>{lastAction ?? currentStage.description}</span>
          </div>
          <div className="hero-actions">
            {activeStage === "upload" && hasMap ? (
              <button className="action-button" type="button" onClick={() => handleOpenStage("map")}>
                Open mindmap
              </button>
            ) : null}
            {activeStage === "map" ? (
              <button className="action-button" type="button" onClick={() => handleOpenStage("familiarity")}>
                Continue to familiarity
              </button>
            ) : null}
            {activeStage === "familiarity" ? (
              <button className="action-button" type="button" onClick={() => handleOpenStage("quiz")}>
                Continue to quiz
              </button>
            ) : null}
            {activeStage === "quiz" ? (
              <button className="action-button" type="button" onClick={() => handleOpenStage("review")}>
                Continue to review
              </button>
            ) : null}
            {activeStage === "review" ? (
              <button className="action-button" type="button" onClick={() => handleGenerateQuiz()}>
                Build mixed quiz
              </button>
            ) : null}
            {activeStage !== "upload" ? (
              <button className="ghost-button" type="button" onClick={() => handleOpenStage("upload")}>
                Add more notes
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="stage-rail" aria-label="Guided stages">
        {stageCards.map((stage) => (
          <button
            key={stage.id}
            className={`stage-button ${stage.current ? "stage-button-active" : ""} ${
              stage.index < activeStageIndex ? "stage-button-complete" : ""
            }`}
            type="button"
            disabled={!stage.available}
            onClick={() => handleOpenStage(stage.id)}
          >
            <span className="stage-step">0{stage.index + 1}</span>
            <span className="stage-text">
              <strong>{stage.label}</strong>
              <span>{stage.badge}</span>
            </span>
          </button>
        ))}
      </section>

      <section className="panel stage-focus">
        <div>
          <p className="eyebrow">{currentStage.kicker}</p>
          <h2>{currentStage.label}</h2>
          <p className="stage-copy">{currentStage.description}</p>
        </div>
        <ul className="fact-row">
          {stageFacts.map((fact) => (
            <li key={fact.label}>
              <strong>{fact.value}</strong>
              <span>{fact.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {activeStage === "upload" ? (
        <section className="single-column guided-stage-grid">
          <IntakePanel modules={snapshot.modules} onMutate={refreshInTransition} onSourceCreated={handleSourceCreated} />
          <section className="panel stage-support">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Ready so far</p>
                <h2>Subjects in focus</h2>
              </div>
              <span className="panel-badge">{snapshot.sources.length} uploads</span>
            </div>
            <ul className="compact-list">
              {snapshot.modules.length ? (
                snapshot.modules.map((moduleRecord) => (
                  <li key={moduleRecord.id}>
                    <strong>{moduleRecord.code ? `${moduleRecord.code} · ` : ""}{moduleRecord.title}</strong>
                    <span>{moduleRecord.description}</span>
                  </li>
                ))
              ) : (
                <li>
                  <strong>No subjects yet</strong>
                  <span>Create the first subject, then upload notes to unlock the map.</span>
                </li>
              )}
            </ul>
          </section>
        </section>
      ) : null}

      {activeStage === "map" ? (
        <section className="single-column guided-stage-grid">
          {selectedConcept ? (
            <section className="panel selection-summary">
              <div>
                <p className="eyebrow">Selected concept</p>
                <h2>{selectedConcept.title}</h2>
                <p className="stage-copy">{selectedConcept.summary}</p>
              </div>
              <ul className="fact-row">
                <li>
                  <strong>{relatedEdges.length}</strong>
                  <span>connected links</span>
                </li>
                <li>
                  <strong>{selectedConcept.evidenceRefs.length}</strong>
                  <span>evidence refs</span>
                </li>
                <li>
                  <strong>{selectedConcept.moduleIds.length}</strong>
                  <span>subjects</span>
                </li>
              </ul>
            </section>
          ) : null}
          <GraphCanvas
            nodes={snapshot.graph.nodes}
            edges={snapshot.graph.edges}
            selectedConceptId={selectedConceptId}
            onSelectConcept={setSelectedConceptId}
          />
          {lastIngestionResult ? (
            <section className="panel stage-support">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Latest ingest</p>
                  <h2>{lastIngestionResult.source.title}</h2>
                </div>
                <span
                  className={`status-pill ${lastIngestionResult.fallbackReason ? "status-confusing" : "status-active"}`}
                >
                  {lastIngestionResult.processor === "gemini" ? "Gemini" : "Heuristic"}
                </span>
              </div>
              <p className="muted">
                {lastIngestionResult.conceptCount} concepts and {lastIngestionResult.edgeCount} links were added from
                the last upload.
              </p>
              {lastIngestionResult.fallbackReason ? <p className="status-text">{lastIngestionResult.fallbackReason}</p> : null}
            </section>
          ) : null}
          <ConceptPanel
            concept={selectedConcept}
            modules={snapshot.modules}
            relatedEdges={relatedEdges}
            onMutate={refreshInTransition}
          />
        </section>
      ) : null}

      {activeStage === "familiarity" ? (
        <section className="single-column guided-stage-grid">
          <FamiliarityStage
            concepts={snapshot.conceptRecords}
            ratedCount={ratedCount}
            selectedConceptId={selectedConceptId}
            onContinue={() => handleOpenStage("quiz")}
            onOpenMap={() => handleOpenStage("map")}
            onRate={handleRateConcept}
            onSelectConcept={setSelectedConceptId}
          />
          <ConceptPanel
            concept={selectedConcept}
            familiarityRating={selectedFamiliarity?.rating}
            modules={snapshot.modules}
            relatedEdges={relatedEdges}
            onMutate={refreshInTransition}
          />
        </section>
      ) : null}

      {activeStage === "quiz" ? (
        <section className="single-column guided-stage-grid">
          <QuizPanel
            quizzes={snapshot.quizzes}
            onGenerateQuiz={() => handleGenerateQuiz()}
            onRefresh={refreshInTransition}
          />
          <section className="panel stage-support">
            <div className="panel-header">
              <div>
                <p className="eyebrow">After this round</p>
                <h2>Carry weak concepts into review</h2>
              </div>
              <span className="panel-badge">{snapshot.due.length} due</span>
            </div>
            <ul className="compact-list">
              <li>
                <strong>{highPriorityCount} concepts still need work</strong>
                <span>These are the best targets for the next focused review cycle.</span>
              </li>
              <li>
                <strong>{snapshot.quizzes.length} prompts are ready</strong>
                <span>Regenerate if this set feels stale, then move into the review queue.</span>
              </li>
            </ul>
          </section>
        </section>
      ) : null}

      {activeStage === "review" ? (
        <section className="single-column guided-stage-grid">
          <StudyQueue due={snapshot.due} onGenerateQuiz={handleGenerateQuiz} />
          <ReminderPanel reminders={snapshot.reminders} initialSettings={snapshot.reminderSettings} />
        </section>
      ) : null}

      <footer className="footer-note">
        <span>
          {isRefreshing ? "Refreshing data..." : "Work forward through the flow, then loop back only when you add more notes."}
        </span>
      </footer>
    </main>
  );
}

function getInitialStage(snapshot: DashboardSnapshot): StageId {
  if (snapshot.graph.nodes.length) {
    return "map";
  }

  return "upload";
}

function isStageAvailable(stageId: StageId, hasSources: boolean, hasMap: boolean) {
  switch (stageId) {
    case "upload":
      return true;
    case "map":
      return hasSources || hasMap;
    case "familiarity":
    case "quiz":
    case "review":
      return hasMap;
    default:
      return false;
  }
}

function getStageBadge(stageId: StageId, snapshot: DashboardSnapshot, ratedCount: number) {
  switch (stageId) {
    case "upload":
      return snapshot.sources.length ? `${snapshot.sources.length} processed` : "Start here";
    case "map":
      return snapshot.graph.nodes.length ? `${snapshot.graph.nodes.length} concepts` : "Waiting";
    case "familiarity":
      return snapshot.graph.nodes.length ? `${ratedCount}/${snapshot.conceptRecords.length} triaged` : "Waiting";
    case "quiz":
      return snapshot.quizzes.length ? `${snapshot.quizzes.length} prompts` : "Waiting";
    case "review":
      return snapshot.due.length ? `${snapshot.due.length} due` : "Monitor queue";
    default:
      return "Waiting";
  }
}

function countCompletedStages(snapshot: DashboardSnapshot, hasMap: boolean, ratedCount: number) {
  let count = 0;

  if (snapshot.sources.length) {
    count += 1;
  }

  if (hasMap) {
    count += 1;
  }

  if (ratedCount) {
    count += 1;
  }

  if (snapshot.quizzes.length) {
    count += 1;
  }

  if (snapshot.due.length) {
    count += 1;
  }

  return count;
}

function describeSourceCreation(result: SourceCreationResult) {
  const processorLabel = result.processor === "gemini" ? "Gemini" : "heuristic extraction";
  const base = `${result.conceptCount} concepts and ${result.edgeCount} links added with ${processorLabel}.`;

  if (result.fallbackReason) {
    return `${base} ${result.fallbackReason}`;
  }

  return base;
}

function getStageFacts(
  stageId: StageId,
  snapshot: DashboardSnapshot,
  ratedCount: number,
  highPriorityCount: number,
  comfortableCount: number
) {
  switch (stageId) {
    case "upload":
      return [
        { label: "subjects", value: snapshot.modules.length },
        { label: "uploads", value: snapshot.sources.length },
        { label: "next screen", value: "mindmap" }
      ];
    case "map":
      return [
        { label: "concepts", value: snapshot.graph.nodes.length },
        { label: "links", value: snapshot.edgeRecords.length },
        { label: "selected", value: snapshot.graph.nodes.length ? "inspect a node" : "waiting" }
      ];
    case "familiarity":
      return [
        { label: "triaged", value: `${ratedCount}/${snapshot.conceptRecords.length}` },
        { label: "need work", value: highPriorityCount },
        { label: "comfortable", value: comfortableCount }
      ];
    case "quiz":
      return [
        { label: "prompts", value: snapshot.quizzes.length },
        { label: "due after quiz", value: snapshot.due.length },
        { label: "focus", value: highPriorityCount }
      ];
    case "review":
      return [
        { label: "due now", value: snapshot.due.length },
        { label: "reminder jobs", value: snapshot.reminders.length },
        { label: "comfortable", value: comfortableCount }
      ];
    default:
      return [];
  }
}
