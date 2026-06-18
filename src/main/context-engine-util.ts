// Pure helpers for the Context Engine device-flow driver (#111), split out from
// contextEngine.ts so they're unit-testable without pulling in electron or the
// @harnext/core cloud client.

/**
 * Best-effort org/project id from an access token's JWT payload. The granted
 * project equals the `org` claim (server settings); we also accept `org_id` /
 * `tenant` as fallbacks. Returns undefined for anything that isn't a JWT with a
 * string org claim — never throws (the connected UI just omits the project then).
 */
export function orgFromToken(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return undefined
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    const org = json.org ?? json.org_id ?? json.tenant
    return typeof org === 'string' ? org : undefined
  } catch {
    return undefined
  }
}

/**
 * Normalize a user-entered base URL before it's persisted: trim surrounding
 * whitespace and drop trailing slashes so requests build clean paths
 * (`{base}/oauth/device/code`, not `{base}//oauth/...`).
 */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
