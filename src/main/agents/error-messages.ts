// Turns raw provider/SDK call failures into actionable, human-readable messages
// (#129). A run that fails because a model doesn't exist used to surface the
// verbatim transport error — e.g. `404 404 page not found` — which gives the
// user nothing to act on. We map the common failure shapes to a message that
// names the model, the provider, and where to fix it.
//
// Pure and dependency-free so it can be unit-tested without Electron or the SDK.

export interface ModelErrorContext {
  /** Provider id the failing call ran against (e.g. "nvidia"). */
  provider?: string | null
  /** Model id the call used (e.g. "deepseek/deepseek-v4-pro"). */
  model?: string | null
}

/** Best-effort HTTP status extraction from an arbitrary thrown value. */
export function extractStatus(raw: unknown): number | null {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const k of ['status', 'statusCode', 'code']) {
      const v = obj[k]
      if (typeof v === 'number' && v >= 100 && v < 600) return v
    }
    const resp = (raw as { response?: { status?: unknown } }).response
    if (resp && typeof resp.status === 'number') return resp.status
  }
  const detail = raw instanceof Error ? raw.message : String(raw ?? '')
  // Leading/standalone 3-digit status, e.g. "404 404 page not found",
  // "status 401", "HTTP 429 Too Many Requests".
  const m = detail.match(/\b([45]\d{2})\b/)
  return m ? Number(m[1]) : null
}

/**
 * Map a raw provider/model failure to an actionable message. Falls back to the
 * raw text (or a generic line) when nothing matches, so detail is never lost.
 */
export function describeAgentError(raw: unknown, ctx: ModelErrorContext = {}): string {
  const detail = (raw instanceof Error ? raw.message : String(raw ?? '')).trim()
  const status = extractStatus(raw)
  const provider = ctx.provider?.trim() || 'the provider'
  const model = ctx.model?.trim() ? `"${ctx.model.trim()}"` : 'the selected model'

  // Model not found / wrong provider.
  if (
    status === 404 ||
    /unknown model|model.*not.*(found|exist)|no.*such.*model|page not found/i.test(detail)
  ) {
    return `Model ${model} not found on provider "${provider}". Check the model in Settings → Models.`
  }
  // Bad / missing credentials.
  if (
    status === 401 ||
    status === 403 ||
    /invalid.*api.*key|invalid.*token|unauthorized|forbidden|authentication|expired.*key/i.test(
      detail
    )
  ) {
    return `Invalid or expired API key for ${provider}. Update it in Settings → Providers.`
  }
  // Rate limiting.
  if (status === 429 || /rate.?limit|too many requests|quota/i.test(detail)) {
    return `Rate limited by ${provider} — try again shortly.`
  }
  // Connectivity / DNS / timeout.
  if (
    /timeout|timed out|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|getaddrinfo|fetch failed|network|socket hang up/i.test(
      detail
    )
  ) {
    return `Couldn't reach ${provider}. Check your connection or base URL.`
  }
  // Upstream server error.
  if (status !== null && status >= 500) {
    return `${provider[0].toUpperCase() + provider.slice(1)} had a server error (${status}) — try again shortly.`
  }

  // Unrecognised — keep the original detail rather than inventing a cause.
  return detail || `${provider} request failed.`
}
