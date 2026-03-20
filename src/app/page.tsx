import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardSnapshot } from "@/lib/app";

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();
  return <DashboardShell initialSnapshot={snapshot} />;
}
