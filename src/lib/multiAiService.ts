// ==============================================================================
// MULTI-AI COMPLETION ENGINE
// Unified interface for OpenAI, Anthropic Claude, Google Gemini, Groq, DeepSeek, OpenRouter
// Includes automatic failover, response parsing, and high-fidelity local generator
// ==============================================================================

import {
  AIProviderId,
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  getActiveAIProvider,
  getAIProviderKey,
  getSelectedModel,
  isAutoFallbackEnabled,
} from './aiConfig';

export interface AICompletionRequest {
  provider?: AIProviderId;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface AICompletionResponse {
  text: string;
  provider: AIProviderId | 'local_fallback';
  model: string;
  latencyMs: number;
  fallbackOccurred?: boolean;
  attemptedProviders?: AIProviderId[];
}

/**
 * Execute completion using the requested or active AI provider with automatic fallback
 */
export async function executeAICompletion(
  req: AICompletionRequest
): Promise<AICompletionResponse> {
  const preferredProvider = req.provider || getActiveAIProvider();
  const allowFallback = isAutoFallbackEnabled();

  // Create candidate providers list starting with preferred
  const candidateProviders: AIProviderId[] = [preferredProvider];
  if (allowFallback) {
    for (const p of AI_PROVIDER_ORDER) {
      if (p !== preferredProvider && getAIProviderKey(p)) {
        candidateProviders.push(p);
      }
    }
  }

  const attempted: AIProviderId[] = [];
  let lastError: Error | null = null;

  for (const provider of candidateProviders) {
    const key = getAIProviderKey(provider);
    if (!key) continue;

    const model = req.model && provider === preferredProvider
      ? req.model
      : getSelectedModel(provider);

    attempted.push(provider);
    const startTime = Date.now();

    try {
      let resultText = '';

      if (provider === 'anthropic') {
        resultText = await callAnthropic({
          key,
          model,
          systemPrompt: req.systemPrompt,
          userPrompt: req.userPrompt,
          temperature: req.temperature ?? 0.7,
          maxTokens: req.maxTokens ?? 2048,
        });
      } else if (provider === 'openai') {
        resultText = await callOpenAI({
          key,
          model,
          systemPrompt: req.systemPrompt,
          userPrompt: req.userPrompt,
          temperature: req.temperature ?? 0.7,
          maxTokens: req.maxTokens ?? 2048,
          jsonMode: req.jsonMode,
        });
      } else if (provider === 'gemini') {
        resultText = await callGemini({
          key,
          model,
          systemPrompt: req.systemPrompt,
          userPrompt: req.userPrompt,
          temperature: req.temperature ?? 0.7,
          maxTokens: req.maxTokens ?? 2048,
        });
      } else if (provider === 'groq') {
        resultText = await callGroq({
          key,
          model,
          systemPrompt: req.systemPrompt,
          userPrompt: req.userPrompt,
          temperature: req.temperature ?? 0.7,
          maxTokens: req.maxTokens ?? 2048,
          jsonMode: req.jsonMode,
        });
      } else if (provider === 'deepseek') {
        resultText = await callDeepSeek({
          key,
          model,
          systemPrompt: req.systemPrompt,
          userPrompt: req.userPrompt,
          temperature: req.temperature ?? 0.7,
          maxTokens: req.maxTokens ?? 2048,
          jsonMode: req.jsonMode,
        });
      } else if (provider === 'openrouter') {
        resultText = await callOpenRouter({
          key,
          model,
          systemPrompt: req.systemPrompt,
          userPrompt: req.userPrompt,
          temperature: req.temperature ?? 0.7,
          maxTokens: req.maxTokens ?? 2048,
        });
      }

      const latencyMs = Date.now() - startTime;
      return {
        text: resultText,
        provider,
        model,
        latencyMs,
        fallbackOccurred: provider !== preferredProvider,
        attemptedProviders: attempted,
      };
    } catch (err: any) {
      console.warn(`[MultiAI] Provider ${provider} (${model}) failed:`, err.message || err);
      lastError = err;
      // If fallback not allowed, don't try next
      if (!allowFallback) break;
    }
  }

  // If Supabase edge function is available, try it before local fallback
  const edgeFunctionsUrl = (import.meta as any).env?.VITE_SUPABASE_FUNCTIONS_URL;
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
  if (edgeFunctionsUrl && anonKey && !edgeFunctionsUrl.includes('your-project-ref')) {
    try {
      const edgeStart = Date.now();
      const edgeRes = await fetch(`${edgeFunctionsUrl}/generate-ai-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          provider: preferredProvider,
          model: req.model || getSelectedModel(preferredProvider),
          systemPrompt: req.systemPrompt,
          userPrompt: req.userPrompt,
          temperature: req.temperature,
          maxTokens: req.maxTokens,
        }),
      });
      if (edgeRes.ok) {
        const data = await edgeRes.json();
        const output = data.raw || data.body || JSON.stringify(data);
        return {
          text: output,
          provider: data.provider || preferredProvider,
          model: (req.model || getSelectedModel(preferredProvider)) + ' (Server Proxy)',
          latencyMs: Date.now() - edgeStart,
          attemptedProviders: attempted,
        };
      }
    } catch (edgeErr) {
      console.warn('[MultiAI] Edge function proxy failed:', edgeErr);
    }
  }

  // If no providers worked, return synthesized fallback
  console.info('[MultiAI] No live API key succeeded; invoking high-fidelity local generator fallback.');
  const localOutput = generateLocalSynthesizedResponse(req);
  return {
    text: localOutput,
    provider: 'local_fallback',
    model: 'built-in-sales-engine',
    latencyMs: 350,
    attemptedProviders: attempted,
    fallbackOccurred: true,
  };
}

// ------------------------------------------------------------------------------
// PROVIDER-SPECIFIC HTTP IMPLEMENTATIONS
// ------------------------------------------------------------------------------

async function callAnthropic(opts: {
  key: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userPrompt }],
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorBody.error?.message || `Anthropic HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Anthropic Claude');
  return text;
}

async function callOpenAI(opts: {
  key: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
}): Promise<string> {
  const payload: any = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };

  if (opts.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorBody.error?.message || `OpenAI HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI');
  return text;
}

async function callGemini(opts: {
  key: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  // Use header for API key authentication to keep key out of query parameters and logs
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;

  const payload: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: opts.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
    },
  };

  if (opts.systemPrompt) {
    payload.system_instruction = {
      parts: [{ text: opts.systemPrompt }],
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': opts.key,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
    let errMsg = errorBody.error?.message || `Gemini HTTP ${res.status}`;
    if (res.status === 402 || errMsg.toLowerCase().includes('prepayment') || errMsg.toLowerCase().includes('depleted')) {
      errMsg = `Google Gemini: Prepayment credits depleted. Manage project billing at https://aistudio.google.com/app/apikey`;
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Google Gemini');
  return text;
}

async function callGroq(opts: {
  key: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
}): Promise<string> {
  const payload: any = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };

  if (opts.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorBody.error?.message || `Groq HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq');
  return text;
}

async function callDeepSeek(opts: {
  key: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
}): Promise<string> {
  const payload: any = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };

  if (opts.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorBody.error?.message || `DeepSeek HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from DeepSeek');
  return text;
}

async function callOpenRouter(opts: {
  key: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.key}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
      'X-Title': 'CRM Outreach Engine',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(errorBody.error?.message || `OpenRouter HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenRouter');
  return text;
}

// ------------------------------------------------------------------------------
// HIGH-FIDELITY OFFLINE LOCAL GENERATOR FALLBACK
// Returns structured JSON matching the bulk template schema so the UI works seamlessly
// even without active internet or third-party keys.
// ------------------------------------------------------------------------------
function generateLocalSynthesizedResponse(req: AICompletionRequest): string {
  // If JSON mode was requested (like bulk variations), return a rich JSON structure
  const isBulkRequest = req.userPrompt.includes('variations') || req.userPrompt.includes('bulk');

  if (isBulkRequest) {
    return JSON.stringify({
      variations: [
        {
          id: 'agency_overflow_var',
          title: 'Discreet Agency Overflow & Capacity',
          pitchAngle: 'Specialist capacity for the implementation and experimentation layer without disrupting client relationships',
          subject: 'Specialist implementation capacity for {{company}}',
          body: `Hi {{first_name}},

I’m reaching out because {{company}}’s Shopify Plus and commerce work appears to sit at the intersection of strategy, experience, and technical delivery. I wanted to ask whether your teams ever need additional specialist capacity for the implementation and experimentation layer of client work.

Ingversions Digital helps ecommerce teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements. We can take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.

For {{company}}, this could be useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations. I’d be happy to share how we typically work alongside an existing agency team without interrupting its client relationship or process.

Would a short conversation be relevant for your talent or delivery planning?

Best regards,
Uday Raj
Ingversions Digital`,
        },
        {
          id: 'shopify_cro_sprints',
          title: 'Shopify CRO & Experimentation Sprints',
          pitchAngle: 'Turn approved hypotheses into live storefront builds with verified analytics QA',
          subject: 'Shopify CRO & experimentation support for {{company}}',
          body: `Hi {{first_name}},

When your team at {{company}} is rolling out commerce transformations or conversion roadmaps, executing the backlog of A/B tests, landing-page variants, and theme tweaks can quickly strain internal engineering resources.

At Ingversions Digital, we specialize in the execution layer: turning approved hypotheses into clean Shopify builds, verifying cross-device tracking, and managing pre-launch QA so your client experiments go live without delay.

We function as a seamless extension of your delivery team with zero operational friction.

Would a quick 10-minute sync be worth exploring for your upcoming sprint planning?

Best regards,
Uday Raj
Ingversions Digital`,
        },
        {
          id: 'delivery_planning_note',
          title: 'Consultative Delivery Planning Note',
          pitchAngle: 'Direct executive inquiry on whether extra implementation capacity is relevant for upcoming quarters',
          subject: 'Quick question regarding {{company}}\'s implementation bandwidth',
          body: `Hi {{first_name}},

Quick question: does {{company}} ever bring in external specialist capacity for the implementation and experimentation layer of client work—specifically Shopify CRO, theme builds, or analytics QA?

We partner with agency teams as discreet overflow during peak delivery periods or large transformations, operating strictly in the background without touching your client relationships.

Would a brief conversation be relevant for your upcoming delivery planning?

Best regards,
Uday Raj
Ingversions Digital`,
        },
      ],
    });
  }

  // Single email draft fallback
  return JSON.stringify({
    subject: 'Specialist implementation capacity for {{company}}',
    body: `Hi {{first_name}},

I’m reaching out because {{company}}’s Shopify Plus and commerce work appears to sit at the intersection of strategy, experience, and technical delivery. I wanted to ask whether your teams ever need additional specialist capacity for the implementation and experimentation layer of client work.

Ingversions Digital helps ecommerce teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements. We can take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.

For {{company}}, this could be useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations. I’d be happy to share how we typically work alongside an existing agency team without interrupting its client relationship or process.

Would a short conversation be relevant for your talent or delivery planning?

Best regards,
Uday Raj
Ingversions Digital`,
  });
}
