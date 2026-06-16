import { useState } from 'react'
import type { JSX } from 'react'
import { Icon } from './icons'
import { failureHeadline, cleanLog, isLongError, failureGuidance } from '../lib/failure'

/**
 * Structured failure panel (#118): a concise parsed cause, optional guidance, a
 * collapsible + capped-height full log, and Retry / Dismiss — instead of dumping
 * the raw, unbounded error string into the view.
 */
export function FailurePanel({
  error,
  onDismiss,
  onRetry
}: {
  error: string
  onDismiss: () => void
  onRetry?: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const long = isLongError(error)
  const guidance = failureGuidance(error)
  return (
    <div className="fail-panel">
      <div className="fail-head">
        <span className="fail-ic">
          <Icon.alert size={15} />
        </span>
        <div className="fail-headline">{failureHeadline(error)}</div>
        <button className="fail-x" title="Dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <Icon.x size={14} />
        </button>
      </div>
      {guidance && <div className="fail-guide">{guidance}</div>}
      {long && (
        <>
          <button className="fail-toggle" onClick={() => setOpen((o) => !o)}>
            <Icon.chevron size={13} className={'fail-chev' + (open ? ' open' : '')} />
            {open ? 'Hide full log' : 'Show full log'}
          </button>
          {open && <pre className="fail-log">{cleanLog(error)}</pre>}
        </>
      )}
      <div className="fail-actions">
        {onRetry && (
          <button className="btn primary sm" onClick={onRetry}>
            <Icon.refresh size={13} />
            Retry
          </button>
        )}
        <button className="btn ghost sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
