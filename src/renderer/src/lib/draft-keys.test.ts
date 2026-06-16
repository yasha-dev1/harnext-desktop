import { describe, it, expect } from 'vitest'
import { projectDraftKey, agentDraftKey } from './draft-keys'

describe('composer draft keys (#132)', () => {
  it('namespaces project (Compose) and agent (follow-up) drafts distinctly', () => {
    expect(projectDraftKey(7)).toBe('project:7')
    expect(agentDraftKey('abc-123')).toBe('agent:abc-123')
    // A project id and an agent id never collide.
    expect(projectDraftKey(7)).not.toBe(agentDraftKey('7'))
  })
})
