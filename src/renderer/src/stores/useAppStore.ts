import { create } from 'zustand'
import type {
  AgentMeta,
  AgentPush,
  AppSettings,
  ContextEngineStatus,
  DockerStatus,
  LoopInput,
  LoopMeta,
  LoopRun,
  EnvOverrides,
  Project,
  ProjectEnvConfig,
  Role,
  SandboxInfo,
  StartAgentInput,
  TimelineItem,
  WorktreeDiff
} from '@shared/types'
import { playSound } from '../lib/sounds'

function mergeTimeline(fromDb: TimelineItem[], live: TimelineItem[]): TimelineItem[] {
  const seen = new Set(fromDb.map((t) => `${t.kind}:${t.seq}`))
  return [...fromDb, ...live.filter((t) => !seen.has(`${t.kind}:${t.seq}`))].sort(
    (a, b) => a.seq - b.seq
  )
}

interface AppStore {
  settings: AppSettings | null
  projects: Project[]
  projectsLoaded: boolean
  agents: Record<string, AgentMeta>
  agentIdsByProject: Record<number, string[]>
  timelines: Record<string, TimelineItem[]>
  streaming: Record<string, { role: Role; text: string }>
  diffs: Record<string, WorktreeDiff>
  sandboxes: Record<string, SandboxInfo>
  /** Pending steering messages queued for a running agent. */
  steers: Record<string, string[]>
  /** Steers that weren't delivered (run aborted/failed) — shown until resent. */
  undeliveredSteers: Record<string, string[]>
  loopsByProject: Record<number, LoopMeta[]>
  loopRuns: Record<number, LoopRun[]>

  /** Live model catalog per provider id, fetched lazily and cached. */
  providerModels: Record<string, string[]>

  // Context Engine (RFC 8628 device-flow auth)
  contextEngine: ContextEngineStatus | null
  loadContextEngine: () => Promise<void>
  startContextEngineLogin: () => Promise<void>
  cancelContextEngineLogin: () => Promise<void>
  disconnectContextEngine: () => Promise<void>
  setContextEngineUrl: (url: string) => Promise<void>

  loadSettings: () => Promise<void>
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>
  loadProviderModels: (providerId: string) => Promise<void>

  loadProjects: () => Promise<void>
  openProjectDialog: () => Promise<Project | null>
  removeProject: (id: number) => Promise<void>
  /** Branch switcher (#96): point the project's context at a branch worktree. */
  checkoutBranch: (projectId: number, branch: string) => Promise<void>

  // In-app file/folder picker (replaces the native OS dialog). `pickPath`
  // resolves once the user selects a path or cancels (null), like a dialog.
  picker: { mode: 'dir' | 'file'; resolve: (path: string | null) => void } | null
  pickPath: (opts?: { mode?: 'dir' | 'file' }) => Promise<string | null>
  resolvePicker: (path: string | null) => void

  dockerStatus: DockerStatus | null
  loadDockerStatus: () => Promise<void>
  detectProjectEnv: (id: number) => Promise<void>
  setProjectEnvConfig: (id: number, patch: Partial<ProjectEnvConfig>) => Promise<void>
  setProjectEnvOverrides: (id: number, patch: EnvOverrides) => Promise<void>

  loadAgents: (projectId: number) => Promise<void>
  startAgent: (input: StartAgentInput) => Promise<AgentMeta>
  sendPrompt: (agentId: string, text: string, images?: string[]) => Promise<void>
  /** Bring an ended conversation back to life. */
  resumeAgent: (agentId: string) => Promise<void>
  /** Pop the last queued steer back into the composer for editing. */
  recallSteer: (agentId: string) => Promise<string | null>
  abortAgent: (agentId: string) => Promise<void>
  discardAgent: (agentId: string) => Promise<void>
  mergeAgent: (agentId: string) => Promise<void>
  ensureTimeline: (agentId: string) => Promise<void>
  loadDiff: (agentId: string) => Promise<void>
  loadSandbox: (agentId: string) => Promise<void>

