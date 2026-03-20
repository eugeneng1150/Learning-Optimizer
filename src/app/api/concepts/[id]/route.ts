import { updateConcept } from "@/lib/app";
import { badRequest, ok } from "@/app/api/_utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const body = (await request.json()) as {
    title?: string;
    summary?: string;
    status?: "active" | "confusing" | "mastered";
    pinned?: boolean;
    familiarityRating?: 1 | 2 | 3 | 4 | 5;
    mergeWithId?: string;
  };

  try {
    const { id } = await context.params;
    const concept = await updateConcept(id, body);
    return ok(concept);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update concept";
    return badRequest(message, 404);
  }
}
