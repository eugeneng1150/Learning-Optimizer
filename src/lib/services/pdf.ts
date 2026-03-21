import { PDFParse } from "pdf-parse";

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy().catch(() => undefined);
  const text = normalizeExtractedText(result.text ?? "");

  if (!text) {
    throw new Error("Could not extract readable text from this PDF");
  }

  return text;
}