  loadLoops: (projectId: number) => Promise<void>
  loadLoopRuns: (loopId: number) => Promise<void>
  createLoop: (input: LoopInput) => Promise<LoopMeta>
  updateLoop: (id: number, input: LoopInput) => Promise<LoopMeta>
  removeLoop: (id: number, projectId: number) => Promise<void>
  toggleLoop: (id: number) => Promise<void>
  runLoopNow: (id: number) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => {
  // Context Engine device-flow phase updates (pending → connected/error).
  window.api.contextEngine.onEvent((s) => set({ contextEngine: s }))
  window.api.onAgentEvent((push: AgentPush) => {
    const state = get()
    switch (push.type) {
      case 'text':
        set({
          streaming: { ...state.streaming, [push.agentId]: { role: push.role, text: push.text } }
        })
        break
      case 'message':
      case 'tool-start': {
        const timeline = state.timelines[push.agentId]
        if (!timeline) break
        const item = push.item
        if (timeline.some((t) => t.seq === item.seq && t.kind === item.kind)) break
        set({ timelines: { ...state.timelines, [push.agentId]: [...timeline, item] } })
        break
      }
      case 'tool-end': {
        const timeline = state.timelines[push.agentId]
        if (!timeline) break
        set({
          timelines: {
            ...state.timelines,
            [push.agentId]: timeline.map((t) =>
              t.kind === 'tool' && t.toolCallId === push.toolCallId
                ? { ...t, result: push.result, isError: push.isError, endedAt: push.endedAt }
                : t
            )
          }
        })
        break
      }
      case 'diff': {
        const agent = state.agents[push.agentId]
        set({
          diffs: { ...state.diffs, [push.agentId]: push.diff },
          agents: agent
            ? {
                ...state.agents,
                [push.agentId]: { ...agent, add: push.diff.add, del: push.diff.del }
              }
            : state.agents
        })
        break
      }
      case 'steers':
        set({ steers: { ...state.steers, [push.agentId]: push.steers } })
        break
      case 'steers-undelivered':
        set({ undeliveredSteers: { ...state.undeliveredSteers, [push.agentId]: push.texts } })
        break
      case 'status': {
        const agent = state.agents[push.agentId]
        if (!agent) break
        // The agent just handed control back — play the "done" cue once.
        const justFinished =
          (push.status === 'review' || push.status === 'input') && agent.status !== push.status
        if (justFinished && state.settings?.soundOnDone) {
          playSound(state.settings.doneSound, state.settings.customSoundPath)
        }
        set({
          agents: {
            ...state.agents,
            [push.agentId]: {
              ...agent,
              status: push.status,
              progress: push.progress,
              error: push.error ?? null,
              updatedAt: Date.now()
            }
          }
        })
        break
      }
      case 'progress': {
        const agent = state.agents[push.agentId]
        if (!agent) break
        set({
          agents: { ...state.agents, [push.agentId]: { ...agent, progress: push.progress } }
        })
        break
      }
      case 'sandbox':
        set({ sandboxes: { ...state.sandboxes, [push.agentId]: push.info } })
        break
      case 'agents-changed':
        void get().loadAgents(push.projectId)
        break
      case 'loops-changed':
        void get().loadLoops(push.projectId)
        break
    }
  })

  return {
    settings: null,
    providerModels: {},
    projects: [],
    projectsLoaded: false,
    dockerStatus: null,
    agents: {},
    agentIdsByProject: {},
    timelines: {},
    streaming: {},
    diffs: {},
    sandboxes: {},
    steers: {},
    undeliveredSteers: {},
    loopsByProject: {},
    loopRuns: {},
    contextEngine: null,

    loadContextEngine: async () => {
      set({ contextEngine: await window.api.contextEngine.status() })
    },
    startContextEngineLogin: async () => {
      // Phase updates (pending → connected/error) arrive via the onEvent stream.
      await window.api.contextEngine.startLogin()
    },
    cancelContextEngineLogin: async () => {
      await window.api.contextEngine.cancelLogin()
    },
    disconnectContextEngine: async () => {
      await window.api.contextEngine.disconnect()
    },
    setContextEngineUrl: async (url) => {
      set({ contextEngine: await window.api.contextEngine.setBaseUrl(url) })
    },

    loadSettings: async () => {
      const settings = await window.api.settings.get()
      set({ settings })
    },

    saveSettings: async (patch) => {
      const settings = await window.api.settings.set(patch)
      set({ settings })
    },

    loadProviderModels: async (providerId) => {
      const models = await window.api.providers.models(providerId)
      set((state) => ({ providerModels: { ...state.providerModels, [providerId]: models } }))
    },

    loadProjects: async () => {
      const projects = await window.api.projects.list()
      set({ projects, projectsLoaded: true })
    },

    openProjectDialog: async () => {
      const path = await get().pickPath({ mode: 'dir' })
      if (!path) return null
      const project = await window.api.projects.create(path)
      await get().loadProjects()
      return project
    },

    picker: null,
    pickPath: (opts) =>
      new Promise<string | null>((resolve) => {
        set({ picker: { mode: opts?.mode ?? 'dir', resolve } })
      }),
    resolvePicker: (path) => {
      const p = get().picker
      if (!p) return
      p.resolve(path)
      set({ picker: null })
    },

    removeProject: async (id) => {
      await window.api.projects.remove(id)
      await get().loadProjects()
    },

    checkoutBranch: async (projectId, branch) => {
      const updated = await window.api.projects.checkoutBranch(projectId, branch)
      if (updated) {
        set((state) => ({
          projects: state.projects.map((p) => (p.id === projectId ? updated : p))
        }))
      }
    },

    loadDockerStatus: async () => {
      const dockerStatus = await window.api.projects.dockerStatus()
      set({ dockerStatus })
    },

    detectProjectEnv: async (id) => {
      const project = await window.api.projects.detectEnv(id)
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? project : p)) }))
    },

    setProjectEnvConfig: async (id, patch) => {
      const project = await window.api.projects.setEnvConfig(id, patch)
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? project : p)) }))
    },

    setProjectEnvOverrides: async (id, patch) => {
      const project = await window.api.projects.setEnvOverrides(id, patch)
      set((state) => ({ projects: state.projects.map((p) => (p.id === id ? project : p)) }))
    },

    loadAgents: async (projectId) => {
      const list = await window.api.agents.list(projectId)
      set((state) => ({
        agents: { ...state.agents, ...Object.fromEntries(list.map((a) => [a.id, a])) },
        agentIdsByProject: { ...state.agentIdsByProject, [projectId]: list.map((a) => a.id) }
      }))
    },

    startAgent: async (input) => {
      const meta = await window.api.agents.start(input)
      set((state) => ({
        agents: { ...state.agents, [meta.id]: meta },
        agentIdsByProject: {
          ...state.agentIdsByProject,
          [input.projectId]: [meta.id, ...(state.agentIdsByProject[input.projectId] ?? [])]
        },
        timelines: { ...state.timelines, [meta.id]: state.timelines[meta.id] ?? [] }
      }))
      const items = await window.api.agents.timeline(meta.id)
      set((state) => ({
        timelines: {
          ...state.timelines,
          [meta.id]: mergeTimeline(items, state.timelines[meta.id] ?? [])
        }
      }))
      return meta
    },

    sendPrompt: async (agentId, text, images) => {
      await window.api.agents.prompt(agentId, text, images)
    },
    resumeAgent: async (agentId) => {
      const agent = get().agents[agentId]
      await window.api.agents.resume(agentId)
      // Reload so the agent reflects its now-live state (reply box re-enabled).
      if (agent) await get().loadAgents(agent.projectId)
    },
    recallSteer: (agentId) => window.api.agents.recallSteer(agentId),

    abortAgent: async (agentId) => {
      await window.api.agents.abort(agentId)
    },

    discardAgent: async (agentId) => {
      const agent = get().agents[agentId]
      await window.api.agents.discard(agentId)
      if (agent) await get().loadAgents(agent.projectId)
    },

    mergeAgent: async (agentId) => {
      await window.api.agents.merge(agentId)
      const agent = get().agents[agentId]
      if (agent) await get().loadAgents(agent.projectId)
    },

    ensureTimeline: async (agentId) => {
      if (get().timelines[agentId]) return
      const items = await window.api.agents.timeline(agentId)
      set((state) => ({ timelines: { ...state.timelines, [agentId]: items } }))
    },

    loadDiff: async (agentId) => {
      const diff = await window.api.agents.diff(agentId)
      set((state) => ({ diffs: { ...state.diffs, [agentId]: diff } }))
    },

    loadSandbox: async (agentId) => {
      const info = await window.api.agents.sandbox(agentId)
      set((state) => ({ sandboxes: { ...state.sandboxes, [agentId]: info } }))
    },

    loadLoops: async (projectId) => {
      const loops = await window.api.loops.list(projectId)
      set((state) => ({ loopsByProject: { ...state.loopsByProject, [projectId]: loops } }))
    },

    loadLoopRuns: async (loopId) => {
      const runs = await window.api.loops.runs(loopId)
      set((state) => ({ loopRuns: { ...state.loopRuns, [loopId]: runs } }))
    },

    createLoop: async (input) => {
      const loop = await window.api.loops.create(input)
      await get().loadLoops(input.projectId)
      return loop
    },

    updateLoop: async (id, input) => {
      const loop = await window.api.loops.update(id, input)
      await get().loadLoops(input.projectId)
      return loop
    },

    removeLoop: async (id, projectId) => {
      await window.api.loops.remove(id)
      await get().loadLoops(projectId)
    },

    toggleLoop: async (id) => {
      const loop = await window.api.loops.toggle(id)
      await get().loadLoops(loop.projectId)
    },

    runLoopNow: async (id) => {
      await window.api.loops.runNow(id)
    }
  }
})
