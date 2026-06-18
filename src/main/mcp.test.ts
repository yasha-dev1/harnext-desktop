import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServerConfig } from '../shared/types'

// electron app.getPath → a real temp dir, so the desktop-side "disabled" store
// exercises real JSON read/write. @harnext/core's MCP config is mocked as an
// in-memory live store (it owns the on-disk config; here we test our layer on top).
const electron = vi.hoisted(() => ({ app: { getPath: vi.fn(() => '/tmp') } }))
vi.mock('electron', () => electron)

const core = vi.hoisted(() => {
  // live config store. User config is global; project config is per-cwd — mirror
  // how core scopes it (so passing a cwd for user scope is ignored).
  const live: Record<string, Record<string, unknown>> = {}
  const k = (scope: string, cwd?: string): string =>
    scope === 'project' ? `project|${cwd ?? ''}` : 'user'
  return {
    live,
    loadMcpConfig: vi.fn((scope: string, cwd?: string) => ({
      mcpServers: live[k(scope, cwd)] ?? {}
    })),
    addMcpServer: vi.fn((scope: string, name: string, server: unknown, cwd?: string) => {
      ;(live[k(scope, cwd)] ??= {})[name] = server
    }),
    removeMcpServer: vi.fn((scope: string, name: string, cwd?: string) => {
      delete live[k(scope, cwd)]?.[name]
    })
  }
})
vi.mock('@harnext/core', () => core)

import { listServers, addServer, removeServer, setServerEnabled } from './mcp'

const STDIO = { command: 'node', args: ['srv.js'] } as McpServerConfig
const URLSRV = { url: 'https://mcp.example/sse' } as McpServerConfig

let dir: string
beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(core.live)) delete core.live[key]
  dir = mkdtempSync(join(tmpdir(), 'mcp-test-'))
  electron.app.getPath.mockReturnValue(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('listServers', () => {
  it('lists user servers (enabled) and infers transport', () => {
    addServer('user', 'fs', STDIO, null)
    addServer('user', 'web', URLSRV, null)
    const rows = listServers(null)
    expect(rows.find((r) => r.name === 'fs')).toMatchObject({ enabled: true, transport: 'stdio' })
    expect(rows.find((r) => r.name === 'web')).toMatchObject({ enabled: true, transport: 'url' })
  })

  it('includes project-scope servers only when a cwd is given', () => {
    addServer('project', 'proj-srv', STDIO, '/work/a')
    expect(listServers(null).some((r) => r.name === 'proj-srv')).toBe(false)
    expect(listServers('/work/a').some((r) => r.name === 'proj-srv')).toBe(true)
  })

  it('merges disabled servers (enabled:false) from the desktop store', () => {
    addServer('user', 'fs', STDIO, null)
    setServerEnabled('user', 'fs', false, null)
    const rows = listServers(null)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'fs', enabled: false })
  })

  it('sorts user before project, then by name', () => {
    addServer('user', 'zed', STDIO, null)
    addServer('user', 'ant', STDIO, null)
    addServer('project', 'aaa', STDIO, '/w')
    const names = listServers('/w').map((r) => `${r.scope}:${r.name}`)
    expect(names).toEqual(['user:ant', 'user:zed', 'project:aaa'])
  })

  it('does not leak a disabled project server into another project (cwd-scoped key)', () => {
    addServer('project', 'p', STDIO, '/work/a')
    setServerEnabled('project', 'p', false, '/work/a')
    expect(listServers('/work/b').some((r) => r.name === 'p')).toBe(false)
    expect(listServers('/work/a').some((r) => r.name === 'p')).toBe(true)
  })
})

describe('addServer / removeServer', () => {
  it('addServer delegates to core and clears any stale disabled copy', () => {
    addServer('user', 'fs', STDIO, null)
    setServerEnabled('user', 'fs', false, null) // now in the disabled store
    addServer('user', 'fs', STDIO, null) // re-adding should clear the disabled copy
    const rows = listServers(null)
    expect(rows).toHaveLength(1)
    expect(rows[0].enabled).toBe(true)
  })

  it('removeServer delegates to core and drops the disabled copy too', () => {
    addServer('user', 'fs', STDIO, null)
    setServerEnabled('user', 'fs', false, null)
    removeServer('user', 'fs', null)
    expect(core.removeMcpServer).toHaveBeenCalledWith('user', 'fs', undefined)
    expect(listServers(null)).toHaveLength(0)
  })
})

describe('setServerEnabled — the toggle', () => {
  it('disabling moves the server out of the live config into the disabled store', () => {
    addServer('user', 'fs', STDIO, null)
    setServerEnabled('user', 'fs', false, null)
    // gone from core's live config…
    expect(core.removeMcpServer).toHaveBeenCalledWith('user', 'fs', undefined)
    // …but still surfaced as disabled
    expect(listServers(null)).toMatchObject([{ name: 'fs', enabled: false }])
  })

  it('enabling moves it back into the live config', () => {
    addServer('user', 'fs', STDIO, null)
    setServerEnabled('user', 'fs', false, null)
    vi.clearAllMocks()
    setServerEnabled('user', 'fs', true, null)
    expect(core.addMcpServer).toHaveBeenCalledWith('user', 'fs', STDIO, undefined)
    expect(listServers(null)).toMatchObject([{ name: 'fs', enabled: true }])
  })

  it('is a no-op when enabling a server that is not disabled', () => {
    setServerEnabled('user', 'ghost', true, null)
    expect(core.addMcpServer).not.toHaveBeenCalled()
  })

  it('is a no-op when disabling a server that is not in the live config', () => {
    setServerEnabled('user', 'ghost', false, null)
    expect(core.removeMcpServer).not.toHaveBeenCalled()
  })
})
