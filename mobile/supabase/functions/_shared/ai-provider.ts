// OpenAI-primary, Gemini-fallback — the same provider order `ai-chat` uses.
//
// Why this exists rather than `share-import` calling `ai-chat` over HTTP: that
// function authenticates with `verifyAuth`, which wants a Supabase JWT. The
// share extension presents a share-import token instead (it has no session — see
// src/lib/share/import-token.ts), so there is no JWT to forward.
//
// `ai-chat/index.ts` still has its own copy of these two calls. Consolidating it
// onto this module is a safe pure refactor but it is not this change's job:
// `ai-chat` is on the critical path for every AI feature in the app, and a
// share-extension change has no business touching it.

export interface ChatMessage {
  role: string;
  content: string;
}

const GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

async function callOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: { message?: string } })?.error?.message ??
        `OpenAI API error: ${response.status}`,
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return content as string;
}

async function callGemini(
  apiKey: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const { GoogleGenerativeAI } = await import(
    'https://esm.sh/@google/generative-ai@0.21.0'
  );

  let systemInstruction: string | undefined;
  const conversational = messages.filter((m) => {
    if (m.role === 'system') {
      systemInstruction = m.content;
      return false;
    }
    return true;
  });

  const last = conversational[conversational.length - 1];
  const history = conversational.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(last?.content ?? '');
  const text = result.response.text();
  if (!text) throw new Error('Gemini returned no content');
  return text;
}

/**
 * Run a completion through whichever provider is configured and answers first.
 *
 * Throws only when BOTH providers fail (or neither is configured) — the caller
 * treats that as a retryable failure and leaves the shared link queued.
 */
export async function completeChat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 2048;

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');

  if (!openaiApiKey && !googleApiKey) {
    throw new Error('No AI API key configured on the server.');
  }

  if (openaiApiKey) {
    try {
      return await callOpenAI(
        openaiApiKey,
        messages,
        DEFAULT_OPENAI_MODEL,
        temperature,
        maxTokens,
        options.signal,
      );
    } catch (error) {
      console.error('[AI] OpenAI failed, falling back to Gemini:', error);
    }
  }

  if (googleApiKey) {
    return await callGemini(googleApiKey, messages, temperature, maxTokens);
  }

  throw new Error('All AI providers failed or are not configured.');
}
