import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import type { LoopConfig, LoopType, ProviderOption } from '@shared/types'
import { buildCadence, DAY_SHORT } from '@shared/schedule'
import { useAppStore } from '../stores/useAppStore'
import { shortModel } from '../lib/ui'
import { buildProviderOptions } from '../lib/provider-options'
import { initialInterval, intervalToMinutes } from '../lib/loop-interval'
import { Icon } from '../components/icons'

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
  const settings = useAppStore((s) => s.settings)

  const [name, setName] = useState(initial?.title ?? '')
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [type, setType] = useState<LoopType>(initial?.type ?? 'daily')
  const [config, setConfig] = useState<LoopConfig>({
    time: initial?.config.time ?? '09:00',
    days: initial?.config.days ?? (initial?.config.day != null ? [initial.config.day] : [0]),
    model: initial?.config.model,
    provider: initial?.config.provider
  })
  const initInt = initialInterval(initial?.config)
  const [intervalAmt, setIntervalAmt] = useState(initInt.amt)
  const [intervalUnit, setIntervalUnit] = useState<'minutes' | 'hours'>(initInt.unit)
  const [enabled, setEnabled] = useState(initial ? initial.status === 'active' : true)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.providers.list().then(setProviders)
  }, [])

  if (!project) return <div />
  const valid = name.trim().length > 0 && prompt.trim().length > 0
  const set = (patch: Partial<LoopConfig>): void => setConfig((c) => ({ ...c, ...patch }))

  // Interval amount + unit are the source of truth; fold them into the config.
  const intervalMins = intervalToMinutes(intervalAmt, intervalUnit)
  const days = config.days ?? [0]
  const toggleDay = (d: number): void => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)
    if (next.length) set({ days: next }) // keep at least one weekday selected
  }
  const scheduleConfig: LoopConfig = { ...config, intervalMinutes: intervalMins }

  // Resolve the loop's pinned model/provider, falling back to the global default.
  const provider = config.provider ?? settings?.provider ?? ''
  const model = config.model ?? settings?.model ?? ''
  const selProvider = providers.find((p) => p.id === provider)
  // Always include the resolved provider as an option so the controlled select
  // can't silently desync from state when the default provider isn't authed (#141).
  const providerOptions = buildProviderOptions(providers, provider)
  const modelBase = selProvider?.models ?? []
  const modelOptions = model && !modelBase.includes(model) ? [model, ...modelBase] : modelBase

  const submit = async (): Promise<void> => {
    if (!valid) return
    setError(null)
    try {
      // Pin the resolved model/provider so the loop is independent of the global default.
      const input = {
        projectId,
        title: name.trim(),
        prompt: prompt.trim(),
        type,
        config: { ...scheduleConfig, model: model || undefined, provider: provider || undefined },
        enabled
      }
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
                Resolves to:{' '}
                <b style={{ color: 'var(--p-text)' }}>{buildCadence(type, scheduleConfig)}</b>
              </div>
            </div>
            <div
              className="set-rc"
              style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}
            >
              {type === 'interval' && (
                <>
                  <div className="field sm" style={{ width: 74 }}>
                    <input
                      type="number"
                      min={1}
                      value={intervalAmt}
                      onChange={(e) =>
                        setIntervalAmt(Math.max(1, Math.floor(Number(e.target.value)) || 1))
                      }
                    />
                  </div>
                  <span className="ctl-sel">
                    <select
                      value={intervalUnit}
                      onChange={(e) => setIntervalUnit(e.target.value as 'minutes' | 'hours')}
                    >
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                    </select>
                  </span>
                </>
              )}
              {type === 'weekly' && (
                <div className="seg">
                  {DAY_SHORT.map((d, i) => (
                    <button
                      key={d}
                      className={'seg-b' + (days.includes(i) ? ' active' : '')}
                      onClick={() => toggleDay(i)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              {(type === 'daily' || type === 'weekly') && (
                <div className="field sm" style={{ width: 108 }}>
                  <input
                    type="time"
                    value={config.time ?? '09:00'}
                    onChange={(e) => set({ time: e.target.value })}
                  />
                </div>
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

        <div className="set-card">
          <div className="set-card-head">
            <Icon.cube size={15} />
            <h3>Model</h3>
            <span className="hint">pinned per loop · independent of the global default</span>
          </div>
          <div className="set-row">
            <div className="set-rl">
              <div className="set-label">Provider</div>
              <div className="set-desc">Which connected provider this loop dispatches with.</div>
            </div>
            <div className="set-rc">
              <span className="ctl-sel">
                <select
                  value={provider}
                  onChange={(e) => {
                    const next = providers.find((p) => p.id === e.target.value)
                    set({ provider: e.target.value, model: next?.defaultModel })
                  }}
                >
                  {providerOptions.length === 0 && (
                    <option value={provider}>{provider || '—'}</option>
                  )}
                  {providerOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
          <div className="set-row">
            <div className="set-rl">
              <div className="set-label">Model</div>
              <div className="set-desc">
                Pin a model for this loop — e.g. a cheap one for triage, a stronger one for a weekly
                refactor.
              </div>
            </div>
            <div className="set-rc">
              <span className="ctl-sel">
                <select value={model} onChange={(e) => set({ model: e.target.value })}>
                  {modelOptions.length === 0 && <option value={model}>{shortModel(model)}</option>}
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {shortModel(m)}
                    </option>
                  ))}
                </select>
              </span>
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
