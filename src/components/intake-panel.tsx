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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModuleId && modules[0]) {
      setSelectedModuleId(modules[0].id);
    }
  }, [modules, selectedModuleId]);

  const hasModules = modules.length > 0;

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
      setMessage("Subject created. Upload notes for this subject to generate the first map.");
    });
  }

  async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      setMessage(null);
      const shouldUploadPdf = ingestMode === "file" && selectedFileName?.toLowerCase().endsWith(".pdf") && selectedFile;
      const response =
        shouldUploadPdf
          ? await uploadSourceFile({
              moduleId: selectedModuleId,
              title: sourceTitle,
              file: selectedFile
            })
          : await fetch("/api/sources", {
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
        const contentType = response.headers.get("content-type") ?? "";
        let failureMessage = "Source ingestion failed.";

        if (contentType.includes("application/json")) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          failureMessage = payload?.error || failureMessage;
        } else {
          const raw = (await response.text().catch(() => "")).trim();
          if (raw) {
            failureMessage = raw.slice(0, 320);
          }
        }

        if (response.status === 413) {
          failureMessage = "This file is too large for the current upload path. Try a smaller PDF or split it first.";
        }

        setMessage(failureMessage);
        return;
      }

      const result = (await response.json()) as SourceCreationResult;

      setSourceTitle("");
      setSourceContent("");
      setSelectedFile(null);
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
      lowerName.endsWith(".pdf") ||
      file.type === "text/plain" ||
      file.type === "text/markdown" ||
      file.type === "application/pdf";

    if (!isSupported) {
      setMessage("Only .txt, .md, and .pdf files are supported.");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    setSelectedFileName(file.name);
    setSourceTitle((current) => current || stripTextExtension(file.name));

    if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
      setSourceContent("");
      setMessage(`Loaded ${file.name}. The server will extract text from the PDF during upload.`);
      return;
    }

    const text = await file.text();
    setSourceContent(text);
    setMessage(`Loaded ${file.name} into the ingest form.`);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{hasModules ? "Optional" : "Setup"}</p>
            <h2>{hasModules ? "Add another subject" : "Create a subject first"}</h2>
            <p className="muted">
              Every note upload belongs to one subject, so the app needs that container before Stage 1 can start.
            </p>
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
            <p className="muted">
              {hasModules
                ? "Choose the subject these notes belong to, then paste text or upload a text-based PDF."
                : "Create a subject above first. Once that exists, note upload becomes available here."}
            </p>
          </div>
        </div>

        {hasModules ? (
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
                Upload file
              </button>
            </div>

            <label className="full-width">
              Subject
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
              Notes title
              <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} required />
            </label>
            {ingestMode === "paste" ? (
              <label className="full-width">
                Notes content
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
                  File upload
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                    onChange={handleFileSelect}
                  />
                </label>
                <p className="muted">
                  Upload a local text, markdown, or PDF file. Text files are previewed in the browser. PDFs are sent
                  to the server for extraction before they enter the same source pipeline. Scanned or image-only PDFs
                  are not supported yet.
                </p>
                <label>
                  File preview
                  <textarea
                    value={sourceContent}
                    onChange={(event) => setSourceContent(event.target.value)}
                    rows={8}
                    placeholder={
                      selectedFileName?.toLowerCase().endsWith(".pdf")
                        ? "PDF text will be extracted on the server during upload..."
                        : "File contents will appear here after upload..."
                    }
                    required={!selectedFileName?.toLowerCase().endsWith(".pdf")}
                  />
                </label>
              </div>
            )}
            {selectedFileName ? (
              <p className="status-text">Loaded file: {selectedFileName}</p>
            ) : ingestMode === "file" ? (
              <p className="muted">No file selected yet.</p>
            ) : null}
            <button
              className="action-button"
              type="submit"
              disabled={
                isPending ||
                (ingestMode === "file"
                  ? !selectedFile || (!selectedFileName?.toLowerCase().endsWith(".pdf") && !sourceContent.trim())
                  : false)
              }
            >
              {isPending ? "Processing..." : "Process notes"}
            </button>
          </form>
        ) : (
          <p className="status-text">Create your first subject above, then come back here to upload notes into it.</p>
        )}

        {message ? <p className="status-text">{message}</p> : null}
      </section>
    </div>
  );
}

function stripTextExtension(fileName: string): string {
  return fileName.replace(/\.(txt|md|pdf)$/i, "").trim() || "Untitled source";
}

function formatIngestionMessage(result: SourceCreationResult) {
  const processorLabel = result.processor === "gemini" ? "Gemini" : "heuristic";
  const graphSummary = `${result.conceptCount} concepts and ${result.edgeCount} links`;

  if (result.fallbackReason) {
    return `${graphSummary} generated with heuristic fallback. ${result.fallbackReason}`;
  }

  return `${graphSummary} generated with ${processorLabel}.`;
}

async function uploadSourceFile(input: { moduleId: string; title: string; file: File }) {
  const formData = new FormData();
  formData.set("moduleId", input.moduleId);
  formData.set("title", input.title);
  formData.set("processor", "auto");
  formData.set("file", input.file);

  return fetch("/api/sources", {
    method: "POST",
    body: formData
  });
}
