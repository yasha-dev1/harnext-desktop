import { randomUUID } from 'node:crypto'
import {
  createAgentSession,
  getProviderById,
  getProviderConfig,
  getStoredKey,
  parseGoalVerdict,
  setProviderEnv,
  type AgentSession,
  type AgentSessionEventListener
} from '@harnext/core'
import type {
  AgentMeta,
  AgentPush,
  AgentStatus,
  Role,
  StartAgentInput,
  WorktreeDiff
} from '../../shared/types'
import * as db from '../db'
import {
  commitWorktree,
  createPullRequest,
  createWorktree,
  defaultBaseBranch,
  diffFromSnapshots,
  hasRemote,
  mergeWorktree,
  pushBranch,
  removeWorktree,
  worktreeDiff
} from '../git'
import { DiffTracker } from './diff-service'
import {
  EVALUATOR_SYSTEM_PROMPT,
  GENERATOR_SYSTEM_PROMPT,
  MAX_GOAL_ITERATIONS,
  PLANNER_SYSTEM_PROMPT
} from './goal-prompts'

type AgentEvent = Parameters<AgentSessionEventListener>[0]

/**
 * The SDK reads API keys from env vars only; stored keys from `harnext` CLI
 * login (and our onboarding) live in ~/.harnext/agent/auth.json. Mirror the
 * CLI's ensureAuth(): copy the stored key into the provider's env var.
 */
export function ensureProviderEnv(providerId: string): void {
  const info = getProviderById(providerId)
  if (!info) return
  if (info.local) {
    if (!getProviderConfig(providerId)?.baseUrl && !info.defaultBaseUrl) {
      throw new Error(`Provider "${providerId}" is not configured.`)
    }
    return
  }
  if (!info.envVar || process.env[info.envVar]) return
  const key = getStoredKey(providerId)
  if (key) {
    setProviderEnv(info, key)
    return
  }
  throw new Error(
    `No API key for ${info.name}. Add one in Settings → Providers, or set ${info.envVar}.`
  )
}

const TEXT_FLUSH_MS = 50
const DIFF_DEBOUNCE_MS = 900
const RESULT_PREVIEW_CHARS = 4000

const WORKTREE_NAME_PROMPT =
  'You name git branches for coding tasks. Reply with ONLY the branch name: ' +
  '2-4 lowercase words in kebab-case (hyphen-separated). No "agent/" or ' +
  '"feature/" prefix, no quotes, no punctuation, no explanation. ' +
  'Examples: add-csv-export, fix-login-redirect, refactor-auth-context.'

const WORKTREE_NAME_TIMEOUT_MS = 15_000

/**
 * Ask the model for a concise branch name for the task instead of slugifying
 * the raw prompt. Best-effort: returns null on any error/timeout so worktree
 * creation can fall back to the prompt-derived slug. Runs a minimal, tool-less
 * single-turn session so it's cheap and fast.
 */
async function generateWorktreeName(
  provider: string,
  modelId: string,
  cwd: string,
  prompt: string
): Promise<string | null> {
  try {
    const { session } = await createAgentSession({
      cwd,
      provider,
      modelId,
      systemPrompt: WORKTREE_NAME_PROMPT,
      tools: [],
      skills: [],
      mcpDisabled: true,
      compaction: false,
      maxTurns: 1,
      quiet: true
    })
    let out = ''
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'message_end' && isAssistant(event.message)) {
        out = extractText(event.message)
      }
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('worktree-name timeout')), WORKTREE_NAME_TIMEOUT_MS)
    )
    try {
      await Promise.race([session.prompt(`Task:\n${prompt.slice(0, 1500)}`), timeout])
    } finally {
      unsubscribe()
      void session.dispose()
    }
    const name = out
      .trim()
      .split('\n')[0]
      .replace(/^(agent|feature|feat)\//i, '')
      .trim()
    return name || null
  } catch {
    return null
  }
}

