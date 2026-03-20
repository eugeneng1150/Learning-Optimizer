import { seedStore } from "@/lib/seed";
import { AppStore } from "@/lib/types";

export const cloneStore = (store: AppStore): AppStore =>
  JSON.parse(JSON.stringify(store)) as AppStore;

export function normalizeStore(store: Partial<AppStore>): AppStore {
  const seeded = seedStore();

  return {
    users: store.users ?? seeded.users,
    modules: store.modules ?? seeded.modules,
    sources: store.sources ?? seeded.sources,
    chunks: store.chunks ?? seeded.chunks,
    concepts: store.concepts ?? seeded.concepts,
    edges: store.edges ?? seeded.edges,
    reviewStates: store.reviewStates ?? seeded.reviewStates,
    conceptFamiliarities: store.conceptFamiliarities ?? seeded.conceptFamiliarities,
    quizItems: store.quizItems ?? seeded.quizItems,
    quizAttempts: store.quizAttempts ?? seeded.quizAttempts,
    reminders: store.reminders ?? seeded.reminders,
    reminderSettings: store.reminderSettings ?? seeded.reminderSettings
  };
}
