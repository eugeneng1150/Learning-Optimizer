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
    description: "Create a subject, add notes, and trigger processing."
  },
  {
    id: "map",
    label: "Map",
    kicker: "Stage 2",
    description: "Inspect the generated mindmap before acting on it."
  },
  {
    id: "familiarity",
    label: "Familiarity",
    kicker: "Stage 3",
    description: "Tag weak versus comfortable concepts before quiz generation."
  },
  {
    id: "quiz",
    label: "Quiz",
    kicker: "Stage 4",
    description: "Run a focused recall round from the concept map."
  },
  {
    id: "review",
    label: "Review",
    kicker: "Stage 5",
    description: "Work the due queue and keep reminder cadence visible."
  }
];

export function DashboardShell({ initialSnapshot }: DashboardShellProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeStage, setActiveStage] = useState<StageId>(() => getInitialStage(initialSnapshot));
  const [selectedConceptId, setSelectedConceptId] = useState(initialSnapshot.graph.nodes[0]?.id);
  const [lastAction, setLastAction] = useState<string | null>(
    initialSnapshot.graph.nodes.length ? "Notes are already processed. Start from the mindmap." : null
  );
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
  const highPriorityCount = snapshot.conceptRecords.filter((concept) => concept.status === "confusing").length;
  const comfortableCount = snapshot.conceptRecords.filter((concept) => concept.status === "mastered").length;

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

  function handleSourceCreated() {
    setLastAction("Notes processed. The guided flow lands on the mindmap first.");
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
      <section className="hero guided-hero">
        <div>
          <p className="eyebrow">Learning optimizer</p>
          <h1>Upload notes, verify the map, then move through recall in order.</h1>
          <p className="hero-copy">
            The shell is now staged around one guided path: process notes, inspect the mindmap, sweep familiarity,
            quiz, and continue review.
          </p>
          <div className="hero-message">
            <strong>{currentStage.label}</strong>
            <span>{lastAction ?? currentStage.description}</span>
          </div>
        </div>
        <div className="hero-metrics">
          <article>
            <strong>{snapshot.modules.length}</strong>
            <span>subjects</span>
          </article>
          <article>
            <strong>{snapshot.graph.nodes.length}</strong>
            <span>mapped concepts</span>
          </article>
          <article>
            <strong>{ratedCount}</strong>
            <span>familiarity triaged</span>
          </article>
          <article>
            <strong>{snapshot.due.length}</strong>
            <span>due now</span>
          </article>
        </div>
      </section>

      <section className="stage-rail" aria-label="Guided stages">
        {stageCards.map((stage) => (
          <button
            key={stage.id}
            className={`stage-button ${stage.current ? "stage-button-active" : ""}`}
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

      <section className="panel stage-overview">
        <div>
          <p className="eyebrow">{currentStage.kicker}</p>
          <h2>{currentStage.label}</h2>
          <p className="stage-copy">{currentStage.description}</p>
        </div>
        <div className="stage-overview-metrics">
          <article>
            <strong>{highPriorityCount}</strong>
            <span>need work</span>
          </article>
          <article>
            <strong>{comfortableCount}</strong>
            <span>comfortable</span>
          </article>
          <article>
            <strong>{snapshot.quizzes.length}</strong>
            <span>quiz prompts</span>
          </article>
        </div>
      </section>

      {activeStage === "upload" ? (
        <section className="dashboard-grid guided-stage-grid">
          <div className="main-column">
            <section className="panel stage-brief">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">What happens here</p>
                  <h2>Get to the first useful screen quickly</h2>
                </div>
              </div>
              <ul className="compact-list">
                <li>
                  <strong>Create or pick a subject</strong>
                  <span>Subjects organize uploads, concepts, and later review overlap.</span>
                </li>
                <li>
                  <strong>Paste notes or load a text file</strong>
                  <span>The current branch still supports browser-loaded `.txt` and `.md` content only.</span>
                </li>
                <li>
                  <strong>Process notes into the mindmap</strong>
                  <span>Successful processing routes the shell straight to Map instead of leaving you on Upload.</span>
                </li>
              </ul>
            </section>
            <IntakePanel modules={snapshot.modules} onMutate={refreshInTransition} onSourceCreated={handleSourceCreated} />
          </div>
          <div className="side-column">
            <section className="panel stage-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Current readiness</p>
                  <h2>Before processing</h2>
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
                    <span>Create the first subject, then process notes to unlock the map.</span>
                  </li>
                )}
              </ul>
              <div className="stage-actions">
                <button
                  className="action-button"
                  type="button"
                  disabled={!hasMap}
                  onClick={() => handleOpenStage("map")}
                >
                  Open mindmap
                </button>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeStage === "map" ? (
        <section className="dashboard-grid guided-stage-grid">
          <div className="main-column">
            <GraphCanvas
              nodes={snapshot.graph.nodes}
              edges={snapshot.graph.edges}
              selectedConceptId={selectedConceptId}
              onSelectConcept={setSelectedConceptId}
            />
          </div>
          <div className="side-column">
            <section className="panel stage-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Next move</p>
                  <h2>Verify the structure, then triage familiarity</h2>
                </div>
                <span className="panel-badge">{snapshot.edgeRecords.length} links</span>
              </div>
              <p className="muted">
                This stage is the first success state after note processing. Confirm the generated concepts and open the
                familiarity pass once the map looks credible.
              </p>
              <div className="stage-actions">
                <button
                  className="action-button"
                  type="button"
                  disabled={!hasMap}
                  onClick={() => handleOpenStage("familiarity")}
                >
                  Continue to familiarity
                </button>
              </div>
            </section>
            <ConceptPanel
              concept={selectedConcept}
              modules={snapshot.modules}
              relatedEdges={relatedEdges}
              onMutate={refreshInTransition}
            />
          </div>
        </section>
      ) : null}

      {activeStage === "familiarity" ? (
        <section className="dashboard-grid guided-stage-grid">
          <div className="main-column">
            <FamiliarityStage
              concepts={snapshot.conceptRecords}
              ratedCount={ratedCount}
              selectedConceptId={selectedConceptId}
              onContinue={() => handleOpenStage("quiz")}
              onOpenMap={() => handleOpenStage("map")}
              onRate={handleRateConcept}
              onSelectConcept={setSelectedConceptId}
            />
          </div>
          <div className="side-column">
            <ConceptPanel
              concept={selectedConcept}
              familiarityRating={selectedFamiliarity?.rating}
              modules={snapshot.modules}
              relatedEdges={relatedEdges}
              onMutate={refreshInTransition}
            />
          </div>
        </section>
      ) : null}

      {activeStage === "quiz" ? (
        <section className="dashboard-grid guided-stage-grid">
          <div className="main-column">
            <QuizPanel
              quizzes={snapshot.quizzes}
              onGenerateQuiz={() => handleGenerateQuiz()}
              onRefresh={refreshInTransition}
            />
          </div>
          <div className="side-column">
            <section className="panel stage-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">After this round</p>
                  <h2>Push weak concepts into review</h2>
                </div>
                <span className="panel-badge">{snapshot.due.length} due</span>
              </div>
              <ul className="compact-list">
                <li>
                  <strong>{highPriorityCount} concepts tagged as weak</strong>
                  <span>These are the best candidates for targeted quiz regeneration or review follow-up.</span>
                </li>
                <li>
                  <strong>{snapshot.quizzes.length} prompts available</strong>
                  <span>Regenerate if the current set is stale, then move into the review queue.</span>
                </li>
              </ul>
              <div className="stage-actions">
                <button className="action-button" type="button" onClick={() => handleOpenStage("review")}>
                  Continue to review
                </button>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeStage === "review" ? (
        <section className="two-column-section">
          <div className="stack">
            <section className="panel stage-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Close the loop</p>
                  <h2>Run review based on what is due now</h2>
                </div>
                <span className="panel-badge">{snapshot.reminders.length} reminder jobs</span>
              </div>
              <p className="muted">
                Review keeps the guided flow alive after the first quiz pass. Pull a mixed quiz set from the due queue
                whenever you want another testing round.
              </p>
              <div className="stage-actions">
                <button className="action-button" type="button" onClick={() => handleGenerateQuiz()}>
                  Build mixed quiz
                </button>
              </div>
            </section>
            <StudyQueue due={snapshot.due} onGenerateQuiz={handleGenerateQuiz} />
          </div>
          <ReminderPanel reminders={snapshot.reminders} initialSettings={snapshot.reminderSettings} />
        </section>
      ) : null}

      <footer className="footer-note">
        <span>
          {isRefreshing
            ? "Refreshing data..."
            : "Guided shell active. Work forward from upload to map, familiarity, quiz, and review."}
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
