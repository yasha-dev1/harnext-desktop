import type { AgentPush, LoopInput, LoopMeta } from '../shared/types'
import { buildCadence, computeNextRun } from '../shared/schedule'
import type { AgentManager } from './agents/agent-manager'
import * as db from './db'

const TICK_MS = 30_000

// computeNextRun lives in the (pure, db-free) shared schedule module so it can
// be unit-tested without pulling in the native db/electron deps. Re-exported
// here for existing importers.
export { buildCadence, computeNextRun }

export class LoopScheduler {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private manager: AgentManager,
    private send: (push: AgentPush) => void
  ) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  create(input: LoopInput): LoopMeta {
    const cadence = buildCadence(input.type, input.config)
    const next = computeNextRun(input.type, input.config, Date.now())
    const loop = db.insertLoop(input, cadence, next)
    this.notify(input.projectId)
    return loop
  }

  update(id: number, input: LoopInput): LoopMeta {
    const cadence = buildCadence(input.type, input.config)
    const next = computeNextRun(input.type, input.config, Date.now())
    const loop = db.updateLoop(id, input, cadence, next)
    this.notify(input.projectId)
    return loop
  }

  toggle(id: number): LoopMeta {
    const loop = db.getLoop(id)
    if (!loop) throw new Error('Loop not found')
    if (loop.status === 'active') {
      db.setLoopStatus(id, 'paused', null)
    } else {
      db.setLoopStatus(id, 'active', computeNextRun(loop.type, loop.config, Date.now()))
    }
    this.notify(loop.projectId)
    return db.getLoop(id)!
  }

  remove(id: number): void {
    const loop = db.getLoop(id)
    db.removeLoop(id)
    if (loop) this.notify(loop.projectId)
  }

  async runNow(id: number): Promise<void> {
    const loop = db.getLoop(id)
    if (!loop) throw new Error('Loop not found')
    await this.fire(loop, true)
  }

  private tick(): void {
    for (const loop of db.listDueLoops(Date.now())) {
      void this.fire(loop).catch(() => {})
    }
  }

  private async fire(loop: LoopMeta, manual = false): Promise<void> {
    // A scheduled tick advances the schedule; a manual "Run now" must not —
    // otherwise the next automatic run is skipped/delayed by a full interval.
    if (manual) {
      db.markLoopRan(loop.id)
    } else {
      const next =
        loop.status === 'active' ? computeNextRun(loop.type, loop.config, Date.now()) : null
      db.markLoopFired(loop.id, next)
    }
    this.notify(loop.projectId)
    try {
      const meta = await this.manager.startAgent(
        {
          projectId: loop.projectId,
          prompt: loop.prompt,
          // Per-loop overrides; fall back to the global default when unset.
          model: loop.config.model,
          provider: loop.config.provider
        },
        {
          onSettled: (info) => {
            db.updateLoopRunForAgent(
              meta.id,
              info.status === 'failed' ? 'failed' : info.status === 'review' ? 'review' : 'done',
              info.add,
              info.del,
              info.summary
            )
            this.notify(loop.projectId)
          }
        }
      )
      db.insertLoopRun({
        loopId: loop.id,
        agentId: meta.id,
        status: 'review',
        add: 0,
        del: 0,
        summary: 'Running…'
      })
      this.notify(loop.projectId)
    } catch (err) {
      db.insertLoopRun({
        loopId: loop.id,
        agentId: null,
        status: 'failed',
        add: 0,
        del: 0,
        summary: err instanceof Error ? err.message : String(err)
      })
      this.notify(loop.projectId)
    }
  }

  private notify(projectId: number): void {
    this.send({ agentId: '', type: 'loops-changed', projectId })
  }
}
