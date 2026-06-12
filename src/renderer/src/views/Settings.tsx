import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { JSX, ReactNode } from 'react'
import type { AppSettings, PermissionMode, ProviderOption } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { Icon, type IconName } from '../components/icons'

const EDITORS = ['VS Code', 'Cursor', 'Zed', 'Windsurf', 'Neovim', 'JetBrains', 'Sublime Text']

function Sw({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      className={'sw' + (on ? ' on' : '')}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    >
      <span className="sw-knob" />
    </button>
  )
}

function Row({
  label,
  desc,
  children,
  col
}: {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  col?: boolean
}): JSX.Element {
  return (
    <div className={'set-row' + (col ? ' col' : '')}>
      <div className="set-rl">
        <div className="set-label">{label}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div className="set-rc">{children}</div>
    </div>
  )
}

function Sel({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
}): JSX.Element {
  const opts = options.includes(value) || !value ? options : [value, ...options]
  return (
    <span className="ctl-sel">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </span>
  )
}

const MODE_LABEL: Record<PermissionMode, string> = {
  acceptEdits: 'Auto-accept edits',
  plan: 'Plan only',
  bypassPermissions: 'Full access'
}

function ModelsTab({
  settings,
  save,
  models
}: {
  settings: AppSettings
  save: (p: Partial<AppSettings>) => void
  models: string[]
}): JSX.Element {
  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.cube size={15} />
          <h3>Model</h3>
          <span className="hint">used for every agent</span>
        </div>
        <Row label="Default model" desc="The model harnext codes with when you start an agent.">
          <Sel value={settings.model} onChange={(v) => save({ model: v })} options={models} />
        </Row>
        <Row label="Edit handling" desc="What the agent may do without asking.">
          <Sel
            value={MODE_LABEL[settings.mode]}
            onChange={(v) =>
              save({
                mode: v.startsWith('Auto')
                  ? 'acceptEdits'
                  : v.startsWith('Plan')
                    ? 'plan'
                    : 'bypassPermissions'
              })
            }
            options={Object.values(MODE_LABEL)}
          />
        </Row>
      </div>

      <div className="set-card accent">
        <div className="set-card-head">
          <Icon.loop size={15} />
          <h3>Goal mode · Evaluator pattern</h3>
          <span className="hint">
            triggered by <code>/goal</code>
          </span>
        </div>
        <div
          style={{ padding: '14px 18px 6px', fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.6 }}
        >
          When a prompt starts with <code>/goal</code>, harnext runs a two-model loop instead of a
          single agent — a smart model plans &amp; reviews while an executor writes the code.
        </div>
        <div style={{ padding: '16px 18px 6px' }}>
          <div className="evald">
            <div className="evald-node smart">
              <div className="evald-role">
                <Icon.brain size={13} />
                Smart model
              </div>
              <div className="evald-mdl">{settings.smart}</div>
              <div className="evald-sub">
                Breaks the task into a plan and reviews each result against it.
              </div>
            </div>
            <div className="evald-arrows">
              <Icon.arrowR size={16} />
              <span className="lbl">delegates</span>
              <Icon.arrowL size={16} />
              <span className="lbl">returns</span>
            </div>
            <div className="evald-node exec">
              <div className="evald-role">
                <Icon.zap size={13} />
                Executor model
              </div>
              <div className="evald-mdl">{settings.executor}</div>
              <div className="evald-sub">
                Reads, edits and runs code in the worktree to satisfy each step.
              </div>
            </div>
          </div>
        </div>
        <Row
          label="Smart model"
          desc="Plans the work and evaluates the diff before it reaches you."
        >
          <Sel value={settings.smart} onChange={(v) => save({ smart: v })} options={models} />
        </Row>
        <Row
          label="Executor model"
          desc="Does the hands-on editing. A faster, cheaper coder pairs well here."
        >
          <Sel value={settings.executor} onChange={(v) => save({ executor: v })} options={models} />
        </Row>
        <Row
          label="Evaluator loop"
          desc="When the smart model rejects a result, send it back to the executor to fix automatically."
        >
          <Sw on={settings.evalLoop} onChange={(v) => save({ evalLoop: v })} />
        </Row>
      </div>
    </div>
  )
}

