import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { JSX } from 'react'
import type { PermissionMode, ProviderOption } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { Icon, type IconName } from '../components/icons'

function ModelSelect({
  value,
  models,
  onChange
}: {
  value: string
  models: string[]
  onChange: (v: string) => void
}): JSX.Element {
  const opts = models.includes(value) || !value ? models : [value, ...models]
  return (
    <span className="ctl-sel mono">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  )
}

const QUICK: { ic: IconName; t: string }[] = [
  { ic: 'bolt', t: 'Fix the failing tests' },
  { ic: 'shield', t: 'Add input validation' },
  { ic: 'refresh', t: 'Upgrade dependencies' },
  { ic: 'loop', t: '/goal Ship dark mode end to end' }
]

export default function Compose(): JSX.Element {
  const { projectId: projectIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const navigate = useNavigate()

  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const startAgent = useAppStore((s) => s.startAgent)

  const providerModels = useAppStore((s) => s.providerModels)
  const loadProviderModels = useAppStore((s) => s.loadProviderModels)

  const [text, setText] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void window.api.providers.list().then(setProviders)
    taRef.current?.focus()
  }, [])

  const provider = settings?.provider
  useEffect(() => {
    if (provider) void loadProviderModels(provider)
  }, [provider, loadProviderModels])

  if (!project || !settings) return <div />

  const curated = providers.find((p) => p.id === settings.provider)?.models ?? [settings.model]
  const models = providerModels[settings.provider] ?? curated
  const isGoal = /(^|\s)\/goal\b/i.test(text)

  const start = async (): Promise<void> => {
    if (!text.trim() || starting) return
    setStarting(true)
    setError(null)
    try {
      const meta = await startAgent({ projectId, prompt: text.trim() })
      setText('')
      navigate(`/project/${projectId}/agent/${meta.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="compose-wrap">
      <div className="compose view">
        <div className="compose-eyebrow">
          <span className="dot" />
          New agent · {project.branch ?? project.name}
        </div>
        <h1>Start a new agent</h1>
        <p className="lead">
          Describe what you want done in <b>{project.name}</b>. harnext spins up an isolated git
          worktree with full context from the <b>harnext context engine</b> — your org&apos;s code,
          issues and conversations. Begin a message with <code>/goal</code> to run it as an
          evaluator loop, where a smart model plans &amp; reviews while an executor writes the code.
        </p>

        <div className="composer">
          <textarea
            ref={taRef}
            value={text}
            placeholder="e.g. Add input validation to the signup form — or /goal for a multi-step task…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void start()
              }
            }}
            autoFocus
          />
          <div className="composer-bar">
            <span className="ctl-sel">
              <select
                value={settings.mode}
                onChange={(e) => void saveSettings({ mode: e.target.value as PermissionMode })}
              >
                <option value="acceptEdits">Auto-accept edits</option>
                <option value="plan">Plan only</option>
                <option value="bypassPermissions">Full access</option>
              </select>
            </span>
            {isGoal ? (
              <>
                <span className="goal-badge">
                  <Icon.loop size={13} />
                  Goal mode
                </span>
                <span className="ctl" title="Smart model — plans & reviews">
                  <Icon.brain size={14} />
                  <span className="k">smart</span>
                </span>
                <ModelSelect
                  value={settings.smart}
                  models={models}
                  onChange={(v) => void saveSettings({ smart: v })}
                />
                <span className="ctl" title="Executor model — writes the code">
                  <Icon.zap size={14} />
                  <span className="k">exec</span>
                </span>
                <ModelSelect
                  value={settings.executor}
                  models={models}
                  onChange={(v) => void saveSettings({ executor: v })}
                />
              </>
            ) : (
              <ModelSelect
                value={settings.model}
                models={models}
                onChange={(v) => void saveSettings({ model: v })}
              />
            )}
            <span className="grow" />
            <button className="composer-start" onClick={() => void start()} disabled={starting}>
              <Icon.play size={14} />
              {starting ? 'Starting…' : 'Start agent'} <kbd>⌘↵</kbd>
            </button>
          </div>
        </div>

        {error && (
          <div
            className="set-card danger"
            style={{ marginTop: 14, padding: '12px 16px', fontSize: 12, color: 'var(--err)' }}
          >
            {error}
          </div>
        )}

        <div className="quick-row">
          {QUICK.map((q) => {
            const Ic = Icon[q.ic]
            return (
              <button
                key={q.t}
                className="quick"
                onClick={() => {
                  setText(q.t)
                  taRef.current?.focus()
                }}
              >
                <Ic size={13} />
                {q.t}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
