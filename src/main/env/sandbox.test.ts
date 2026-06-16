import { describe, it, expect } from 'vitest'
import type { ProjectEnvConfig } from '../../shared/types'
import { buildOverride, exitedContainerError } from './sandbox'

const env: ProjectEnvConfig = {
  enabled: true,
  runtime: 'compose',
  composeFiles: ['docker-compose.yml'],
  sourceHash: null,
  workspaceService: 'app',
  services: [
    {
      name: 'app',
      build: true,
      image: null,
      mountsSource: true,
      ports: [3000],
      hasHealthcheck: false
    },
    // redis has a fixed `container_name: redis-master` in the base compose.
    {
      name: 'redis',
      build: false,
      image: 'redis:7',
      mountsSource: false,
      ports: [],
      hasHealthcheck: true
    }
  ],
  exposed: [{ service: 'app', containerPort: 3000, primary: true }],
  artifactVolumes: [],
  initCommands: [],
  detectError: null,
  detectedAt: 0
}

describe('buildOverride container-name namespacing (#117)', () => {
  const out = buildOverride(env, { app: 49210 })

  it('resets container_name for every service — even non-exposed ones', () => {
    expect((out.match(/container_name: !reset null/g) ?? []).length).toBe(2)
    expect(out).toContain('  redis:\n    container_name: !reset null')
  })

  it('keeps the per-worktree port forwarding for exposed services', () => {
    expect(out).toContain('  app:\n    container_name: !reset null')
    expect(out).toContain('    ports: !override\n      - "49210:3000"')
  })

  it('produces a valid compose override document', () => {
    expect(out.startsWith('services:\n')).toBe(true)
    expect(out.endsWith('\n')).toBe(true)
  })
})

describe('buildOverride workspace keep-alive (#124)', () => {
  const out = buildOverride(env, { app: 49210 })

  it('overrides the workspace service entrypoint to a keep-alive shell', () => {
    expect(out).toContain('    entrypoint: ["sleep", "infinity"]')
    // and clears the base command so it is not passed as args to sleep
    expect(out).toContain('    command: !reset null')
  })

  it('only keeps the workspace alive — other services keep their real command', () => {
    // exactly one keep-alive entrypoint, attached to the `app` (workspace) block
    expect((out.match(/entrypoint: \["sleep", "infinity"\]/g) ?? []).length).toBe(1)
    const redisBlock = out.slice(out.indexOf('  redis:'))
    expect(redisBlock).not.toContain('sleep')
    expect(redisBlock).not.toContain('command:')
  })

  it('keep-alive lines sit inside the workspace block, before its ports', () => {
    const appBlock = out.slice(out.indexOf('  app:'), out.indexOf('  redis:'))
    expect(appBlock).toContain('entrypoint: ["sleep", "infinity"]')
    expect(appBlock.indexOf('entrypoint:')).toBeLessThan(appBlock.indexOf('ports:'))
  })

  it('always emits the workspace block even when it has no exposed ports', () => {
    const noPorts = buildOverride({ ...env, exposed: [] }, {})
    expect(noPorts).toContain('  app:\n    container_name: !reset null')
    expect(noPorts).toContain('    entrypoint: ["sleep", "infinity"]')
  })

  it('emits no keep-alive when there is no workspace service', () => {
    const none = buildOverride({ ...env, workspaceService: null }, { app: 49210 })
    expect(none).not.toContain('sleep')
  })
})

describe('exitedContainerError (#124 actionable failure)', () => {
  it('reports the service, exit code, and log tail', () => {
    const msg = exitedContainerError('flowhunt-api', {
      exitCode: 1,
      logs: 'pydantic.ValidationError: 1 validation error\nDATABASE_URL field required'
    })
    expect(msg).toContain('flowhunt-api')
    expect(msg).toContain('exit code 1')
    expect(msg).toContain('pydantic.ValidationError')
    expect(msg).toContain('DATABASE_URL field required')
  })

  it('omits the exit-code clause when unknown', () => {
    const msg = exitedContainerError('api', { exitCode: null })
    expect(msg).not.toContain('exit code')
    expect(msg).toContain('api')
  })

  it('handles missing logs gracefully (no trailing newline)', () => {
    const msg = exitedContainerError('api', { exitCode: 137 })
    expect(msg).toContain('exit code 137')
    expect(msg.endsWith('.')).toBe(true)
  })
})
