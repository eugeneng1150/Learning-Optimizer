import { badRequest, ok } from "@/app/api/_utils";
import { answerConceptQuestion } from "@/lib/app";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const body = (await request.json()) as {
    query?: string;
  };

  if (!body.query?.trim()) {
    return badRequest("query is required");
  }

  try {
    const { id } = await context.params;
    const result = await answerConceptQuestion({
      conceptId: id,
      query: body.query
    });
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to answer concept question";
    return badRequest(message, 404);
  }
}
