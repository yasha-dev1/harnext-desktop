// Semantic-version comparison for the auto-update check (#162/#125) — decides
// whether a GitHub release tag is newer than the running app version. Pure, so
// it's fully unit-testable. Implements enough of semver precedence (incl.
// prerelease rules) for release tags like "v1.2.3" / "1.2.3-beta.1".

export interface SemVer {
  major: number
  minor: number
  patch: number
  /** Dot-separated prerelease identifiers ([] for a normal release). */
  prerelease: string[]
}

/** Parse "v1.2.3" / "1.2.3-rc.1" → SemVer, or null when it isn't a version. */
export function parseVersion(raw: string | null | undefined): SemVer | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec((raw ?? '').trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : []
  }
}

/** -1 / 0 / 1 comparing `a` to `b` by semver precedence. Unparseable → 0 (equal). */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1
  }
  // A release outranks any prerelease of the same x.y.z (1.0.0 > 1.0.0-rc.1).
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0
  if (pa.prerelease.length === 0) return 1
  if (pb.prerelease.length === 0) return -1
  // Compare prerelease identifiers left to right.
  const n = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < n; i++) {
    const x = pa.prerelease[i]
    const y = pb.prerelease[i]
    if (x === undefined) return -1 // fewer identifiers ⇒ lower precedence
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    } else if (x !== y) {
      // Numeric identifiers always rank lower than alphanumeric ones.
      if (xn !== yn) return xn ? -1 : 1
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** True when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}
