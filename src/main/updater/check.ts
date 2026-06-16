import type { UpdateInfo } from '../../shared/types'
import { isNewerVersion } from './version'

// Checks GitHub's latest release for a newer version than the running app
// (#162/#125). Best-effort: any network/parse error resolves to "no update"
// so a failed check never blocks or crashes startup. The fetch is injectable
// so the logic is unit-testable without the network.

interface FetchResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<FetchResponse>

interface GithubRelease {
  tag_name?: string
  name?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
}

export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/yasha-dev1/harnext-desktop/releases/latest'

const NONE = (current: string): UpdateInfo => ({
  current,
  latest: null,
  url: null,
  isUpdate: false
})

/**
 * Resolve whether a newer release exists. `opts.fetchImpl` defaults to the
 * global fetch; `opts.url` overrides the endpoint (both for tests).
 */
export async function checkForUpdate(
  current: string,
  opts: { fetchImpl?: FetchLike; url?: string } = {}
): Promise<UpdateInfo> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined)
  if (!fetchImpl) return NONE(current)
  try {
    const res = await fetchImpl(opts.url ?? LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return NONE(current)
    const body = (await res.json()) as GithubRelease
    // `/releases/latest` already excludes drafts/prereleases, but guard anyway.
    if (body.draft || body.prerelease) return NONE(current)
    const latest = (body.tag_name ?? body.name ?? '').trim()
    if (!latest) return NONE(current)
    return {
      current,
      latest,
      url: body.html_url ?? null,
      isUpdate: isNewerVersion(latest, current)
    }
  } catch {
    return NONE(current)
  }
}
