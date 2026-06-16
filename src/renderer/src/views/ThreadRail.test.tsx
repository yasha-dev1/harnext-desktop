// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { AgentMeta, MessageItem, ToolCallItem } from '@shared/types'
import { Msg, ToolCall } from './AgentDetail'

// The seamless-rail fix (#105) is a CSS rule keyed on the row's class:
// message rows carry a role class (.msg.plan/exec/eval/user) and keep the
// 30px icon offset; tool-call rows are a bare `.msg` and start their rail at
// top:0 so the line is continuous. These tests pin that markup contract so the
// CSS selector (`.msg:not(.user):not(.plan):not(.exec):not(.eval)`) keeps working.

const agent = {
  id: 'a',
  mode: 'goal',
  modelId: null,
  smartModel: 'anthropic/claude',
  execModel: 'anthropic/exec'
} as AgentMeta

const message = (role: MessageItem['role']): MessageItem => ({
  kind: 'message',
  seq: 1,
  role,
  content: 'hello',
  verdict: null,
  createdAt: 0
})
const toolCall: ToolCallItem = {
  kind: 'tool',
  seq: 2,
  role: 'plan',
  toolCallId: 't2',
  toolName: 'read',
  args: { path: 'a.ts' },
  result: 'ok',
  isError: false,
  startedAt: 0,
  endedAt: 1
}

const ROLE_CLASSES = ['user', 'plan', 'exec', 'eval']

describe('thread rail markup contract (#105)', () => {
  it('message rows carry their role class (rail keeps the icon offset)', () => {
    for (const role of ROLE_CLASSES as MessageItem['role'][]) {
      const { container } = render(<Msg m={message(role)} agent={agent} />)
      const row = container.querySelector('.msg')!
      expect(row).toHaveClass(role)
    }
  })

  it('tool-call rows are a bare .msg with no role class (rail starts at top)', () => {
    const { container } = render(<ToolCall t={toolCall} />)
    const row = container.querySelector('.msg')!
    expect(row).toBeInTheDocument()
    for (const c of ROLE_CLASSES) expect(row).not.toHaveClass(c)
  })
})