export interface SettleInfo {
  status: AgentStatus
  add: number
  del: number
  summary: string
}

interface LiveAgent {
  id: string
  projectId: number
  projectPath: string
  isGit: boolean
  mode: 'single' | 'goal'
  worktreePath: string | null
  branch: string | null
  cwd: string
  permissionMode: 'acceptEdits' | 'plan' | 'bypassPermissions'
  smartModel: string | null
  execModel: string | null
  provider: string
  /** All sessions ever created for this agent (for dispose). */
  sessions: AgentSession[]
  /** The session follow-up prompts go to. */
  mainSession: AgentSession | null
  diffTracker: DiffTracker
  seq: number
  partialText: string
  partialRole: Role
  textDirty: boolean
  flushTimer: NodeJS.Timeout | null
  diffTimer: NodeJS.Timeout | null
  abortRequested: boolean
  lastStopReason: string | null
  lastErrorMessage: string | null
  lastAssistantText: string
  onSettled?: (info: SettleInfo) => void
}

export class AgentManager {
  private live = new Map<string, LiveAgent>()

  constructor(private send: (push: AgentPush) => void) {}

  isLive = (id: string): boolean => this.live.has(id)

  async startAgent(
    input: StartAgentInput,
    hooks?: { onSettled?: (info: SettleInfo) => void }
  ): Promise<AgentMeta> {
    const project = db.getProject(input.projectId)
    if (!project) throw new Error(`Project ${input.projectId} not found`)

    const settings = db.getSettings()
    const provider = input.provider ?? settings.provider
    const isGoal = /(^|\s)\/goal\b/i.test(input.prompt)
    const cleanPrompt = input.prompt.replace(/(^|\s)\/goal\b/i, ' ').trim() || input.prompt
    const title = cleanPrompt.replace(/\s+/g, ' ').trim().slice(0, 80)
    const permissionMode = input.permissionMode ?? settings.mode
    const model = input.model ?? settings.model
    const smart = input.smart ?? settings.smart
    const executor = input.executor ?? settings.executor

    ensureProviderEnv(provider)

    const agentId = randomUUID()

    // Isolated worktree for git projects — the user's checkout is never touched.
    // Ask the model for a meaningful branch name first; fall back to the
    // prompt-derived title if it can't (offline, bad key, timeout…).
    let worktree: { path: string; branch: string } | null = null
    if (project.isGit) {
      const suggested = await generateWorktreeName(provider, model, project.path, cleanPrompt)
      worktree = createWorktree(project.path, suggested ?? title, agentId)
    }
    const cwd = worktree?.path ?? project.path

    db.insertAgent({
      id: agentId,
      projectId: input.projectId,
      title,
      mode: isGoal ? 'goal' : 'single',
      modelId: isGoal ? null : model,
      smartModel: isGoal ? smart : null,
      execModel: isGoal ? executor : null,
      permissionMode,
      branch: worktree?.branch ?? null,
      worktreePath: worktree?.path ?? null,
      progress: isGoal ? 'Planning the work' : 'Getting to work'
    })
    this.send({ agentId, type: 'agents-changed', projectId: input.projectId })

    const agent: LiveAgent = {
      id: agentId,
      projectId: input.projectId,
      projectPath: project.path,
      isGit: project.isGit,
      mode: isGoal ? 'goal' : 'single',
      worktreePath: worktree?.path ?? null,
      branch: worktree?.branch ?? null,
      cwd,
      permissionMode,
      smartModel: isGoal ? smart : null,
      execModel: isGoal ? executor : model,
      provider,
      sessions: [],
      mainSession: null,
      diffTracker: new DiffTracker(cwd),
      seq: 1,
      partialText: '',
      partialRole: 'exec',
      textDirty: false,
      flushTimer: null,
      diffTimer: null,
      abortRequested: false,
      lastStopReason: null,
      lastErrorMessage: null,
      lastAssistantText: '',
      onSettled: hooks?.onSettled
    }
    this.live.set(agentId, agent)

    const userItem = db.insertMessage(agentId, agent.seq++, 'user', cleanPrompt)
    this.send({ agentId, type: 'message', item: userItem })

    if (isGoal) {
      void this.runGoal(agent, cleanPrompt).catch((err: unknown) =>
        this.settle(agent, err instanceof Error ? err.message : String(err))
      )
    } else {
      void this.runSingle(agent, cleanPrompt).catch((err: unknown) =>
        this.settle(agent, err instanceof Error ? err.message : String(err))
      )
    }

    return db.getAgent(agentId, true)!
  }

