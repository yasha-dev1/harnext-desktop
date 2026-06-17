import type { UpdateInfo } from '@shared/types'

/**
 * Decide whether the top-right update popup should be shown (#162).
 *
 * Show it only when the check actually found a newer release AND the user
 * hasn't already dismissed *that specific* version — so dismissing v1.2.0
 * silences it until v1.3.0 ships, instead of nagging on every startup.
 */
export function shouldShowUpdate(
  info: UpdateInfo | null | undefined,
  dismissedVersion: string | null
): boolean {
  if (!info || !info.isUpdate || !info.latest) return false
  return info.latest !== dismissedVersion
}

/** Human label for the popup, e.g. `v0.1.16 → v0.2.0`. Tolerates a missing tag. */
export function updateLabel(info: UpdateInfo): string {
  const v = (s: string): string => (s.startsWith('v') ? s : `v${s}`)
  return info.latest ? `${v(info.current)} → ${v(info.latest)}` : v(info.current)
}
