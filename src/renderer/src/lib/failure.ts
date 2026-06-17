// Helpers for the structured agent-failure panel (#118). A failed agent's
// `error` is often hundreds of lines of raw `docker compose` stderr with the
// real cause buried under repeated "X variable is not set" warnings.

const NOISE = /variable is not set|defaulting to a blank string/i
const CAUSE =
  /\b(conflict|already in use|already exists|error|cannot|can't|failed|denied|refused|not found|no such|unable|timed? ?out|exit code)\b/i

/** A concise one-line cause pulled from a raw, multi-line error/log. */
export function failureHeadline(raw: string): string {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return 'The agent failed.'
  const signal = lines.filter((l) => !NOISE.test(l))
  // Prefer an explicit error/conflict line; else the last meaningful line.
  const key =
    signal.find((l) => CAUSE.test(l)) ?? signal[signal.length - 1] ?? lines[lines.length - 1]
  // Strip leading log decorations (timestamps, "Error:", level tags).
  return key.replace(/^(error|err|fatal|warn(?:ing)?)[:\s-]+/i, '').slice(0, 240)
}

/**
 * Collapse runs of the repetitive "variable is not set" warnings into a single
 * summary line so the full log stays readable.
 */
export function cleanLog(raw: string): string {
  const out: string[] = []
  let noise = 0
  const flush = (): void => {
    if (noise > 0) {
      out.push(`  … ${noise} "variable is not set" warning${noise === 1 ? '' : 's'} hidden`)
      noise = 0
    }
  }
  for (const line of raw.split('\n')) {
    if (NOISE.test(line)) noise++
    else {
      flush()
      out.push(line)
    }
  }
  flush()
  return out.join('\n').trim()
}

/** True when the error is big enough to warrant a collapsible log. */
export function isLongError(raw: string): boolean {
  return raw.includes('\n') || raw.length > 200
}

/** Friendly, actionable guidance for a few known failure shapes. */
export function failureGuidance(raw: string): string | null {
  if (/already in use|name .*already exists|conflict.*container/i.test(raw)) {
    return 'A container with that name is already running. Stop your local stack (or remove the named container), then retry.'
  }
  if (/cannot connect to the docker daemon|is the docker daemon running/i.test(raw)) {
    return 'Docker isn’t running. Start Docker Desktop and retry.'
  }
  return null
}