  async prompt(agentId: string, text: string): Promise<void> {
    const agent = this.live.get(agentId)
    if (!agent?.mainSession) {
      throw new Error('This agent session has ended — start a new agent to continue.')
    }
    const item = db.insertMessage(agentId, agent.seq++, 'user', text)
    this.send({ agentId, type: 'message', item })
    this.setStatus(agent.id, 'running', 'Getting to work')
    agent.abortRequested = false
    agent.lastStopReason = null
    agent.lastErrorMessage = null
    const session = agent.mainSession
    void session
      .prompt(text)
      .then(() => this.settle(agent))
      .catch((err: unknown) => this.settle(agent, err instanceof Error ? err.message : String(err)))
  }

  abort(agentId: string): void {
    const agent = this.live.get(agentId)
    if (!agent) return
    agent.abortRequested = true
    for (const s of agent.sessions) s.abort()
  }

  async merge(agentId: string): Promise<void> {
    const meta = db.getAgent(agentId, this.isLive(agentId))
    if (!meta) throw new Error('Agent not found')
    const project = db.getProject(meta.projectId)
    if (!project) throw new Error('Project not found')
    if (!meta.worktreePath || !meta.branch) throw new Error('This agent has no worktree to merge.')
    mergeWorktree(project.path, meta.worktreePath, meta.branch, meta.title)
    removeWorktree(project.path, meta.worktreePath, meta.branch)
    await this.disposeAgent(agentId)
    this.setStatus(agentId, 'done', `Merged into ${project.branch ?? 'HEAD'}`)
  }

  /**
   * Commit the agent's worktree, push its branch to origin, and open a pull
   * request against `base` (defaults to the remote's default branch). Returns
   * the PR URL. The agent and its branch are kept — this is an alternative to
   * the local-only `merge()` for teams that integrate via review.
   */
  async openPullRequest(
    agentId: string,
    opts: { base?: string; title?: string; body?: string } = {}
  ): Promise<string> {
    const meta = db.getAgent(agentId, this.isLive(agentId))
    if (!meta) throw new Error('Agent not found')
    const project = db.getProject(meta.projectId)
    if (!project) throw new Error('Project not found')
    if (!meta.worktreePath || !meta.branch) {
      throw new Error('This agent has no worktree/branch to push.')
    }
    if (!hasRemote(project.path)) {
      throw new Error('This project has no `origin` remote to push to.')
    }
    const title = opts.title?.trim() || meta.title
    const base = opts.base?.trim() || defaultBaseBranch(project.path)
    const body = opts.body ?? `Opened from the harnext agent “${meta.title}”.`
    commitWorktree(meta.worktreePath, title)
    pushBranch(meta.worktreePath, meta.branch)
    return createPullRequest(project.path, { branch: meta.branch, base, title, body })
  }

  async discard(agentId: string): Promise<void> {
    const meta = db.getAgent(agentId, this.isLive(agentId))
    if (!meta) return
    const project = db.getProject(meta.projectId)
    await this.disposeAgent(agentId)
    if (meta.worktreePath && project) {
      removeWorktree(project.path, meta.worktreePath, meta.branch)
    }
    db.removeAgent(agentId)
    this.send({ agentId, type: 'agents-changed', projectId: meta.projectId })
  }

  async remove(agentId: string): Promise<void> {
    await this.discard(agentId)
  }

