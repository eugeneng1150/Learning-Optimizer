import { createModule, getDashboardSnapshot } from "@/lib/app";
import { badRequest, ok } from "@/app/api/_utils";

export async function GET() {
  const snapshot = await getDashboardSnapshot();
  return ok(snapshot.modules);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; description?: string; code?: string };

  if (!body.title?.trim() || !body.description?.trim()) {
    return badRequest("title and description are required");
  }

  const moduleRecord = await createModule({
    title: body.title,
    description: body.description,
    code: body.code
  });
  return ok(moduleRecord, 201);
}
