import { getModuleSimilarity } from "@/lib/app";
import { badRequest, ok } from "@/app/api/_utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const modules = await getModuleSimilarity(id);
    return ok(modules);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compute similarity";
    return badRequest(message, 404);
  }
}
