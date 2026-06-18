import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { BranchList, PermissionMode, ProviderOption } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { Icon, type IconName } from '../components/icons'
import { ModelPicker } from '../components/ModelPicker'
import { toPickerGroups, canonicalRef } from '../lib/model-picker'
import { parseModelRef } from '@shared/model-ref'
import { EffortPicker } from '../components/EffortPicker'
import { AttachButton, AttachmentBar } from '../components/Attachments'
import { useAttachments } from '../lib/attachments'
import { canSubmitComposer } from '../lib/composer'
import { imagesWouldBeDropped, NON_VISION_ATTACH_HINT } from '../lib/vision-models'
import { projectDraftKey } from '../lib/draft-keys'
import { navigateHistory, caretAtEdge } from '../lib/composer-history'

// Stable reference so the `?? []` fallback doesn't churn the selector.
const EMPTY_HISTORY: string[] = []

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

  // Draft persists across navigation (#132): keyed per project in the store.
  const draftKey = projectDraftKey(projectId)
  const text = useAppStore((s) => s.composerDrafts[draftKey] ?? '')
  const setDraft = useAppStore((s) => s.setDraft)
  const clearDraft = useAppStore((s) => s.clearDraft)
  const setText = (v: string): void => setDraft(draftKey, v)
  // Shell-style ↑/↓ prompt history (#133): per-project sent prompts.
  const history = useAppStore((s) => s.promptHistory[draftKey]) ?? EMPTY_HISTORY
  const pushPromptHistory = useAppStore((s) => s.pushPromptHistory)
  const [histIndex, setHistIndex] = useState<number | null>(null)
  const histDraft = useRef('')
  const [starting, setStarting] = useState(false)
  const att = useAttachments()
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  // Base branch: `branches` is the fetched local/remote list; `base` is the user's
  // explicit pick (null = use the project's current branch, i.e. today's behaviour).
  const [branches, setBranches] = useState<BranchList | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void window.api.providers.list().then(setProviders)
    taRef.current?.focus()
  }, [])

  useEffect(() => {
    if (project?.isGit) void window.api.projects.branches(projectId).then(setBranches)
  }, [projectId, project?.isGit])

  // Load every connected provider's models so the pickers can list them all (#103).
  useEffect(() => {
    providers.forEach((p) => {
      if (p.authenticated) void loadProviderModels(p.id)
    })
  }, [providers, loadProviderModels])

  if (!project || !settings) return <div />

  // Cross-provider model catalog for the pickers (#103): one group per connected
  // provider, each model carried as a `<provider>:<model>` ref.
  const groups = toPickerGroups(
    providers.map((p) => ({
      id: p.id,
      name: p.name,
      authenticated: p.authenticated,
      models: providerModels[p.id] ?? p.models
    }))
  )
  const providerIds = providers.map((p) => p.id)
  const refOf = (v: string): string => canonicalRef(v, providerIds, settings.provider)
  const isGoal = /(^|\s)\/goal\b/i.test(text)
  // Warn when the model that will receive the prompt can't read images, so an
  // attachment isn't silently dropped (#131). In goal mode the planner (smart)
  // gets the first prompt; otherwise it's the single model. Resolve the ref to its
  // bare model id first so the vision check sees the model, not the `provider:` ref.
  const promptModel = parseModelRef(isGoal ? settings.smart : settings.model, {
    providers: providerIds,
    fallback: settings.provider
  }).modelId
  const nonVisionModel = imagesWouldBeDropped(promptModel)

  // Base-branch picker: default to the project's current branch; the options are
  // the fetched local + remote branches (current first), deduped.
  const currentBranch = branches?.current ?? project.branch ?? ''
  const baseValue = base ?? currentBranch
  const branchOptions = [
    ...new Set([currentBranch, ...(branches?.local ?? []), ...(branches?.remote ?? [])])
  ].filter(Boolean)

  const canSubmit = canSubmitComposer(text, att.items.length > 0)

  const start = async (): Promise<void> => {
    // Allow an image-only prompt (text or at least one attachment).
    if (!canSubmit || starting) return
    setStarting(true)
    setError(null)
    try {
      const images = att.items.map((a) => a.dataUrl)
      // Only override when the user picked a branch other than the current one.
      const baseBranch = baseValue && baseValue !== currentBranch ? baseValue : undefined
      const meta = await startAgent({ projectId, prompt: text.trim(), images, baseBranch })
      pushPromptHistory(draftKey, text)
      setHistIndex(null)
      clearDraft(draftKey)
      att.clear()
      navigate(`/project/${projectId}/agent/${meta.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const onComposerKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void start()
      return
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const ta = e.currentTarget
    const edge = caretAtEdge(ta.value, ta.selectionStart, ta.selectionEnd)
    // Only hijack the arrow at the relevant line edge, so multi-line editing works.
    if (e.key === 'ArrowUp' ? !edge.atFirstLine : !edge.atLastLine) return
    if (e.key === 'ArrowUp' && history.length === 0) return
    e.preventDefault()
    if (histIndex === null) histDraft.current = text // remember the in-progress draft
    const draft = histIndex === null ? text : histDraft.current
    const res = navigateHistory(e.key === 'ArrowUp' ? 'up' : 'down', history, histIndex, draft)
    setHistIndex(res.index)
    setText(res.text)
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

        <div className="composer" onDrop={att.onDrop} onDragOver={(e) => e.preventDefault()}>
          <AttachmentBar items={att.items} onRemove={att.remove} />
          <textarea
            ref={taRef}
            value={text}
            placeholder="e.g. Add input validation to the signup form — or /goal for a multi-step task…  (paste or drop an image)"
            onChange={(e) => setText(e.target.value)}
            onPaste={att.onPaste}
            onKeyDown={onComposerKey}
            autoFocus
          />
          <div className="composer-bar">
            <AttachButton
              onPick={att.addFiles}
              title={nonVisionModel ? NON_VISION_ATTACH_HINT : undefined}
            />
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
                <ModelPicker
                  mono
                  value={refOf(settings.smart)}
                  groups={groups}
                  onChange={(v) => void saveSettings({ smart: v })}
                />
                <span className="ctl" title="Executor model — writes the code">
                  <Icon.zap size={14} />
                  <span className="k">exec</span>
                </span>
                <ModelPicker
                  mono
                  value={refOf(settings.executor)}
                  groups={groups}
                  onChange={(v) => void saveSettings({ executor: v })}
                />
              </>
            ) : (
              <ModelPicker
                mono
                value={refOf(settings.model)}
                groups={groups}
                onChange={(v) => void saveSettings({ model: v })}
              />
            )}
            <span className="ctl" title="Reasoning effort — how hard the model thinks">
              <Icon.brain size={14} />
              <span className="k">effort</span>
            </span>
            <EffortPicker
              value={settings.thinkingLevel}
              onChange={(v) => void saveSettings({ thinkingLevel: v })}
            />
            {project.isGit && branchOptions.length > 0 && (
              <>
                <span
                  className="ctl"
                  title="Base branch — the agent's worktree is created from this ref"
                >
                  <Icon.branch size={14} />
                  <span className="k">base</span>
                </span>
                <ModelPicker
                  mono
                  value={baseValue}
                  models={branchOptions}
                  onChange={(v) => setBase(v)}
                  placeholder="Search branches…"
                  icon={() => <Icon.branch size={13} />}
                />
              </>
            )}
            <span className="grow" />
            <button
              className="composer-start"
              onClick={() => void start()}
              disabled={starting || !canSubmit}
            >
              <Icon.play size={14} />
              {starting ? 'Starting…' : 'Start agent'} <kbd>⌘↵</kbd>
            </button>
          </div>
        </div>

        {(error || att.error) && (
          <div
            className="set-card danger"
            style={{ marginTop: 14, padding: '12px 16px', fontSize: 12, color: 'var(--err)' }}
          >
            {error || att.error}
          </div>
        )}

        {nonVisionModel && att.items.length > 0 && (
          <div
            className="set-card"
            role="alert"
            style={{
              marginTop: 14,
              padding: '12px 16px',
              fontSize: 12,
              color: 'var(--warn, #e0b341)'
            }}
          >
            ⚠ {NON_VISION_ATTACH_HINT} Your attachment won’t be sent.
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
