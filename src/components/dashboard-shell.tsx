"use client";

import { useEffect, useState, useTransition } from "react";

import { DashboardSnapshot } from "@/lib/app";
import { GraphCanvas } from "@/components/graph-canvas";
import { IntakePanel } from "@/components/intake-panel";
import { ConceptPanel } from "@/components/concept-panel";
import { StudyQueue } from "@/components/study-queue";
import { QuizPanel } from "@/components/quiz-panel";
import { ReminderPanel } from "@/components/reminder-panel";

interface DashboardShellProps {
  initialSnapshot: DashboardSnapshot;
}

type WorkspaceView = "home" | "graph" | "study" | "quizzes" | "ingest";

const NAV_ITEMS: Array<{ id: WorkspaceView; label: string }> = [
  { id: "home", label: "Dashboard" },
  { id: "graph", label: "Graph" },
  { id: "study", label: "Study" },
  { id: "quizzes", label: "Quizzes" },
  { id: "ingest", label: "Ingest" }
];

export function DashboardShell({ initialSnapshot }: DashboardShellProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeView, setActiveView] = useState<WorkspaceView>("home");
  const [selectedConceptId, setSelectedConceptId] = useState(initialSnapshot.graph.nodes[0]?.id);
  const [isRefreshing, startTransition] = useTransition();

  const selectedConcept = snapshot.conceptRecords.find((concept) => concept.id === selectedConceptId);
  const selectedFamiliarity = snapshot.conceptFamiliarities.find((record) => record.conceptId === selectedConceptId);
  const relatedEdges = snapshot.edgeRecords.filter(
    (edge) => edge.sourceConceptId === selectedConceptId || edge.targetConceptId === selectedConceptId
  );

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
    setActiveView("quizzes");
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
    if (!selectedConceptId && snapshot.graph.nodes[0]) {
      setSelectedConceptId(snapshot.graph.nodes[0].id);
    }
  }, [selectedConceptId, snapshot.graph.nodes]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Learning optimizer</p>
          <h1>Turn scattered study material into an AI concept graph with review pressure built in.</h1>
          <p className="hero-copy">
            Ingest modules and notes, inspect evidence-backed links across subjects, and keep recall alive with spaced
            review and mixed-concept testing.
          </p>
        </div>
        <div className="hero-metrics">
          <article>
            <strong>{snapshot.modules.length}</strong>
            <span>modules</span>
          </article>
          <article>
            <strong>{snapshot.graph.nodes.length}</strong>
            <span>concepts</span>
          </article>
          <article>
            <strong>{snapshot.due.length}</strong>
            <span>due reviews</span>
          </article>
        </div>
      </section>

      <section className="nav-strip">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-button ${activeView === item.id ? "nav-button-active" : ""}`}
            type="button"
            onClick={() => setActiveView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </section>

      {activeView === "home" ? (
        <section className="home-grid">
          <div className="summary-grid">
            <article className="panel feature-card">
              <p className="eyebrow">Map understanding</p>
              <h3>Graph workspace</h3>
              <p>Inspect concept links, evidence, and cross-module overlap without the rest of the study tooling in the way.</p>
              <button className="action-button" type="button" onClick={() => setActiveView("graph")}>
                Open graph
              </button>
            </article>
            <article className="panel feature-card">
              <p className="eyebrow">Check retention</p>
              <h3>Quiz workspace</h3>
              <p>Run mixed recall tests separately so the quiz flow feels like a focused session, not a sidebar widget.</p>
              <button className="action-button" type="button" onClick={() => setActiveView("quizzes")}>
                Open quizzes
              </button>
            </article>
            <article className="panel feature-card">
              <p className="eyebrow">Plan revision</p>
              <h3>Study workspace</h3>
              <p>See due concepts and reminder activity in one place, with less visual competition from graph and ingest tools.</p>
              <button className="action-button" type="button" onClick={() => setActiveView("study")}>
                Open study
              </button>
            </article>
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Quick stats</p>
                  <h2>Current learning system</h2>
                </div>
              </div>
              <ul className="compact-list">
                <li>
                  <strong>{snapshot.modules.length} modules tracked</strong>
                  <span>Structured containers for notes, uploads, and graph overlap.</span>
                </li>
                <li>
                  <strong>{snapshot.graph.nodes.length} concepts in the graph</strong>
                  <span>Each concept keeps evidence references and a mastery score.</span>
                </li>
                <li>
                  <strong>{snapshot.due.length} concepts currently due</strong>
                  <span>The review queue is driven by the FSRS-style scheduler.</span>
                </li>
              </ul>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Modules</p>
                  <h2>Your active subjects</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setActiveView("ingest")}>
                  Add content
                </button>
              </div>
              <ul className="compact-list">
                {snapshot.modules.map((moduleRecord) => (
                  <li key={moduleRecord.id}>
                    <strong>{moduleRecord.code ? `${moduleRecord.code} · ` : ""}{moduleRecord.title}</strong>
                    <span>{moduleRecord.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      ) : null}

      {activeView === "graph" ? (
        <section className="dashboard-grid">
          <div className="main-column">
            <GraphCanvas
              nodes={snapshot.graph.nodes}
              edges={snapshot.graph.edges}
              selectedConceptId={selectedConceptId}
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

      {activeView === "study" ? (
        <section className="two-column-section">
          <StudyQueue due={snapshot.due} onGenerateQuiz={handleGenerateQuiz} />
          <ReminderPanel reminders={snapshot.reminders} initialSettings={snapshot.reminderSettings} />
        </section>
      ) : null}

      {activeView === "quizzes" ? (
        <section className="single-column">
          <QuizPanel
            quizzes={snapshot.quizzes}
            onGenerateQuiz={() => handleGenerateQuiz()}
            onRefresh={refreshInTransition}
          />
        </section>
      ) : null}

      {activeView === "ingest" ? (
        <section className="single-column">
          <IntakePanel modules={snapshot.modules} onMutate={refreshInTransition} />
        </section>
      ) : null}

      <footer className="footer-note">
        <span>{isRefreshing ? "Refreshing data..." : "Focused workspaces active. Use the navigation buttons to move between graph, study, quizzes, and ingest."}</span>
      </footer>
    </main>
  );
}
