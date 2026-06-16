import type { UpdateInfo } from '@shared/types'

/** Add a leading `v` unless the version string already has one. */
function v(s: string): string {
  return s.startsWith('v') ? s : `v${s}`
}

export interface UpdateStatusView {
  /** Is a newer release available? Drives whether the download link shows. */
  available: boolean
  /** One-line message for the Settings "Updates" card. */
  text: string
}

/**
 * Status line for the Settings "Check for updates" control (#125). Pure so the
 * card's copy is unit-testable: `info === null` means no check has run (or it
 * failed silently — the check is best-effort), otherwise we report up-to-date or
 * the available version.
 */
export function describeUpdateStatus(info: UpdateInfo | null | undefined): UpdateStatusView {
  if (!info) return { available: false, text: '' }
  if (info.isUpdate && info.latest) {
    return { available: true, text: `Update available — ${v(info.current)} → ${v(info.latest)}` }
  }
  return { available: false, text: `You're on the latest version (${v(info.current)})` }
}
