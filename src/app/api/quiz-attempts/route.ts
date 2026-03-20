import { submitQuizAttempt } from "@/lib/app";
import { badRequest, ok } from "@/app/api/_utils";

export async function POST(request: Request) {
  const body = (await request.json()) as { quizItemId?: string; answer?: string };

  if (!body.quizItemId?.trim() || !body.answer?.trim()) {
    return badRequest("quizItemId and answer are required");
  }

  try {
    const attempt = await submitQuizAttempt({
      quizItemId: body.quizItemId,
      answer: body.answer
    });

    return ok(attempt, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit quiz attempt";
    return badRequest(message, 404);
  }
}
