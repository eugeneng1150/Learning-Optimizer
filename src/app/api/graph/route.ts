import { getDashboardSnapshot } from "@/lib/app";
import { ok } from "@/app/api/_utils";

export async function GET() {
  const snapshot = await getDashboardSnapshot();
  return ok({
    nodes: snapshot.graph.nodes,
    edges: snapshot.graph.edges,
    concepts: snapshot.conceptRecords,
    edgeRecords: snapshot.edgeRecords
  });
}
