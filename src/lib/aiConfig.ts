// ==============================================================================
// MULTI-AI SYSTEM CONFIGURATION & API KEY MANAGER
// Supports: OpenAI, Anthropic Claude, Google Gemini, Groq, DeepSeek, OpenRouter
// ==============================================================================

import { encryptSecret, decryptSecret, maskApiKey } from './authCrypto';

export { maskApiKey };

export type AIProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'deepseek'
  | 'openrouter';

export interface AIModelOption {
  id: string;
  name: string;
  recommended?: boolean;
  contextWindow?: string;
  description?: string;
}

export interface AIProviderMeta {
  id: AIProviderId;
  name: string;
  shortName: string;
  description: string;
  websiteUrl: string;
  apiKeyHelpUrl: string;
  apiKeyPlaceholder: string;
  envKeyName: string;
  defaultModel: string;
  models: AIModelOption[];
  badgeColor: string;
  iconBg: string;
}

export const AI_PROVIDERS: Record<AIProviderId, AIProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    description: 'Gold standard for nuanced, highly professional B2B outreach and persuasive email copy.',
    websiteUrl: 'https://anthropic.com',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    envKeyName: 'VITE_ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-5-sonnet-latest',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-200',
    iconBg: 'bg-amber-600 text-white',
    models: [
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet (Best Quality)', recommended: true, description: 'Exceptional reasoning and conversion-driven sales tone' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Ultra Fast)', description: 'Lightweight, rapid execution for high-volume batches' },
      { id: 'claude-3-opus-latest', name: 'Claude 3 Opus (Deep Reasoning)', description: 'Comprehensive strategic positioning' },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI ChatGPT',
    shortName: 'OpenAI',
    description: 'Premier AI foundation models with sharp executive tone and strong structuring capabilities.',
    websiteUrl: 'https://openai.com',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-proj-...',
    envKeyName: 'VITE_OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    iconBg: 'bg-emerald-600 text-white',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Omni Flagship)', recommended: true, description: 'Smartest and most versatile model for business communication' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cost Effective)', description: 'Fast, efficient model for bulk email generation' },
      { id: 'o3-mini', name: 'o3-mini (Reasoning Focused)', description: 'Deep analytical and structured proposal generation' },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    description: 'High-speed multimodality and massive context windows, with generous free/low-cost tiers.',
    websiteUrl: 'https://ai.google.dev',
    apiKeyHelpUrl: 'https://aistudio.google.com/app/apikey',
    apiKeyPlaceholder: 'AIzaSy...',
    envKeyName: 'VITE_GEMINI_API_KEY',
    defaultModel: 'gemini-1.5-flash',
    badgeColor: 'bg-blue-100 text-blue-900 border-blue-200',
    iconBg: 'bg-blue-600 text-white',
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast & Smart)', recommended: true, description: 'High speed and concise, impactful B2B messaging' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen Fast)', description: 'Next-generation fast multimodal reasoning engine' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Deep Intelligence)', description: 'Complex multi-paragraph client proposals and research' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Latest ultra-low latency generation engine' },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq (LPU Inference)',
    shortName: 'Groq',
    description: 'Near-instantaneous inference speed running state-of-the-art open models like Llama 3.3.',
    websiteUrl: 'https://groq.com',
    apiKeyHelpUrl: 'https://console.groq.com/keys',
    apiKeyPlaceholder: 'gsk_...',
    envKeyName: 'VITE_GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    badgeColor: 'bg-orange-100 text-orange-900 border-orange-200',
    iconBg: 'bg-orange-600 text-white',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', recommended: true, description: 'Top tier open-weights intelligence at lightning speed' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', description: 'Sub-second bulk generation for hundreds of leads' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'Balanced MoE model with long context memory' },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek AI',
    shortName: 'DeepSeek',
    description: 'Exceptional open-architecture reasoning models with competitive enterprise pricing.',
    websiteUrl: 'https://deepseek.com',
    apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyPlaceholder: 'sk-...',
    envKeyName: 'VITE_DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    badgeColor: 'bg-cyan-100 text-cyan-900 border-cyan-200',
    iconBg: 'bg-cyan-600 text-white',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3 (Chat)', recommended: true, description: 'Versatile general-purpose model for commercial emails' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (Reasoner)', description: 'Chain-of-thought reasoning for technical sales briefs' },
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    shortName: 'OpenRouter',
    description: 'Unified gateway providing access to 200+ models from Claude, GPT-4, Llama, and Mistral with a single key.',
    websiteUrl: 'https://openrouter.ai',
    apiKeyHelpUrl: 'https://openrouter.ai/keys',
    apiKeyPlaceholder: 'sk-or-v1-...',
    envKeyName: 'VITE_OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    badgeColor: 'bg-purple-100 text-purple-900 border-purple-200',
    iconBg: 'bg-purple-600 text-white',
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (via OpenRouter)', recommended: true, description: 'Top sales copy model via universal billing' },
      { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o (via OpenRouter)', description: 'Flagship OpenAI model with universal routing' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (via OpenRouter)', description: 'High performance open model' },
      { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5 (via OpenRouter)', description: 'Cost-effective high-throughput generation' },
    ],
  },
};

