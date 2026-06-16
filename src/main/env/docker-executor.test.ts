import { describe, it, expect, vi } from 'vitest'
import { DockerExecutor, dockerExecArgs, type SpawnFn } from './docker-executor'

// A minimal stand-in for the spawned child: records kill()/on() calls.
function fakeChild(): { kill: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> } {
  return { kill: vi.fn(), on: vi.fn() }
}

// A spawn spy that records its call args (cmd, argv, options) for assertions.
function spawnSpy(child = fakeChild()): {
  spy: ReturnType<typeof vi.fn>
  child: typeof child
} {
  return { spy: vi.fn(() => child), child }
}

describe('dockerExecArgs (#176)', () => {
  it('builds a `docker exec` argv in the given cwd and container', () => {
    expect(dockerExecArgs('c123', '/work/app', 'ls -la')).toEqual([
      'exec',
      '-i',
      '-w',
      '/work/app',
      'c123',
      'sh',
      '-c',
      'ls -la'
    ])
  })

  it('passes the whole command as one `sh -c` string (not split into argv)', () => {
    const args = dockerExecArgs('c', '/w', 'echo hi && grep x')
    expect(args[args.length - 2]).toBe('-c')
    expect(args[args.length - 1]).toBe('echo hi && grep x')
  })
})

describe('DockerExecutor.spawn (#176)', () => {
  it('spawns docker with the exec argv + piped stdio, never forwarding host env', () => {
    const { spy, child } = spawnSpy()
    const exec = new DockerExecutor('ctr', vi.fn(), spy as unknown as SpawnFn)

    const returned = exec.spawn('pwd', { cwd: '/work' } as never)

    expect(spy).toHaveBeenCalledWith(
      'docker',
      ['exec', '-i', '-w', '/work', 'ctr', 'sh', '-c', 'pwd'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    // The host environment is intentionally not passed through.
    const options = spy.mock.calls[0][2] as object
    expect('env' in options).toBe(false)
    expect(returned).toBe(child)
  })

  it('kills the child immediately when the signal is already aborted', () => {
    const { spy, child } = spawnSpy()
    const exec = new DockerExecutor('ctr', vi.fn(), spy as unknown as SpawnFn)

    exec.spawn('sleep 99', { cwd: '/w', signal: AbortSignal.abort() } as never)

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('kills the child when the signal aborts later, and registers a close cleanup', () => {
    const { spy, child } = spawnSpy()
    const exec = new DockerExecutor('ctr', vi.fn(), spy as unknown as SpawnFn)
    const ctrl = new AbortController()

    exec.spawn('sleep 99', { cwd: '/w', signal: ctrl.signal } as never)
    expect(child.kill).not.toHaveBeenCalled()
    expect(child.on).toHaveBeenCalledWith('close', expect.any(Function))

    ctrl.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('registers no abort handling when no signal is given', () => {
    const { spy, child } = spawnSpy()
    const exec = new DockerExecutor('ctr', vi.fn(), spy as unknown as SpawnFn)

    exec.spawn('pwd', { cwd: '/w' } as never)

    expect(child.on).not.toHaveBeenCalled()
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('dispose() delegates to the injected teardown', async () => {
    const teardown = vi.fn().mockResolvedValue(undefined)
    const { spy } = spawnSpy()
    const exec = new DockerExecutor('c', teardown, spy as unknown as SpawnFn)

    await exec.dispose()

    expect(teardown).toHaveBeenCalledOnce()
  })
})
