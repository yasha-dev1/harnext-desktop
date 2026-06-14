import {
  PROVIDERS,
  OPENROUTER_BASE_URL,
  getProviderById,
  getProviderConfig,
  getStoredKey,
  listNvidiaModels,
  listOllamaModels,
  listOpenRouterModels,
  normalizeOllamaBaseUrl,
  type ProviderInfo
} from '@harnext/core'
import type { ProviderOption, ProviderVerifyResult } from '../shared/types'

const PROVIDER_SUBS: Record<string, string> = {
  anthropic: 'Claude, direct API',
  openai: 'GPT, direct API',
  google: 'Gemini, direct API',
  xai: 'Grok, direct API',
  openrouter: 'Unified gateway · 300+ models',
  groq: 'Fast open-model inference',
  mistral: 'Mistral, direct API',
  cerebras: 'Fast open-model inference',
  nvidia: 'NVIDIA NIM endpoints',
  ollama: 'Runs on this machine'
}

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
  openai: ['gpt-5.3-codex', 'gpt-5.1', 'gpt-5.1-mini'],
  google: ['gemini-3-pro-preview', 'gemini-3-flash-preview'],
  xai: ['grok-4', 'grok-3'],
  openrouter: [
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4.1',
    'openai/gpt-5.1',
    'openai/gpt-5.1-mini',
    'google/gemini-3-pro',
    'qwen/qwen3-coder-480b',
    'deepseek/deepseek-v3.2',
    'x-ai/grok-4'
  ],
  groq: ['llama-3.3-70b-versatile', 'qwen-2.5-coder-32b'],
  mistral: ['mistral-large-latest', 'codestral-latest'],
  cerebras: ['qwen-3-235b-a22b-instruct-2507'],
  nvidia: ['moonshotai/kimi-k2.5'],
  ollama: ['llama3.1', 'qwen2.5-coder']
}

/** Where each provider hands out API keys — linked from the setup wizard. */
const CONSOLE_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
  xai: 'https://console.x.ai',
  openrouter: 'https://openrouter.ai/keys',
  groq: 'https://console.groq.com/keys',
  mistral: 'https://console.mistral.ai/api-keys',
  cerebras: 'https://cloud.cerebras.ai',
  nvidia: 'https://build.nvidia.com',
  ollama: 'https://ollama.com/download'
}

function isAuthenticated(p: ProviderInfo): boolean {
  if (p.local) return Boolean(getProviderConfig(p.id)?.baseUrl ?? p.defaultBaseUrl)
  return Boolean((p.envVar && process.env[p.envVar]) || getStoredKey(p.id))
}

export function listProviders(): ProviderOption[] {
  return PROVIDERS.map((p) => {
    const models = PROVIDER_MODELS[p.id] ?? [p.defaultModel]
    return {
      id: p.id,
      name: p.name,
      sub: PROVIDER_SUBS[p.id] ?? '',
      defaultModel: p.defaultModel,
      models: models.includes(p.defaultModel) ? models : [p.defaultModel, ...models],
      authenticated: isAuthenticated(p),
      local: Boolean(p.local),
      consoleUrl: CONSOLE_URLS[p.id] ?? '',
      baseUrl: getProviderConfig(p.id)?.baseUrl ?? p.defaultBaseUrl ?? null
    }
  })
}

// ── verification ──────────────────────────────────────────────────────
// Every hosted provider here exposes an OpenAI-style model listing we can
// GET to prove the credentials actually work. The shapes differ only in the
// auth header and the JSON envelope, captured below. nvidia/ollama/openrouter
// have purpose-built helpers in core, so they bypass this map.

interface VerifySpec {
  url: string
  headers: (key: string) => Record<string, string>
  models: (json: unknown) => string[]
}

function ids(json: unknown): string[] {
  const data = (json as { data?: { id?: string }[] })?.data
  return Array.isArray(data) ? data.map((m) => m.id ?? '').filter(Boolean) : []
}

const VERIFY: Record<string, VerifySpec> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/models',
    headers: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
    models: ids
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
    models: ids
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    headers: () => ({}),
    models: (j) =>
      ((j as { models?: { name?: string }[] })?.models ?? [])
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean)
  },
  xai: {
    url: 'https://api.x.ai/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
    models: ids
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
    models: ids
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
    models: ids
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/models',
    headers: (k) => ({ authorization: `Bearer ${k}` }),
    models: ids
  }
}

function fail(status: ProviderVerifyResult['status'], message: string): ProviderVerifyResult {
  return { ok: false, status, message, models: [] }
}

