import { describe, it, expect } from 'vitest'
import { READ_ONLY_BASH, wouldBlockTool, normalizeToolName, type GoalPolicy } from './goal-policy'

/**
 * #109: the goal-mode planner/evaluator were created with `permissionMode: 'plan'`,
 * which blocks `bash` entirely — so they couldn't run `git status`/`git diff`/`ls`/
 * `curl` even though their prompts tell them to. The fix runs them under
 * `acceptEdits` with `write`/`edit` disallowed: a read-only shell.
 *
 * `wouldBlockTool` mirrors @harnext/core's headless permission hook, so this
 * proves the before/after behaviour without importing core (stubbed in CI).
 */

const BEFORE: GoalPolicy = { permissionMode: 'plan' }
const AFTER: GoalPolicy = READ_ONLY_BASH

describe('goal-mode read-only-bash policy (#109)', () => {
  it('before: plan mode blocks bash (the bug)', () => {
    expect(wouldBlockTool(BEFORE, 'bash')).toBe(true)
  })

  it('before: plan mode allows the read tool (so it was bash specifically that broke)', () => {
    expect(wouldBlockTool(BEFORE, 'read')).toBe(false)
  })

  it('after: bash runs — the planner/evaluator get their read-only shell', () => {
    expect(wouldBlockTool(AFTER, 'bash')).toBe(false)
  })

  it('after: write and edit stay blocked — no mutation of the working tree', () => {
    expect(wouldBlockTool(AFTER, 'write')).toBe(true)
    expect(wouldBlockTool(AFTER, 'edit')).toBe(true)
  })

  it('after: the read tool still runs', () => {
    expect(wouldBlockTool(AFTER, 'read')).toBe(false)
  })

  it('after: background-shell inspection tools (bash_output, kill_shell) run', () => {
    expect(wouldBlockTool(AFTER, 'bash_output')).toBe(false)
    expect(wouldBlockTool(AFTER, 'kill_shell')).toBe(false)
  })

  it('matches Claude-SDK canonical tool names too (Bash/Write/Edit)', () => {
    expect(wouldBlockTool(AFTER, 'Bash')).toBe(false)
    expect(wouldBlockTool(AFTER, 'Write')).toBe(true)
    expect(wouldBlockTool(AFTER, 'Edit')).toBe(true)
  })

  it('READ_ONLY_BASH is the read-only-shell policy applied in goal mode', () => {
    expect(READ_ONLY_BASH.permissionMode).toBe('acceptEdits')
    expect([...READ_ONLY_BASH.disallowedTools]).toEqual(['write', 'edit'])
  })

  it('normalizeToolName folds canonical names to native', () => {
    expect(normalizeToolName('Bash')).toBe('bash')
    expect(normalizeToolName('TodoWrite')).toBe('todo')
    expect(normalizeToolName('ExitPlanMode')).toBe('exit_plan')
  })
})
