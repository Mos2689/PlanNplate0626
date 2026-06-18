import { Hono } from "hono";
import { GoogleGenerativeAI } from "@google/generative-ai";

const openaiRouter = new Hono();

/**
 * Maps OpenAI role names to Gemini role names.
 * Gemini uses "user" and "model" (not "assistant").
 */
function toGeminiRole(role: string): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

/**
 * Convert an OpenAI-style messages array to Gemini's history + final user message format.
 * Returns { history, lastUserMessage }.
 */
function convertMessagesToGemini(
  messages: Array<{ role: string; content: string }>
): {
  systemInstruction: string | undefined;
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  lastUserMessage: string;
} {
  // Extract system message if present
  let systemInstruction: string | undefined;
  const nonSystemMessages = messages.filter((m) => {
    if (m.role === "system") {
      systemInstruction = m.content;
      return false;
    }
    return true;
  });

  if (nonSystemMessages.length === 0) {
    return { systemInstruction, history: [], lastUserMessage: "" };
  }

  const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
  const historyMessages = nonSystemMessages.slice(0, -1);

  const history = historyMessages.map((m) => ({
    role: toGeminiRole(m.role),
    parts: [{ text: m.content }],
  }));

  return {
    systemInstruction,
    history,
    lastUserMessage: lastMessage?.content ?? "",
  };
}

/**
 * Call Google Gemini and return a response in OpenAI-compatible format.
 */
async function callGemini(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const { systemInstruction, history, lastUserMessage } =
    convertMessagesToGemini(messages);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastUserMessage);
  const responseText = result.response.text();

  // Return OpenAI-compatible shape so mobile client doesn't need to change
  return {
    id: `gemini-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "gemini-2.0-flash",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: responseText,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * Call OpenAI and return the raw response data.
 */
async function callOpenAI(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      (errorData as any)?.error?.message ??
      `OpenAI API error: ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * POST /api/openai/chat
 *
 * Uses Google Gemini as the primary provider (server-side key, never exposed to client).
 * Falls back to OpenAI if Gemini is unavailable or fails.
 * The request/response format is identical to OpenAI chat completions so the
 * mobile client requires no changes.
 */
openaiRouter.post("/chat", async (c) => {
  const googleApiKey = process.env.GOOGLE_AI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!googleApiKey && !openaiApiKey) {
    return c.json({ error: "No AI API key configured on the server." }, 500);
  }

  let body: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: "messages array is required" }, 400);
  }

  const temperature = body.temperature ?? 0.8;
  const maxTokens = body.max_tokens ?? 2048;
  const openaiModel = body.model ?? "gpt-4o-mini";

  // Try Google Gemini first
  if (googleApiKey) {
    try {
      console.log("[AI] Using Google Gemini as primary provider");
      const data = await callGemini(
        googleApiKey,
        body.messages,
        temperature,
        maxTokens
      );
      return c.json(data);
    } catch (geminiError) {
      console.error(
        "[AI] Gemini failed, falling back to OpenAI:",
        geminiError
      );
      // Fall through to OpenAI fallback
    }
  }

  // Fallback to OpenAI
  if (openaiApiKey) {
    try {
      console.log("[AI] Using OpenAI as fallback provider");
      const data = await callOpenAI(
        openaiApiKey,
        body.messages,
        openaiModel,
        temperature,
        maxTokens
      );
      return c.json(data);
    } catch (openaiError) {
      const message =
        openaiError instanceof Error
          ? openaiError.message
          : "OpenAI request failed";
      console.error("[AI] OpenAI fallback also failed:", openaiError);
      return c.json({ error: message }, 500);
    }
  }

  return c.json({ error: "All AI providers failed or are not configured." }, 500);
});

/**
 * POST /api/openai/transcribe
 * Proxies audio transcription requests to OpenAI Whisper.
 * Gemini does not support audio transcription via this interface, so OpenAI is used directly.
 */
openaiRouter.post("/transcribe", async (c) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return c.json({ error: "OpenAI API key not configured on the server." }, 500);
  }

  try {
    const contentType = c.req.header("Content-Type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return c.json({ error: "multipart/form-data content type required" }, 400);
    }

    const rawBody = await c.req.arrayBuffer();

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": contentType,
      },
      body: rawBody,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[OpenAI] Transcription error:", response.status, errorData);
      return c.json(
        { error: (errorData as any)?.error?.message ?? `Transcription failed: ${response.status}` },
        response.status as any
      );
    }

    const data = await response.json() as Record<string, unknown>;
    return c.json(data);
  } catch (error) {
    console.error("[OpenAI] Transcription unexpected error:", error);
    return c.json({ error: "An unexpected error occurred" }, 500);
  }
});

export { openaiRouter };
