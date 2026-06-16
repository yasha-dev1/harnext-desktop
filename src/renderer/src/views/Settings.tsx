import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { JSX, ReactNode } from 'react'
import type {
  AppSettings,
  DockerStatus,
  EnvOverrides,
  PermissionMode,
  Project,
  ProjectEnvConfig,
  ProviderOption,
  ProviderVerifyResult
} from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { Icon, type IconName } from '../components/icons'
import { ModelPicker } from '../components/ModelPicker'
import { EffortPicker } from '../components/EffortPicker'
import { EditorLogo } from '../components/EditorLogo'
import { SOUNDS, playSound } from '../lib/sounds'
import { ProviderLogo } from '../components/ProviderLogo'
import McpSettings from '../components/McpSettings'
import EnvSecrets from '../components/EnvSecrets'
import { UpdatesCard } from '../components/UpdatesCard'

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
  col,
  dim
}: {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  col?: boolean
  // De-emphasize the label/desc when the row's parent control is off.
  dim?: boolean
}): JSX.Element {
  return (
    <div className={'set-row' + (col ? ' col' : '')}>
      <div className={'set-rl' + (dim ? ' dim' : '')}>
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

const GOAL_BLOG_URL = 'https://www.harnext.dev/blog/goal-mode-evaluator-loop'

function ModelsTab({
  settings,
  save,
  models
}: {
  settings: AppSettings
  save: (p: Partial<AppSettings>) => void
  models: string[]
}): JSX.Element {
  const [advanced, setAdvanced] = useState(false)
  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.cube size={15} />
          <h3>Model</h3>
          <span className="hint">used for every agent</span>
        </div>
        <Row label="Default model" desc="The model harnext codes with when you start an agent.">
          <ModelPicker
            mono
            value={settings.model}
            onChange={(v) => save({ model: v })}
            models={models}
          />
        </Row>
        <Row
          label="Reasoning effort"
          desc="How hard the model thinks before answering. Higher is more thorough but slower and pricier; unsupported models clamp to what they allow."
        >
          <EffortPicker
            value={settings.thinkingLevel}
            onChange={(v) => save({ thinkingLevel: v })}
          />
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

      <div className="set-card">
        <button
          className={'set-card-head adv-head' + (advanced ? ' open' : '')}
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
        >
          <Icon.settings size={15} />
          <h3>Advanced</h3>
          <span className="hint">Goal mode · evaluator models</span>
          <Icon.chevron size={15} className={'adv-chev' + (advanced ? ' open' : '')} />
        </button>
        {advanced && (
          <>
            <div className="adv-note">
              <span>
                Goal mode (<code>/goal</code>) runs a two-model evaluator loop instead of a single
                agent — a smart model plans &amp; reviews while an executor writes the code.
              </span>
              <a className="adv-link" href={GOAL_BLOG_URL} target="_blank" rel="noreferrer">
                Learn how it works
                <Icon.arrowR size={12} />
              </a>
            </div>
            <Row
              label="Smart model"
              desc="Plans the work and evaluates the diff before it reaches you."
            >
              <ModelPicker
                mono
                value={settings.smart}
                onChange={(v) => save({ smart: v })}
                models={models}
              />
            </Row>
            <Row
              label="Executor model"
              desc="Does the hands-on editing. A faster, cheaper coder pairs well here."
            >
              <ModelPicker
                mono
                value={settings.executor}
                onChange={(v) => save({ executor: v })}
                models={models}
              />
            </Row>
            <Row
              label="Evaluator loop"
              desc="When the smart model rejects a result, send it back to the executor to fix automatically."
            >
              <Sw on={settings.evalLoop} onChange={(v) => save({ evalLoop: v })} />
            </Row>
          </>
        )}
      </div>
    </div>
  )
}

function ProvStatus({ p, active }: { p: ProviderOption; active: boolean }): JSX.Element {
  if (active && p.authenticated)
    return (
      <span className="spill st-done sm">
        <span className="sdot" />
        Active
      </span>
    )
  if (active)
    return (
      <span className="spill st-failed sm">
        <span className="sdot" />
        No key
      </span>
    )
  if (p.authenticated)
    return (
      <span className="spill st-input sm">
        <span className="sdot" />
        Ready
      </span>
    )
  return (
    <span className="spill st-paused sm">
      <span className="sdot" />
      Set up
    </span>
  )
}

const WIZ_STEPS = ['Connect', 'Model', 'Activate']

function ProviderSetup({
  provider,
  active,
  startAtModel,
  onCancel,
  onActivate,
  refresh
}: {
  provider: ProviderOption
  active: boolean
  startAtModel: boolean
  onCancel: () => void
  onActivate: (model: string) => void
  refresh: () => void
}): JSX.Element {
  const local = provider.local
  const providerModels = useAppStore((s) => s.providerModels)
  const loadProviderModels = useAppStore((s) => s.loadProviderModels)
  const [step, setStep] = useState(startAtModel ? 1 : 0)
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? 'http://localhost:11434')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProviderVerifyResult | null>(null)
  const [model, setModel] = useState(provider.defaultModel)
  // Status of the *saved* credentials (vs `result`, which is the typed key).
  const [credResult, setCredResult] = useState<ProviderVerifyResult | null>(null)
  const [credBusy, setCredBusy] = useState(false)

  // Pull the full catalog for an already-connected provider (which skips the
  // verify step that would otherwise surface it).
  useEffect(() => {
    if (provider.authenticated) void loadProviderModels(provider.id)
  }, [provider.id, provider.authenticated, loadProviderModels])

  // Re-test the saved key/URL (server falls back to the stored credential).
  const testStored = useCallback(async (): Promise<void> => {
    setCredBusy(true)
    setCredResult(null)
    const res = await window.api.providers.verify(provider.id, {})
    setCredResult(res)
    setCredBusy(false)
  }, [provider.id])

  // Landing on the model step for a connected provider, surface whether its
  // stored credential actually works — this is what catches a dead key.
  useEffect(() => {
    if (!startAtModel || !provider.authenticated) return
    let alive = true
    window.api.providers.verify(provider.id, {}).then((res) => {
      if (alive) setCredResult(res)
    })
    return () => {
      alive = false
    }
  }, [startAtModel, provider.authenticated, provider.id])

  const removeConfig = async (): Promise<void> => {
    await window.api.providers.remove(provider.id)
    setCredResult(null)
    setResult(null)
    setKey('')
    refresh()
    setStep(0)
  }

  // Models offered in step 2: curated favourites first, enriched with the live
  // catalog (cached) and anything the verify probe just returned, deduped.
  const models = useMemo(() => {
    const live = [...(providerModels[provider.id] ?? []), ...(result?.models ?? [])]
    return Array.from(new Set([...provider.models, ...live]))
  }, [provider.models, provider.id, providerModels, result])

  const verify = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    const res = await window.api.providers.verify(provider.id, { key: key.trim(), baseUrl })
    setResult(res)
    setBusy(false)
    if (res.ok) {
      if (local) await window.api.providers.saveBaseUrl(provider.id, baseUrl.trim())
      else if (key.trim()) await window.api.providers.saveKey(provider.id, key.trim())
    }
  }

  const verified = result?.ok ?? false

  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <span className="wiz-logo">
            <ProviderLogo id={provider.id} size={16} />
          </span>
          <h3>Set up {provider.name}</h3>
          <span className="hint">{provider.sub}</span>
          <button className="wiz-x" onClick={onCancel} title="Cancel">
            <Icon.x size={14} />
          </button>
        </div>

        <div className="wiz-steps">
          {WIZ_STEPS.map((label, i) => (
            <div
              key={label}
              className={'wiz-step' + (i === step ? ' active' : i < step ? ' done' : '')}
            >
              <span className="wiz-num">{i < step ? <Icon.check size={11} /> : i + 1}</span>
              {label}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="wiz-body">
            {local ? (
              <>
                <p className="wiz-lead">
                  {provider.name} runs on your machine. Point harnext at the server&apos;s address —
                  no API key needed.
                </p>
                <div className="field">
                  <span className="field-ic">
                    <Icon.terminal size={15} />
                  </span>
                  <input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={baseUrl}
                    onChange={(e) => {
                      setBaseUrl(e.target.value)
                      setResult(null)
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="wiz-lead">
                  Paste an API key for {provider.name}. It&apos;s stored locally in{' '}
                  <code>~/.harnext</code> and only ever sent to the provider.
                </p>
                <div className="field">
                  <span className="field-ic">
                    <Icon.key size={15} />
                  </span>
                  <input
                    type="password"
                    placeholder="Paste your API key"
                    value={key}
                    autoFocus
                    onChange={(e) => {
                      setKey(e.target.value)
                      setResult(null)
                    }}
                    onKeyDown={(e) => {
                      // Don't treat the IME composition-commit Enter as "verify".
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && key.trim() && !busy)
                        void verify()
                    }}
                  />
                </div>
                {provider.consoleUrl && (
                  <a
                    className="wiz-link"
                    href={provider.consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon.external size={12} />
                    Get a key from {provider.name}
                  </a>
                )}
              </>
            )}

            {result && (
              <div className={'wiz-result ' + (result.ok ? 'ok' : 'bad')}>
                {result.ok ? <Icon.check size={14} /> : <Icon.alert size={14} />}
                <span>
                  {result.message}
                  {result.ok && result.models.length > 0 && (
                    <span className="wiz-result-sub">
                      {' '}
                      · {result.models.length} models available
                    </span>
                  )}
                </span>
              </div>
            )}

            <div className="wiz-foot">
              <button className="btn ghost" onClick={onCancel}>
                Cancel
              </button>
              <span className="spacer" />
              {verified ? (
                <button className="btn primary" onClick={() => setStep(1)}>
                  Continue
                  <Icon.arrowR size={14} />
                </button>
              ) : (
                <button
                  className="btn primary"
                  disabled={busy || (!local && !key.trim())}
                  onClick={() => void verify()}
                >
                  {busy ? (
                    <>
                      <Icon.refresh size={14} className="wiz-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      <Icon.shield size={14} />
                      Verify connection
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wiz-body">
            {provider.authenticated && (
              <div className="wiz-cred">
                <span className="wiz-cred-label">
                  <Icon.key size={13} />
                  {local ? `Server: ${provider.baseUrl ?? '—'}` : 'API key on file'}
                </span>
                {credBusy ? (
                  <span className="wiz-cred-status muted">
                    <Icon.refresh size={12} className="wiz-spin" />
                    Testing…
                  </span>
                ) : credResult ? (
                  <span className={'wiz-cred-status ' + (credResult.ok ? 'ok' : 'bad')}>
                    {credResult.ok ? <Icon.check size={12} /> : <Icon.alert size={12} />}
                    {credResult.ok ? 'Connected' : credResult.message}
                  </span>
                ) : null}
                <span className="wiz-cred-actions">
                  <button
                    className="wiz-textbtn"
                    onClick={() => void testStored()}
                    disabled={credBusy}
                  >
                    Test
                  </button>
                  <button
                    className="wiz-textbtn"
                    onClick={() => {
                      setResult(null)
                      setStep(0)
                    }}
                  >
                    {local ? 'Change URL' : 'Replace key'}
                  </button>
                  <button className="wiz-textbtn danger" onClick={() => void removeConfig()}>
                    Remove
                  </button>
                </span>
              </div>
            )}
            <p className="wiz-lead">
              Pick the default model harnext codes with on {provider.name}. You can change it
              anytime in the Models tab.
            </p>
            <ModelPicker mono value={model} onChange={setModel} models={models} />
            <div className="wiz-foot">
              <button
                className="btn ghost"
                onClick={() => (startAtModel ? onCancel() : setStep(0))}
              >
                <Icon.chevronL size={14} />
                Back
              </button>
              <span className="spacer" />
              <button className="btn primary" onClick={() => setStep(2)}>
                Continue
                <Icon.arrowR size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wiz-body">
            <div className="wiz-summary">
              <div className="wiz-sum-row">
                <span className="wiz-sum-k">Provider</span>
                <span className="wiz-sum-v">{provider.name}</span>
              </div>
              <div className="wiz-sum-row">
                <span className="wiz-sum-k">Model</span>
                <span className="wiz-sum-v">{model}</span>
              </div>
              <div className="wiz-sum-row">
                <span className="wiz-sum-k">Connection</span>
                <span className="spill st-done sm">
                  <span className="sdot" />
                  {provider.authenticated || verified ? 'Connected' : 'Saved'}
                </span>
              </div>
            </div>
            <p className="wiz-lead">
              {active
                ? `${provider.name} is already your active provider — this updates its model.`
                : `Make ${provider.name} the active provider for new agents in this project.`}
            </p>
            <div className="wiz-foot">
              <button className="btn ghost" onClick={() => setStep(1)}>
                <Icon.chevronL size={14} />
                Back
              </button>
              <span className="spacer" />
              <button className="btn primary" onClick={() => onActivate(model)}>
                <Icon.check size={14} />
                {active ? 'Save changes' : `Use ${provider.name}`}
              </button>
            </div>
          </div>
        )}
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
  // Which provider's setup wizard is open. `model` skips straight to the model
  // step for a provider that's already connected.
  const [setup, setSetup] = useState<{ id: string; model: boolean } | null>(null)
  const providerModels = useAppStore((s) => s.providerModels)
  const active = providers.find((p) => p.id === settings.provider)
  const setupProvider = providers.find((p) => p.id === setup?.id)

  if (setup && setupProvider) {
    return (
      <ProviderSetup
        provider={setupProvider}
        active={setupProvider.id === settings.provider}
        startAtModel={setup.model}
        onCancel={() => setSetup(null)}
        onActivate={(model) => {
          // Reconcile Goal-mode models on switch (issue #4): keep smart/executor
          // only if valid for the new provider, else fall back to its default.
          const valid = providerModels[setupProvider.id] ?? setupProvider.models
          const keep = (m: string): string => (valid.includes(m) ? m : setupProvider.defaultModel)
          save({
            provider: setupProvider.id,
            model,
            smart: keep(settings.smart),
            executor: keep(settings.executor)
          })
          setSetup(null)
          refresh()
        }}
        refresh={refresh}
      />
    )
  }

  const open = (p: ProviderOption): void => setSetup({ id: p.id, model: p.authenticated })

  return (
    <div className="set-stack">
      {active && !active.authenticated && (
        <div className="prov-warn">
          <Icon.alert size={15} />
          <div>
            <b>{active.name} isn&apos;t connected.</b> Agents will fail until you finish setup.
          </div>
          <button className="btn primary sm" onClick={() => open(active)}>
            Finish setup
          </button>
        </div>
      )}

      <div className="set-card">
        <div className="set-card-head">
          <Icon.cube size={15} />
          <h3>Model provider</h3>
          <span className="hint">pick one to set up — it activates only when connected</span>
        </div>
        <div style={{ padding: 16 }}>
          <div className="prov-grid">
            {providers.map((p) => (
              <button
                key={p.id}
                className={'prov' + (settings.provider === p.id ? ' on' : '')}
                onClick={() => open(p)}
              >
                <span className="prov-logo">
                  <ProviderLogo id={p.id} size={20} />
                </span>
                <span className="prov-meta">
                  <span className="prov-nm">{p.name}</span>
                  <span className="prov-subrow">
                    <span className="prov-sub">{p.sub}</span>
                    <ProvStatus p={p} active={p.id === settings.provider} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        {active && (
          <Row
            label="Active provider"
            desc="Used for every new agent in this project. Stored locally in ~/.harnext."
          >
            <span className="tag">
              <Icon.cube size={13} />
              <b>
                {active.name} · {settings.model}
              </b>
            </span>
          </Row>
        )}
      </div>
    </div>
  )
}

function PathField({
  value,
  placeholder,
  onSave
}: {
  value: string
  placeholder?: string
  onSave: (v: string) => void
}): JSX.Element {
  const [v, setV] = useState(value)
  // Re-sync the field when the saved value changes externally (adjust-on-render).
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setV(value)
  }
  const pickPath = useAppStore((s) => s.pickPath)
  const commit = (next: string): void => {
    const t = next.trim()
    if (t && t !== value) onSave(t)
  }
  const browse = async (): Promise<void> => {
    const dir = await pickPath({ mode: 'dir' })
    if (dir) {
      setV(dir)
      onSave(dir)
    }
  }
  return (
    <span className="path-field">
      <span className="field">
        <span className="field-ic">
          <Icon.folder size={15} />
        </span>
        <input
          type="text"
          spellCheck={false}
          value={v}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => commit(v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(v)
          }}
        />
      </span>
      <button className="btn ghost" onClick={() => void browse()}>
        Browse
      </button>
    </span>
  )
}

/** A plain single-line text field that commits a non-empty value on blur/Enter. */
function TextField({
  value,
  placeholder,
  icon,
  onSave
}: {
  value: string
  placeholder?: string
  icon?: ReactNode
  onSave: (v: string) => void
}): JSX.Element {
  const [v, setV] = useState(value)
  // Re-sync when the saved value changes externally (adjust-on-render).
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setV(value)
  }
  // Only persist a non-empty change; clearing the field reverts on blur.
  const commit = (next: string): void => {
    const t = next.trim()
    if (t && t !== value) onSave(t)
  }
  return (
    <span className="field">
      {icon && <span className="field-ic">{icon}</span>}
      <input
        type="text"
        spellCheck={false}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => commit(v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(v)
        }}
      />
    </span>
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
  // Fall back to the default for a stale/unknown stored id so the controlled
  // <select> never shows a mismatched option (e.g. a persisted 'bruh').
  const doneSound = SOUNDS.some((s) => s.id === settings.doneSound) ? settings.doneSound : 'chime'
  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.user size={15} />
          <h3>Identity</h3>
        </div>
        <Row
          label="Display name"
          desc="Shown in the sidebar. Defaults to your machine username; set whatever you like."
        >
          <TextField
            value={settings.displayName}
            placeholder="Your name"
            icon={<Icon.user size={15} />}
            onSave={(v) => save({ displayName: v })}
          />
        </Row>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <Icon.external size={15} />
          <h3>Editor</h3>
        </div>
        <Row
          label="Default editor"
          desc="Opened when you hit “Editor” on an agent — launches the agent's worktree."
        >
          <ModelPicker
            value={settings.editor}
            models={EDITORS}
            onChange={(v) => save({ editor: v })}
            placeholder="Search editors…"
            icon={(name) => <EditorLogo name={name} size={15} />}
          />
        </Row>
        <Row
          label="Open editor when an agent finishes"
          desc="Auto-launch the worktree once an agent is ready for review."
        >
          <Sw on={settings.openOnDone} onChange={(v) => save({ openOnDone: v })} />
        </Row>
        <Row
          label="Play a sound when an agent is ready"
          desc="An audible cue when an agent finishes and hands back for review."
        >
          <Sw on={settings.soundOnDone} onChange={(v) => save({ soundOnDone: v })} />
        </Row>
        <Row
          label="Sound"
          dim={!settings.soundOnDone}
          desc={
            !settings.soundOnDone
              ? 'Turn on “Play a sound when an agent is ready” to choose a cue.'
              : settings.doneSound === 'custom'
                ? settings.customSoundPath
                  ? `Custom file: ${settings.customSoundPath.split(/[/\\]/).pop()}`
                  : 'Pick your own audio file to play.'
                : 'Which sound plays when an agent finishes.'
          }
        >
          <span className="ctl-sel">
            <select
              value={doneSound}
              disabled={!settings.soundOnDone}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') {
                  void window.api.pickAudioFile().then((p) => {
                    if (p) save({ doneSound: 'custom', customSoundPath: p })
                  })
                } else {
                  save({ doneSound: v })
                }
              }}
            >
              {SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </span>
          {settings.doneSound === 'custom' && (
            <button
              className="btn ghost"
              style={{ marginLeft: 8 }}
              disabled={!settings.soundOnDone}
              onClick={() =>
                void window.api.pickAudioFile().then((p) => {
                  if (p) save({ doneSound: 'custom', customSoundPath: p })
                })
              }
            >
              <Icon.folder size={13} />
              Choose…
            </button>
          )}
          {/* Preview stays live even when the cue is off, so a sound can be
              auditioned before enabling the feature. */}
          <button
            className="btn ghost"
            style={{ marginLeft: 8 }}
            onClick={() => playSound(doneSound, settings.customSoundPath)}
          >
            <Icon.play size={13} />
            Preview
          </button>
        </Row>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <Icon.branch size={15} />
          <h3>Worktrees &amp; git</h3>
        </div>
        <Row
          label="Worktree location"
          desc="New agents get their own checkout here, isolated from your working copy."
          col
        >
          <PathField
            value={settings.worktreeRoot}
            placeholder="~/.harnext-desktop/worktrees"
            onSave={(v) => save({ worktreeRoot: v })}
          />
        </Row>
        <Row label="Branch prefix" desc="Agent branches are namespaced with this prefix.">
          <span className="tag">
            <Icon.branch size={13} />
            <b>agent/</b>
          </span>
        </Row>
      </div>

      <UpdatesCard />

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

function DockerLine({ ok, label, bad }: { ok: boolean; label: string; bad?: string }): JSX.Element {
  return (
    <span className={'spill sm ' + (ok ? 'st-done' : 'st-failed')}>
      <span className="sdot" />
      {ok ? label : (bad ?? label)}
    </span>
  )
}

function EnvironmentTab({
  project,
  dockerStatus,
  detect,
  setEnvConfig,
  setOverrides
}: {
  project: Project
  dockerStatus: DockerStatus | null
  detect: () => Promise<void>
  setEnvConfig: (patch: Partial<ProjectEnvConfig>) => void
  setOverrides: (patch: EnvOverrides) => Promise<void>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const env = project.envConfig
  const viable = !!env && env.runtime === 'compose' && !env.detectError && env.services.length > 0
  const primary = env?.exposed.find((e) => e.primary)?.service ?? ''

  // Editable compose-file list (comma-separated, relative to the project root).
  const detectedFiles = (env?.composeFiles ?? []).join(', ')
  const [composeInput, setComposeInput] = useState(detectedFiles)
  // Re-sync the input when detection changes the files (adjust-on-render).
  const [lastDetected, setLastDetected] = useState(detectedFiles)
  if (detectedFiles !== lastDetected) {
    setLastDetected(detectedFiles)
    setComposeInput(detectedFiles)
  }

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const applyCompose = (): Promise<void> =>
    run(() =>
      setOverrides({
        composeFiles: composeInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      })
    )

  const DetectBtn = (
    <button className="btn ghost sm" onClick={() => void run(detect)} disabled={busy}>
      <Icon.refresh size={13} className={busy ? 'wiz-spin' : undefined} />
      {busy ? 'Working…' : env ? 'Re-detect' : 'Detect'}
    </button>
  )

  return (
    <div className="set-stack">
      <div className="set-card">
        <div className="set-card-head">
          <Icon.layers size={15} />
          <h3>Docker sandbox</h3>
          <span className="hint">isolated environment per worktree · recommended</span>
        </div>
        <Row
          label="Run agents in a Docker sandbox"
          desc="Each worktree boots this project's docker compose stack on its own ports, so the agent builds and runs the app in a clean, isolated environment. Turn off to run on the host exactly as before."
        >
          {viable ? (
            <Sw on={!!env?.enabled} onChange={(v) => setEnvConfig({ enabled: v })} />
          ) : (
            <span className="tag muted">Unavailable</span>
          )}
        </Row>
        {env?.detectError && (
          <div className="prov-warn">
            <Icon.alert size={15} />
            <div>{env.detectError}</div>
            {DetectBtn}
          </div>
        )}
      </div>

      <EnvSecrets project={project} setOverrides={setOverrides} />

      <div className="set-card">
        <div className="set-card-head">
          <Icon.cube size={15} />
          <h3>Compose configuration</h3>
          <span className="spacer" />
          {DetectBtn}
        </div>
        <Row
          label="Compose file(s)"
          desc="Comma-separated, relative to the project root. Leave blank to auto-detect. Must be committed for agent worktrees to include it."
          col
        >
          <span className="path-field">
            <span className="field">
              <span className="field-ic">
                <Icon.file size={15} />
              </span>
              <input
                type="text"
                spellCheck={false}
                value={composeInput}
                placeholder="docker-compose.yml"
                onChange={(e) => setComposeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) void applyCompose()
                }}
              />
            </span>
            <button
              className="btn ghost"
              disabled={busy || composeInput === detectedFiles}
              onClick={() => void applyCompose()}
            >
              Apply
            </button>
          </span>
        </Row>
        {viable && env && (
          <>
            <Row
              label="Workspace service"
              desc="Runs the agent's shell; the worktree is bind-mounted here."
            >
              <Sel
                value={env.workspaceService ?? ''}
                onChange={(v) => void run(() => setOverrides({ workspaceService: v }))}
                options={env.services.map((s) => s.name)}
              />
            </Row>
            {env.exposed.length > 0 && (
              <Row label="Preview service" desc="Opened in the explorer when you view an agent.">
                <Sel
                  value={primary}
                  onChange={(v) => void run(() => setOverrides({ primaryService: v }))}
                  options={env.exposed.map((e) => e.service)}
                />
              </Row>
            )}
            {env.services.map((s) => (
              <Row
                key={s.name}
                label={s.name}
                desc={s.image ?? (s.build ? 'built from source' : undefined)}
              >
                <span className="tag">{s.build ? 'build' : 'image'}</span>
                {s.mountsSource && <span className="tag">source</span>}
                {s.ports.length > 0 && <span className="tag">:{s.ports.join(' :')}</span>}
                {s.hasHealthcheck && <span className="tag">health</span>}
                {s.name === env.workspaceService && (
                  <span className="spill st-done sm">
                    <span className="sdot" />
                    workspace
                  </span>
                )}
              </Row>
            ))}
          </>
        )}
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <Icon.terminal size={15} />
          <h3>Docker on this machine</h3>
        </div>
        <Row label="Engine" desc={dockerStatus?.version ?? undefined}>
          <DockerLine ok={!!dockerStatus?.installed} label="Installed" bad="Not installed" />
        </Row>
        <Row label="Compose" desc="Compose v2 (the `docker compose` command) is required.">
          <DockerLine
            ok={dockerStatus?.composeFlavor === 'v2'}
            label="v2"
            bad={dockerStatus?.composeFlavor === 'v1' ? 'v1 (upgrade needed)' : 'Missing'}
          />
        </Row>
        <Row label="Daemon">
          <DockerLine ok={!!dockerStatus?.daemonRunning} label="Running" bad="Not running" />
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
  const providerModels = useAppStore((s) => s.providerModels)
  const loadProviderModels = useAppStore((s) => s.loadProviderModels)
  const dockerStatus = useAppStore((s) => s.dockerStatus)
  const loadDockerStatus = useAppStore((s) => s.loadDockerStatus)
  const detectProjectEnv = useAppStore((s) => s.detectProjectEnv)
  const setProjectEnvConfig = useAppStore((s) => s.setProjectEnvConfig)
  const setProjectEnvOverrides = useAppStore((s) => s.setProjectEnvOverrides)
  const [tab, setTab] = useState('models')
  const [providers, setProviders] = useState<ProviderOption[]>([])

  const refreshProviders = (): void => {
    void window.api.providers.list().then(setProviders)
  }
  useEffect(refreshProviders, [])
  useEffect(() => {
    void loadDockerStatus()
  }, [loadDockerStatus])

  const provider = settings?.provider
  useEffect(() => {
    if (provider) void loadProviderModels(provider)
  }, [provider, loadProviderModels])

  if (!settings || !project) return <div />
  const save = (p: Partial<AppSettings>): void => void saveSettings(p)
  const curated = providers.find((p) => p.id === settings.provider)?.models ?? [settings.model]
  const models = providerModels[settings.provider] ?? curated

  const TABS: { id: string; label: string; ic: IconName }[] = [
    { id: 'models', label: 'Models', ic: 'loop' },
    { id: 'providers', label: 'Providers', ic: 'cube' },
    { id: 'environment', label: 'Environment', ic: 'layers' },
    { id: 'mcp', label: 'MCP', ic: 'terminal' },
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
      {tab === 'environment' && (
        <EnvironmentTab
          project={project}
          dockerStatus={dockerStatus}
          detect={() => detectProjectEnv(project.id)}
          setEnvConfig={(patch) => setProjectEnvConfig(project.id, patch)}
          setOverrides={(patch) => setProjectEnvOverrides(project.id, patch)}
        />
      )}
      {tab === 'mcp' && <McpSettings cwd={project.path} />}
      {tab === 'general' && <GeneralTab settings={settings} save={save} />}
      {tab === 'appearance' && <AppearanceTab settings={settings} save={save} />}
    </div>
  )
}