export const AI_PROVIDER_ORDER: AIProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'groq',
  'deepseek',
  'openrouter',
];

// ------------------------------------------------------------------------------
// STORAGE KEYS
// ------------------------------------------------------------------------------
const STORAGE_PREFIX = 'crm_ai_';

export function getAIProviderKey(provider: AIProviderId): string {
  if (typeof window === 'undefined') return '';
  const localKey = localStorage.getItem(`${STORAGE_PREFIX}key_${provider}`);
  if (localKey && localKey.trim()) {
    return decryptSecret(localKey.trim());
  }

  // Backward compatibility with previous anthropic key
  if (provider === 'anthropic') {
    const legacy = localStorage.getItem('crm_anthropic_api_key');
    if (legacy && legacy.trim()) {
      return decryptSecret(legacy.trim());
    }
  }

  // Fallback to Vite env variables if set
  const metaEnv = (import.meta as any).env || {};
  const envKey = metaEnv[AI_PROVIDERS[provider].envKeyName];
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }

  return '';
}

export function getMaskedAIProviderKey(provider: AIProviderId): string {
  const key = getAIProviderKey(provider);
  return maskApiKey(key);
}

export function setAIProviderKey(provider: AIProviderId, key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();

  // If input is already masked (e.g. user didn't change it), do not overwrite with masked asterisks
  if (trimmed.includes('••••')) {
    return;
  }

  if (trimmed) {
    const cipher = encryptSecret(trimmed);
    localStorage.setItem(`${STORAGE_PREFIX}key_${provider}`, cipher);
    if (provider === 'anthropic') {
      localStorage.setItem('crm_anthropic_api_key', cipher);
    }
  } else {
    localStorage.removeItem(`${STORAGE_PREFIX}key_${provider}`);
    if (provider === 'anthropic') {
      localStorage.removeItem('crm_anthropic_api_key');
    }
  }
  dispatchAIConfigChanged();
}

export function getSelectedModel(provider: AIProviderId): string {
  if (typeof window === 'undefined') return AI_PROVIDERS[provider].defaultModel;
  const stored = localStorage.getItem(`${STORAGE_PREFIX}model_${provider}`);
  if (stored && stored.trim()) return stored.trim();
  return AI_PROVIDERS[provider].defaultModel;
}

export function setSelectedModel(provider: AIProviderId, model: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}model_${provider}`, model.trim());
  dispatchAIConfigChanged();
}

export function getActiveAIProvider(): AIProviderId {
  if (typeof window === 'undefined') return 'anthropic';
  const stored = localStorage.getItem(`${STORAGE_PREFIX}active_provider`) as AIProviderId;
  if (stored && AI_PROVIDERS[stored]) {
    // If the stored provider has a key, use it
    if (getAIProviderKey(stored)) return stored;
  }

  // Otherwise pick the first provider that has an active key
  for (const id of AI_PROVIDER_ORDER) {
    if (getAIProviderKey(id)) return id;
  }

  // Default to anthropic or openai
  return stored && AI_PROVIDERS[stored] ? stored : 'anthropic';
}

export function setActiveAIProvider(provider: AIProviderId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}active_provider`, provider);
  dispatchAIConfigChanged();
}

