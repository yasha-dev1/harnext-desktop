// Case-insensitive substring filter for the titlebar branch switcher (#136), so
// a long branch list can be narrowed by typing. Pure, so it's unit-testable.

/** Branches whose name contains `query` (case-insensitive). Blank query → all. */
export function filterBranches(branches: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return branches
  return branches.filter((b) => b.toLowerCase().includes(q))
}