export async function verifyProvider(
  providerId: string,
  cred: { key?: string; baseUrl?: string }
): Promise<ProviderVerifyResult> {
  // Local server (ollama): a successful tag listing proves it's reachable.
  if (providerId === 'ollama') {
    const base = normalizeOllamaBaseUrl(cred.baseUrl?.trim() || 'http://localhost:11434')
    try {
      const models = await listOllamaModels(base)
      if (!models.length) {
        return fail('error', 'Connected, but no models are installed. Run `ollama pull <model>`.')
      }
      return { ok: true, status: 'ok', message: 'Connected', models: models.map((m) => m.id) }
    } catch {
      return fail('unreachable', `No Ollama server reachable at ${base}.`)
    }
  }

  const key = cred.key?.trim()
  if (!key) return fail('auth', 'Enter an API key to continue.')

  try {
    if (providerId === 'nvidia') {
      const models = await listNvidiaModels(key)
      return { ok: true, status: 'ok', message: 'Verified', models: models.map((m) => m.id) }
    }
    if (providerId === 'openrouter') {
      const res = await fetchWithTimeout(`${OPENROUTER_BASE_URL}/key`, {
        authorization: `Bearer ${key}`
      })
      if (res.status === 401 || res.status === 403) return fail('auth', 'Invalid API key.')
      if (!res.ok) return fail('error', `OpenRouter returned ${res.status}.`)
      const models = await listOpenRouterModels().catch(() => [])
      return { ok: true, status: 'ok', message: 'Verified', models: models.map((m) => m.id) }
    }

    const spec = VERIFY[providerId]
    if (!spec) return { ok: true, status: 'ok', message: 'Key saved', models: [] }

    const url = providerId === 'google' ? `${spec.url}?key=${encodeURIComponent(key)}` : spec.url
    const res = await fetchWithTimeout(url, spec.headers(key))
    if (res.status === 401 || res.status === 403) return fail('auth', 'Invalid API key.')
    if (!res.ok) return fail('error', `Provider returned ${res.status} ${res.statusText}.`)
    const models = spec.models(await res.json().catch(() => ({})))
    return { ok: true, status: 'ok', message: 'Verified', models }
  } catch {
    return fail('unreachable', 'Could not reach the provider. Check your network and try again.')
  }
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    return await fetch(url, { headers, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ── live model catalog ────────────────────────────────────────────────
// The curated PROVIDER_MODELS lists are just sensible defaults — every
// provider actually exposes its full catalog over the network. Fetch it so
// the model pickers aren't limited to a hand-picked handful (OpenRouter
// alone serves 300+). Falls back to the curated list on any failure.

function storedKeyFor(info: ProviderInfo | undefined): string | undefined {
  if (!info) return undefined
  return getStoredKey(info.id) ?? (info.envVar ? process.env[info.envVar] : undefined)
}

async function fetchLiveModels(providerId: string): Promise<string[]> {
  const info = getProviderById(providerId)

  if (providerId === 'ollama') {
    const base = normalizeOllamaBaseUrl(
      getProviderConfig(providerId)?.baseUrl ?? info?.defaultBaseUrl ?? 'http://localhost:11434'
    )
    return (await listOllamaModels(base)).map((m) => m.id)
  }
  // OpenRouter's catalog is a public endpoint — no key required.
  if (providerId === 'openrouter') return (await listOpenRouterModels()).map((m) => m.id)

  const key = storedKeyFor(info)
  if (!key) return []
  if (providerId === 'nvidia') return (await listNvidiaModels(key)).map((m) => m.id)

  const spec = VERIFY[providerId]
  if (!spec) return []
  const url = providerId === 'google' ? `${spec.url}?key=${encodeURIComponent(key)}` : spec.url
  const res = await fetchWithTimeout(url, spec.headers(key))
  if (!res.ok) throw new Error(`status ${res.status}`)
  return spec.models(await res.json())
}

/**
 * Full model list for a provider: its live catalog merged after the curated
 * favourites (so common coding models stay at the top), deduped. Returns just
 * the curated list when the provider is unreachable or unconfigured.
 */
export async function getProviderModels(providerId: string): Promise<string[]> {
  const info = getProviderById(providerId)
  const curated = PROVIDER_MODELS[providerId] ?? (info ? [info.defaultModel] : [])
  try {
    const live = await fetchLiveModels(providerId)
    if (!live.length) return curated
    return Array.from(new Set([...curated, ...live]))
  } catch {
    return curated
  }
}
