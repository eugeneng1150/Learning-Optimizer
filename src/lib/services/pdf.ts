import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type PdfJsModule = {
  getDocument: (input: {
    data: Uint8Array;
    disableWorker: boolean;
    useWorkerFetch: boolean;
    isEvalSupported: boolean;
  }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str?: string; hasEOL?: boolean }>;
        }>;
        cleanup: () => void;
      }>;
      destroy: () => Promise<void>;
    }>;
  };
};

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function loadPdfJs(): Promise<PdfJsModule> {
  const workspaceModulePath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.mjs"
  );

  if (!fs.existsSync(workspaceModulePath)) {
    throw new Error("Could not locate pdfjs-dist in node_modules.");
  }

  return (await import(/* webpackIgnore: true */ pathToFileURL(workspaceModulePath).href)) as PdfJsModule;
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  let document:
    | {
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{
            items: Array<{ str?: string; hasEOL?: boolean }>;
          }>;
          cleanup: () => void;
        }>;
        destroy: () => Promise<void>;
      }
    | undefined;

  try {
    document = await loadingTask.promise;

    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      try {
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => {
            if (!item.str) {
              return item.hasEOL ? "\n" : "";
            }

            return item.hasEOL ? `${item.str}\n` : item.str;
          })
          .join(" ");

        pageTexts.push(pageText);
      } finally {
        page.cleanup();
      }
    }

    const text = normalizeExtractedText(pageTexts.join("\n\n"));

    if (!text) {
      throw new Error(
        "Could not extract readable text from this PDF. Text-based PDFs work right now, but scanned or image-only PDFs still need OCR support."
      );
    }

    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF parsing error";

    if (/password|encrypted/i.test(message)) {
      throw new Error("This PDF is password-protected. Remove the password and upload it again.");
    }

    if (/invalid|malformed|corrupt/i.test(message)) {
      throw new Error("This PDF could not be read. The file may be corrupted or not a valid PDF.");
    }

    throw new Error(
      `PDF extraction failed. Text-based PDFs work right now, but scanned or image-only PDFs still need OCR support. ${message}`
    );
  } finally {
    await document?.destroy().catch(() => undefined);
  }
}
