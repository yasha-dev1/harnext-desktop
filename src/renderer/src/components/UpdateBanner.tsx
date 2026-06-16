import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { UpdateInfo } from '@shared/types'
import { Icon } from './icons'

/**
 * On startup, ask the main process whether a newer GitHub release exists and, if
 * so, show a small non-blocking toast in the top-right offering a one-click jump
 * to the release (#162). Dismissible — once dismissed it doesn't nag again this
 * session. (In-app download / quitAndInstall via electron-updater is the
 * follow-up; until then "Update" opens the release page so it's never a dead end.)
 */
export function UpdateBanner(): JSX.Element | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let live = true
    // Defensive `?.` so an older preload without this method can't crash startup.
    void Promise.resolve(window.api.checkForUpdate?.())
      .then((res) => {
        if (live && res?.isUpdate) setInfo(res)
      })
      .catch(() => {
        /* a failed check never surfaces — startup is unaffected */
      })
    return () => {
      live = false
    }
  }, [])

  if (!info || dismissed) return null
  return (
    <div className="update-toast" role="alert">
      <span className="update-ic">
        <Icon.refresh size={15} />
      </span>
      <div className="update-body">
        <div className="update-title">Update available</div>
        <div className="update-ver">
          {info.latest} <span className="update-cur">(you’re on {info.current})</span>
        </div>
      </div>
      <button
        className="update-btn"
        disabled={!info.url}
        onClick={() => info.url && void window.api.openExternal(info.url)}
      >
        Update
      </button>
      <button
        className="update-x"
        title="Dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <Icon.x size={13} />
      </button>
    </div>
  )
}
