import { task, logger } from "@trigger.dev/sdk";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";

export interface GeminiPayload {
  model: string;
  prompt: string;
  systemPrompt?: string;
  /** image urls for multimodal vision (handle accepts multiple) */
  images?: string[];
  videos?: string[];
  audios?: string[];
  files?: string[];
  settings?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    seed?: number;
  };
}

export interface GeminiResult {
  text: string;
}

const MIME_FALLBACK = "image/png";

async function urlToInlinePart(url: string): Promise<Part | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? MIME_FALLBACK;
    const buf = Buffer.from(await res.arrayBuffer());
    return { inlineData: { data: buf.toString("base64"), mimeType } };
  } catch {
    return null;
  }
}

/** Run a Google Gemini prompt (with optional multimodal inputs) as a Trigger.dev task. */
export const geminiTask = task({
  id: "gemini",
  maxDuration: 120,
  run: async (payload: GeminiPayload): Promise<GeminiResult> => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    if (!payload.prompt?.trim()) throw new Error("Gemini: prompt is required.");

    const genAI = new GoogleGenerativeAI(apiKey);
    // The UI keeps "gemini-3.1-pro" to match the Galaxy.ai reference, but that
    // isn't a real Google model — map display names to real model ids.
    // gemini-2.5-pro is heavily rate-limited on the free tier (429), so the
    // "gemini-3.1-pro" display name maps to the free-tier-friendly flash model.
    const MODEL_ALIASES: Record<string, string> = {
      "gemini-3.1-pro": "gemini-2.5-flash",
    };
    const requested =
      payload.model || process.env.GEMINI_DEFAULT_MODEL || "gemini-2.5-flash";
    const modelId = MODEL_ALIASES[requested] ?? requested;

    const model = genAI.getGenerativeModel({
      model: modelId,
      ...(payload.systemPrompt
        ? { systemInstruction: payload.systemPrompt }
        : {}),
      generationConfig: {
        temperature: payload.settings?.temperature ?? 0.7,
        maxOutputTokens: payload.settings?.maxOutputTokens ?? 1024,
        topP: payload.settings?.topP ?? 1,
        // forward optional params only when set (0 = "unset" in our UI)
        ...(payload.settings?.topK ? { topK: payload.settings.topK } : {}),
        ...(payload.settings?.frequencyPenalty
          ? { frequencyPenalty: payload.settings.frequencyPenalty }
          : {}),
        ...(payload.settings?.presencePenalty
          ? { presencePenalty: payload.settings.presencePenalty }
          : {}),
        ...(payload.settings?.seed ? { seed: payload.settings.seed } : {}),
      },
    });

    const mediaUrls = [
      ...(payload.images ?? []),
      ...(payload.videos ?? []),
      ...(payload.audios ?? []),
      ...(payload.files ?? []),
    ];
    const mediaParts = (
      await Promise.all(mediaUrls.map((u) => urlToInlinePart(u)))
    ).filter((p): p is Part => p !== null);

    logger.info("Gemini: generating", {
      model: modelId,
      mediaCount: mediaParts.length,
    });

    const parts: Part[] = [{ text: payload.prompt }, ...mediaParts];

    // Retry transient errors (503 overloaded / 500 / network); fail fast on
    // non-transient ones (invalid key, quota, model not found).
    const DELAYS = [1500, 3000, 6000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
      try {
        const result = await model.generateContent(parts);
        return { text: result.response.text() };
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient =
          /\b503\b|\b500\b|UNAVAILABLE|overloaded|deadline|ECONNRESET|fetch failed|temporarily/i.test(
            msg
          );
        if (!transient || attempt === DELAYS.length) {
          throw new Error(conciseGeminiError(err, modelId));
        }
        logger.warn(`Gemini transient error — retrying (${attempt + 1})`, {
          error: msg.slice(0, 140),
        });
        await new Promise((r) => setTimeout(r, DELAYS[attempt]));
      }
    }
    throw new Error(conciseGeminiError(lastErr, modelId));
  },
});

/** Turn verbose GoogleGenerativeAI errors into a short, user-readable message. */
function conciseGeminiError(err: unknown, modelId: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return `Quota/rate limit exceeded for ${modelId}. Try gemini-2.5-flash or enable billing.`;
  }
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
    return "Invalid Google API key (GOOGLE_GENERATIVE_AI_API_KEY).";
  }
  if (/not found|404/i.test(msg)) {
    return `Model "${modelId}" is not available.`;
  }
  if (/SAFETY|blocked/i.test(msg)) {
    return "Response blocked by Gemini safety filters.";
  }
  // fallback: first line, trimmed
  return msg.split("\n")[0]!.slice(0, 160);
}
