"use client";

import { useTransition } from "react";

import { DueConcept } from "@/lib/types";

interface StudyQueueProps {
  due: DueConcept[];
  onGenerateQuiz: (conceptIds?: string[]) => Promise<void>;
}

export function StudyQueue({ due, onGenerateQuiz }: StudyQueueProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Review queue</p>
          <h2>Due concepts</h2>
        </div>
        <span className="panel-badge">{due.length} due</span>
      </div>

      <ul className="queue-list">
        {due.length ? (
          due.map((item) => (
            <li key={item.concept.id}>
              <div>
                <strong>{item.concept.title}</strong>
                <p>{item.concept.summary}</p>
                <small>
                  Stability {item.reviewState.stability} · Difficulty {item.reviewState.difficulty} · Due{" "}
                  {new Date(item.reviewState.dueAt).toLocaleString()}
                </small>
              </div>
              <button
                className="ghost-button"
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await onGenerateQuiz([item.concept.id]);
                  })
                }
              >
                Quiz this concept
              </button>
            </li>
          ))
        ) : (
          <li className="empty-state">No concepts are due right now.</li>
        )}
      </ul>
    </section>
  );
}