  stopAll(): void {
    for (const agent of this.live.values()) {
      agent.abortRequested = true
      for (const s of agent.sessions) s.abort()
    }
  }

  getDiff(agentId: string): WorktreeDiff {
    const agent = this.live.get(agentId)
    if (agent?.isGit && agent.worktreePath) return worktreeDiff(agent.worktreePath)
    const meta = db.getAgent(agentId, this.isLive(agentId))
    if (meta?.worktreePath) {
      try {
        return worktreeDiff(meta.worktreePath)
      } catch {
        /* worktree gone (merged/discarded) — fall through */
      }
    }
    return diffFromSnapshots(db.listFileChanges(agentId))
  }

  async disposeAll(): Promise<void> {
    for (const agent of this.live.values()) {
      for (const s of agent.sessions) s.abort()
      if (agent.flushTimer) clearTimeout(agent.flushTimer)
      if (agent.diffTimer) clearTimeout(agent.diffTimer)
      for (const s of agent.sessions) void s.dispose().catch(() => {})
    }
    this.live.clear()
  }

  // ── run flows ──────────────────────────────────────────────────────

  private async runSingle(agent: LiveAgent, prompt: string): Promise<void> {
    const session = await this.createSession(agent, {
      modelId: agent.execModel!,
      role: 'exec',
      permissionMode: agent.permissionMode
    })
    agent.mainSession = session
    await session.prompt(prompt)
    this.settle(agent)
  }

  private async runGoal(agent: LiveAgent, goal: string): Promise<void> {
    const settings = db.getSettings()

    // 1 — planner (smart model, read-only)
    this.setStatus(agent.id, 'running', 'Planning the work')
    const planner = await this.createSession(agent, {
      modelId: agent.smartModel!,
      role: 'plan',
      permissionMode: 'plan',
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      mcpDisabled: true
    })
    await planner.prompt(goal)
    const blueprint = agent.lastAssistantText
    if (agent.abortRequested || !blueprint) {
      this.settle(agent)
      return
    }

    // 2 — generator (executor model, writes code)
    this.setStatus(agent.id, 'running', 'Implementing the plan')
    const generator = await this.createSession(agent, {
      modelId: agent.execModel!,
      role: 'exec',
      permissionMode: agent.permissionMode,
      systemPrompt: GENERATOR_SYSTEM_PROMPT
    })
    agent.mainSession = generator
    await generator.prompt(
      `GOAL:\n${goal}\n\nBLUEPRINT:\n${blueprint}\n\nImplement the blueprint now.`
    )
    if (agent.abortRequested) {
      this.settle(agent)
      return
    }

    // 3 — evaluator loop (smart model, read-only)
    if (settings.evalLoop) {
      for (let i = 1; i <= MAX_GOAL_ITERATIONS; i++) {
        this.setStatus(agent.id, 'running', `Reviewing the changes (round ${i})`)
        const evaluator = await this.createSession(agent, {
          modelId: agent.smartModel!,
          role: 'eval',
          permissionMode: 'plan',
          systemPrompt: EVALUATOR_SYSTEM_PROMPT,
          mcpDisabled: true
        })
        await evaluator.prompt(
          `GOAL:\n${goal}\n\nBLUEPRINT:\n${blueprint}\n\nReview the working tree changes against the blueprint now.`
        )
        const reviewText = agent.lastAssistantText
        const verdict = parseGoalVerdict(reviewText)
        if (agent.abortRequested || verdict !== 'revise') break
        this.setStatus(agent.id, 'running', `Fixing review feedback (round ${i})`)
        await generator.prompt(
          `The evaluator requested changes:\n\n${reviewText}\n\nFix every item.`
        )
        if (agent.abortRequested) break
      }
    }
    this.settle(agent)
  }

