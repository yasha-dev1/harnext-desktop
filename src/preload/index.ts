import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentPush,
  AppSettings,
  DesktopApi,
  LoopInput,
  StartAgentInput
} from '../shared/types'

const api: DesktopApi = {
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close')
  },
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  pickAudioFile: () => ipcRenderer.invoke('dialog:pickAudioFile'),
  readSound: (path: string) => ipcRenderer.invoke('sounds:read', path),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', patch)
  },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    models: (provider: string) => ipcRenderer.invoke('providers:models', provider),
    saveKey: (provider: string, key: string) =>
      ipcRenderer.invoke('providers:saveKey', provider, key),
    saveBaseUrl: (provider: string, baseUrl: string) =>
      ipcRenderer.invoke('providers:saveBaseUrl', provider, baseUrl),
    verify: (provider: string, cred: { key?: string; baseUrl?: string }) =>
      ipcRenderer.invoke('providers:verify', provider, cred),
    remove: (provider: string) => ipcRenderer.invoke('providers:remove', provider)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (path: string) => ipcRenderer.invoke('projects:create', path),
    remove: (id: number) => ipcRenderer.invoke('projects:remove', id),
    touch: (id: number) => ipcRenderer.invoke('projects:touch', id)
  },
  agents: {
    list: (projectId: number) => ipcRenderer.invoke('agents:list', projectId),
    start: (input: StartAgentInput) => ipcRenderer.invoke('agents:start', input),
    prompt: (agentId: string, text: string) => ipcRenderer.invoke('agents:prompt', agentId, text),
    abort: (agentId: string) => ipcRenderer.invoke('agents:abort', agentId),
    remove: (agentId: string) => ipcRenderer.invoke('agents:remove', agentId),
    timeline: (agentId: string) => ipcRenderer.invoke('agents:timeline', agentId),
    diff: (agentId: string) => ipcRenderer.invoke('agents:diff', agentId),
    merge: (agentId: string) => ipcRenderer.invoke('agents:merge', agentId),
    suggestPR: (agentId: string) => ipcRenderer.invoke('agents:suggestPR', agentId),
    openPR: (agentId: string, opts: { base?: string; title?: string; body?: string }) =>
      ipcRenderer.invoke('agents:openPR', agentId, opts),
    discard: (agentId: string) => ipcRenderer.invoke('agents:discard', agentId),
    openEditor: (agentId: string) => ipcRenderer.invoke('agents:openEditor', agentId),
    stopAll: () => ipcRenderer.invoke('agents:stopAll')
  },
  loops: {
    list: (projectId: number) => ipcRenderer.invoke('loops:list', projectId),
    create: (input: LoopInput) => ipcRenderer.invoke('loops:create', input),
    update: (id: number, input: LoopInput) => ipcRenderer.invoke('loops:update', id, input),
    remove: (id: number) => ipcRenderer.invoke('loops:remove', id),
    toggle: (id: number) => ipcRenderer.invoke('loops:toggle', id),
    runNow: (id: number) => ipcRenderer.invoke('loops:runNow', id),
    runs: (loopId: number) => ipcRenderer.invoke('loops:runs', loopId)
  },
  onAgentEvent: (cb: (e: AgentPush) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, push: AgentPush): void => cb(push)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