export function isAutoFallbackEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(`${STORAGE_PREFIX}auto_fallback`);
  return val === null ? true : val === 'true';
}

export function setAutoFallbackEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}auto_fallback`, enabled ? 'true' : 'false');
  dispatchAIConfigChanged();
}

export function getAllConfiguredProviders(): Array<{
  id: AIProviderId;
  meta: AIProviderMeta;
  hasKey: boolean;
  selectedModel: string;
  isActive: boolean;
}> {
  const active = getActiveAIProvider();
  return AI_PROVIDER_ORDER.map((id) => {
    const key = getAIProviderKey(id);
    return {
      id,
      meta: AI_PROVIDERS[id],
      hasKey: Boolean(key),
      selectedModel: getSelectedModel(id),
      isActive: id === active,
    };
  });
}

export function hasAnyAIKeyConfigured(): boolean {
  return AI_PROVIDER_ORDER.some((id) => Boolean(getAIProviderKey(id)));
}

// ------------------------------------------------------------------------------
// EVENT BUS FOR LIVE UPDATES
// ------------------------------------------------------------------------------
export function dispatchAIConfigChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm_ai_config_updated'));
  }
}

// ------------------------------------------------------------------------------
// LIVE CONNECTION TESTER
// Verifies that a given API key is valid and can generate a test completion
// ------------------------------------------------------------------------------
export interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  provider: AIProviderId;
  model: string;
  message: string;
  error?: string;
}

export async function testAIConnection(
  provider: AIProviderId,
  explicitKey?: string,
  explicitModel?: string
): Promise<ConnectionTestResult> {
  const key = (explicitKey || getAIProviderKey(provider)).trim();
  const model = explicitModel || getSelectedModel(provider);

  if (!key) {
    return {
      success: false,
      latencyMs: 0,
      provider,
      model,
      message: 'API key is missing. Please enter a key.',
      error: 'Missing key',
    };
  }

  const startTime = Date.now();

  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "pong"' }],
          max_tokens: 5,
        }),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      return {
        success: true,
        latencyMs,
        provider,
        model,
        message: `Successfully connected to OpenAI (${model}) in ${latencyMs}ms`,
      };
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Ping' }],
        }),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      return {
        success: true,
        latencyMs,
        provider,
        model,
        message: `Successfully connected to Claude (${model}) in ${latencyMs}ms`,
      };
    }

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        let errMsg = err.error?.message || `HTTP ${res.status}`;
        if (res.status === 402 || errMsg.toLowerCase().includes('prepayment') || errMsg.toLowerCase().includes('depleted')) {
          errMsg = `Google AI Studio: Key verified, but prepayment credits are depleted. Visit https://aistudio.google.com/app/apikey to manage billing, or auto-failover will engage.`;
        }
        throw new Error(errMsg);
      }
      return {
        success: true,
        latencyMs,
        provider,
        model,
        message: `Successfully connected to Google Gemini (${model}) in ${latencyMs}ms`,
      };
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      return {
        success: true,
        latencyMs,
        provider,
        model,
        message: `Successfully connected to Groq (${model}) in ${latencyMs}ms`,
      };
    }

    if (provider === 'deepseek') {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      return {
        success: true,
        latencyMs,
        provider,
        model,
        message: `Successfully connected to DeepSeek (${model}) in ${latencyMs}ms`,
      };
    }

    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
          'X-Title': 'CRM Outreach Engine',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      return {
        success: true,
        latencyMs,
        provider,
        model,
        message: `Successfully connected to OpenRouter (${model}) in ${latencyMs}ms`,
      };
    }

    throw new Error(`Unsupported provider: ${provider}`);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      latencyMs,
      provider,
      model,
      message: `Failed to connect: ${err.message || String(err)}`,
      error: err.message || String(err),
    };
  }
}
