import { describe, it, expect } from 'vitest'
import type { ProjectEnvConfig } from '../../shared/types'
import { buildOverride } from './sandbox'

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
    expect(out).toContain(
      '  app:\n    container_name: !reset null\n    ports: !override\n      - "49210:3000"'
    )
  })

  it('produces a valid compose override document', () => {
    expect(out.startsWith('services:\n')).toBe(true)
    expect(out.endsWith('\n')).toBe(true)
  })
})
