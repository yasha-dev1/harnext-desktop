import type { JSX } from 'react'
import type { AgentStatus } from '@shared/types'
import { STATUS } from '../lib/ui'

export default function StatusPill({
  status,
  sm
}: {
  status: AgentStatus
  sm?: boolean
}): JSX.Element {
  const s = STATUS[status]
  return (
    <span className={'spill ' + s.cls + (sm ? ' sm' : '')}>
      <span className={'sdot' + (s.spin ? ' spin' : '')} />
      {s.label}
    </span>
  )
}
