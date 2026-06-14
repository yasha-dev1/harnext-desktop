import { useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { timeAgo, timeUntil } from '../lib/ui'
import { useNow } from '../lib/useNow'
import { Icon } from '../components/icons'

export default function LoopsHome(): JSX.Element {
  const { projectId: projectIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const navigate = useNavigate()
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const loops = useAppStore((s) => s.loopsByProject[projectId]) ?? []
  // Tick so the "next in …" / "X ago" labels below refresh on their own.
  useNow()

  if (!project) return <div />

  return (
    <div className="compose-wrap">
      <div className="compose view" style={{ width: 'min(820px,100%)' }}>
        <div className="compose-eyebrow">
          <span className="dot" />
          Loops · {project.name}
        </div>
        <h1>Loops</h1>
        <p className="lead">
          Put harnext on a schedule. A <b>loop</b> dispatches an agent automatically — on a cadence
          you choose — so recurring work like triage, dependency upkeep and security guardrails just
          keeps happening.
        </p>
        <div className="loops-grid">
          {loops.map((l) => (
            <button
              key={l.id}
              className="loops-tile"
              onClick={() => navigate(`/project/${projectId}/loops/${l.id}`)}
            >
              <div className="lt-top">
                <span
                  className={'sdot' + (l.status === 'active' ? ' spin' : '')}
                  style={{ color: `var(--${l.status === 'active' ? 'ok' : 'tx-2'})` }}
                />
                <span className="lt-title">{l.title}</span>
              </div>
              <div className="lt-cad">
                <Icon.loop size={13} />
                {l.cadence}
              </div>
              <div className="lt-foot">
                <span className={'spill sm ' + (l.status === 'active' ? 'st-done' : 'st-paused')}>
                  <span className="sdot" />
                  {l.status === 'active' ? 'Active' : 'Paused'}
                </span>
                <span className="lt-runs">
                  {l.runs} runs ·{' '}
                  {l.status === 'active' ? 'next ' + timeUntil(l.nextRunAt) : timeAgo(l.lastRunAt)}
                </span>
              </div>
            </button>
          ))}
          <button
            className="loops-tile add"
            onClick={() => navigate(`/project/${projectId}/loops/new`)}
          >
            <span className="lt-add-ic">
              <Icon.plus size={20} />
            </span>
            <span className="lt-add-label">New loop</span>
            <span className="lt-add-sub">Schedule a recurring task</span>
          </button>
        </div>
      </div>
    </div>
  )
}
