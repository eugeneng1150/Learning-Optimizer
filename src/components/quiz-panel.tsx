"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";

import { QuizItem } from "@/lib/types";

interface QuizPanelProps {
  quizzes: QuizItem[];
  onRefresh: () => Promise<void>;
  onGenerateQuiz: () => Promise<void>;
}

export function QuizPanel({ quizzes, onRefresh, onGenerateQuiz }: QuizPanelProps) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIndex(0);
    setAnswer("");
    setFeedback(null);
  }, [quizzes]);

  const quiz = quizzes[index];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quiz) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/quiz-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizItemId: quiz.id,
          answer
        })
      });

      const data = (await response.json()) as { feedback?: string; outcome?: string };
      setFeedback(response.ok ? `${data.outcome}: ${data.feedback}` : "Quiz submission failed.");
      setAnswer("");
      await onRefresh();
    });
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Quiz engine</p>
          <h2>Mixed recall testing</h2>
        </div>
        <button
          className="ghost-button"
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await onGenerateQuiz();
            })
          }
        >
          Regenerate quiz set
        </button>
      </div>

      {quiz ? (
        <>
          <div className="quiz-meta">
            <span className="panel-badge">
              {quiz.type} · {index + 1}/{quizzes.length}
            </span>
            <div className="pager">
              <button className="ghost-button" type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                Prev
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={index === quizzes.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                Next
              </button>
            </div>
          </div>
          <p className="quiz-prompt">{quiz.prompt}</p>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="full-width">
              Your answer
              <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={5} required />
            </label>
            <button className="action-button" type="submit" disabled={isPending}>
              {isPending ? "Evaluating..." : "Submit answer"}
            </button>
          </form>
          <div className="subpanel">
            <h3>Grounding</h3>
            <ul className="compact-list">
              {quiz.evidenceRefs.map((evidence) => (
                <li key={evidence.id}>{evidence.excerpt}</li>
              ))}
            </ul>
          </div>
          {feedback ? <p className="status-text">{feedback}</p> : null}
        </>
      ) : (
        <div className="empty-state">No quiz items yet. Generate a quiz set from the due queue.</div>
      )}
    </section>
  );
}
