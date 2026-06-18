// OpenAI Audio Transcription Edge Function (Whisper)
// Proxies audio transcription requests to OpenAI with authentication and rate limiting

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

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
          rateLimitRemaining: rateLimitResult.remaining,
          resetsAt: rateLimitResult.resetsAt,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 3. Get the form data from the request
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: audio file is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 4. Get OpenAI API key from server secrets
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 5. Build form data for OpenAI
    const openaiFormData = new FormData();
    openaiFormData.append('file', file);
    openaiFormData.append('model', formData.get('model') || 'whisper-1');

    // Optional parameters
    const language = formData.get('language');
    if (language) {
      openaiFormData.append('language', language);
    }

    const prompt = formData.get('prompt');
    if (prompt) {
      openaiFormData.append('prompt', prompt);
    }

    const responseFormat = formData.get('response_format');
    if (responseFormat) {
      openaiFormData.append('response_format', responseFormat);
    }

    // 6. Forward request to OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: openaiFormData,
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json().catch(() => ({}));
      console.error('OpenAI API error:', openaiResponse.status, errorData);
      return new Response(
        JSON.stringify({
          error: errorData.error?.message || 'OpenAI API request failed',
          rateLimitRemaining: rateLimitResult.remaining,
          resetsAt: rateLimitResult.resetsAt,
        }),
        {
          status: openaiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const openaiData = await openaiResponse.json();

    // 7. Return successful response with rate limit info
    return new Response(
      JSON.stringify({
        data: openaiData,
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
