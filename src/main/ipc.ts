import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { removeProviderConfig, saveProviderConfig, saveProviderKey } from '@harnext/core'
import type {
  AppSettings,
  EnvOverrides,
  FsListing,
  LoopInput,
  McpScope,
  McpServerConfig,
  ProjectEnvConfig,
  ProjectSecretsInfo,
  StartAgentInput
} from '../shared/types'
import { addServer, listServers, removeServer, setServerEnabled } from './mcp'
import { AgentManager } from './agents/agent-manager'
import * as db from './db'
import { openInEditor } from './editor'
import { detectProjectEnv, emptyEnvConfig, getDockerStatus } from './env/detect'
import {
  importSecretsFromEnvFile,
  listProjectSecretKeys,
  removeProjectSecret,
  secretsAvailable,
  setProjectSecret,
  setProjectSecretsFromText
} from './env/secrets'
import { currentBranch, fetchRemote, isGitRepo, listBranches, openBranchWorktree } from './git'
import { checkForUpdate } from './updater/check'
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

  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))

  // Auto-update: is a newer GitHub release available? (#162/#125)
  ipcMain.handle('update:check', () => checkForUpdate(app.getVersion()))

  ipcMain.handle('dialog:pickDirectory', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:pickAudioFile', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:pickEnvFile', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'showHiddenFiles']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Read-only filesystem browsing for the in-app file/folder picker.
  ipcMain.handle('fs:home', () => homedir())
  ipcMain.handle('fs:listDir', (_e, dirPath: string): FsListing => {
    try {
      const abs = resolve(dirPath)
      const dirents = readdirSync(abs, { withFileTypes: true })
      const entries = dirents
        .filter((d) => !d.name.startsWith('.')) // hide dotfiles by default
        .map((d) => {
          const full = join(abs, d.name)
          const isSymlink = d.isSymbolicLink()
          let isDir = d.isDirectory()
          // Resolve a symlink's target type so it sorts/navigates correctly.
          if (isSymlink) {
            try {
              isDir = statSync(full).isDirectory()
            } catch {
              isDir = false
            }
          }
          return { name: d.name, path: full, isDir, isSymlink }
        })
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      const parent = dirname(abs)
      return { path: abs, parent: parent === abs ? null : parent, entries }
    } catch (err) {
      return {
        path: dirPath,
        parent: null,
        entries: [],
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  // MCP server connector
  ipcMain.handle('mcp:list', (_e, cwd: string | null) => listServers(cwd))
  ipcMain.handle(
    'mcp:add',
    (_e, scope: McpScope, name: string, server: McpServerConfig, cwd: string | null) =>
      addServer(scope, name, server, cwd)
  )
  ipcMain.handle('mcp:remove', (_e, scope: McpScope, name: string, cwd: string | null) =>
    removeServer(scope, name, cwd)
  )
  ipcMain.handle(
    'mcp:setEnabled',
    (_e, scope: McpScope, name: string, enabled: boolean, cwd: string | null) =>
      setServerEnabled(scope, name, enabled, cwd)
  )

  ipcMain.handle('sounds:read', (_e, p: string) => {
    try {
      const ext = extname(p).slice(1).toLowerCase()
      const mime =
        ext === 'mp3'
          ? 'audio/mpeg'
          : ext === 'wav'
            ? 'audio/wav'
            : ext === 'ogg' || ext === 'oga'
              ? 'audio/ogg'
              : ext === 'm4a' || ext === 'aac'
                ? 'audio/mp4'
                : ext === 'flac'
                  ? 'audio/flac'
                  : 'application/octet-stream'
      return `data:${mime};base64,${readFileSync(p).toString('base64')}`
    } catch {
      return null
    }
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
  ipcMain.handle('projects:create', async (_e, path: string) => {
    const git = isGitRepo(path)
    const project = db.createProject(path, git ? currentBranch(path) : null, git)
    // First time we see this project, detect its Docker environment. Best-effort:
    // never block adding a project on detection. Re-opens keep the stored config
    // (and the user's enable/disable choice) — re-detect explicitly via detectEnv.
    if (!project.envConfig) {
      try {
        return db.setProjectEnvConfig(project.id, await detectProjectEnv(path)) ?? project
      } catch {
        /* leave envConfig null; the Environment tab offers a manual "Detect" */
      }
    }
    return project
  })
  ipcMain.handle('projects:remove', async (_e, id: number) => {
    for (const agent of db.listAgents(id, manager.isLive)) {
      await manager.remove(agent.id)
    }
    db.removeProject(id)
  })
  ipcMain.handle('projects:touch', (_e, id: number) => db.touchProject(id))
  ipcMain.handle('projects:branches', (_e, id: number) => {
    const project = db.getProject(id)
    if (!project?.isGit) return { current: null, local: [], remote: [] }
    fetchRemote(project.path) // best-effort; pulls in new remote branches
    return listBranches(project.path)
  })
  // Branch switcher (#96): point the project's context at the chosen branch. The
  // branch the main checkout is on clears the pin; any other branch is checked
  // out into a (reused or new) worktree. The main checkout is never touched.
  ipcMain.handle('projects:checkoutBranch', (_e, id: number, branch: string) => {
    const project = db.getProject(id)
    if (!project?.isGit) return project
    fetchRemote(project.path)
    if (branch === currentBranch(project.path)) return db.setActiveWorktree(id, null, null)
    const wt = openBranchWorktree(project.path, branch, db.getSettings().worktreeRoot)
    return db.setActiveWorktree(id, wt.path, wt.branch)
  })
  ipcMain.handle('docker:status', () => getDockerStatus())
  ipcMain.handle('projects:detectEnv', async (_e, id: number) => {
    const project = db.getProject(id)
    if (!project) throw new Error('Project not found')
    const env = await detectProjectEnv(project.path, project.envConfig?.overrides ?? {})
    // Preserve the user's enable choice across a re-detect — but never leave it
    // enabled when the stack can no longer be resolved.
    const prev = project.envConfig
    const viable = env.runtime === 'compose' && !env.detectError && env.services.length > 0
    const enabled = prev ? prev.enabled && viable : env.enabled
    return db.setProjectEnvConfig(id, { ...env, enabled }) ?? project
  })
  ipcMain.handle('projects:setEnvOverrides', async (_e, id: number, patch: EnvOverrides) => {
    const project = db.getProject(id)
    if (!project) throw new Error('Project not found')
    const base = project.envConfig ?? emptyEnvConfig()
    const overrides = { ...(base.overrides ?? {}), ...patch }
    // An empty composeFiles list clears the override (back to auto-discovery).
    if (overrides.composeFiles && overrides.composeFiles.length === 0) delete overrides.composeFiles
    const env = await detectProjectEnv(project.path, overrides)
    // Specifying a compose file for a project that had none opts it in; otherwise
    // keep the user's existing enable choice.
    const viable = env.runtime === 'compose' && !env.detectError && env.services.length > 0
    const enabled = viable ? (base.runtime === 'compose' ? base.enabled : true) : false
    return db.setProjectEnvConfig(id, { ...env, enabled }) ?? project
  })
  ipcMain.handle('projects:setEnvConfig', (_e, id: number, patch: Partial<ProjectEnvConfig>) => {
    const project = db.getProject(id)
    if (!project) throw new Error('Project not found')
    const base = project.envConfig ?? emptyEnvConfig()
    return db.setProjectEnvConfig(id, { ...base, ...patch }) ?? project
  })

  // Per-project encrypted secret store (#123). Only names cross to the renderer.
  const secretsInfo = (id: number): ProjectSecretsInfo => ({
    available: secretsAvailable(),
    keys: listProjectSecretKeys(id)
  })
  ipcMain.handle('projects:secrets', (_e, id: number) => secretsInfo(id))
  ipcMain.handle('projects:setSecret', (_e, id: number, key: string, value: string) => {
    if (!db.getProject(id)) throw new Error('Project not found')
    setProjectSecret(id, key, value)
    return secretsInfo(id)
  })
  ipcMain.handle('projects:setSecretsBulk', (_e, id: number, text: string) => {
    if (!db.getProject(id)) throw new Error('Project not found')
    setProjectSecretsFromText(id, text)
    return secretsInfo(id)
  })
  ipcMain.handle('projects:removeSecret', (_e, id: number, key: string) => {
    removeProjectSecret(id, key)
    return secretsInfo(id)
  })
  ipcMain.handle('projects:importSecretsFromEnv', (_e, id: number, path?: string) => {
    const project = db.getProject(id)
    if (!project) throw new Error('Project not found')
    importSecretsFromEnvFile(id, project.path, path ?? '.env')
    return secretsInfo(id)
  })

  // agents
  ipcMain.handle('agents:list', (_e, projectId: number) => db.listAgents(projectId, manager.isLive))
  ipcMain.handle('agents:start', (_e, input: StartAgentInput) => manager.startAgent(input))
  ipcMain.handle('agents:prompt', (_e, agentId: string, text: string, images?: string[]) =>
    manager.prompt(agentId, text, images)
  )
  ipcMain.handle('agents:resume', (_e, agentId: string) => manager.resume(agentId))
  ipcMain.handle('agents:recallSteer', (_e, agentId: string) => manager.recallSteer(agentId))
  ipcMain.handle('agents:abort', (_e, agentId: string) => manager.abort(agentId))
  ipcMain.handle('agents:remove', (_e, agentId: string) => manager.remove(agentId))
  ipcMain.handle('agents:timeline', (_e, agentId: string) => db.getTimeline(agentId))
  ipcMain.handle('agents:diff', (_e, agentId: string) => manager.getDiff(agentId))
  ipcMain.handle('agents:merge', (_e, agentId: string) => manager.merge(agentId))
  ipcMain.handle('agents:suggestPR', (_e, agentId: string) => manager.suggestPullRequest(agentId))
  ipcMain.handle(
    'agents:openPR',
    (_e, agentId: string, opts: { base?: string; title?: string; body?: string }) =>
      manager.openPullRequest(agentId, opts)
  )
  ipcMain.handle('agents:discard', (_e, agentId: string) => manager.discard(agentId))
  ipcMain.handle('agents:rename', (_e, agentId: string, title: string) =>
    db.renameAgent(agentId, title)
  )
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
  ipcMain.handle('agents:sandbox', (_e, agentId: string) => manager.getSandbox(agentId))

  // loops
  ipcMain.handle('loops:list', (_e, projectId: number) => db.listLoops(projectId))
  ipcMain.handle('loops:create', (_e, input: LoopInput) => scheduler.create(input))
  ipcMain.handle('loops:update', (_e, id: number, input: LoopInput) => scheduler.update(id, input))
  ipcMain.handle('loops:remove', (_e, id: number) => scheduler.remove(id))
  ipcMain.handle('loops:toggle', (_e, id: number) => scheduler.toggle(id))
  ipcMain.handle('loops:runNow', (_e, id: number) => scheduler.runNow(id))
  ipcMain.handle('loops:runs', (_e, loopId: number) => db.listLoopRuns(loopId))
}
