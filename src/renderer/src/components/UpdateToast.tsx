import type { JSX } from 'react'
import type { UpdateInfo } from '@shared/types'
import { updateLabel } from '../lib/update-popup'

/**
 * Top-right "update available" popup (#162). One-click: the primary button opens
 * the GitHub release page in the user's browser; the ✕ dismisses this version so
 * it won't reappear until a newer one ships. Purely presentational — the parent
 * decides whether to render it (via `shouldShowUpdate`) and owns the side effects.
 */
export function UpdateToast({
  info,
  onUpdate,
  onDismiss
}: {
  info: UpdateInfo
  onUpdate: () => void
  onDismiss: () => void
}): JSX.Element {
  return (
    <div className="update-toast" role="alert" aria-label="Update available">
      <button className="update-dismiss" aria-label="Dismiss update" onClick={onDismiss}>
        ✕
      </button>
      <div className="update-title">Update available</div>
      <div className="update-ver">{updateLabel(info)}</div>
      <button className="update-action" onClick={onUpdate}>
        Update now
      </button>
    </div>
  )
}
