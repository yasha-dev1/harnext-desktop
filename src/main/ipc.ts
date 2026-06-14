import { BrowserWindow, dialog, ipcMain } from 'electron'
import { PROVIDERS, getProviderConfig, getStoredKey, saveProviderKey } from '@harnext/core'
import type { AppSettings, LoopInput, StartAgentInput } from '../shared/types'
import { AgentManager } from './agents/agent-manager'
import * as db from './db'
import { openInEditor } from './editor'
import { currentBranch, isGitRepo } from './git'
import { LoopScheduler } from './loops'

const PROVIDER_SUBS: Record<string, string> = {
  anthropic: 'Claude, direct API',
  openai: 'GPT, direct API',
  google: 'Gemini, direct API',
  xai: 'Grok, direct API',
  openrouter: 'Unified gateway · 300+ models',
  groq: 'Fast open-model inference',
  mistral: 'Mistral, direct API',
  cerebras: 'Fast open-model inference',
  nvidia: 'NVIDIA NIM endpoints',
  ollama: 'Runs on this machine'
}

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
  openai: ['gpt-5.3-codex', 'gpt-5.1', 'gpt-5.1-mini'],
  google: ['gemini-3-pro-preview', 'gemini-3-flash-preview'],
  xai: ['grok-4', 'grok-3'],
  openrouter: [
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4.1',
    'openai/gpt-5.1',
    'openai/gpt-5.1-mini',
    'google/gemini-3-pro',
    'qwen/qwen3-coder-480b',
    'deepseek/deepseek-v3.2',
    'x-ai/grok-4'
  ],
  groq: ['llama-3.3-70b-versatile', 'qwen-2.5-coder-32b'],
  mistral: ['mistral-large-latest', 'codestral-latest'],
  cerebras: ['qwen-3-235b-a22b-instruct-2507'],
  nvidia: ['moonshotai/kimi-k2.5'],
  ollama: ['llama3.1', 'qwen2.5-coder']
}

function getWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export function registerIpc(manager: AgentManager, scheduler: LoopScheduler): void {
  // window controls (frameless titlebar)
  ipcMain.on('win:minimize', () => getWindow()?.minimize())
  ipcMain.on('win:maximize', () => {
    const win = getWindow()
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('win:close', () => getWindow()?.close())

  ipcMain.handle('dialog:pickDirectory', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // settings
  ipcMain.handle('settings:get', () => db.getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => db.setSettings(patch))

  // providers
  ipcMain.handle('providers:list', () =>
    PROVIDERS.map((p) => {
      const models = PROVIDER_MODELS[p.id] ?? [p.defaultModel]
      return {
        id: p.id,
        name: p.name,
        sub: PROVIDER_SUBS[p.id] ?? '',
        defaultModel: p.defaultModel,
        models: models.includes(p.defaultModel) ? models : [p.defaultModel, ...models],
        authenticated: p.local
          ? Boolean(getProviderConfig(p.id)?.baseUrl ?? p.defaultBaseUrl)
          : Boolean((p.envVar && process.env[p.envVar]) || getStoredKey(p.id))
      }
    })
  )
  ipcMain.handle('providers:saveKey', (_e, provider: string, key: string) => {
    saveProviderKey(provider, key)
  })

  // projects
  ipcMain.handle('projects:list', () => db.listProjects())
  ipcMain.handle('projects:create', (_e, path: string) => {
    const git = isGitRepo(path)
    return db.createProject(path, git ? currentBranch(path) : null, git)
  })
  ipcMain.handle('projects:remove', async (_e, id: number) => {
    for (const agent of db.listAgents(id, manager.isLive)) {
      await manager.remove(agent.id)
    }
    db.removeProject(id)
  })
  ipcMain.handle('projects:touch', (_e, id: number) => db.touchProject(id))

  // agents
  ipcMain.handle('agents:list', (_e, projectId: number) => db.listAgents(projectId, manager.isLive))
  ipcMain.handle('agents:start', (_e, input: StartAgentInput) => manager.startAgent(input))
  ipcMain.handle('agents:prompt', (_e, agentId: string, text: string) =>
    manager.prompt(agentId, text)
  )
  ipcMain.handle('agents:abort', (_e, agentId: string) => manager.abort(agentId))
  ipcMain.handle('agents:remove', (_e, agentId: string) => manager.remove(agentId))
  ipcMain.handle('agents:timeline', (_e, agentId: string) => db.getTimeline(agentId))
  ipcMain.handle('agents:diff', (_e, agentId: string) => manager.getDiff(agentId))
  ipcMain.handle('agents:merge', (_e, agentId: string) => manager.merge(agentId))
  ipcMain.handle('agents:discard', (_e, agentId: string) => manager.discard(agentId))
  ipcMain.handle('agents:openEditor', async (_e, agentId: string) => {
    const meta = db.getAgent(agentId, manager.isLive(agentId))
    if (!meta) throw new Error('Agent not found')
    const project = db.getProject(meta.projectId)
    const settings = db.getSettings()
    const target = meta.worktreePath ?? project?.path
    if (!target) throw new Error('No worktree or project path to open.')
    await openInEditor(settings.editor, target)
  })
  ipcMain.handle('agents:stopAll', () => manager.stopAll())

  // loops
  ipcMain.handle('loops:list', (_e, projectId: number) => db.listLoops(projectId))
  ipcMain.handle('loops:create', (_e, input: LoopInput) => scheduler.create(input))
  ipcMain.handle('loops:update', (_e, id: number, input: LoopInput) => scheduler.update(id, input))
  ipcMain.handle('loops:remove', (_e, id: number) => scheduler.remove(id))
  ipcMain.handle('loops:toggle', (_e, id: number) => scheduler.toggle(id))
  ipcMain.handle('loops:runNow', (_e, id: number) => scheduler.runNow(id))
  ipcMain.handle('loops:runs', (_e, loopId: number) => db.listLoopRuns(loopId))
}
