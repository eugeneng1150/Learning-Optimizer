import { badRequest, ok } from "@/app/api/_utils";
import { getDashboardSnapshot, getReminderSettings, updateReminderSettings } from "@/lib/app";
import type { ReminderSettings } from "@/lib/types";

function describeSettings(settings: ReminderSettings): string {
  const channels = [
    settings.inAppEnabled ? "in-app" : null,
    settings.emailEnabled ? "email" : null
  ].filter(Boolean) as string[];
  const channelText = channels.length ? channels.join(" + ") : "no delivery channels";
  return `Daily at ${formatHour(settings.dailyHour)} via ${channelText}.`;
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${suffix}`;
}

export async function GET() {
  const [settings, snapshot] = await Promise.all([getReminderSettings(), getDashboardSnapshot()]);
  return ok({
    settings,
    cadenceText: describeSettings(settings),
    channels: {
      email: settings.emailEnabled,
      inApp: settings.inAppEnabled
    },
    updatedAt: settings.updatedAt,
    jobs: snapshot.reminders
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<ReminderSettings>;

  if (
    typeof body.emailEnabled !== "boolean" ||
    typeof body.inAppEnabled !== "boolean" ||
    typeof body.dailyHour !== "number"
  ) {
    return badRequest("emailEnabled, inAppEnabled, and dailyHour are required");
  }

  const settings = await updateReminderSettings(body);

  return ok({
    settings,
    cadenceText: describeSettings(settings),
    channels: {
      email: settings.emailEnabled,
      inApp: settings.inAppEnabled
    },
    updatedAt: settings.updatedAt
  });
}
