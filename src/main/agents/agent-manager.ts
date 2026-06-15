import { randomUUID } from 'node:crypto'
import {
  createAgentSession,
  getProviderById,
  getProviderConfig,
  getStoredKey,
  parseGoalVerdict,
  setProviderEnv,
  type AgentMessage,
  type AgentSession,
  type AgentSessionEventListener,
  type CommandExecutor
} from '@harnext/core'
import type {
  AgentMeta,
  AgentPush,
  AgentStatus,
  Project,
  Role,
  SandboxInfo,
  StartAgentInput,
  TimelineItem,
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
import { DockerExecutor } from '../env/docker-executor'
import { bootstrapSandbox, sandboxProjectName, type SandboxHandle } from '../env/sandbox'
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

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

/**
 * Rebuild a best-effort `AgentMessage[]` transcript from a stored timeline, to
 * seed a resumed session via `createAgentSession({ initialMessages })`. Only the
 * conversational messages are seeded (user → user, plan/exec/eval → assistant);
 * `convertToLlm` keeps the user/assistant text, so the model gets the prior
 * context. Tool turns are omitted — the model re-runs tools as needed.
 */
function buildInitialMessages(
  timeline: TimelineItem[],
  provider: string,
  model: string
): AgentMessage[] {
  const out: AgentMessage[] = []
  for (const item of timeline) {
    if (item.kind !== 'message' || !item.content.trim()) continue
    if (item.role === 'user') {
      out.push({ role: 'user', content: item.content, timestamp: item.createdAt })
    } else {
      out.push({
        role: 'assistant',
        content: [{ type: 'text', text: item.content }],
        api: 'resumed',
        provider,
        model,
        usage: ZERO_USAGE,
        stopReason: 'stop',
        timestamp: item.createdAt
      })
    }
  }
  return out
}

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

const PR_DETAILS_PROMPT =
  'You write GitHub pull request descriptions for a finished coding task. ' +
  'Given the task and the changes, reply with the PR title on the FIRST line ' +
  '(concise, imperative, no prefix, no surrounding quotes), then a blank line, ' +
  'then a short markdown body: a one-sentence summary followed by a "## Changes" ' +
  'bullet list of what changed and why. Keep it under ~150 words and do not ' +
  'invent changes that are not in the diff.'

const PR_DETAILS_TIMEOUT_MS = 20_000

/**
 * Ask the model for a PR title + markdown body from the task and its diff, the
 * same way {@link generateWorktreeName} suggests a branch name — a minimal,
 * tool-less single-turn session. Best-effort: returns null on any
 * error/timeout so the caller can fall back to a simple default.
 */
async function generatePrDetails(
  provider: string,
  modelId: string,
  cwd: string,
  context: string
): Promise<{ title: string; body: string } | null> {
  try {
    const { session } = await createAgentSession({
      cwd,
      provider,
      modelId,
      systemPrompt: PR_DETAILS_PROMPT,
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
      setTimeout(() => reject(new Error('pr-details timeout')), PR_DETAILS_TIMEOUT_MS)
    )
    try {
      await Promise.race([session.prompt(context.slice(0, 6000)), timeout])
    } finally {
      unsubscribe()
      void session.dispose()
    }
    const text = out.trim()
    if (!text) return null
    const nl = text.indexOf('\n')
    const title = (nl === -1 ? text : text.slice(0, nl))
      .replace(/^#+\s*/, '')
      .replace(/^title:\s*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim()
    const body = nl === -1 ? '' : text.slice(nl + 1).trim()
    return title ? { title, body } : null
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
  /** Docker sandbox routing: when set, shell commands run in the container. */
  executor: CommandExecutor | null
  /** Container-side working dir for the executor (the bind-mount target). */
  execCwd: string | undefined
  sandbox: SandboxHandle | null
  sandboxStatus: SandboxInfo['status']
  /** All sessions ever created for this agent (for dispose). */
  sessions: AgentSession[]
  /** The session follow-up prompts go to. */
  mainSession: AgentSession | null
  diffTracker: DiffTracker
  seq: number
  /** Steering messages queued while a turn is in flight (delivered at settle). */
  steerQueue: string[]
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
      worktree = createWorktree(project.path, suggested ?? title, agentId, settings.worktreeRoot)
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
      executor: null,
      execCwd: undefined,
      sandbox: null,
      sandboxStatus: 'off',
      sessions: [],
      mainSession: null,
      diffTracker: new DiffTracker(cwd),
      seq: 1,
      steerQueue: [],
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

    const images = input.images
    const userItem = db.insertMessage(agentId, agent.seq++, 'user', cleanPrompt, null, images)
    this.send({ agentId, type: 'message', item: userItem })

    // Bring up the Docker sandbox (if enabled) before the agent runs, so it
    // starts on a ready environment, then run. Bootstrap can take a while, so
    // this stays off the IPC return path.
    const run = async (): Promise<void> => {
      await this.prepareSandbox(agent, project)
      if (isGoal) await this.runGoal(agent, cleanPrompt, images)
      else await this.runSingle(agent, cleanPrompt, images)
    }
    void run().catch((err: unknown) =>
      this.settle(agent, err instanceof Error ? err.message : String(err))
    )

    return db.getAgent(agentId, true)!
  }

  /**
   * Stand up the per-worktree container stack and wire a DockerExecutor so the
   * agent's shell commands (and dev servers) run inside it. No-op unless the
   * project has the sandbox enabled, is a git project, and has a worktree.
   */
  private async prepareSandbox(agent: LiveAgent, project: Project): Promise<void> {
    const env = project.envConfig
    if (!env?.enabled || env.runtime !== 'compose' || !agent.isGit || !agent.worktreePath) return
    this.setStatus(agent.id, 'running', 'Preparing environment')
    this.setSandboxStatus(agent, 'preparing')
    try {
      const name = sandboxProjectName(project.path, agent.worktreePath)
      const handle = await bootstrapSandbox(env, agent.worktreePath, name)
      agent.sandbox = handle
      agent.executor = new DockerExecutor(handle.container, handle.teardown)
      agent.execCwd = handle.execCwd
      this.setSandboxStatus(agent, 'ready')
    } catch (err) {
      this.setSandboxStatus(agent, 'failed')
      throw err
    }
  }

  /** Build the renderer-facing sandbox state from the live handle + project config. */
  private sandboxInfo(agent: LiveAgent): SandboxInfo {
    const exposed = db.getProject(agent.projectId)?.envConfig?.exposed ?? []
    const hostPorts = agent.sandbox?.hostPorts ?? {}
    const ports = exposed
      .filter((e) => hostPorts[e.service] != null)
      .map((e) => ({
        service: e.service,
        url: `http://localhost:${hostPorts[e.service]}`,
        primary: e.primary
      }))
    const primary = ports.find((p) => p.primary) ?? ports[0]
    return { status: agent.sandboxStatus, primaryUrl: primary?.url ?? null, ports }
  }

  private setSandboxStatus(agent: LiveAgent, status: SandboxInfo['status']): void {
    agent.sandboxStatus = status
    this.send({ agentId: agent.id, type: 'sandbox', info: this.sandboxInfo(agent) })
  }

  getSandbox(agentId: string): SandboxInfo {
    const agent = this.live.get(agentId)
    if (!agent) return { status: 'off', primaryUrl: null, ports: [] }
    return this.sandboxInfo(agent)
  }

  /** Emit the agent's current pending-steer queue to the renderer. */
  private emitSteers(agent: LiveAgent): void {
    this.send({ agentId: agent.id, type: 'steers', steers: [...agent.steerQueue] })
  }

  /** Remove and return the last queued steer (Esc-to-recall for editing). */
  recallSteer(agentId: string): string | null {
    const agent = this.live.get(agentId)
    if (!agent || agent.steerQueue.length === 0) return null
    const text = agent.steerQueue.pop()!
    this.emitSteers(agent)
    return text
  }

  async prompt(agentId: string, text: string, images?: string[]): Promise<void> {
    const agent = this.live.get(agentId)
    if (!agent?.mainSession) {
      throw new Error('This agent session has ended — start a new agent to continue.')
    }
    // Mid-run: queue the message as a steer; it's delivered at the next turn
    // boundary (see settle). Images aren't carried on steers (text-only).
    if (db.getAgent(agentId, true)?.status === 'running') {
      const t = text.trim()
      if (!t) return
      agent.steerQueue.push(t)
      this.emitSteers(agent)
      return
    }
    const item = db.insertMessage(agentId, agent.seq++, 'user', text, null, images)
    this.send({ agentId, type: 'message', item })
    this.setStatus(agent.id, 'running', 'Getting to work')
    agent.abortRequested = false
    agent.lastStopReason = null
    agent.lastErrorMessage = null
    const session = agent.mainSession
    void session
      .prompt(text, images)
      .then(() => this.settle(agent))
      .catch((err: unknown) => this.settle(agent, err instanceof Error ? err.message : String(err)))
  }

  /**
   * Bring an ended conversation back to life: rebuild a `LiveAgent` from the
   * stored meta, seed a fresh session with the prior transcript (harnext#46's
   * `initialMessages`), and re-create the worktree's Docker sandbox if enabled.
   * The user's next message then flows through the normal `prompt` path.
   */
  async resume(agentId: string): Promise<void> {
    if (this.live.has(agentId)) return // already live — nothing to resume
    const meta = db.getAgent(agentId, false)
    if (!meta) throw new Error('Agent not found')
    const project = db.getProject(meta.projectId)
    if (!project) throw new Error('Project not found')

    const settings = db.getSettings()
    // Provider isn't stored per-agent; fall back to the current default.
    const provider = settings.provider
    ensureProviderEnv(provider)
    const cwd = meta.worktreePath ?? project.path
    const execModel = meta.execModel ?? meta.modelId ?? settings.model

    const agent: LiveAgent = {
      id: agentId,
      projectId: meta.projectId,
      projectPath: project.path,
      isGit: project.isGit,
      mode: meta.mode,
      worktreePath: meta.worktreePath,
      branch: meta.branch,
      cwd,
      permissionMode: meta.permissionMode,
      smartModel: meta.smartModel,
      execModel,
      provider,
      executor: null,
      execCwd: undefined,
      sandbox: null,
      sandboxStatus: 'off',
      sessions: [],
      mainSession: null,
      diffTracker: new DiffTracker(cwd),
      seq: 1,
      steerQueue: [],
      partialText: '',
      partialRole: 'exec',
      textDirty: false,
      flushTimer: null,
      diffTimer: null,
      abortRequested: false,
      lastStopReason: null,
      lastErrorMessage: null,
      lastAssistantText: '',
      onSettled: undefined
    }
    this.live.set(agentId, agent)

    const timeline = db.getTimeline(agentId)
    // Continue numbering after the stored transcript.
    agent.seq = timeline.reduce((m, t) => Math.max(m, t.seq), 0) + 1
    const initialMessages = buildInitialMessages(timeline, provider, execModel)

    this.setStatus(agentId, 'running', 'Resuming…')
    try {
      // Best-effort sandbox respawn — never hard-block resume on it (#57).
      await this.prepareSandbox(agent, project)
      const session = await this.createSession(agent, {
        modelId: execModel,
        role: 'exec',
        permissionMode: agent.permissionMode,
        initialMessages
      })
      agent.mainSession = session
      this.setStatus(agentId, 'input', 'Resumed — continue the conversation')
      this.send({ agentId, type: 'agents-changed', projectId: meta.projectId })
    } catch (err) {
      this.live.delete(agentId)
      this.setStatus(
        agentId,
        'failed',
        'Resume failed',
        err instanceof Error ? err.message : String(err)
      )
      this.send({ agentId, type: 'agents-changed', projectId: meta.projectId })
      throw err
    }
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
  /**
   * Suggest a PR title + markdown body for a finished agent the same way the
   * worktree name is generated (a maxTurns:1 model call), plus the repo's
   * default base branch — so the "Open a pull request" dialog opens pre-filled
   * instead of blank. Best-effort: falls back to the agent title + a simple body.
   */
  async suggestPullRequest(
    agentId: string
  ): Promise<{ title: string; base: string; body: string }> {
    const meta = db.getAgent(agentId, this.isLive(agentId))
    if (!meta) throw new Error('Agent not found')
    const project = db.getProject(meta.projectId)
    if (!project) throw new Error('Project not found')
    const base = hasRemote(project.path) ? defaultBaseBranch(project.path) : 'main'
    const fallback = {
      title: meta.title,
      base,
      body: `Opened from the harnext agent “${meta.title}”.`
    }
    const settings = db.getSettings()
    const provider = settings.provider
    const model = meta.modelId ?? meta.execModel ?? settings.model
    try {
      ensureProviderEnv(provider)
      const cwd = meta.worktreePath ?? project.path
      const gen = await generatePrDetails(
        provider,
        model,
        cwd,
        this.buildPrContext(agentId, meta.title)
      )
      if (gen) return { title: gen.title, base, body: gen.body || fallback.body }
    } catch {
      /* best-effort — fall through to the default */
    }
    return fallback
  }

  /** Assemble task + change context for PR-detail generation. */
  private buildPrContext(agentId: string, fallbackTask: string): string {
    const timeline = db.getTimeline(agentId)
    const firstUser = timeline.find((t) => t.kind === 'message' && t.role === 'user')
    const lastAssistant = [...timeline]
      .reverse()
      .find((t) => t.kind === 'message' && t.role !== 'user')
    const task = (firstUser?.kind === 'message' ? firstUser.content : fallbackTask).slice(0, 1500)
    const summary = lastAssistant?.kind === 'message' ? lastAssistant.content.slice(0, 1500) : ''
    const diff = this.getDiff(agentId)
    const files = diff.files.map((f) => `- ${f.path} (+${f.add}/-${f.del})`).join('\n')
    return [
      `Task:\n${task}`,
      summary ? `What the agent reported doing:\n${summary}` : '',
      `Files changed (${diff.files.length}, +${diff.add}/-${diff.del}):\n${files || '(none)'}`
    ]
      .filter(Boolean)
      .join('\n\n')
  }

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
      if (agent.sandbox) void agent.sandbox.teardown().catch(() => {})
    }
    this.live.clear()
  }

  // ── run flows ──────────────────────────────────────────────────────

  private async runSingle(agent: LiveAgent, prompt: string, images?: string[]): Promise<void> {
    const session = await this.createSession(agent, {
      modelId: agent.execModel!,
      role: 'exec',
      permissionMode: agent.permissionMode
    })
    agent.mainSession = session
    await session.prompt(prompt, images)
    this.settle(agent)
  }

  private async runGoal(agent: LiveAgent, goal: string, images?: string[]): Promise<void> {
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
    await planner.prompt(goal, images)
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
      /** Seed history when resuming an ended conversation (harnext#46). */
      initialMessages?: AgentMessage[]
    }
  ): Promise<AgentSession> {
    const { session } = await createAgentSession({
      cwd: agent.cwd,
      provider: agent.provider,
      modelId: opts.modelId,
      permissionMode: opts.permissionMode,
      systemPrompt: opts.systemPrompt,
      mcpDisabled: opts.mcpDisabled,
      quiet: true,
      ...(opts.initialMessages
        ? { initialMessages: opts.initialMessages, sessionId: agent.id }
        : {}),
      // Sandbox: run shell commands in the container while read/edit/write stay
      // on the host worktree (bind-mounted, so the container sees the same files).
      ...(agent.executor ? { executor: agent.executor, execCwd: agent.execCwd } : {})
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

    const aborted = agent.abortRequested || agent.lastStopReason === 'aborted'
    const failed = !!runError || agent.lastStopReason === 'error'

    // Steering: a turn just finished cleanly with messages queued. Deliver them
    // on the same live session (no restart) — they become real user messages and
    // continue the conversation — instead of settling to idle.
    if (!aborted && !failed && agent.steerQueue.length > 0 && agent.mainSession) {
      const steers = agent.steerQueue.splice(0)
      this.emitSteers(agent)
      for (const text of steers) {
        const item = db.insertMessage(agent.id, agent.seq++, 'user', text)
        this.send({ agentId: agent.id, type: 'message', item })
      }
      this.pushDiff(agent)
      this.setStatus(agent.id, 'running', 'Following your steer')
      const session = agent.mainSession
      void session
        .prompt(steers.join('\n\n'))
        .then(() => this.settle(agent))
        .catch((err: unknown) =>
          this.settle(agent, err instanceof Error ? err.message : String(err))
        )
      return
    }

    // The run ended (aborted/failed) with steers still queued — surface them so
    // the user can resend; they were never delivered.
    if (agent.steerQueue.length > 0) {
      const texts = agent.steerQueue.splice(0)
      this.emitSteers(agent)
      this.send({ agentId: agent.id, type: 'steers-undelivered', texts })
    }

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
    if (agent.sandbox) {
      void agent.sandbox.teardown().catch(() => {})
      this.send({ agentId, type: 'sandbox', info: { status: 'off', primaryUrl: null, ports: [] } })
    }
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