  private async createSession(
    agent: LiveAgent,
    opts: {
      modelId: string
      role: Role
      permissionMode: 'acceptEdits' | 'plan' | 'bypassPermissions'
      systemPrompt?: string
      mcpDisabled?: boolean
    }
  ): Promise<AgentSession> {
    const { session } = await createAgentSession({
      cwd: agent.cwd,
      provider: agent.provider,
      modelId: opts.modelId,
      permissionMode: opts.permissionMode,
      systemPrompt: opts.systemPrompt,
      mcpDisabled: opts.mcpDisabled,
      quiet: true
    })
    agent.sessions.push(session)
    session.subscribe((event) => this.handleEvent(agent, opts.role, event))
    return session
  }

  // ── event pipeline ─────────────────────────────────────────────────

  private handleEvent(agent: LiveAgent, role: Role, event: AgentEvent): void {
    switch (event.type) {
      case 'message_start': {
        if (isAssistant(event.message)) {
          agent.partialText = ''
          agent.partialRole = role
        }
        break
      }
      case 'message_update': {
        if (isAssistant(event.message)) {
          agent.partialText = extractText(event.message)
          agent.partialRole = role
          agent.textDirty = true
          this.scheduleTextFlush(agent)
        }
        break
      }
      case 'message_end': {
        if (isAssistant(event.message)) {
          const msg = event.message as { stopReason?: string; errorMessage?: string }
          agent.lastStopReason = msg.stopReason ?? null
          agent.lastErrorMessage = msg.errorMessage ?? null
          if (agent.flushTimer) {
            clearTimeout(agent.flushTimer)
            agent.flushTimer = null
          }
          agent.partialText = ''
          agent.textDirty = false
          const text = extractText(event.message)
          if (text.trim().length > 0) {
            agent.lastAssistantText = text
            const verdict = role === 'eval' ? (parseGoalVerdict(text) ?? null) : null
            const item = db.insertMessage(agent.id, agent.seq++, role, text, verdict)
            this.send({ agentId: agent.id, type: 'message', item })
          }
          this.send({ agentId: agent.id, type: 'text', role, text: '' })
        }
        break
      }
      case 'tool_execution_start': {
        if (!agent.isGit) {
          agent.diffTracker.onToolStart(event.toolCallId, event.toolName, event.args ?? {})
        }
        const item = db.insertToolCall(
          agent.id,
          agent.seq++,
          role,
          event.toolCallId,
          event.toolName,
          event.args ?? {}
        )
        this.send({ agentId: agent.id, type: 'tool-start', item })
        const progress = `${event.toolName} ${summarizeArgs(event.args ?? {})}`.trim().slice(0, 60)
        db.updateAgentProgress(agent.id, progress)
        this.send({ agentId: agent.id, type: 'progress', progress })
        break
      }
      case 'tool_execution_end': {
        const preview = extractResultText(event.result).slice(0, RESULT_PREVIEW_CHARS)
        const endedAt = db.finishToolCall(agent.id, event.toolCallId, preview, event.isError)
        this.send({
          agentId: agent.id,
          type: 'tool-end',
          toolCallId: event.toolCallId,
          result: preview,
          isError: event.isError,
          endedAt
        })
        if (!agent.isGit) {
          const captured = agent.diffTracker.onToolEnd(event.toolCallId, event.isError)
          if (captured) {
            db.insertFileChange({ agentId: agent.id, toolCallId: event.toolCallId, ...captured })
            this.scheduleDiffPush(agent)
          }
        } else if (['edit', 'write', 'bash'].includes(event.toolName)) {
          this.scheduleDiffPush(agent)
        }
        break
      }
    }
  }

  private scheduleTextFlush(agent: LiveAgent): void {
    if (agent.flushTimer) return
    agent.flushTimer = setTimeout(() => {
      agent.flushTimer = null
      if (!agent.textDirty) return
      agent.textDirty = false
      this.send({
        agentId: agent.id,
        type: 'text',
        role: agent.partialRole,
        text: agent.partialText
      })
    }, TEXT_FLUSH_MS)
  }

