import { createSourceWithStatus, getDashboardSnapshot } from "@/lib/app";
import { badRequest, ok } from "@/app/api/_utils";
import { extractTextFromPdfBuffer } from "@/lib/services/pdf";

async function parseMultipartSourceRequest(request: Request) {
  const formData = await request.formData();
  const moduleId = String(formData.get("moduleId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const processor = String(formData.get("processor") ?? "auto").trim() as "auto" | "gemini" | "heuristic";
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("file is required");
  }

  const fileName = file.name.trim();
  const lowerName = fileName.toLowerCase();
  const kind = lowerName.endsWith(".pdf") ? "pdf" : "text";
  const arrayBuffer = await file.arrayBuffer();

  let content = "";

  if (kind === "pdf") {
    content = await extractTextFromPdfBuffer(Buffer.from(arrayBuffer));
  } else {
    content = Buffer.from(arrayBuffer).toString("utf8").trim();
  }

  return {
    moduleId,
    title: title || fileName.replace(/\.(pdf|txt|md)$/i, "").trim() || "Untitled source",
    content,
    kind: kind as "pdf" | "text",
    processor
  };
}

export async function GET() {
  const snapshot = await getDashboardSnapshot();
  return ok(snapshot.sources);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body: {
      moduleId?: string;
      title?: string;
      content?: string;
      kind?: "pdf" | "text";
      processor?: "auto" | "gemini" | "heuristic";
    } = contentType.includes("multipart/form-data")
      ? await parseMultipartSourceRequest(request)
      : ((await request.json()) as {
          moduleId?: string;
          title?: string;
          content?: string;
          kind?: "pdf" | "text";
          processor?: "auto" | "gemini" | "heuristic";
        });

    if (!body.moduleId?.trim() || !body.title?.trim() || !body.content?.trim()) {
      return badRequest("moduleId, title, and content are required");
    }

    const result = await createSourceWithStatus({
      moduleId: body.moduleId,
      title: body.title,
      content: body.content,
      kind: body.kind,
      processor: body.processor
    });

    return ok(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create source";
    const status =
      /module not found/i.test(message) ? 404 : /pdf|content are required|file is required|supported/i.test(message) ? 422 : 400;
    return badRequest(message, status);
  }
}
