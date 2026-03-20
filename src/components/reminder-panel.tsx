"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";

import type { ReminderJob, ReminderSettings } from "@/lib/types";

interface ReminderPanelProps {
  reminders: ReminderJob[];
  initialSettings: ReminderSettings;
}

export function ReminderPanel({ reminders, initialSettings }: ReminderPanelProps) {
  const [settings, setSettings] = useState<ReminderSettings>(initialSettings);
  const [cadenceText, setCadenceText] = useState(describeCadence(initialSettings));
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSettings(initialSettings);
    setCadenceText(describeCadence(initialSettings));
  }, [initialSettings]);

  useEffect(() => {
    let ignore = false;

    async function loadSettings() {
      try {
        const response = await fetch("/api/reminders");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          settings: ReminderSettings;
          cadenceText: string;
        };

        if (ignore) {
          return;
        }

        setSettings(data.settings);
        setCadenceText(data.cadenceText);
      } catch {
        // Keep the local defaults if settings cannot be loaded.
      }
    }

    void loadSettings();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      setStatus(null);
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        setStatus("Failed to save reminder settings.");
        return;
      }

      const data = (await response.json()) as { cadenceText: string; settings: ReminderSettings };
      setSettings(data.settings);
      setCadenceText(data.cadenceText);
      setStatus("Reminder settings saved.");
    });
  }

  function updateSetting<K extends keyof ReminderSettings>(key: K, value: ReminderSettings[K]) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Reminder delivery</p>
          <h2>Reminder settings</h2>
        </div>
        <span className="panel-badge">{reminders.length} recent jobs</span>
      </div>
      <p className="muted">{cadenceText}</p>

      <form className="form-grid" onSubmit={handleSave}>
        <label className="toggle-row">
          <span>
            <strong>Email reminders</strong>
            <span>Send study nudges by email.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.emailEnabled}
            onChange={(event) => updateSetting("emailEnabled", event.target.checked)}
          />
        </label>

        <label className="toggle-row">
          <span>
            <strong>In-app reminders</strong>
            <span>Show review prompts inside the app.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.inAppEnabled}
            onChange={(event) => updateSetting("inAppEnabled", event.target.checked)}
          />
        </label>

        <label>
          Daily reminder hour
          <input
            type="range"
            min={0}
            max={23}
            value={settings.dailyHour}
            onChange={(event) => updateSetting("dailyHour", Number(event.target.value))}
          />
          <span className="muted">{describeCadence(settings)}</span>
        </label>

        <button className="action-button" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save reminder settings"}
        </button>
      </form>

      {status ? <p className="status-text">{status}</p> : null}

      <div className="subpanel">
        <h3>Recent jobs</h3>
        <ul className="compact-list">
          {reminders.length ? (
            reminders.slice(-6).reverse().map((job) => (
              <li key={job.id}>
                <span>
                  {job.channel} · {job.dueConceptIds.length} concepts
                </span>
                <span>{new Date(job.sentAt).toLocaleString()}</span>
              </li>
            ))
          ) : (
            <li>No reminder jobs recorded yet.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

function describeCadence(current: ReminderSettings): string {
  const suffix = current.dailyHour >= 12 ? "PM" : "AM";
  const displayHour = current.dailyHour % 12 === 0 ? 12 : current.dailyHour % 12;
  const channels = [
    current.inAppEnabled ? "in-app" : null,
    current.emailEnabled ? "email" : null
  ].filter(Boolean) as string[];
  const channelText = channels.length ? channels.join(" + ") : "no delivery channels";
  return `Daily at ${displayHour}:00 ${suffix} via ${channelText}.`;
}
