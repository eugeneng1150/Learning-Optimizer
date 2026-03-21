import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  answerConceptQuestion,
  createModule,
  createSource,
  createSourceWithStatus,
  generateQuizzes,
  getDashboardSnapshot,
  submitQuizAttempt,
  updateConcept
} from "@/lib/app";
import { seedStore } from "@/lib/seed";
import { resetStoreCache } from "@/lib/store";

function createJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload
  } as Response;
}

function buildEmbedding(seed: number): number[] {
  return Array.from({ length: 768 }, (_, index) => Number((seed + index / 1000).toFixed(4)));
}

test("dashboard flow ingests a source, builds graph data, and updates review after a quiz", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  resetStoreCache();

  try {
    const initial = await getDashboardSnapshot();
    assert.ok(initial.graph.nodes.length > 0);

    const moduleRecord = await createModule({
      title: "Databases",
      description: "Indexes, joins, query planning, and retrieval structures."
    });

    await createSource({
      moduleId: moduleRecord.id,
      title: "Database retrieval notes",
      content:
        "Index structures support retrieval. Query planning depends on joins, costs, and graph-like dependencies between operators."
    });

    const next = await getDashboardSnapshot();
    assert.ok(next.modules.some((item) => item.id === moduleRecord.id));
    assert.ok(next.graph.nodes.some((item) => item.module_ids.includes(moduleRecord.id)));

    const quiz = next.quizzes[0];
    assert.ok(quiz);

    const attempt = await submitQuizAttempt({
      quizItemId: quiz.id,
      answer: quiz.expectedAnswer
    });

    assert.equal(attempt.outcome, "easy");

    const afterAttempt = await getDashboardSnapshot();
    const reviewedConcept = afterAttempt.conceptRecords.find((concept) => concept.id === quiz.conceptIds[0]);
    assert.ok(reviewedConcept);
    assert.ok((reviewedConcept?.masteryScore ?? 0) >= 0.46);
  } finally {
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("regenerating quizzes drops stale attempts tied to replaced quiz item ids", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  resetStoreCache();

  try {
    const initial = await getDashboardSnapshot();
    const firstQuiz = initial.quizzes[0];
    assert.ok(firstQuiz);

    await submitQuizAttempt({
      quizItemId: firstQuiz.id,
      answer: firstQuiz.expectedAnswer
    });

    const regenerated = await generateQuizzes();
    assert.ok(regenerated.length > 0);
    assert.equal(regenerated.some((item) => item.id === firstQuiz.id), false);

    const afterRegeneration = await getDashboardSnapshot();
    assert.equal(afterRegeneration.quizzes.length, regenerated.length);
    assert.equal(afterRegeneration.quizzes.some((item) => item.id === firstQuiz.id), false);
  } finally {
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("quiz generation can scope prompts to a single source", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  resetStoreCache();

  try {
    const moduleRecord = await createModule({
      title: "Statistics",
      code: "ST2132",
      description: "Probability and inference."
    });

    const sourceA = await createSource({
      moduleId: moduleRecord.id,
      title: "Lecture 16",
      content: "Bayesian posterior updates combine priors with evidence. Conjugate priors keep updates tractable."
    });
    await createSource({
      moduleId: moduleRecord.id,
      title: "Lecture 17",
      content: "Maximum likelihood estimation compares parameter values and optimization criteria."
    });

    const noteScoped = await generateQuizzes({ sourceId: sourceA.id });

    assert.ok(noteScoped.length > 0);
    assert.equal(
      noteScoped.every((quiz) => quiz.evidenceRefs.every((evidence) => evidence.sourceId === sourceA.id)),
      true
    );
  } finally {
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("saving familiarity updates review state and removes highly familiar concepts from the default due quiz set", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  resetStoreCache();

  try {
    const initial = await getDashboardSnapshot();
    const concept = initial.conceptRecords[0];
    assert.ok(concept);

    await updateConcept(concept.id, { familiarityRating: 5 });

    const afterRating = await getDashboardSnapshot();
    const familiarity = afterRating.conceptFamiliarities.find((item) => item.conceptId === concept.id);
    const dueConceptIds = new Set(afterRating.due.map((item) => item.concept.id));

    assert.equal(familiarity?.rating, 5);
    assert.equal(dueConceptIds.has(concept.id), false);
    assert.equal(afterRating.quizzes.some((quiz) => quiz.conceptIds.includes(concept.id)), false);
  } finally {
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("source ingestion prefers Gemini semantic output when it is available", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MODEL;
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MODEL = "gemini-test-model";
  resetStoreCache();

  global.fetch = (async (input, init) => {
    const url = String(input);

    if (url.includes(":batchEmbedContents")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        requests?: Array<unknown>;
      };

      return createJsonResponse({
        embeddings: (body.requests ?? []).map((_, index) => ({
          values: buildEmbedding(index + 1)
        }))
      });
    }

    return createJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  summary: "Bayesian learning notes about posterior updates.",
                  concepts: [
                    {
                      title: "Bayesian posterior",
                      summary: "Posterior beliefs combine priors with observed evidence.",
                      confidence: 0.91,
                      evidence: ["Posterior updates combine priors with new evidence."]
                    },
                    {
                      title: "Conjugate prior",
                      summary: "A conjugate prior preserves tractable posterior updates.",
                      confidence: 0.86,
                      evidence: ["Conjugate priors make posterior updates tractable."]
                    }
                  ],
                  relationships: [
                    {
                      sourceTitle: "Conjugate prior",
                      targetTitle: "Bayesian posterior",
                      type: "applies_to",
                      weight: 0.82,
                      evidence: ["Conjugate priors make posterior updates tractable."]
                    }
                  ]
                })
              }
            ]
          }
        }
      ]
    });
  }) as typeof fetch;

  try {
    const moduleRecord = await createModule({
      title: "Probabilistic Models",
      description: "Bayesian inference and conjugate updates."
    });

    const created = await createSourceWithStatus({
      moduleId: moduleRecord.id,
      title: "Bayesian inference notes",
      content:
        "Posterior updates combine priors with new evidence. Conjugate priors make posterior updates tractable.",
      processor: "auto"
    });

    assert.equal(created.processor, "gemini");
    assert.equal(created.fallbackReason, undefined);
    assert.equal(created.source.title, "Bayesian inference notes");

    const snapshot = await getDashboardSnapshot();
    const posterior = snapshot.conceptRecords.find((concept) => concept.title === "Bayesian Posterior");
    const prior = snapshot.conceptRecords.find((concept) => concept.title === "Conjugate Prior");
    assert.ok(posterior);
    assert.ok(prior);
    assert.ok(
      snapshot.edgeRecords.some(
        (edge) =>
          edge.type === "applies_to" &&
          edge.sourceConceptId === prior?.id &&
          edge.targetConceptId === posterior?.id
      )
    );
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalGeminiModel) {
      process.env.GEMINI_MODEL = originalGeminiModel;
    } else {
      delete process.env.GEMINI_MODEL;
    }
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("source ingestion falls back to heuristics when Gemini is unavailable", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  resetStoreCache();

  global.fetch = (async () => {
    throw new Error("simulated Gemini outage");
  }) as typeof fetch;

  try {
    const moduleRecord = await createModule({
      title: "Latent Variable Models",
      description: "Inference with hidden variables."
    });

    const created = await createSourceWithStatus({
      moduleId: moduleRecord.id,
      title: "Latent variable notes",
      content:
        "Latent variables explain hidden structure in the data. Posterior inference estimates hidden causes from observed evidence.",
      processor: "gemini"
    });

    assert.equal(created.processor, "heuristic");
    assert.match(created.fallbackReason ?? "", /Gemini fallback activated/);

    const snapshot = await getDashboardSnapshot();
    assert.ok(snapshot.conceptRecords.some((concept) => concept.title.toLowerCase().includes("latent variable")));
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("legacy source rehydration stays heuristic even when Gemini is configured", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  resetStoreCache();

  const seeded = seedStore();
  const legacyStore = {
    ...seeded,
    chunks: [],
    concepts: [],
    edges: [],
    reviewStates: [],
    quizItems: [],
    quizAttempts: [],
    reminders: []
  };

  let fetchCalls = 0;
  global.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("Gemini should not be called during legacy rehydration");
  }) as typeof fetch;

  try {
    await writeFile(path.join(tempDir, "store.json"), JSON.stringify(legacyStore, null, 2), "utf8");

    const snapshot = await getDashboardSnapshot();
    assert.ok(snapshot.conceptRecords.length > 0);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("concept evidence questions use retrieved chunks and Gemini grounding", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  resetStoreCache();

  global.fetch = (async (input, init) => {
    const url = String(input);

    if (url.includes(":batchEmbedContents")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        requests?: Array<unknown>;
      };

      return createJsonResponse({
        embeddings: (body.requests ?? []).map((_, index) => ({
          values: buildEmbedding(index + 10)
        }))
      });
    }

    if (url.includes(":embedContent")) {
      return createJsonResponse({
        embedding: {
          values: buildEmbedding(10)
        }
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";

    if (prompt.includes('Schema: { "answer": string }')) {
      return createJsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    answer:
                      "Posterior inference updates beliefs by combining a prior with observed evidence from the notes."
                  })
                }
              ]
            }
          }
        ]
      });
    }

    return createJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  summary: "Posterior inference notes.",
                  concepts: [
                    {
                      title: "Posterior inference",
                      summary: "Posterior inference updates beliefs from observed evidence.",
                      confidence: 0.92,
                      evidence: ["Posterior inference updates beliefs with observed evidence."]
                    }
                  ],
                  relationships: []
                })
              }
            ]
          }
        }
      ]
    });
  }) as typeof fetch;

  try {
    const moduleRecord = await createModule({
      title: "Bayesian Learning",
      description: "Priors, posteriors, and evidence."
    });

    await createSourceWithStatus({
      moduleId: moduleRecord.id,
      title: "Posterior notes",
      content:
        "Posterior inference updates beliefs with observed evidence. Priors act as the starting belief before data arrives.",
      processor: "auto"
    });

    const snapshot = await getDashboardSnapshot();
    const concept = snapshot.conceptRecords.find((item) => item.title === "Posterior Inference");
    assert.ok(concept);

    const answer = await answerConceptQuestion({
      conceptId: concept!.id,
      query: "How does posterior inference use evidence?"
    });

    assert.equal(answer.processor, "gemini");
    assert.match(answer.answer, /updates beliefs/i);
    assert.ok(answer.matches.length > 0);
    assert.match(answer.matches[0]?.text ?? "", /observed evidence/i);
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("explicit quiz regeneration uses retrieved chunk evidence for concept prompts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learning-optimizer-"));
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.LEARNING_OPTIMIZER_DATA_DIR = tempDir;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  resetStoreCache();

  global.fetch = (async (input, init) => {
    const url = String(input);

    if (url.includes(":batchEmbedContents")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { requests?: Array<unknown> };
      return createJsonResponse({
        embeddings: (body.requests ?? []).map((_, index) => ({
          values: buildEmbedding(index + 20)
        }))
      });
    }

    if (url.includes(":embedContent")) {
      return createJsonResponse({
        embedding: {
          values: buildEmbedding(20)
        }
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";

    if (prompt.includes('Schema: { "answer": string }')) {
      return createJsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    answer:
                      "Posterior inference should be explained as belief updating from observed evidence and prior assumptions."
                  })
                }
              ]
            }
          }
        ]
      });
    }

    return createJsonResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  summary: "Posterior inference notes.",
                  concepts: [
                    {
                      title: "Posterior inference",
                      summary: "Posterior inference updates beliefs from observed evidence.",
                      confidence: 0.92,
                      evidence: ["Posterior inference updates beliefs with observed evidence."]
                    }
                  ],
                  relationships: []
                })
              }
            ]
          }
        }
      ]
    });
  }) as typeof fetch;

  try {
    const moduleRecord = await createModule({
      title: "Bayesian Learning",
      description: "Priors, posteriors, and evidence."
    });

    await createSourceWithStatus({
      moduleId: moduleRecord.id,
      title: "Posterior notes",
      content:
        "Posterior inference updates beliefs with observed evidence. Priors act as the starting belief before data arrives.",
      processor: "auto"
    });

    const snapshot = await getDashboardSnapshot();
    const concept = snapshot.conceptRecords.find((item) => item.title === "Posterior Inference");
    assert.ok(concept);

    const regenerated = await generateQuizzes([concept!.id]);
    const conceptQuiz = regenerated.find((item) => item.type !== "relationship");

    assert.ok(conceptQuiz);
    assert.match(conceptQuiz?.expectedAnswer ?? "", /belief updating/i);
    assert.ok((conceptQuiz?.evidenceRefs.length ?? 0) > 0);
    assert.match(conceptQuiz?.evidenceRefs[0]?.excerpt ?? "", /observed evidence/i);
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    delete process.env.LEARNING_OPTIMIZER_DATA_DIR;
    resetStoreCache();
    await rm(tempDir, { recursive: true, force: true });
  }
});
