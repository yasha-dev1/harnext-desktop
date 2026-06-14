import { BrowserWindow, dialog, ipcMain } from 'electron'
import { removeProviderConfig, saveProviderConfig, saveProviderKey } from '@harnext/core'
import type { AppSettings, LoopInput, StartAgentInput } from '../shared/types'
import { AgentManager } from './agents/agent-manager'
import * as db from './db'
import { openInEditor } from './editor'
import { currentBranch, isGitRepo } from './git'
import { LoopScheduler } from './loops'
import { getProviderModels, listProviders, verifyProvider } from './providers'

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
  ipcMain.handle('providers:list', () => listProviders())
  ipcMain.handle('providers:models', (_e, provider: string) => getProviderModels(provider))
  ipcMain.handle('providers:saveKey', (_e, provider: string, key: string) => {
    saveProviderKey(provider, key)
  })
  ipcMain.handle('providers:saveBaseUrl', (_e, provider: string, baseUrl: string) => {
    saveProviderConfig(provider, { baseUrl })
  })
  ipcMain.handle(
    'providers:verify',
    (_e, provider: string, cred: { key?: string; baseUrl?: string }) =>
      verifyProvider(provider, cred)
  )
  ipcMain.handle('providers:remove', (_e, provider: string) => {
    removeProviderConfig(provider)
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
  ipcMain.handle(
    'agents:openPR',
    (_e, agentId: string, opts: { base?: string; title?: string; body?: string }) =>
      manager.openPullRequest(agentId, opts)
  )
  ipcMain.handle('agents:discard', (_e, agentId: string) => manager.discard(agentId))
  ipcMain.handle('agents:openEditor', async (_e, agentId: string) => {
    const meta = db.getAgent(agentId, manager.isLive(agentId))
    if (!meta) throw new Error('Agent not found')
    const project = db.getProject(meta.projectId)
    const settings = db.getSettings()
    await openInEditor(settings.editor, meta.worktreePath ?? project?.path ?? '.')
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
