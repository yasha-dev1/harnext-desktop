import { memo, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { JSX } from 'react'
import type {
  AgentMeta,
  DiffFile,
  MessageItem,
  Role,
  SandboxInfo,
  TimelineItem,
  ToolCallItem,
  WorktreeDiff
} from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import StatusPill from '../components/StatusPill'
import { elapsed, onActivate, shortModel } from '../lib/ui'
import { Icon } from '../components/icons'

const ROLE_META: Record<Role, { ic: keyof typeof Icon; name: string; icCls: string }> = {
  user: { ic: 'user', name: 'You', icCls: 'user' },
  plan: { ic: 'brain', name: 'Planner', icCls: 'plan' },
  exec: { ic: 'zap', name: 'Executor', icCls: 'exec' },
  eval: { ic: 'shield', name: 'Evaluator', icCls: 'eval' }
}

const TOOL_ICONS: Record<string, keyof typeof Icon> = {
  read: 'eye',
  edit: 'edit',
  write: 'edit',
  bash: 'terminal',
  skill: 'bolt',
  todo: 'check'
}

function roleModel(agent: AgentMeta, role: Role): string {
  if (agent.mode === 'single') return shortModel(agent.modelId)
  if (role === 'exec') return shortModel(agent.execModel)
  return shortModel(agent.smartModel)
}

function MsgText({ text }: { text: string }): JSX.Element {
  return (
    <div className="msg-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

const Msg = memo(function Msg({ m, agent }: { m: MessageItem; agent: AgentMeta }): JSX.Element {
  const r = ROLE_META[m.role]
  const Ic = Icon[r.ic]
  return (
    <div className={'msg ' + m.role}>
      <span className={'msg-ic ' + r.icCls}>
        <Ic size={15} />
      </span>
      <div className="msg-body">
        <div className="msg-role">
          <b>{r.name}</b>
          {m.role !== 'user' && <span className="model">· {roleModel(agent, m.role)}</span>}
        </div>
        {m.role === 'eval' && m.verdict ? (
          <div className="eval-card">
            <div className="eval-head">
              <Icon.loop size={14} />
              Evaluation
              <span className="verdict">{m.verdict.toUpperCase()}</span>
            </div>
            <div className="eval-checks" style={{ padding: '8px 12px 10px' }}>
              <MsgText text={m.content} />
            </div>
          </div>
        ) : (
          <MsgText text={m.content} />
        )}
      </div>
    </div>
  )
})

const ToolCall = memo(function ToolCall({ t }: { t: ToolCallItem }): JSX.Element {
  const [open, setOpen] = useState(false)
  const Ic = Icon[TOOL_ICONS[t.toolName] ?? 'terminal']
  const arg =
    typeof t.args.path === 'string'
      ? t.args.path
      : typeof t.args.file_path === 'string'
        ? t.args.file_path
        : typeof t.args.command === 'string'
          ? t.args.command
          : ''
  return (
    <div className="msg" style={{ paddingBottom: 10 }}>
      <span className="msg-ic" style={{ visibility: 'hidden', height: 0 }} />
      <div className="msg-body" style={{ paddingTop: 0 }}>
        <div
          className="toolcall"
          role="button"
          tabIndex={0}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onActivate(() => setOpen((o) => !o))}
          style={{ cursor: 'pointer', marginTop: 0 }}
        >
          <span className="tc-ic">
            <Ic size={14} />
          </span>
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {t.toolName} <code>{arg}</code>
          </span>
          {t.endedAt === null ? (
            <span className="tc-tag">
              <span
                className="sdot spin"
                style={{ display: 'inline-block', color: 'var(--primary)' }}
              />
            </span>
          ) : (
            <span className="tc-tag" style={t.isError ? { color: 'var(--err)' } : undefined}>
              {t.isError ? 'error' : t.toolName}
            </span>
          )}
        </div>
        {open && t.result !== null && (
          <pre
            style={{
              marginTop: 6,
              padding: '8px 11px',
              borderRadius: 8,
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              fontSize: 11,
              maxHeight: 240,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              color: t.isError ? 'var(--err)' : 'var(--tx-2)'
            }}
          >
            {t.result}
          </pre>
        )}
      </div>
    </div>
  )
})

function Thread({ agent, timeline }: { agent: AgentMeta; timeline: TimelineItem[] }): JSX.Element {
  const streaming = useAppStore((s) => s.streaming[agent.id])
  const sendPrompt = useAppStore((s) => s.sendPrompt)
  const [reply, setReply] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const isRunning = agent.status === 'running'
  const canReply = agent.live && !isRunning

  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })

  const send = async (): Promise<void> => {
    const text = reply.trim()
    if (!text || !canReply) return
    setReply('')
    setSendError(null)
    try {
      await sendPrompt(agent.id, text)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      className="thread"
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
    >
      <div className="thread-lead">Conversation</div>
      {timeline.map((item) =>
        item.kind === 'message' ? (
          <Msg key={`m${item.seq}`} m={item} agent={agent} />
        ) : (
          <ToolCall key={`t${item.seq}`} t={item} />
        )
      )}
      {streaming?.text && (
        <div className={'msg ' + streaming.role}>
          <span className={'msg-ic ' + ROLE_META[streaming.role].icCls}>
            {(() => {
              const Ic = Icon[ROLE_META[streaming.role].ic]
              return <Ic size={15} />
            })()}
          </span>
          <div className="msg-body">
            <div className="msg-role">
              <b>{ROLE_META[streaming.role].name}</b>
              <span className="model">· {roleModel(agent, streaming.role)}</span>
            </div>
            <MsgText text={streaming.text} />
          </div>
        </div>
      )}
      {isRunning && (
        <div className="thread-stream">
          <span className="stream-dots">
            <i />
            <i />
            <i />
          </span>
          {agent.progress}…
        </div>
      )}
      {sendError && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--err)' }}>{sendError}</div>
      )}
      <div className="reply">
        <input
          placeholder={
            !agent.live
              ? 'Session ended — start a new agent to continue'
              : isRunning
                ? 'Agent is working…'
                : agent.status === 'input'
                  ? 'Answer the agent…'
                  : 'Send a follow-up…'
          }
          disabled={!canReply}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            // Ignore the Enter that commits an IME composition (CJK input),
            // otherwise it sends a half-composed message.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send()
          }}
        />
        <button title="Send" onClick={() => void send()} disabled={!canReply}>
          <Icon.send size={15} />
        </button>
      </div>
    </div>
  )
}

