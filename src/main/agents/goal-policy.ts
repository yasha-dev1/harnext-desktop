/**
 * Goal-mode permission policy (#109).
 *
 * The goal-mode planner and evaluator need a *read-only shell*: their prompts
 * tell them to run `git status` / `git diff`, `ls`, `cat`, `curl` to inspect
 * the repo and review the diff — but they must never mutate the working tree.
 *
 * They used to run under `permissionMode: 'plan'`, which blocks `bash` outright
 * (core classifies `bash` as mutating), so every shell command was denied and
 * the prompt's promise was a lie. Instead we run them under `acceptEdits` with
 * `write`/`edit` hidden and blocked: the shell works, the tree can't be edited.
 *
 * `wouldBlockTool` mirrors @harnext/core's headless `createPermissionHook` for
 * the modes goal mode uses, so the policy can be unit-tested in CI *without*
 * importing `@harnext/core` (a local sibling package that CI stubs out). Core's
 * `tool-policy.ts` is the source of truth; the read-only/mutating sets below are
 * copied verbatim from it.
 */

export interface GoalPolicy {
  permissionMode: 'plan' | 'acceptEdits' | 'bypassPermissions'
  disallowedTools?: readonly string[]
}

/**
 * The read-only-shell policy applied to the goal-mode planner and evaluator.
 * `acceptEdits` lets `bash`/`read` run; `write`/`edit` are disallowed so the
 * working tree stays untouched while they plan and review.
 */
export const READ_ONLY_BASH = {
  permissionMode: 'acceptEdits',
  disallowedTools: ['write', 'edit']
} as const satisfies GoalPolicy

// Copied from @harnext/core src/tool-policy.ts (the source of truth).
const READ_ONLY_NATIVE = new Set(['read', 'todo', 'exit_plan', 'bash_output', 'kill_shell'])
const MUTATING_NATIVE = new Set(['bash', 'write', 'edit'])

// Canonical (Claude-SDK) names whose lowercase differs from the native name.
const CANONICAL_LOWER_TO_NATIVE: Record<string, string> = {
  todowrite: 'todo',
  exitplanmode: 'exit_plan',
  bashoutput: 'bash_output',
  killshell: 'kill_shell'
}

/**
 * Reduce a tool name to its native comparison key, alias-aware: `Bash`→`bash`,
 * `TodoWrite`→`todo`. Mirrors core's `normalizeToolName`.
 */
export function normalizeToolName(name: string): string {
  const lower = name.trim().toLowerCase()
  return CANONICAL_LOWER_TO_NATIVE[lower] ?? lower
}

/**
 * Would a call to `tool` be blocked under `policy`? Models @harnext/core's
 * headless permission hook for the modes goal mode uses (`plan` /
 * `acceptEdits` / `bypassPermissions`). `true` = denied (the model gets an
 * error); `false` = the tool runs.
 */
export function wouldBlockTool(policy: GoalPolicy, tool: string): boolean {
  const native = normalizeToolName(tool)
  const disallowed = policy.disallowedTools ?? []
  // Disallowed always wins, in every mode.
  if (disallowed.some((rule) => normalizeToolName(rule) === native)) return true

  switch (policy.permissionMode) {
    case 'bypassPermissions':
      return false
    case 'plan':
      if (READ_ONLY_NATIVE.has(native)) return false
      if (MUTATING_NATIVE.has(native)) return true
      // Unknown (e.g. MCP) tools aren't pre-approved while planning → blocked.
      return true
    case 'acceptEdits':
    default:
      // Headless: once the disallow check passes, the tool runs.
      return false
  }
}
