import { updateEdge } from "@/lib/app";
import { badRequest, ok } from "@/app/api/_utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const body = (await request.json()) as {
    type?: "similar_to" | "prerequisite_of" | "part_of" | "applies_to" | "contrasts_with";
    weight?: number;
    pinned?: boolean;
    deleted?: boolean;
  };

  try {
    const { id } = await context.params;
    const edge = await updateEdge(id, body);
    return ok(edge);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update edge";
    return badRequest(message, 404);
  }
}