function ProvidersTab({
  settings,
  save,
  providers,
  refresh
}: {
  settings: AppSettings
  save: (p: Partial<AppSettings>) => void
  providers: ProviderOption[]
  refresh: () => void
}): JSX.Element {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const selected = providers.find((p) => p.id === settings.provider)

  const saveKey = async (): Promise<void> => {
    if (!key.trim()) return
    await window.api.providers.saveKey(settings.provider, key.trim())
    setKey('')
    setSaved(true)
    refresh()
  }

  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.cube size={15} />
          <h3>Model provider</h3>
        </div>
        <div style={{ padding: 16 }}>
          <div className="prov-grid">
            {providers.map((p) => (
              <button
                key={p.id}
                className={'prov' + (settings.provider === p.id ? ' on' : '')}
                onClick={() => {
                  save({ provider: p.id, model: p.defaultModel })
                  setSaved(false)
                }}
              >
                <span className="prov-rd" />
                <span className="prov-meta">
                  <span className="prov-nm">{p.name}</span>
                  <span className="prov-sub">{p.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <Row
          label="API key"
          desc="Stored locally in ~/.harnext. Never leaves this machine except to call the provider."
          col
        >
          <div className="keyrow">
            <div className="field sm">
              <span className="field-ic">
                <Icon.key size={15} />
              </span>
              <input
                type="password"
                placeholder={
                  selected?.authenticated
                    ? '••••••••••••  (key on file — paste to replace)'
                    : 'Paste your API key'
                }
                value={key}
                onChange={(e) => {
                  setKey(e.target.value)
                  setSaved(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveKey()
                }}
                onBlur={() => void saveKey()}
              />
            </div>
            {(saved || selected?.authenticated) && (
              <span className="spill st-done sm">
                <span className="sdot" />
                {saved ? 'Saved' : 'Connected'}
              </span>
            )}
            {!saved && selected && !selected.authenticated && (
              <span className="spill st-failed sm">
                <span className="sdot" />
                No key
              </span>
            )}
          </div>
        </Row>
      </div>
    </div>
  )
}

function GeneralTab({
  settings,
  save
}: {
  settings: AppSettings
  save: (p: Partial<AppSettings>) => void
}): JSX.Element {
  const [stopped, setStopped] = useState(false)
  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.external size={15} />
          <h3>Editor</h3>
        </div>
        <Row
          label="Default editor"
          desc="Opened when you hit “Editor” on an agent — launches the agent's worktree."
        >
          <Sel value={settings.editor} onChange={(v) => save({ editor: v })} options={EDITORS} />
        </Row>
        <Row
          label="Open editor when an agent finishes"
          desc="Auto-launch the worktree once an agent is ready for review."
        >
          <Sw on={settings.openOnDone} onChange={(v) => save({ openOnDone: v })} />
        </Row>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <Icon.branch size={15} />
          <h3>Worktrees &amp; git</h3>
        </div>
        <Row
          label="Worktree location"
          desc="Each agent gets its own checkout here, isolated from your working copy."
        >
          <span className="tag">
            <Icon.folder size={13} />
            <b>~/.harnext-desktop/worktrees</b>
          </span>
        </Row>
        <Row label="Branch prefix" desc="Agent branches are namespaced with this prefix.">
          <span className="tag">
            <Icon.branch size={13} />
            <b>agent/</b>
          </span>
        </Row>
      </div>

      <div className="set-card danger">
        <div className="set-card-head">
          <Icon.alert size={15} />
          <h3>Danger zone</h3>
        </div>
        <Row
          label="Stop all agents"
          desc="Halts every running worktree across all projects immediately."
        >
          <button
            className="btn danger"
            onClick={() => {
              void window.api.agents.stopAll().then(() => setStopped(true))
            }}
          >
            <Icon.stop size={13} />
            {stopped ? 'Stopped' : 'Stop all'}
          </button>
        </Row>
      </div>
    </div>
  )
}

function AppearanceTab({
  settings,
  save
}: {
  settings: AppSettings
  save: (p: Partial<AppSettings>) => void
}): JSX.Element {
  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.eye size={15} />
          <h3>Appearance</h3>
        </div>
        <Row label="Theme" desc="Switch between a dark and light interface.">
          <div className="seg">
            {(['dark', 'light'] as const).map((d) => (
              <button
                key={d}
                className={'seg-b' + (settings.theme === d ? ' active' : '')}
                style={{ textTransform: 'capitalize' }}
                onClick={() => save({ theme: d })}
              >
                {d}
              </button>
            ))}
          </div>
        </Row>
      </div>
    </div>
  )
}

export default function Settings(): JSX.Element {
  const { projectId: projectIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const [tab, setTab] = useState('models')
  const [providers, setProviders] = useState<ProviderOption[]>([])

  const refreshProviders = (): void => {
    void window.api.providers.list().then(setProviders)
  }
  useEffect(refreshProviders, [])

  if (!settings || !project) return <div />
  const save = (p: Partial<AppSettings>): void => void saveSettings(p)
  const models = providers.find((p) => p.id === settings.provider)?.models ?? [settings.model]

  const TABS: { id: string; label: string; ic: IconName }[] = [
    { id: 'models', label: 'Models', ic: 'loop' },
    { id: 'providers', label: 'Providers', ic: 'cube' },
    { id: 'general', label: 'General', ic: 'branch' },
    { id: 'appearance', label: 'Appearance', ic: 'spark' }
  ]

  return (
    <div className="page view">
      <div className="page-head">
        <div className="page-crumb">
          {project.name}
          <span className="sep">/</span>
          <span>settings</span>
        </div>
        <h1 className="page-title">Settings</h1>
        <p className="page-desc">
          Configure the models harnext uses, your provider keys, and how agents run in{' '}
          <b>{project.name}</b>.
        </p>
      </div>
      <div className="tabs">
        {TABS.map((tb) => {
          const Ic = Icon[tb.ic]
          return (
            <button
              key={tb.id}
              className={'tab' + (tab === tb.id ? ' active' : '')}
              onClick={() => setTab(tb.id)}
            >
              <Ic size={14} />
              {tb.label}
            </button>
          )
        })}
      </div>
      {tab === 'models' && <ModelsTab settings={settings} save={save} models={models} />}
      {tab === 'providers' && (
        <ProvidersTab
          settings={settings}
          save={save}
          providers={providers}
          refresh={refreshProviders}
        />
      )}
      {tab === 'general' && <GeneralTab settings={settings} save={save} />}
      {tab === 'appearance' && <AppearanceTab settings={settings} save={save} />}
    </div>
  )
}
