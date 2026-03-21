import { generateQuizzes } from "@/lib/app";
import { ok } from "@/app/api/_utils";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { conceptIds?: string[]; sourceId?: string };
  const quizzes = await generateQuizzes({
    conceptIds: body.conceptIds,
    sourceId: body.sourceId
  });
  return ok(quizzes, 201);
}