// ── diff viewer ──────────────────────────────────────────────────────

const FileBlock = memo(function FileBlock({ file }: { file: DiffFile }): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const dir = file.path.split('/').slice(0, -1).join('/')
  const name = file.path.split('/').pop()
  return (
    <div className="file-block">
      <div
        className={'file-bar' + (collapsed ? ' collapsed' : '')}
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={onActivate(() => setCollapsed((c) => !c))}
      >
        <span className="file-chev">
          <Icon.chevron size={14} />
        </span>
        <Icon.fileCode size={15} style={{ color: 'var(--tx-2)' }} />
        <span className="file-path">
          {dir && <span className="dir">{dir}/</span>}
          {name}
        </span>
        <span className={'file-badge ' + file.badge}>
          {file.badge === 'new' ? 'new' : file.badge === 'del' ? 'deleted' : 'modified'}
        </span>
        <span className="file-stat">
          <span className="add">+{file.add}</span>
          <span className="del">−{file.del}</span>
        </span>
      </div>
      {!collapsed &&
        file.hunks.map((h, hi) => (
          <div key={hi}>
            <div className="hunk-label">{h.label}</div>
            <table className="diff-table">
              <tbody>
                {h.lines.map((l, li) => (
                  <tr key={li} className={l.t}>
                    <td className="ln">{l.n ?? l.o ?? ''}</td>
                    <td className="sign">{l.t === 'add' ? '+' : l.t === 'del' ? '−' : ''}</td>
                    <td className="code">{l.c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
})

function DiffViewer({
  agent,
  diff
}: {
  agent: AgentMeta
  diff: WorktreeDiff | undefined
}): JSX.Element {
  const files = diff?.files ?? []
  return (
    <div className="diffwrap">
      <div className="diff-head">
        <span className="dh-title">
          <Icon.diff size={15} />
          Worktree diff
        </span>
        {agent.branch && <span className="dh-branch">· {agent.branch}</span>}
        <span className="diff-stat">
          <span className="files">
            <Icon.fileCode size={13} />
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
          <span className="add">+{diff?.add ?? 0}</span>
          <span className="del">−{diff?.del ?? 0}</span>
        </span>
      </div>
      <div className="diff-scroll">
        {files.length === 0 ? (
          <div className="aside-empty" style={{ padding: '60px 24px' }}>
            No changes in the worktree yet.
          </div>
        ) : (
          files.map((f) => <FileBlock key={f.path} file={f} />)
        )}
      </div>
    </div>
  )
}

// ── explorer (live preview of the sandbox dev server) ────────────────

function Explorer({ sandbox }: { sandbox: SandboxInfo }): JSX.Element {
  const ports = sandbox.ports
  const [selected, setSelected] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Default to the primary service; honour the user's pick once they switch.
  const url =
    ports.find((p) => p.service === selected)?.url ?? sandbox.primaryUrl ?? ports[0]?.url ?? null

  if (sandbox.status === 'preparing') {
    return (
      <div className="exp-empty">
        <span className="stream-dots">
          <i />
          <i />
          <i />
        </span>
        Starting the environment…
      </div>
    )
  }
  if (sandbox.status === 'failed') {
    return (
      <div className="exp-empty">
        <Icon.alert size={18} />
        The sandbox failed to start — see the error above the conversation.
      </div>
    )
  }
  if (!url) {
    return (
      <div className="exp-empty">
        <Icon.eye size={18} />
        No forwarded services to preview.
      </div>
    )
  }

  return (
    <div className="explorer">
      <div className="exp-bar">
        {ports.length > 1 && (
          <span className="exp-svc">
            {ports.map((p) => (
              <button
                key={p.service}
                className={p.url === url ? 'active' : ''}
                onClick={() => setSelected(p.service)}
              >
                {p.service}
              </button>
            ))}
          </span>
        )}
        <span className="exp-url">{url}</span>
        <button className="exp-iconbtn" title="Reload" onClick={() => setReloadKey((k) => k + 1)}>
          <Icon.refresh size={14} />
        </button>
        <button
          className="exp-iconbtn"
          title="Open in browser"
          onClick={() => void window.api.openExternal(url)}
        >
          <Icon.external size={14} />
        </button>
      </div>
      <webview key={`${url}#${reloadKey}`} className="exp-frame" src={url} />
    </div>
  )
}

function RightPane({
  agent,
  diff,
  sandbox
}: {
  agent: AgentMeta
  diff: WorktreeDiff | undefined
  sandbox: SandboxInfo | undefined
}): JSX.Element {
  const [tab, setTab] = useState<'diff' | 'preview'>('diff')
  // Only surface the Preview tab when this agent actually has a sandbox.
  if (!sandbox || sandbox.status === 'off') return <DiffViewer agent={agent} diff={diff} />
  const dotCls =
    sandbox.status === 'preparing' ? ' preparing' : sandbox.status === 'failed' ? ' failed' : ''
  return (
    <div className="rightpane">
      <div className="rp-tabs">
        <button className={tab === 'diff' ? 'active' : ''} onClick={() => setTab('diff')}>
          <Icon.diff size={14} />
          Diff
        </button>
        <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>
          <Icon.eye size={14} />
          Preview
          <span className={'rp-dot' + dotCls} />
        </button>
      </div>
      <div className="rp-body">
        {tab === 'diff' ? <DiffViewer agent={agent} diff={diff} /> : <Explorer sandbox={sandbox} />}
      </div>
    </div>
  )
}

// ── actions ──────────────────────────────────────────────────────────

function OpenPRPanel({
  agent,
  onError
}: {
  agent: AgentMeta
  onError: (msg: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(agent.title)
  const [base, setBase] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const generatedRef = useRef(false)

  // Open the dialog and, on first open, ask the model for a PR title + body
  // (and the repo's default base) the same way the worktree name is generated,
  // so the fields aren't blank. Best-effort: defaults stay on failure.
  const openModal = (): void => {
    setOpen(true)
    if (generatedRef.current) return
    generatedRef.current = true
    setGenerating(true)
    void window.api.agents
      .suggestPR(agent.id)
      .then((s) => {
        setTitle(s.title)
        setBase(s.base)
        setBody(s.body)
      })
      .catch(() => {
        /* keep defaults — the user can fill them in manually */
      })
      .finally(() => setGenerating(false))
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      const u = await window.api.agents.openPR(agent.id, {
        title: title.trim() || undefined,
        base: base.trim() || undefined,
        body: body.trim() || undefined
      })
      setUrl(u)
      setOpen(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (url) {
    return (
      <a className="btn ok" href={url} target="_blank" rel="noreferrer" title={url}>
        <Icon.external size={14} />
        PR opened
      </a>
    )
  }

  return (
    <>
      <button className="btn" onClick={openModal}>
        <Icon.branch size={14} />
        Push &amp; open PR
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="modal-card pr-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <Icon.branch size={15} />
              Open a pull request
              {generating && <span className="pr-spin" role="status" aria-label="Generating" />}
            </div>

            {/* base ← compare, like GitHub's open-PR header */}
            <div className="pr-branchbar">
              <span className="pr-into">base</span>
              {generating ? (
                <span className="pr-skel pr-skel-base" />
              ) : (
                <input
                  className="pr-base"
                  value={base}
                  disabled={busy}
                  placeholder="default branch"
                  onChange={(e) => setBase(e.target.value)}
                />
              )}
              <span className="pr-arrow" aria-hidden="true">
                ←
              </span>
              <span className="pr-into">compare</span>
              <span className="pr-branch" title={agent.branch ?? ''}>
                <Icon.branch size={12} />
                {agent.branch ?? '(uncommitted)'}
              </span>
            </div>

            <p className="modal-desc">
              Pushes <code>{agent.branch}</code> to <code>origin</code> and opens a PR via the
              GitHub CLI.
            </p>

            <label className="modal-field">
              <span>Title</span>
              {generating ? (
                <span className="pr-skel pr-skel-input" />
              ) : (
                <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
              )}
            </label>
            <label className="modal-field">
              <span>Description</span>
              {generating ? (
                <span className="pr-skel pr-skel-area" />
              ) : (
                <textarea
                  value={body}
                  rows={10}
                  disabled={busy}
                  onChange={(e) => setBody(e.target.value)}
                />
              )}
            </label>
            <div className="modal-actions">
              <button className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn ok"
                disabled={busy || generating || !title.trim()}
                onClick={() => void submit()}
              >
                {busy ? (
                  <>
                    <span className="pr-spin sm" aria-hidden="true" />
                    Creating…
                  </>
                ) : generating ? (
                  <>
                    <span className="pr-spin sm" aria-hidden="true" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Icon.branch size={14} />
                    Create pull request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DetailActions({
  agent,
  editor,
  onError
}: {
  agent: AgentMeta
  editor: string
  onError: (msg: string) => void
}): JSX.Element | null {
  const navigate = useNavigate()
  const abortAgent = useAppStore((s) => s.abortAgent)
  const discardAgent = useAppStore((s) => s.discardAgent)
  const mergeAgent = useAppStore((s) => s.mergeAgent)
  const sendPrompt = useAppStore((s) => s.sendPrompt)

  const openEditor = (): void => {
    void window.api.agents.openEditor(agent.id).catch((err: unknown) => {
      onError(err instanceof Error ? err.message : String(err))
    })
  }
  const discard = (): void => {
    if (!confirm('Discard this agent? Its worktree and branch are deleted.')) return
    void discardAgent(agent.id).then(() => navigate(`/project/${agent.projectId}`))
  }
  const merge = (): void => {
    void mergeAgent(agent.id).catch((err: unknown) =>
      onError(err instanceof Error ? err.message : String(err))
    )
  }
  const resume = (): void => {
    void sendPrompt(agent.id, 'Continue where you left off.').catch((err: unknown) =>
      onError(err instanceof Error ? err.message : String(err))
    )
  }

  const editorBtn = (
    <button className="btn ghost" onClick={openEditor}>
      <Icon.external size={14} />
      {editor}
    </button>
  )

  switch (agent.status) {
    case 'review':
      return (
        <>
          {editorBtn}
          <button className="btn danger" onClick={discard}>
            <Icon.trash size={14} />
            Discard
          </button>
          {agent.branch && <OpenPRPanel agent={agent} onError={onError} />}
          {agent.branch && (
            <button className="btn ok" onClick={merge}>
              <Icon.merge size={14} />
              Approve &amp; merge
            </button>
          )}
        </>
      )
    case 'running':
      return (
        <>
          {editorBtn}
          <button className="btn danger" onClick={() => void abortAgent(agent.id)}>
            <Icon.stop size={13} />
            Stop
          </button>
        </>
      )
    case 'input':
      return (
        <>
          {editorBtn}
          <button className="btn danger" onClick={discard}>
            <Icon.trash size={14} />
            Discard
          </button>
        </>
      )
    case 'done':
      return agent.branch ? (
        <span className="tag">
          <Icon.branch size={13} />
          merged <b>{agent.branch}</b>
        </span>
      ) : null
    case 'failed':
      return (
        <button className="btn danger" onClick={discard}>
          <Icon.trash size={14} />
          Discard
        </button>
      )
    case 'paused':
      return (
        <>
          <button className="btn danger" onClick={discard}>
            <Icon.trash size={14} />
            Discard
          </button>
          {agent.live && (
            <button className="btn primary" onClick={resume}>
              <Icon.play size={13} />
              Resume
            </button>
          )}
        </>
      )
    default:
      return null
  }
}

// ── page ─────────────────────────────────────────────────────────────

export default function AgentDetail(): JSX.Element {
  const { projectId: projectIdParam, agentId = '' } = useParams()
  const projectId = Number(projectIdParam)
  const navigate = useNavigate()

  const agent = useAppStore((s) => s.agents[agentId])
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const settings = useAppStore((s) => s.settings)
  const timeline = useAppStore((s) => s.timelines[agentId])
  const diff = useAppStore((s) => s.diffs[agentId])
  const sandbox = useAppStore((s) => s.sandboxes[agentId])
  const ensureTimeline = useAppStore((s) => s.ensureTimeline)
  const loadDiff = useAppStore((s) => s.loadDiff)
  const loadSandbox = useAppStore((s) => s.loadSandbox)
  const agentsLoaded = useAppStore((s) => s.agentIdsByProject[projectId] !== undefined)

  const [actionError, setActionError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Reset per-agent UI state when navigating between agents.
  const [lastAgentId, setLastAgentId] = useState(agentId)
  if (lastAgentId !== agentId) {
    setLastAgentId(agentId)
    setActionError(null)
  }

  useEffect(() => {
    void ensureTimeline(agentId)
    void loadDiff(agentId)
    void loadSandbox(agentId)
  }, [agentId, ensureTimeline, loadDiff, loadSandbox])

  const isRunning = agent?.status === 'running'
  useEffect(() => {
    if (!isRunning) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [isRunning])

  // Once the project's agents have loaded and this id isn't among them, the
  // agent was removed (or never existed) — return home instead of hanging on
  // "Loading…" forever (mirrors LoopDetail's redirect for a missing loop).
  useEffect(() => {
    if (agentsLoaded && !agent) navigate(`/project/${projectId}`, { replace: true })
  }, [agentsLoaded, agent, navigate, projectId])

  if (!agent || !project) {
    return (
      <div className="aside-empty" style={{ padding: 60 }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="detail view">
      <div className="detail-head">
        <div className="detail-htext">
          <div className="detail-crumb">
            <button className="back" onClick={() => navigate(`/project/${projectId}`)}>
              <Icon.chevronL size={13} />
              Agents
            </button>
            <span className="sep">/</span>
            <span>{project.name}</span>
          </div>
          <div className="detail-title">{agent.title}</div>
          <div className="detail-tags">
            <StatusPill status={agent.status} />
            {agent.branch && (
              <span className="tag">
                <Icon.branch size={13} />
                <b>{agent.branch}</b>
              </span>
            )}
            {agent.mode === 'goal' && (
              <span className="tag goal">
                <Icon.loop size={13} />
                Goal
              </span>
            )}
            {agent.mode === 'single' ? (
              <span className="tag">
                <Icon.cube size={13} />
                {shortModel(agent.modelId)}
              </span>
            ) : (
              <>
                <span className="tag">
                  <Icon.brain size={13} />
                  {shortModel(agent.smartModel)}
                </span>
                <span className="tag">
                  <Icon.zap size={13} />
                  {shortModel(agent.execModel)}
                </span>
              </>
            )}
            <span className="tag">
              <Icon.clock size={13} />
              {elapsed(agent.createdAt, isRunning ? now : agent.updatedAt)}
            </span>
          </div>
          {(actionError || agent.error) && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--err)' }}>
              {actionError ?? agent.error}
            </div>
          )}
        </div>
        <div className="detail-actions">
          <DetailActions
            agent={agent}
            editor={settings?.editor ?? 'Editor'}
            onError={setActionError}
          />
        </div>
      </div>
      <div className="detail-cols">
        <Thread agent={agent} timeline={timeline ?? []} />
        <RightPane agent={agent} diff={diff} sandbox={sandbox} />
      </div>
    </div>
  )
}
