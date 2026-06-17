// Case-insensitive title filter for the sidebar conversation search (#116), so
// a conversation can be found among many. Pure, so it's unit-testable.

/** Conversations whose title contains `query` (case-insensitive). Blank → all. */
export function filterConversations<T extends { title: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((a) => a.title.toLowerCase().includes(q))
}
