import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  addMcpServer,
  loadMcpConfig,
  removeMcpServer,
  type McpScope,
  type McpServerConfig as CoreServerConfig
} from '@harnext/core'
import type { McpServerConfig, McpServerRow } from '../shared/types'

// Core's MCP config has no enabled/disabled concept, so the desktop keeps the
// configs of toggled-off servers in its own store. Disabling moves a server out
// of the live config (so the next agent session's merged config drops it);
// enabling moves it back. This never touches a server the user didn't toggle.
type DisabledStore = Record<string, CoreServerConfig>

function disabledPath(): string {
  return join(app.getPath('userData'), 'mcp-disabled.json')
}
function loadDisabled(): DisabledStore {
  try {
    return JSON.parse(readFileSync(disabledPath(), 'utf8')) as DisabledStore
  } catch {
    return {}
  }
}
function saveDisabled(store: DisabledStore): void {
  const p = disabledPath()
  if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(store, null, 2))
}
// Project configs are per-cwd, so project keys include the cwd.
function dkey(scope: McpScope, name: string, cwd: string | null): string {
  return `${scope}|${scope === 'project' ? (cwd ?? '') : ''}|${name}`
}

function transportOf(c: CoreServerConfig): 'stdio' | 'url' {
  return c.url ? 'url' : 'stdio'
}

export function listServers(cwd: string | null): McpServerRow[] {
  const rows: McpServerRow[] = []
  const scopes: McpScope[] = cwd ? ['user', 'project'] : ['user']
  for (const scope of scopes) {
    const cfg = loadMcpConfig(scope, cwd ?? undefined)
    for (const [name, server] of Object.entries(cfg.mcpServers)) {
      rows.push({ name, scope, transport: transportOf(server), enabled: true, config: server })
    }
  }
  for (const [key, server] of Object.entries(loadDisabled())) {
    const [scope, dcwd, name] = key.split('|')
    if (scope === 'project' && (!cwd || dcwd !== cwd)) continue
    rows.push({
      name,
      scope: scope as McpScope,
      transport: transportOf(server),
      enabled: false,
      config: server
    })
  }
  return rows.sort((a, b) =>
    a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'user' ? -1 : 1
  )
}

export function addServer(
  scope: McpScope,
  name: string,
  server: McpServerConfig,
  cwd: string | null
): void {
  addMcpServer(scope, name, server, cwd ?? undefined)
  // Re-adding a previously disabled server clears the disabled copy.
  const store = loadDisabled()
  if (store[dkey(scope, name, cwd)]) {
    delete store[dkey(scope, name, cwd)]
    saveDisabled(store)
  }
}

export function removeServer(scope: McpScope, name: string, cwd: string | null): void {
  removeMcpServer(scope, name, cwd ?? undefined)
  const store = loadDisabled()
  if (store[dkey(scope, name, cwd)]) {
    delete store[dkey(scope, name, cwd)]
    saveDisabled(store)
  }
}

export function setServerEnabled(
  scope: McpScope,
  name: string,
  enabled: boolean,
  cwd: string | null
): void {
  const store = loadDisabled()
  const key = dkey(scope, name, cwd)
  if (enabled) {
    const server = store[key]
    if (!server) return
    addMcpServer(scope, name, server, cwd ?? undefined)
    delete store[key]
    saveDisabled(store)
  } else {
    const server = loadMcpConfig(scope, cwd ?? undefined).mcpServers[name]
    if (!server) return
    store[key] = server
    saveDisabled(store)
    removeMcpServer(scope, name, cwd ?? undefined)
  }
}
