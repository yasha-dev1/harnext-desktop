// Cross-provider model catalog (#103). Today a single "active provider" gates
// which models the pickers show; using Anthropic Opus *and* OpenRouter DeepSeek
// at once needs a flat catalog of every authenticated provider's models, each
// tagged with its provider. Model ids are only unique *within* a provider
// (e.g. both Anthropic and OpenRouter list a "claude" model), so entries are
// keyed by a `<provider>:<model>` ref. Pure, so it's unit-testable.

export interface ProviderModels {
  id: string
  name: string
  models: string[]
  authenticated: boolean
}

export interface CatalogEntry {
  /** Stable cross-provider id: `<provider>:<model>`. */
  ref: string
  /** Provider id (e.g. "anthropic"). */
  provider: string
  /** Provider display name (e.g. "Anthropic"). */
  providerName: string
  /** Model id within the provider (e.g. "claude-opus-4-8"). */
  model: string
  /** Display label, e.g. "claude-opus-4-8 · Anthropic". */
  label: string
}

/** `<provider>:<model>` — the catalog's stable cross-provider id for a model. */
export function formatModelRef(provider: string, model: string): string {
  return `${provider}:${model}`
}

/** Split a `<provider>:<model>` ref (on the first `:`), or null if malformed. */
export function parseModelRef(ref: string): { provider: string; model: string } | null {
  const i = ref.indexOf(':')
  if (i <= 0 || i === ref.length - 1) return null
  return { provider: ref.slice(0, i), model: ref.slice(i + 1) }
}

/**
 * Flat catalog of every **authenticated** provider's models, for a unified
 * multi-provider picker. Deduped by ref; preserves provider order, then each
 * provider's model order.
 */
export function buildModelCatalog(providers: ProviderModels[]): CatalogEntry[] {
  const out: CatalogEntry[] = []
  const seen = new Set<string>()
  for (const p of providers) {
    if (!p.authenticated) continue
    for (const model of p.models) {
      const ref = formatModelRef(p.id, model)
      if (seen.has(ref)) continue
      seen.add(ref)
      out.push({ ref, provider: p.id, providerName: p.name, model, label: `${model} · ${p.name}` })
    }
  }
  return out
}
