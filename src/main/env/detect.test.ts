import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { parseServices, buildExposed, pickWorkspaceService } from './detect'
import type { ComposeService } from '../../shared/types'

const svc = (over: Partial<ComposeService>): ComposeService => ({
  name: 'svc',
  build: false,
  image: null,
  mountsSource: false,
  ports: [],
  hasHealthcheck: false,
  ...over
})

describe('parseServices (#138/#176)', () => {
  const root = '/home/me/project'

  it('maps build/image/healthcheck and dedupes + sorts published ports', () => {
    const out = parseServices(
      {
        api: {
          build: { context: '.' },
          ports: [{ target: 8000 }, { target: 8000 }, { target: 80 }],
          healthcheck: { disable: false }
        }
      },
      root
    )
    expect(out).toEqual([
      {
        name: 'api',
        build: true,
        image: null,
        mountsSource: false,
        ports: [80, 8000],
        hasHealthcheck: true
      }
    ])
  })

  it('detects mountsSource when a service bind-mounts the project root', () => {
    const out = parseServices(
      {
        web: {
          image: 'node:20',
          volumes: [{ type: 'bind', source: resolve(root) }]
        }
      },
      root
    )
    expect(out[0].mountsSource).toBe(true)
    expect(out[0].image).toBe('node:20')
    expect(out[0].build).toBe(false)
  })

  it('does not flag a bind mount of some other path as mountsSource', () => {
    const out = parseServices(
      { web: { image: 'node:20', volumes: [{ type: 'bind', source: '/etc/elsewhere' }] } },
      root
    )
    expect(out[0].mountsSource).toBe(false)
  })

  it('ignores non-numeric ports and treats a disabled healthcheck as none', () => {
    const out = parseServices(
      { db: { image: 'postgres', ports: [{ published: '5432' }], healthcheck: { disable: true } } },
      root
    )
    expect(out[0].ports).toEqual([])
    expect(out[0].hasHealthcheck).toBe(false)
  })
})

describe('buildExposed (#138/#176)', () => {
  const services = [
    svc({ name: 'api', ports: [8000] }),
    svc({ name: 'web', ports: [3000] }),
    svc({ name: 'db', ports: [] }) // no published port → not exposed
  ]

  it('exposes only services with a published port, first port as the container port', () => {
    const out = buildExposed(services, null)
    expect(out.map((e) => e.service)).toEqual(['api', 'web'])
    expect(out.find((e) => e.service === 'api')?.containerPort).toBe(8000)
  })

  it('marks the workspace service primary when no override is given', () => {
    const out = buildExposed(services, 'web')
    expect(out.find((e) => e.primary)?.service).toBe('web')
  })

  it('an explicit primary override beats the workspace', () => {
    const out = buildExposed(services, 'web', 'api')
    expect(out.find((e) => e.primary)?.service).toBe('api')
  })

  it('falls back to the first exposed service when neither override nor workspace is exposed', () => {
    const out = buildExposed(services, 'db') // db has no port
    expect(out.find((e) => e.primary)?.service).toBe('api')
  })

  it('returns an empty list when nothing publishes a port', () => {
    expect(buildExposed([svc({ name: 'db', ports: [] })], 'db')).toEqual([])
  })
})

describe('pickWorkspaceService (#138/#176)', () => {
  const services = [
    svc({ name: 'db', image: 'postgres' }),
    svc({ name: 'api', build: true }),
    svc({ name: 'web', mountsSource: true })
  ]

  it('honours a valid explicit override', () => {
    expect(pickWorkspaceService(services, 'web')).toBe('web')
  })

  it('ignores an override that names no real service', () => {
    // Falls through to the first build/mountsSource service.
    expect(pickWorkspaceService(services, 'ghost')).toBe('api')
  })

  it('prefers the first service that builds or mounts source', () => {
    expect(pickWorkspaceService(services)).toBe('api')
  })

  it('picks a source-mounting service when none build', () => {
    expect(
      pickWorkspaceService([svc({ name: 'db' }), svc({ name: 'web', mountsSource: true })])
    ).toBe('web')
  })

  it('returns null when no service builds or mounts source', () => {
    expect(pickWorkspaceService([svc({ name: 'db', image: 'postgres' })])).toBeNull()
  })
})
