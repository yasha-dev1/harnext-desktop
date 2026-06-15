import { describe, it, expect } from 'vitest'
import {
  withWorkingDir,
  PLANNER_SYSTEM_PROMPT,
  GENERATOR_SYSTEM_PROMPT,
  EVALUATOR_SYSTEM_PROMPT
} from './goal-prompts'

/**
 * #108: goal-mode role prompts are passed as a full system-prompt override,
 * which drops core's cwd-aware default. withWorkingDir re-injects the working
 * directory so the planner/executor/evaluator know where they are.
 */
describe('withWorkingDir (#108)', () => {
  const CWD = '/Users/me/dev/harnext-desktop'

  it('appends the working directory to a role prompt', () => {
    const out = withWorkingDir(PLANNER_SYSTEM_PROMPT, CWD)
    expect(out).toContain(`Current working directory: ${CWD}`)
    // The original role instructions are preserved.
    expect(out).toContain('You are the PLANNER')
    // And it discourages disk-wide path hunting.
    expect(out.toLowerCase()).toContain('do not guess paths')
  })

  it('works for every goal stage', () => {
    for (const p of [PLANNER_SYSTEM_PROMPT, GENERATOR_SYSTEM_PROMPT, EVALUATOR_SYSTEM_PROMPT]) {
      expect(withWorkingDir(p, CWD)).toContain(`Current working directory: ${CWD}`)
    }
  })

  it('keeps the cwd line last so it is not buried by the role text', () => {
    const out = withWorkingDir(GENERATOR_SYSTEM_PROMPT, CWD)
    expect(out.indexOf('Current working directory:')).toBeGreaterThan(
      out.indexOf('You are the GENERATOR')
    )
  })
})
