import { AppStore } from "@/lib/types";

const now = new Date().toISOString();

export const DEMO_USER_ID = "user_demo";

export const seedStore = (): AppStore => ({
  users: [
    {
      id: DEMO_USER_ID,
      name: "Demo Learner",
      email: "demo@example.com"
    }
  ],
  modules: [
    {
      id: "mod_algorithms",
      userId: DEMO_USER_ID,
      title: "Algorithms",
      code: "CS2040",
      description: "Design and analysis of algorithms, graph traversal, dynamic programming, and greedy methods.",
      createdAt: now
    },
    {
      id: "mod_ml",
      userId: DEMO_USER_ID,
      title: "Machine Learning",
      code: "CS3244",
      description: "Model fitting, generalization, optimization, embeddings, and graph-based learning.",
      createdAt: now
    }
  ],
  sources: [
    {
      id: "src_algorithms_notes",
      moduleId: "mod_algorithms",
      userId: DEMO_USER_ID,
      title: "Algorithms week 4 notes",
      kind: "text",
      content:
        "Graph traversal connects breadth first search, shortest path thinking, and prerequisite reasoning. Dynamic programming depends on overlapping subproblems and optimal substructure. Greedy methods contrast with dynamic programming because local choice does not always give global optimality.",
      createdAt: now
    },
    {
      id: "src_ml_notes",
      moduleId: "mod_ml",
      userId: DEMO_USER_ID,
      title: "Machine learning embeddings notes",
      kind: "text",
      content:
        "Embeddings turn concepts into vectors so similar ideas lie close together. Retrieval augmented generation uses chunking, vector search, and grounded evidence. Graph neural networks apply message passing over nodes and edges, linking graph structure with representation learning.",
      createdAt: now
    }
  ],
  chunks: [],
  concepts: [],
  edges: [],
  reviewStates: [],
  conceptFamiliarities: [],
  quizItems: [],
  quizAttempts: [],
  reminders: [],
  reminderSettings: [
    {
      userId: DEMO_USER_ID,
      emailEnabled: true,
      inAppEnabled: true,
      dailyHour: 19,
      updatedAt: now
    }
  ]
});
