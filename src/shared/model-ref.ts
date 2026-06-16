/**
 * Provider-qualified model references (#103).
 *
 * Today a model selection is a bare id (`claude-opus-4-8`) that implicitly
 * belongs to the single active `provider`. To let `model` / `smart` / `executor`
 * each live on a *different* connected provider (e.g. smart = Anthropic Opus,
 * executor = OpenRouter DeepSeek), we qualify each selection with its provider as
 * a `"<provider>:<modelId>"` ref and derive the session's provider from the ref.
 *
 * Separator note: the provider is always the prefix up to the FIRST `:`. Provider
 * ids are simple slugs (`anthropic`, `openrouter`, `ollama`), while model ids may
 * themselves contain `:` (ollama tags like `llama3:8b`) or `/` (openrouter like
 * `deepseek/deepseek-chat`) — those live entirely in the suffix. Parsing only
 * treats the prefix as a provider when it matches a *known* provider id, so a
 * legacy bare `llama3:8b` is still read as a bare model id, not provider `llama3`.
 *
 * Pure and dependency-free so it's shared by the main process (to pick a
 * session's provider) and the renderer (to build the cross-provider picker), and
 * fully unit-testable in CI.
 */

export interface ModelRef {
  provider: string
  modelId: string
}

/** Compose a `"<provider>:<modelId>"` ref. */
export function formatModelRef(provider: string, modelId: string): string {
  return `${provider}:${modelId}`
}

export interface ParseOpts {
  /** Known provider ids — only a matching prefix is treated as a provider. */
  providers: string[]
  /** Provider to attribute a bare (unqualified) id to — the active provider. */
  fallback: string
}

/**
 * Resolve a stored selection to `{ provider, modelId }`. A qualified ref
 * (`anthropic:claude-opus`) splits on its first `:` when the prefix is a known
 * provider; anything else (a bare id, or a `:` that isn't a provider prefix such
 * as `llama3:8b`) is attributed to `fallback` unchanged — this is the migration
 * path for today's bare-id settings.
 */
export function parseModelRef(ref: string | null | undefined, opts: ParseOpts): ModelRef {
  const raw = (ref ?? '').trim()
  if (!raw) return { provider: opts.fallback, modelId: '' }
  const idx = raw.indexOf(':')
  if (idx > 0) {
    const prefix = raw.slice(0, idx)
    if (opts.providers.includes(prefix)) {
      return { provider: prefix, modelId: raw.slice(idx + 1) }
    }
  }
  return { provider: opts.fallback, modelId: raw }
}

/** The provider a session should run on for a stored selection (item 3). */
export function resolveModelProvider(ref: string | null | undefined, opts: ParseOpts): string {
  return parseModelRef(ref, opts).provider
}

/** Migrate a bare model id to a qualified ref under `provider` (item 5). */
export function migrateBareModel(bareId: string, provider: string): string {
  if (!bareId) return ''
  // Already qualified? leave it (idempotent migration).
  const idx = bareId.indexOf(':')
  if (idx > 0 && bareId.slice(0, idx) === provider) return bareId
  return formatModelRef(provider, bareId)
}

export interface ProviderModels {
  id: string
  name?: string
  authenticated?: boolean
  models: string[]
}

export interface ModelGroup {
  provider: string
  label: string
  options: { ref: string; modelId: string }[]
}

/**
 * Build the cross-provider model list for the picker (item 2): one group per
 * connected provider, each model carried as a qualified ref so selecting it
 * captures its provider. Only authenticated providers contribute (the user can't
 * run a model on a provider with no key); order is preserved.
 */
export function buildModelGroups(providers: ProviderModels[]): ModelGroup[] {
  return providers
    .filter((p) => p.authenticated !== false && p.models.length > 0)
    .map((p) => ({
      provider: p.id,
      label: p.name ?? p.id,
      options: p.models.map((modelId) => ({ ref: formatModelRef(p.id, modelId), modelId }))
    }))
}
