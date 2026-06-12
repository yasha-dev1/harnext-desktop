import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import type { LoopRun } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { shortModel, timeAgo, timeUntil } from '../lib/ui'
import { Icon } from '../components/icons'

function LoopRunRow({ run, onOpen }: { run: LoopRun; onOpen?: () => void }): JSX.Element {
  const cls =
    run.status === 'done' ? 'st-done' : run.status === 'failed' ? 'st-failed' : 'st-review'
  return (
    <div className="lrun" onClick={onOpen} style={onOpen ? { cursor: 'pointer' } : undefined}>
      <span className={'spill sm ' + cls}>
        <span className="sdot" />
        {run.status === 'done' ? 'Done' : run.status === 'failed' ? 'Failed' : 'Review'}
      </span>
      <span className="lrun-sum">{run.summary}</span>
      {(run.add > 0 || run.del > 0) && (
        <span className="lrun-diff">
          <span className="add">+{run.add}</span>
          <span className="del">−{run.del}</span>
        </span>
      )}
      <span className="lrun-when">{timeAgo(run.createdAt)}</span>
    </div>
  )
}

export default function LoopDetail(): JSX.Element {
  const { projectId: projectIdParam, loopId: loopIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const loopId = Number(loopIdParam)
  const navigate = useNavigate()

  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const loop = useAppStore((s) => (s.loopsByProject[projectId] ?? []).find((l) => l.id === loopId))
  const runs = useAppStore((s) => s.loopRuns[loopId]) ?? []
  const settings = useAppStore((s) => s.settings)
  const loadLoopRuns = useAppStore((s) => s.loadLoopRuns)
  const toggleLoop = useAppStore((s) => s.toggleLoop)
  const removeLoop = useAppStore((s) => s.removeLoop)
  const runLoopNow = useAppStore((s) => s.runLoopNow)
  const loopsLoaded = useAppStore((s) => s.loopsByProject[projectId] !== undefined)

  useEffect(() => {
    if (Number.isFinite(loopId)) void loadLoopRuns(loopId)
  }, [loopId, loadLoopRuns, loop?.runs])

  useEffect(() => {
    if (loopsLoaded && !loop) navigate(`/project/${projectId}/loops`, { replace: true })
  }, [loopsLoaded, loop, navigate, projectId])

  if (!loop || !project) return <div />

  return (
    <div className="detail view">
      <div className="detail-head">
        <div className="detail-htext">
          <div className="detail-crumb">
            <button className="back" onClick={() => navigate(`/project/${projectId}/loops`)}>
              <Icon.chevronL size={13} />
              Loops
            </button>
            <span className="sep">/</span>
            <span>{project.name}</span>
          </div>
          <div className="detail-title">{loop.title}</div>
          <div className="detail-tags">
            <span className={'spill ' + (loop.status === 'active' ? 'st-done' : 'st-paused')}>
              <span className={'sdot' + (loop.status === 'active' ? ' spin' : '')} />
              {loop.status === 'active' ? 'Active' : 'Paused'}
            </span>
            <span className="tag">
              <Icon.loop size={13} />
              {loop.cadence}
            </span>
            <span className="tag">
              <Icon.clock size={13} />
              {loop.status === 'active' ? (
                <>
                  next <b>{timeUntil(loop.nextRunAt)}</b>
                </>
              ) : (
                'paused'
              )}
            </span>
            <span className="tag">
              <Icon.refresh size={13} />
              {loop.runs} runs
            </span>
          </div>
        </div>
        <div className="detail-actions">
          <button
            className="btn ghost"
            onClick={() => navigate(`/project/${projectId}/loops/${loop.id}/edit`)}
          >
            <Icon.edit size={14} />
            Edit
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Delete this loop? Its run history is removed.')) {
                void removeLoop(loop.id, projectId).then(() =>
                  navigate(`/project/${projectId}/loops`)
                )
              }
            }}
          >
            <Icon.trash size={14} />
            Delete
          </button>
          <button
            className={'btn ' + (loop.status === 'active' ? 'ghost' : 'primary')}
            onClick={() => void toggleLoop(loop.id)}
          >
            {loop.status === 'active' ? (
              <>
                <Icon.pause size={14} />
                Pause
              </>
            ) : (
              <>
                <Icon.play size={13} />
                Resume
              </>
            )}
          </button>
          <button className="btn ok" onClick={() => void runLoopNow(loop.id)}>
            <Icon.zap size={14} />
            Run now
          </button>
        </div>
      </div>

      <div className="loop-body">
        <div className="loop-inner">
          <div className="set-card">
            <div className="set-card-head">
              <Icon.terminal size={15} />
              <h3>What it does</h3>
            </div>
            <div className="loop-prompt">{loop.prompt}</div>
          </div>

          <div className="set-card">
            <div className="set-card-head">
              <Icon.clock size={15} />
              <h3>Schedule</h3>
            </div>
            <div className="set-row">
              <div className="set-rl">
                <div className="set-label">Cadence</div>
                <div className="set-desc">When this loop dispatches a new agent.</div>
              </div>
              <div className="set-rc">
                <span className="tag">
                  <Icon.loop size={13} />
                  {loop.cadence}
                </span>
              </div>
            </div>
            <div className="set-row">
              <div className="set-rl">
                <div className="set-label">Model</div>
                <div className="set-desc">The model this loop runs with each time it fires.</div>
              </div>
              <div className="set-rc">
                <span className="tag">
                  <Icon.cube size={13} />
                  {shortModel(settings?.model ?? null)}
                </span>
              </div>
            </div>
            <div className="set-row">
              <div className="set-rl">
                <div className="set-label">Last run</div>
                <div className="set-desc">Most recent dispatch.</div>
              </div>
              <div className="set-rc">
                <span style={{ color: 'var(--tx-1)', fontSize: 12.5 }}>
                  {timeAgo(loop.lastRunAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="set-card">
            <div className="set-card-head">
              <Icon.refresh size={15} />
              <h3>Recent runs</h3>
              <span className="hint">{loop.runs} total</span>
            </div>
            <div className="lrun-list">
              {runs.length === 0 && (
                <div className="aside-empty" style={{ padding: '24px 16px' }}>
                  No runs yet — hit “Run now” to fire it immediately.
                </div>
              )}
              {runs.map((r) => (
                <LoopRunRow
                  key={r.id}
                  run={r}
                  onOpen={
                    r.agentId
                      ? () => navigate(`/project/${projectId}/agent/${r.agentId}`)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
