/**
 * Pure env-file helpers (#123) — no Electron/DB imports, so they're unit-testable.
 * The sandbox feeds the result to `docker compose --env-file` to interpolate `${VAR}`.
 */

/**
 * Parse an env-file into KEY=value pairs. Mirrors the subset compose's dotenv
 * loader accepts: blank and `#`-comment lines are skipped, a leading `export ` is
 * stripped, and the value is everything after the first `=` (surrounding matching
 * quotes removed, so a re-emitted `KEY=value` reproduces the original).
 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const body = line.startsWith('export ') ? line.slice(7).trim() : line
    const eq = body.indexOf('=')
    if (eq <= 0) continue
    const key = body.slice(0, eq).trim()
    if (!key) continue
    let value = body.slice(eq + 1).trim()
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/**
 * Merge a base env-file's raw contents with inline secrets into a single env-file
 * body. The base is kept verbatim; secret lines are appended LAST so they win
 * (compose's dotenv loader uses the last definition of a duplicate key).
 */
export function buildEnvFileContent(
  baseRaw: string | null,
  secrets: Record<string, string>
): string {
  const parts: string[] = []
  if (baseRaw && baseRaw.trim()) parts.push(baseRaw.endsWith('\n') ? baseRaw : baseRaw + '\n')
  for (const [k, v] of Object.entries(secrets)) parts.push(`${k}=${v}\n`)
  return parts.join('')
}
