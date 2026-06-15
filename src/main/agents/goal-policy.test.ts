import { describe, it, expect } from 'vitest'
import { createPermissionHook } from '@harnext/core'

/**
 * #109: the goal-mode planner/evaluator were created with `permissionMode: 'plan'`,
 * which blocks `bash` entirely — so they couldn't run `git status`/`git diff`/`ls`/
 * `curl` even though their prompts tell them to. The fix runs them under
 * `acceptEdits` with `write`/`edit` disallowed: a read-only shell.
 *
 * This drives core's REAL permission hook to prove the before/after behaviour.
 */
type Policy = Parameters<typeof createPermissionHook>[0]

async function isBlocked(policy: Policy, tool: string): Promise<boolean> {
  const hook = createPermissionHook(policy)
  if (!hook) return false // no hook → the agent runs every tool
  const result = await hook({ toolCall: { name: tool } } as never)
  return Boolean(result && (result as { block?: boolean }).block)
}

const BEFORE: Policy = { permissionMode: 'plan' }
const AFTER: Policy = { permissionMode: 'acceptEdits', disallowedTools: ['write', 'edit'] }

describe('goal-mode read-only-bash policy (#109)', () => {
  it('before: plan mode blocks bash (the bug)', async () => {
    expect(await isBlocked(BEFORE, 'bash')).toBe(true)
  })

  it('after: bash runs — the planner/evaluator get their read-only shell', async () => {
    expect(await isBlocked(AFTER, 'bash')).toBe(false)
  })

  it('after: write and edit stay blocked — no mutation', async () => {
    expect(await isBlocked(AFTER, 'write')).toBe(true)
    expect(await isBlocked(AFTER, 'edit')).toBe(true)
  })

  it('after: the read tool still runs', async () => {
    expect(await isBlocked(AFTER, 'read')).toBe(false)
  })
})