  private scheduleDiffPush(agent: LiveAgent): void {
    if (agent.diffTimer) return
    agent.diffTimer = setTimeout(() => {
      agent.diffTimer = null
      this.pushDiff(agent)
    }, DIFF_DEBOUNCE_MS)
  }

  private pushDiff(agent: LiveAgent): WorktreeDiff {
    let diff: WorktreeDiff
    try {
      diff =
        agent.isGit && agent.worktreePath
          ? worktreeDiff(agent.worktreePath)
          : diffFromSnapshots(db.listFileChanges(agent.id))
    } catch {
      diff = { files: [], add: 0, del: 0 }
    }
    db.updateAgentDiffStat(agent.id, diff.add, diff.del)
    this.send({ agentId: agent.id, type: 'diff', diff })
    return diff
  }

  // ── lifecycle ──────────────────────────────────────────────────────

  private settle(agent: LiveAgent, runError?: string): void {
    if (!this.live.has(agent.id)) return
    const diff = this.pushDiff(agent)
    const hasChanges = diff.add + diff.del > 0

    let status: AgentStatus
    let progress: string
    let error: string | undefined
    if (agent.abortRequested || agent.lastStopReason === 'aborted') {
      status = 'paused'
      progress = 'Paused by you'
    } else if (runError || agent.lastStopReason === 'error') {
      status = 'failed'
      error = runError ?? agent.lastErrorMessage ?? 'unknown error'
      progress = 'Failed'
    } else if (hasChanges) {
      status = 'review'
      progress = 'Awaiting your review'
    } else {
      status = 'input'
      progress = 'Waiting for your reply'
    }
    this.setStatus(agent.id, status, progress, error)

    const summary = agent.lastAssistantText.replace(/\s+/g, ' ').trim().slice(0, 90)
    agent.onSettled?.({
      status,
      add: diff.add,
      del: diff.del,
      summary: summary || progress
    })
    agent.onSettled = undefined

    if (status === 'review') {
      const settings = db.getSettings()
      if (settings.openOnDone) {
        const meta = db.getAgent(agent.id, true)
        if (meta) {
          void import('../editor').then(({ openInEditor }) =>
            openInEditor(settings.editor, meta.worktreePath ?? agent.projectPath)
          )
        }
      }
    }
  }

  private async disposeAgent(agentId: string): Promise<void> {
    const agent = this.live.get(agentId)
    if (!agent) return
    for (const s of agent.sessions) s.abort()
    if (agent.flushTimer) clearTimeout(agent.flushTimer)
    if (agent.diffTimer) clearTimeout(agent.diffTimer)
    this.live.delete(agentId)
    for (const s of agent.sessions) void s.dispose().catch(() => {})
  }

  private setStatus(agentId: string, status: AgentStatus, progress: string, error?: string): void {
    db.updateAgentStatus(agentId, status, progress, error)
    this.send({ agentId, type: 'status', status, progress, error })
  }
}

// ── helpers ──────────────────────────────────────────────────────────

function isAssistant(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { role?: string }).role === 'assistant'
  )
}

function extractText(message: unknown): string {
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (b): b is { type: 'text'; text: string } => b?.type === 'text' && typeof b.text === 'string'
    )
    .map((b) => b.text)
    .join('')
}

function extractResultText(result: unknown): string {
  const content = (result as { content?: unknown })?.content
  if (!Array.isArray(content)) return typeof result === 'string' ? result : ''
  return content
    .filter(
      (b): b is { type: 'text'; text: string } => b?.type === 'text' && typeof b.text === 'string'
    )
    .map((b) => b.text)
    .join('\n')
}

function summarizeArgs(args: Record<string, unknown>): string {
  if (typeof args.path === 'string') return args.path.split('/').slice(-2).join('/')
  if (typeof args.file_path === 'string') return args.file_path.split('/').slice(-2).join('/')
  if (typeof args.command === 'string') return args.command
  return ''
}
