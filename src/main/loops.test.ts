import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AgentPush, LoopInput, LoopMeta } from '../shared/types'

// Mock the native db and the (separately-tested) pure schedule math so these tests
// isolate the LoopScheduler's orchestration. computeNextRun returns a fixed marker
// so we can assert "advanced the schedule" without coupling to real clock math.
const db = vi.hoisted(() => ({
  insertLoop: vi.fn((): LoopMeta => ({}) as LoopMeta),
  updateLoop: vi.fn((): LoopMeta => ({}) as LoopMeta),
  getLoop: vi.fn((): LoopMeta | undefined => undefined),
  setLoopStatus: vi.fn(),
  removeLoop: vi.fn(),
  listDueLoops: vi.fn((): LoopMeta[] => []),
  markLoopRan: vi.fn(),
  markLoopFired: vi.fn(),
  insertLoopRun: vi.fn(),
  updateLoopRunForAgent: vi.fn()
}))
vi.mock('./db', () => db)
vi.mock('../shared/schedule', () => ({
  buildCadence: vi.fn(() => 'every day'),
  computeNextRun: vi.fn(() => 9999)
}))

import { LoopScheduler } from './loops'

const INPUT: LoopInput = {
  projectId: 1,
  title: 'Nightly',
  prompt: 'tidy the repo',
  type: 'daily',
  config: { model: 'opus', provider: 'anthropic' } as LoopInput['config'],
  enabled: true
}
const loopMeta = (over: Partial<LoopMeta> = {}): LoopMeta =>
  ({
    id: 5,
    projectId: 1,
    prompt: 'tidy the repo',
    type: 'daily',
    config: INPUT.config,
    status: 'active',
    ...over
  }) as LoopMeta

function makeScheduler(startAgent = vi.fn().mockResolvedValue({ id: 'agent-1' })): {
  scheduler: LoopScheduler
  send: ReturnType<typeof vi.fn>
  startAgent: typeof startAgent
} {
  const send = vi.fn<(p: AgentPush) => void>()
  // The manager is constructor-injected, so a stub suffices — no module mock.
  const manager = { startAgent } as unknown as ConstructorParameters<typeof LoopScheduler>[0]
  return { scheduler: new LoopScheduler(manager, send), send, startAgent }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.insertLoop.mockReturnValue(loopMeta())
  db.updateLoop.mockReturnValue(loopMeta())
  db.listDueLoops.mockReturnValue([])
})

describe('create / update', () => {
  it('persists with the built cadence + computed next run and notifies the project', () => {
    const { scheduler, send } = makeScheduler()
    scheduler.create(INPUT)
    expect(db.insertLoop).toHaveBeenCalledWith(INPUT, 'every day', 9999)
    expect(send).toHaveBeenCalledWith({ agentId: '', type: 'loops-changed', projectId: 1 })
  })

  it('update writes through to db.updateLoop with the same cadence/next', () => {
    const { scheduler } = makeScheduler()
    scheduler.update(5, INPUT)
    expect(db.updateLoop).toHaveBeenCalledWith(5, INPUT, 'every day', 9999)
  })
})

describe('toggle', () => {
  it('pauses an active loop (clears the next run)', () => {
    const { scheduler, send } = makeScheduler()
    db.getLoop
      .mockReturnValueOnce(loopMeta({ status: 'active' }))
      .mockReturnValueOnce(loopMeta({ status: 'paused' }))
    scheduler.toggle(5)
    expect(db.setLoopStatus).toHaveBeenCalledWith(5, 'paused', null)
    expect(send).toHaveBeenCalledWith({ agentId: '', type: 'loops-changed', projectId: 1 })
  })

  it('resumes a paused loop with a freshly computed next run', () => {
    const { scheduler } = makeScheduler()
    db.getLoop.mockReturnValue(loopMeta({ status: 'paused' }))
    scheduler.toggle(5)
    expect(db.setLoopStatus).toHaveBeenCalledWith(5, 'active', 9999)
  })

  it('throws when the loop does not exist', () => {
    const { scheduler } = makeScheduler()
    db.getLoop.mockReturnValue(undefined)
    expect(() => scheduler.toggle(404)).toThrow(/not found/i)
  })
})

