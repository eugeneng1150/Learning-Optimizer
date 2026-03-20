import { getDueReviews } from "@/lib/app";
import { ok } from "@/app/api/_utils";

export async function GET() {
  return ok(await getDueReviews());
}
