// AI Chat Edge Function
// Gemini-first, OpenAI-fallback with authentication and rate limiting

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Maps OpenAI role names to Gemini role names.
 * Gemini uses "user" and "model" (not "assistant").
 */
function toGeminiRole(role) {
  return role === 'assistant' ? 'model' : 'user';
}

/**
 * Convert an OpenAI-style messages array to Gemini's history + final user message format.
 */
function convertMessagesToGemini(messages) {
  let systemInstruction;
  const nonSystemMessages = messages.filter((m) => {
    if (m.role === 'system') {
      systemInstruction = m.content;
      return false;
    }
    return true;
  });

  if (nonSystemMessages.length === 0) {
    return { systemInstruction, history: [], lastUserMessage: '' };
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
    lastUserMessage: lastMessage?.content ?? '',
  };
}

/**
 * Call Google Gemini and return a response in OpenAI-compatible format.
 */
async function callGemini(apiKey, messages, temperature, maxTokens) {
  // Dynamic import for Google Generative AI SDK
  const { GoogleGenerativeAI } = await import('https://esm.sh/@google/generative-ai@0.21.0');

  const genAI = new GoogleGenerativeAI(apiKey);
  const { systemInstruction, history, lastUserMessage } = convertMessagesToGemini(messages);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastUserMessage);
  const responseText = result.response.text();

  return {
    id: `gemini-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: GEMINI_MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: responseText,
        },
        finish_reason: 'stop',
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
async function callOpenAI(apiKey, messages, model, temperature, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    throw new Error(errorData?.error?.message ?? `OpenAI API error: ${response.status}`);
  }

  return response.json();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify authentication
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. Check rate limit
    const rateLimitResult = await checkRateLimit(user.id);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Please try again after ${new Date(rateLimitResult.resetsAt).toLocaleTimeString()}.`,
          rateLimitRemaining: 0,
          resetsAt: rateLimitResult.resetsAt,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 3. Get request body
    const body = await req.json();

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages array is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 4. Get API keys from server secrets
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!googleApiKey && !openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'No AI API key configured on the server.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const temperature = body.temperature ?? 0.8;
    const maxTokens = body.max_tokens ?? 2048;
    const openaiModel = body.model ?? DEFAULT_MODEL;

    let data;

    // 5. Try OpenAI first (PRIMARY)
    if (openaiApiKey) {
      try {
        console.log('[AI] Using OpenAI as primary provider');
        data = await callOpenAI(openaiApiKey, body.messages, openaiModel, temperature, maxTokens);
      } catch (openaiError) {
        console.error('[AI] OpenAI failed, falling back to Gemini:', openaiError);
        data = null;
      }
    }

    // 6. Fallback to Gemini if OpenAI failed or wasn't available
    if (!data && googleApiKey) {
      try {
        console.log('[AI] Using Google Gemini as fallback provider');
        data = await callGemini(googleApiKey, body.messages, temperature, maxTokens);
      } catch (geminiError) {
        const message = geminiError instanceof Error ? geminiError.message : 'Gemini request failed';
        console.error('[AI] Gemini fallback also failed:', geminiError);
        return new Response(
          JSON.stringify({
            error: message,
            rateLimitRemaining: rateLimitResult.remaining,
            resetsAt: rateLimitResult.resetsAt,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'All AI providers failed or are not configured.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 7. Return successful response with rate limit info
    return new Response(
      JSON.stringify({
        data,
        rateLimitRemaining: rateLimitResult.remaining,
        resetsAt: rateLimitResult.resetsAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});