describe('remove', () => {
  it('deletes the loop and notifies its project', () => {
    const { scheduler, send } = makeScheduler()
    db.getLoop.mockReturnValue(loopMeta())
    scheduler.remove(5)
    expect(db.removeLoop).toHaveBeenCalledWith(5)
    expect(send).toHaveBeenCalledWith({ agentId: '', type: 'loops-changed', projectId: 1 })
  })

  it('still deletes (without a notify) when the loop was already gone', () => {
    const { scheduler, send } = makeScheduler()
    db.getLoop.mockReturnValue(undefined)
    scheduler.remove(5)
    expect(db.removeLoop).toHaveBeenCalledWith(5)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('runNow vs scheduled tick — schedule advancement', () => {
  it('a manual "Run now" records the run but does NOT advance the schedule', async () => {
    const { scheduler, startAgent } = makeScheduler()
    db.getLoop.mockReturnValue(loopMeta({ status: 'active' }))
    await scheduler.runNow(5)
    expect(db.markLoopRan).toHaveBeenCalledWith(5)
    expect(db.markLoopFired).not.toHaveBeenCalled() // would skip the next auto-run
    expect(startAgent).toHaveBeenCalledTimes(1)
  })

  it('a scheduled tick advances the schedule (markLoopFired with the next run)', async () => {
    const { scheduler, startAgent } = makeScheduler()
    db.listDueLoops.mockReturnValue([loopMeta({ id: 7, status: 'active' })])
    scheduler['tick']()
    await Promise.resolve()
    await Promise.resolve()
    expect(db.markLoopFired).toHaveBeenCalledWith(7, 9999)
    expect(db.markLoopRan).not.toHaveBeenCalled()
    expect(startAgent).toHaveBeenCalledTimes(1)
  })

  it('runNow throws when the loop is missing', async () => {
    const { scheduler } = makeScheduler()
    db.getLoop.mockReturnValue(undefined)
    await expect(scheduler.runNow(404)).rejects.toThrow(/not found/i)
  })
})

describe('fire — agent start outcomes', () => {
  it('starts the agent with the loop prompt + per-loop model/provider, and records a review run', async () => {
    const startAgent = vi.fn().mockResolvedValue({ id: 'agent-9' })
    const { scheduler } = makeScheduler(startAgent)
    db.getLoop.mockReturnValue(loopMeta({ status: 'active' }))
    await scheduler.runNow(5)
    expect(startAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 1,
        prompt: 'tidy the repo',
        model: 'opus',
        provider: 'anthropic'
      }),
      expect.objectContaining({ onSettled: expect.any(Function) })
    )
    expect(db.insertLoopRun).toHaveBeenCalledWith(
      expect.objectContaining({ loopId: 5, agentId: 'agent-9', status: 'review' })
    )
  })

  it('records a FAILED run (not a silent drop) when startAgent throws', async () => {
    const startAgent = vi.fn().mockRejectedValue(new Error('no worktree'))
    const { scheduler } = makeScheduler(startAgent)
    db.getLoop.mockReturnValue(loopMeta({ status: 'active' }))
    await scheduler.runNow(5)
    expect(db.insertLoopRun).toHaveBeenCalledWith(
      expect.objectContaining({
        loopId: 5,
        agentId: null,
        status: 'failed',
        summary: 'no worktree'
      })
    )
  })

  it('onSettled maps the agent outcome onto the loop run', async () => {
    const startAgent = vi.fn().mockResolvedValue({ id: 'agent-2' })
    const { scheduler } = makeScheduler(startAgent)
    db.getLoop.mockReturnValue(loopMeta({ status: 'active' }))
    await scheduler.runNow(5)
    const onSettled = startAgent.mock.calls[0][1].onSettled as (i: {
      status: string
      add: number
      del: number
      summary: string
    }) => void

    onSettled({ status: 'failed', add: 0, del: 0, summary: 'boom' })
    expect(db.updateLoopRunForAgent).toHaveBeenLastCalledWith('agent-2', 'failed', 0, 0, 'boom')
    onSettled({ status: 'review', add: 1, del: 2, summary: 'needs review' })
    expect(db.updateLoopRunForAgent).toHaveBeenLastCalledWith(
      'agent-2',
      'review',
      1,
      2,
      'needs review'
    )
    onSettled({ status: 'input', add: 3, del: 4, summary: 'ok' })
    expect(db.updateLoopRunForAgent).toHaveBeenLastCalledWith('agent-2', 'done', 3, 4, 'ok')
  })
})
