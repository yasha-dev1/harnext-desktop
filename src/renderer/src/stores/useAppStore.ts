import { create } from 'zustand'
import type {
  AgentMeta,
  AgentPush,
  AppSettings,
  LoopInput,
  LoopMeta,
  LoopRun,
  Project,
  Role,
  StartAgentInput,
  TimelineItem,
  WorktreeDiff
} from '@shared/types'

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
  loopsByProject: Record<number, LoopMeta[]>
  loopRuns: Record<number, LoopRun[]>

  loadSettings: () => Promise<void>
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>

  loadProjects: () => Promise<void>
  openProjectDialog: () => Promise<Project | null>
  removeProject: (id: number) => Promise<void>

  loadAgents: (projectId: number) => Promise<void>
  startAgent: (input: StartAgentInput) => Promise<AgentMeta>
  sendPrompt: (agentId: string, text: string) => Promise<void>
  abortAgent: (agentId: string) => Promise<void>
  discardAgent: (agentId: string) => Promise<void>
  mergeAgent: (agentId: string) => Promise<void>
  ensureTimeline: (agentId: string) => Promise<void>
  loadDiff: (agentId: string) => Promise<void>

  loadLoops: (projectId: number) => Promise<void>
  loadLoopRuns: (loopId: number) => Promise<void>
  createLoop: (input: LoopInput) => Promise<LoopMeta>
  updateLoop: (id: number, input: LoopInput) => Promise<LoopMeta>
  removeLoop: (id: number, projectId: number) => Promise<void>
  toggleLoop: (id: number) => Promise<void>
  runLoopNow: (id: number) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => {
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
      case 'status': {
        const agent = state.agents[push.agentId]
        if (!agent) break
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
    projects: [],
    projectsLoaded: false,
    agents: {},
    agentIdsByProject: {},
    timelines: {},
    streaming: {},
    diffs: {},
    loopsByProject: {},
    loopRuns: {},

    loadSettings: async () => {
      const settings = await window.api.settings.get()
      set({ settings })
    },

    saveSettings: async (patch) => {
      const settings = await window.api.settings.set(patch)
      set({ settings })
    },

    loadProjects: async () => {
      const projects = await window.api.projects.list()
      set({ projects, projectsLoaded: true })
    },

    openProjectDialog: async () => {
      const path = await window.api.pickDirectory()
      if (!path) return null
      const project = await window.api.projects.create(path)
      await get().loadProjects()
      return project
    },

    removeProject: async (id) => {
      await window.api.projects.remove(id)
      await get().loadProjects()
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

    sendPrompt: async (agentId, text) => {
      await window.api.agents.prompt(agentId, text)
    },

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
