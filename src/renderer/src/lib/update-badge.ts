import type { UpdateInfo } from '@shared/types'

/**
 * Whether to show the persistent "update available" badge on the Settings entry
 * (#125). Unlike the startup popup (`shouldShowUpdate`), the badge has **no
 * dismiss state** — it stays as a quiet, always-visible indicator for as long as
 * a newer release exists, so the user can act on it whenever they like even
 * after closing the popup.
 */
export function shouldShowBadge(info: UpdateInfo | null | undefined): boolean {
  return Boolean(info && info.isUpdate && info.latest)
}
