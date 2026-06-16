// Gates the goal-mode planner → executor handoff (#110).
//
// runGoal used to advance to the executor on *any* non-empty planner output, so
// a planner that got blocked and ended its turn with a question ("I can't fetch
// the issue — paste the details") had that question implemented as if it were a
// spec. A real plan is only ready when the planner signals completion by calling
// the plan-mode `exit_plan` tool. These pure helpers encode that, so the gate
// is unit-testable without the session machinery.

/**
 * Whether a tool-execution event names the plan-mode "present the plan" tool.
 * Robust to both the native name (`exit_plan`) and the canonical SDK name
 * (`ExitPlanMode`) by folding to letters only.
 */
export function isExitPlanTool(toolName: string): boolean {
  const n = toolName.toLowerCase().replace(/[^a-z]/g, '')
  return n === 'exitplan' || n === 'exitplanmode'
}

/**
 * Pull the plan markdown out of an `exit_plan` tool call's arguments. The tool
 * schema names it `plan`; tolerate a `blueprint` alias and stray whitespace.
 */
export function exitPlanArg(args: Record<string, unknown>): string {
  const raw = args.plan ?? args.blueprint
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Whether the planner genuinely produced a plan ready for the executor.
 * Requires BOTH that the planner presented a plan via `exit_plan` AND a
 * non-empty blueprint; otherwise it merely asked a question / got blocked and
 * the executor must not run — the run pauses and surfaces the planner's message.
 */
export function plannerProducedPlan(
  presentedExitPlan: boolean,
  blueprint: string | null | undefined
): boolean {
  return presentedExitPlan && !!blueprint && blueprint.trim().length > 0
}
