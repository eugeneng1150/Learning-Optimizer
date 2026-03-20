import { createSource, getDashboardSnapshot } from "@/lib/app";
import { badRequest, ok } from "@/app/api/_utils";

export async function GET() {
  const snapshot = await getDashboardSnapshot();
  return ok(snapshot.sources);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    moduleId?: string;
    title?: string;
    content?: string;
    kind?: "pdf" | "text";
    processor?: "auto" | "gemini" | "heuristic";
  };

  if (!body.moduleId?.trim() || !body.title?.trim() || !body.content?.trim()) {
    return badRequest("moduleId, title, and content are required");
  }

  try {
    const source = await createSource({
      moduleId: body.moduleId,
      title: body.title,
      content: body.content,
      kind: body.kind,
      processor: body.processor
    });

    return ok(source, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create source";
    return badRequest(message, 404);
  }
}
