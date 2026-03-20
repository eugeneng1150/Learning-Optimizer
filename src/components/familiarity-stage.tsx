"use client";

import { useTransition } from "react";

import { ConceptRecord } from "@/lib/types";

interface FamiliarityStageProps {
  concepts: ConceptRecord[];
  ratedCount: number;
  selectedConceptId?: string;
  onContinue: () => void;
  onOpenMap: () => void;
  onRate: (conceptId: string, status: ConceptRecord["status"]) => Promise<void>;
  onSelectConcept: (conceptId: string) => void;
}

const FAMILIARITY_OPTIONS: Array<{
  label: string;
  helper: string;
  status: ConceptRecord["status"];
}> = [
  { label: "Needs work", helper: "Flag weak recall first.", status: "confusing" },
  { label: "Getting there", helper: "Keep it in rotation.", status: "active" },
  { label: "Comfortable", helper: "Treat as strong recall.", status: "mastered" }
];

export function FamiliarityStage({
  concepts,
  ratedCount,
  selectedConceptId,
  onContinue,
  onOpenMap,
  onRate,
  onSelectConcept
}: FamiliarityStageProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <section className="panel familiarity-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Stage 3</p>
          <h2>Quick familiarity sweep</h2>
        </div>
        <span className="panel-badge">
          {ratedCount}/{concepts.length} triaged
        </span>
      </div>

      <p className="muted familiarity-copy">
        Use a fast pass to tag what feels fragile versus familiar before starting recall testing. This branch maps the
        choices onto the existing concept status field until the dedicated 1-5 familiarity model lands.
      </p>

      {concepts.length ? (
        <ul className="familiarity-list">
          {concepts.map((concept) => (
            <li
              key={concept.id}
              className={`familiarity-item ${selectedConceptId === concept.id ? "familiarity-item-active" : ""}`}
            >
              <button
                className="familiarity-card-button"
                type="button"
                onClick={() => onSelectConcept(concept.id)}
              >
                <span className="familiarity-item-header">
                  <strong>{concept.title}</strong>
                  <span className={`status-pill status-${concept.status}`}>{describeStatus(concept.status)}</span>
                </span>
                <span className="muted">{concept.summary}</span>
              </button>

              <div className="rating-row">
                {FAMILIARITY_OPTIONS.map((option) => (
                  <button
                    key={option.status}
                    className={`ghost-button rating-button ${
                      concept.status === option.status ? "rating-button-active" : ""
                    }`}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        onSelectConcept(concept.id);
                        await onRate(concept.id, option.status);
                      })
                    }
                  >
                    <strong>{option.label}</strong>
                    <span>{option.helper}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">Process notes first so there is a concept set to triage.</div>
      )}

      <div className="stage-actions">
        <button className="ghost-button" type="button" onClick={onOpenMap}>
          Reopen mindmap
        </button>
        <button className="action-button" type="button" disabled={!concepts.length} onClick={onContinue}>
          Continue to quiz
        </button>
      </div>
    </section>
  );
}

function describeStatus(status: ConceptRecord["status"]) {
  switch (status) {
    case "confusing":
      return "Needs work";
    case "mastered":
      return "Comfortable";
    default:
      return "Getting there";
  }
}
