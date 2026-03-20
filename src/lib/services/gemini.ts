import { EdgeType } from "@/lib/types";

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiSemanticConcept {
  title: string;
  summary: string;
  confidence: number;
  evidence: string[];
}

export interface GeminiSemanticRelationship {
  sourceTitle: string;
  targetTitle: string;
  type: EdgeType;
  weight: number;
  evidence: string[];
}

export interface GeminiSemanticExtraction {
  summary: string;
  concepts: GeminiSemanticConcept[];
  relationships: GeminiSemanticRelationship[];
}

export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new GeminiUnavailableError("GEMINI_API_KEY is not configured");
  }

  return {
    apiKey,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    endpoint: process.env.GEMINI_API_BASE_URL?.trim() || DEFAULT_GEMINI_ENDPOINT
  };
}

function buildPrompt(moduleTitle: string, sourceTitle: string, sourceContent: string): string {
  return [
    "You extract learning concepts from study notes for a knowledge graph.",
    "Return JSON only.",
    "Schema:",
    '{ "summary": string, "concepts": [{ "title": string, "summary": string, "confidence": number, "evidence": string[] }], "relationships": [{ "sourceTitle": string, "targetTitle": string, "type": "similar_to" | "prerequisite_of" | "part_of" | "applies_to" | "contrasts_with", "weight": number, "evidence": string[] }] }',
    "Requirements:",
    "- Use concise, specific titles.",
    "- Keep concept summaries under 240 characters.",
    "- Confidence and weight must be numbers between 0 and 1.",
    "- Evidence strings must be short verbatim excerpts from the source text.",
    "- Only include relationships supported by the source.",
    "",
    `Module: ${moduleTitle}`,
    `Source: ${sourceTitle}`,
    "Notes:",
    sourceContent.slice(0, 30000)
  ].join("\n");
}

function isEdgeType(value: string): value is EdgeType {
  return (
    value === "similar_to" ||
    value === "prerequisite_of" ||
    value === "part_of" ||
    value === "applies_to" ||
    value === "contrasts_with"
  );
}

function clampScore(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Number(Math.max(0, Math.min(1, numeric)).toFixed(2));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);
}

function extractTextCandidate(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return "";
  }

  const directText = Reflect.get(payload, "text");
  if (typeof directText === "string") {
    return directText;
  }

  const candidates = Reflect.get(payload, "candidates");
  if (!Array.isArray(candidates)) {
    return "";
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const content = Reflect.get(candidate, "content");
    if (!content || typeof content !== "object") {
      continue;
    }

    const parts = Reflect.get(content, "parts");
    if (!Array.isArray(parts)) {
      continue;
    }

    const joined = parts
      .map((part) => (part && typeof part === "object" && typeof Reflect.get(part, "text") === "string"
        ? String(Reflect.get(part, "text"))
        : ""))
      .filter(Boolean)
      .join("\n");

    if (joined) {
      return joined;
    }
  }

  return "";
}

function parseGeminiPayload(payload: unknown): GeminiSemanticExtraction {
  const rawText = extractTextCandidate(payload).trim();
  if (!rawText) {
    throw new GeminiUnavailableError("Gemini returned an empty response");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new GeminiUnavailableError("Gemini returned invalid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new GeminiUnavailableError("Gemini returned an unexpected payload");
  }

  const summary =
    typeof Reflect.get(parsed, "summary") === "string" ? String(Reflect.get(parsed, "summary")).trim() : "";
  const concepts = Array.isArray(Reflect.get(parsed, "concepts"))
    ? (Reflect.get(parsed, "concepts") as unknown[])
    : [];
  const relationships = Array.isArray(Reflect.get(parsed, "relationships"))
    ? (Reflect.get(parsed, "relationships") as unknown[])
    : [];

  const normalizedConcepts = concepts
    .map((concept) => {
      if (!concept || typeof concept !== "object") {
        return null;
      }

      const title = typeof Reflect.get(concept, "title") === "string" ? String(Reflect.get(concept, "title")).trim() : "";
      const conceptSummary =
        typeof Reflect.get(concept, "summary") === "string" ? String(Reflect.get(concept, "summary")).trim() : "";

      if (!title || !conceptSummary) {
        return null;
      }

      return {
        title,
        summary: conceptSummary.slice(0, 240),
        confidence: clampScore(Reflect.get(concept, "confidence"), 0.72),
        evidence: toStringArray(Reflect.get(concept, "evidence"))
      };
    })
    .filter((concept): concept is GeminiSemanticConcept => Boolean(concept))
    .slice(0, 12);

  const normalizedRelationships = relationships
    .map((relationship) => {
      if (!relationship || typeof relationship !== "object") {
        return null;
      }

      const sourceTitle =
        typeof Reflect.get(relationship, "sourceTitle") === "string"
          ? String(Reflect.get(relationship, "sourceTitle")).trim()
          : "";
      const targetTitle =
        typeof Reflect.get(relationship, "targetTitle") === "string"
          ? String(Reflect.get(relationship, "targetTitle")).trim()
          : "";
      const type = Reflect.get(relationship, "type");
      const relationshipType = typeof type === "string" ? type : "";

      if (!sourceTitle || !targetTitle || !isEdgeType(relationshipType)) {
        return null;
      }

      return {
        sourceTitle,
        targetTitle,
        type: relationshipType,
        weight: clampScore(Reflect.get(relationship, "weight"), 0.68),
        evidence: toStringArray(Reflect.get(relationship, "evidence"))
      };
    })
    .filter((relationship): relationship is GeminiSemanticRelationship => Boolean(relationship))
    .slice(0, 20);

  if (!normalizedConcepts.length) {
    throw new GeminiUnavailableError("Gemini returned no usable concepts");
  }

  return {
    summary: summary.slice(0, 320),
    concepts: normalizedConcepts,
    relationships: normalizedRelationships
  };
}

export async function requestGeminiSemanticExtraction(input: {
  moduleTitle: string;
  sourceTitle: string;
  sourceContent: string;
}): Promise<GeminiSemanticExtraction> {
  const { apiKey, endpoint, model } = getGeminiConfig();
  const response = await fetch(`${endpoint}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(input.moduleTitle, input.sourceTitle, input.sourceContent) }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new GeminiUnavailableError(`Gemini request failed (${response.status})${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return parseGeminiPayload(payload);
}
