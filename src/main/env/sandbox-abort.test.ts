import { describe, it, expect } from 'vitest'
import { abortableDelay, waitForContainerReady, abortError, type InspectState } from './sandbox'

describe('abortableDelay — cancellable sleep (#126)', () => {
  it('resolves after the delay when not aborted', async () => {
    await expect(abortableDelay(5)).resolves.toBeUndefined()
  })

  it('rejects immediately if the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(abortableDelay(10_000, ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects promptly when aborted mid-wait (no waiting out the full delay)', async () => {
    const ac = new AbortController()
    const p = abortableDelay(10_000, ac.signal)
    setTimeout(() => ac.abort(), 5)
    const start = Date.now()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - start).toBeLessThan(1000) // didn't wait the 10s
  })
})

// A fake inspect/delay so the readiness poll is exercised without Docker.
const inspectReturning = (...states: Array<{ status?: string; health?: string }>): InspectState => {
  let i = 0
  return async () => states[Math.min(i++, states.length - 1)]
}
const noDelay = async (): Promise<void> => {}

describe('waitForContainerReady — readiness poll (#126)', () => {
  it('resolves once the container is running and healthy', async () => {
    const inspect = inspectReturning(
      { status: 'created' },
      { status: 'running', health: 'healthy' }
    )
    await expect(
      waitForContainerReady('c', 'workspace', 60_000, { inspect, delay: noDelay })
    ).resolves.toBeUndefined()
  })

  it('treats a running container with no healthcheck as ready', async () => {
    const inspect = inspectReturning({ status: 'running' })
    await expect(
      waitForContainerReady('c', 'workspace', 60_000, { inspect, delay: noDelay })
    ).resolves.toBeUndefined()
  })

  it('fails fast when the workspace container exits before becoming ready', async () => {
    const inspect = inspectReturning({ status: 'exited' })
    await expect(
      waitForContainerReady('c', 'workspace', 60_000, { inspect, delay: noDelay })
    ).rejects.toThrow(/exited before it became ready/)
  })

  it('times out when the container never becomes ready', async () => {
    const inspect = inspectReturning({ status: 'created' })
    await expect(
      waitForContainerReady('c', 'workspace', 0, { inspect, delay: noDelay })
    ).rejects.toThrow(/not ready within/)
  })

  it('aborts the poll promptly when the signal is aborted (the #126 fix)', async () => {
    const ac = new AbortController()
    ac.abort()
    const inspect = inspectReturning({ status: 'created' }) // never ready
    await expect(
      waitForContainerReady('c', 'workspace', 60_000, {
        inspect,
        delay: noDelay,
        signal: ac.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('aborts even while waiting between polls', async () => {
    const ac = new AbortController()
    const inspect = inspectReturning({ status: 'created' })
    // Real abortableDelay so the abort interrupts the inter-poll wait.
    const p = waitForContainerReady('c', 'workspace', 60_000, { inspect, signal: ac.signal })
    setTimeout(() => ac.abort(), 5)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('abortError', () => {
  it('is an Error tagged AbortError', () => {
    const e = abortError()
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('AbortError')
  })
})
