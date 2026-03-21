"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState, useTransition } from "react";

import { ModuleRecord, SourceCreationResult } from "@/lib/types";

interface IntakePanelProps {
  modules: ModuleRecord[];
  onMutate: () => Promise<void>;
  onSourceCreated?: (result: SourceCreationResult) => void;
}

export function IntakePanel({ modules, onMutate, onSourceCreated }: IntakePanelProps) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleCode, setModuleCode] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState(modules[0]?.id ?? "");
  const [ingestMode, setIngestMode] = useState<"paste" | "file">("paste");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModuleId && modules[0]) {
      setSelectedModuleId(modules[0].id);
    }
  }, [modules, selectedModuleId]);

  async function handleCreateModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: moduleTitle,
          code: moduleCode,
          description: moduleDescription
        })
      });

      if (!response.ok) {
        setMessage("Module creation failed.");
        return;
      }

      const moduleRecord = (await response.json()) as ModuleRecord;
      setModuleTitle("");
      setModuleCode("");
      setModuleDescription("");
      await onMutate();
      setSelectedModuleId(moduleRecord.id);
      setMessage("Subject created. Upload notes to generate the map.");
    });
  }

  async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: selectedModuleId,
          title: sourceTitle,
          content: sourceContent,
          kind: "text",
          processor: "auto"
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error || "Source ingestion failed.");
        return;
      }

      const result = (await response.json()) as SourceCreationResult;

      setSourceTitle("");
      setSourceContent("");
      setSelectedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await onMutate();
      onSourceCreated?.(result);
      setMessage(formatIngestionMessage(result));
    });
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isSupported =
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md") ||
      file.type === "text/plain" ||
      file.type === "text/markdown";

    if (!isSupported) {
      setMessage("Only .txt and .md files are supported for browser capture.");
      event.target.value = "";
      return;
    }

    const text = await file.text();
    setSelectedFileName(file.name);
    setSourceContent(text);
    setSourceTitle((current) => current || stripTextExtension(file.name));
    setMessage(`Loaded ${file.name} into the ingest form.`);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Stage 1</p>
            <h2>Start with a subject</h2>
          </div>
        </div>

        <form className="form-grid" onSubmit={handleCreateModule}>
          <label>
            Title
            <input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} required />
          </label>
          <label>
            Code
            <input value={moduleCode} onChange={(event) => setModuleCode(event.target.value)} />
          </label>
          <label className="full-width">
            Description
            <textarea
              value={moduleDescription}
              onChange={(event) => setModuleDescription(event.target.value)}
              rows={4}
              required
            />
          </label>
          <button className="action-button" type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Create subject"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Stage 1</p>
            <h2>Upload notes</h2>
          </div>
        </div>

        <form className="form-grid" onSubmit={handleCreateSource}>
          <div className="mode-switch" role="tablist" aria-label="Ingest mode">
            <button
              className={`nav-button ${ingestMode === "paste" ? "nav-button-active" : ""}`}
              type="button"
              aria-pressed={ingestMode === "paste"}
              onClick={() => setIngestMode("paste")}
            >
              Paste text
            </button>
            <button
              className={`nav-button ${ingestMode === "file" ? "nav-button-active" : ""}`}
              type="button"
              aria-pressed={ingestMode === "file"}
              onClick={() => setIngestMode("file")}
            >
              Upload .txt / .md
            </button>
          </div>

          <label className="full-width">
            Module
            <select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)} required>
              {modules.map((moduleRecord) => (
                <option value={moduleRecord.id} key={moduleRecord.id}>
                  {moduleRecord.code ? `${moduleRecord.code} · ` : ""}
                  {moduleRecord.title}
                </option>
              ))}
            </select>
          </label>
          <label className="full-width">
            Source title
            <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} required />
          </label>
          {ingestMode === "paste" ? (
            <label className="full-width">
              Source content
              <textarea
                value={sourceContent}
                onChange={(event) => setSourceContent(event.target.value)}
                rows={8}
                placeholder="Paste notes, lecture text, or a cleaned PDF extract here..."
                required
              />
            </label>
          ) : (
            <div className="full-width file-capture-card">
              <label>
                Browser capture
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={handleFileSelect}
                />
              </label>
              <p className="muted">
                Load a local text or markdown file in the browser. The contents are read client-side and submitted
                through the same source API.
              </p>
              <label>
                File preview
                <textarea
                  value={sourceContent}
                  onChange={(event) => setSourceContent(event.target.value)}
                  rows={8}
                  placeholder="File contents will appear here after upload..."
                  required
                />
              </label>
            </div>
          )}
          {selectedFileName ? (
            <p className="status-text">Loaded file: {selectedFileName}</p>
          ) : ingestMode === "file" ? (
            <p className="muted">No file selected yet.</p>
          ) : null}
          <button className="action-button" type="submit" disabled={isPending || !modules.length}>
            {isPending ? "Processing..." : "Process notes"}
          </button>
        </form>

        {message ? <p className="status-text">{message}</p> : null}
      </section>
    </div>
  );
}

function stripTextExtension(fileName: string): string {
  return fileName.replace(/\.(txt|md)$/i, "").trim() || "Untitled source";
}

function formatIngestionMessage(result: SourceCreationResult) {
  const processorLabel = result.processor === "gemini" ? "Gemini" : "heuristic";
  const graphSummary = `${result.conceptCount} concepts and ${result.edgeCount} links`;

  if (result.fallbackReason) {
    return `${graphSummary} generated with heuristic fallback. ${result.fallbackReason}`;
  }

  return `${graphSummary} generated with ${processorLabel}.`;
}
