import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import type { LoopConfig, LoopType } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { Icon } from '../components/icons'

const HOURS = ['00:00', '02:00', '06:00', '08:00', '09:00', '12:00', '18:00', '22:00']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const INTERVALS = [1, 3, 6, 12]
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function buildCadence(type: LoopType, c: LoopConfig): string {
  if (type === 'interval') {
    const h = c.intervalHours ?? 6
    return h === 1 ? 'Every hour' : `Every ${h} hours`
  }
  if (type === 'daily') return `Every day · ${c.time ?? '09:00'}`
  return `Weekly · ${DAY_SHORT[c.day ?? 0]} ${c.time ?? '09:00'}`
}

export default function NewLoopForm(): JSX.Element {
  const { projectId: projectIdParam, loopId: loopIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const loopId = loopIdParam ? Number(loopIdParam) : null
  const navigate = useNavigate()

  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const initial = useAppStore((s) =>
    loopId !== null ? (s.loopsByProject[projectId] ?? []).find((l) => l.id === loopId) : undefined
  )
  const createLoop = useAppStore((s) => s.createLoop)
  const updateLoop = useAppStore((s) => s.updateLoop)

  const [name, setName] = useState(initial?.title ?? '')
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [type, setType] = useState<LoopType>(initial?.type ?? 'daily')
  const [config, setConfig] = useState<LoopConfig>({
    intervalHours: initial?.config.intervalHours ?? 6,
    time: initial?.config.time ?? '09:00',
    day: initial?.config.day ?? 0
  })
  const [enabled, setEnabled] = useState(initial ? initial.status === 'active' : true)
  const [error, setError] = useState<string | null>(null)

  if (!project) return <div />
  const valid = name.trim().length > 0 && prompt.trim().length > 0
  const set = (patch: Partial<LoopConfig>): void => setConfig((c) => ({ ...c, ...patch }))

  const submit = async (): Promise<void> => {
    if (!valid) return
    setError(null)
    try {
      const input = { projectId, title: name.trim(), prompt: prompt.trim(), type, config, enabled }
      const loop = initial ? await updateLoop(initial.id, input) : await createLoop(input)
      navigate(`/project/${projectId}/loops/${loop.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const TRIGGERS: [LoopType, string][] = [
    ['interval', 'Interval'],
    ['daily', 'Daily'],
    ['weekly', 'Weekly']
  ]

  return (
    <div className="page view">
      <div className="page-head">
        <div className="page-crumb">
          {project.name}
          <span className="sep">/</span>
          <span>loops</span>
          <span className="sep">/</span>
          <span>{initial ? 'edit' : 'new'}</span>
        </div>
        <h1 className="page-title">{initial ? 'Edit loop' : 'New loop'}</h1>
        <p className="page-desc">
          A loop dispatches an agent on a schedule — perfect for triage, upkeep and guardrails that
          should just keep running.
        </p>
      </div>

      <div className="set-stack">
        <div className="set-card">
          <div className="set-card-head">
            <Icon.loop size={15} />
            <h3>Definition</h3>
          </div>
          <div className="set-row col">
            <div className="set-rl">
              <div className="set-label">Name</div>
            </div>
            <div className="field sm">
              <input
                value={name}
                placeholder="e.g. Triage & fix new bug reports"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="set-row col">
            <div className="set-rl">
              <div className="set-label">Task</div>
              <div className="set-desc">What the agent should do each time the loop fires.</div>
            </div>
            <div className="composer" style={{ boxShadow: 'none' }}>
              <textarea
                value={prompt}
                style={{ minHeight: 88 }}
                placeholder="Describe the recurring task…"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="set-card">
          <div className="set-card-head">
            <Icon.clock size={15} />
            <h3>Trigger</h3>
          </div>
          <div className="set-row">
            <div className="set-rl">
              <div className="set-label">Run</div>
              <div className="set-desc">Pick how often this loop should fire.</div>
            </div>
            <div className="set-rc">
              <div className="seg">
                {TRIGGERS.map(([id, lbl]) => (
                  <button
                    key={id}
                    className={'seg-b' + (type === id ? ' active' : '')}
                    onClick={() => setType(id)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="set-row">
            <div className="set-rl">
              <div className="set-label">Schedule</div>
              <div className="set-desc">
                Resolves to: <b style={{ color: 'var(--p-text)' }}>{buildCadence(type, config)}</b>
              </div>
            </div>
            <div className="set-rc">
              {type === 'interval' && (
                <span className="ctl-sel">
                  <select
                    value={config.intervalHours}
                    onChange={(e) => set({ intervalHours: Number(e.target.value) })}
                  >
                    {INTERVALS.map((h) => (
                      <option key={h} value={h}>
                        {h === 1 ? '1 hour' : `${h} hours`}
                      </option>
                    ))}
                  </select>
                </span>
              )}
              {(type === 'daily' || type === 'weekly') && (
                <>
                  {type === 'weekly' && (
                    <span className="ctl-sel">
                      <select
                        value={config.day}
                        onChange={(e) => set({ day: Number(e.target.value) })}
                      >
                        {DAYS.map((d, i) => (
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                  <span className="ctl-sel">
                    <select value={config.time} onChange={(e) => set({ time: e.target.value })}>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="set-row">
            <div className="set-rl">
              <div className="set-label">Enabled</div>
              <div className="set-desc">Start firing as soon as it&apos;s created.</div>
            </div>
            <div className="set-rc">
              <button
                className={'sw' + (enabled ? ' on' : '')}
                onClick={() => setEnabled((e) => !e)}
              >
                <span className="sw-knob" />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div
            className="set-card danger"
            style={{ padding: '12px 16px', fontSize: 12, color: 'var(--err)' }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button
            className="btn ghost"
            onClick={() =>
              navigate(
                initial
                  ? `/project/${projectId}/loops/${initial.id}`
                  : `/project/${projectId}/loops`
              )
            }
          >
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => void submit()}>
            <Icon.check2 size={15} />
            {initial ? 'Save loop' : 'Create loop'}
          </button>
        </div>
      </div>
    </div>
  )
}
