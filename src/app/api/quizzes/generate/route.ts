import { generateQuizzes } from "@/lib/app";
import { ok } from "@/app/api/_utils";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { conceptIds?: string[] };
  const quizzes = await generateQuizzes(body.conceptIds);
  return ok(quizzes, 201);
}
