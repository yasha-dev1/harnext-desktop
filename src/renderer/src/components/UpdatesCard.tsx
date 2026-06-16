import { useState } from 'react'
import type { JSX } from 'react'
import type { UpdateInfo } from '@shared/types'
import { Icon } from './icons'
import { describeUpdateStatus } from '../lib/update-status'

/**
 * Settings "Updates" card (#125): a manual "Check for updates" control that
 * queries GitHub releases on demand and reports whether a newer version exists,
 * with a one-click link to the release. Complements the startup popup (#162) —
 * this is the explicit, user-initiated check in Settings.
 *
 * Self-contained and defensive: `checkForUpdate` is optional so a missing bridge
 * (or a failed check) never throws.
 */
export function UpdatesCard(): JSX.Element {
  const [checking, setChecking] = useState(false)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checked, setChecked] = useState(false)

  const check = (): void => {
    setChecking(true)
    Promise.resolve(window.api.checkForUpdate?.())
      .then((res) => setInfo(res ?? null))
      .catch(() => setInfo(null))
      .finally(() => {
        setChecking(false)
        setChecked(true)
      })
  }

  const status = describeUpdateStatus(info)

  return (
    <div className="set-card">
      <div className="set-card-head">
        <Icon.refresh size={15} />
        <h3>Updates</h3>
      </div>
      <div className="set-row">
        <div className="set-rl">
          <div className="set-label">App updates</div>
          <div className="set-desc">
            {checking
              ? 'Checking GitHub for the latest release…'
              : checked
                ? status.text || 'Could not check for updates right now.'
                : 'Check whether a newer version of harnext is available.'}
          </div>
        </div>
        <div className="set-rc">
          {status.available && info?.url && (
            <button
              className="btn"
              style={{ marginRight: 8 }}
              onClick={() => void window.api.openExternal(info.url as string)}
            >
              <Icon.external size={13} />
              Download
            </button>
          )}
          <button className="btn ghost" disabled={checking} onClick={check}>
            <Icon.refresh size={13} />
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
      </div>
    </div>
  )
}
