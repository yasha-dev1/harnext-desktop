// Keys for the per-surface composer drafts persisted in the store (#132), so an
// unsent message survives navigating away from the conversation and back.

/** Draft key for the new-agent Compose box of a project. */
export function projectDraftKey(projectId: number): string {
  return `project:${projectId}`
}

/** Draft key for a conversation's follow-up composer. */
export function agentDraftKey(agentId: string): string {
  return `agent:${agentId}`
}
