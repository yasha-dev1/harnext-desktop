import { describe, it, expect } from 'vitest'
import { isExitPlanTool, exitPlanArg, plannerProducedPlan } from './goal-plan'

describe('isExitPlanTool', () => {
  it('matches the native and canonical names', () => {
    expect(isExitPlanTool('exit_plan')).toBe(true) // native (what events carry)
    expect(isExitPlanTool('ExitPlanMode')).toBe(true) // canonical SDK name
    expect(isExitPlanTool('exitplanmode')).toBe(true)
    expect(isExitPlanTool('EXIT_PLAN')).toBe(true)
  })

  it('does not match other tools', () => {
    for (const t of ['edit', 'write', 'bash', 'read', 'todo', 'planner']) {
      expect(isExitPlanTool(t)).toBe(false)
    }
  })
})

describe('exitPlanArg', () => {
  it('extracts the trimmed plan markdown from the tool argument', () => {
    expect(exitPlanArg({ plan: '  # Plan\nstep 1  ' })).toBe('# Plan\nstep 1')
  })

  it('tolerates a blueprint alias', () => {
    expect(exitPlanArg({ blueprint: 'do the thing' })).toBe('do the thing')
  })

  it('returns empty string when no plan argument is present', () => {
    expect(exitPlanArg({})).toBe('')
    expect(exitPlanArg({ plan: 123 as unknown as string })).toBe('')
    expect(exitPlanArg({ other: 'x' })).toBe('')
  })
})

describe('plannerProducedPlan — executor handoff gate (#110)', () => {
  it('is true only when the planner presented a plan AND there is a blueprint', () => {
    expect(plannerProducedPlan(true, 'a real blueprint')).toBe(true)
  })

  it('is false when the planner never called exit_plan (blocked / asked a question)', () => {
    // The exact repro: the planner ended with a question, no exit_plan.
    expect(plannerProducedPlan(false, "I can't access GitHub — paste the issue details.")).toBe(
      false
    )
  })

  it('is false when exit_plan was somehow called with an empty plan', () => {
    expect(plannerProducedPlan(true, '')).toBe(false)
    expect(plannerProducedPlan(true, '   ')).toBe(false)
    expect(plannerProducedPlan(true, null)).toBe(false)
    expect(plannerProducedPlan(true, undefined)).toBe(false)
  })
})
