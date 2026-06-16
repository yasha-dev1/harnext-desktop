// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModelPicker, type ModelPickerGroup } from './ModelPicker'

// Cross-provider grouping for #103: each option's stored value is the qualified
// ref (`provider:modelId`) while the list shows the friendly modelId under a
// provider header.
const GROUPS: ModelPickerGroup[] = [
  {
    label: 'Anthropic',
    options: [
      { value: 'anthropic:claude-opus-4-8', label: 'claude-opus-4-8' },
      { value: 'anthropic:claude-sonnet-4-6', label: 'claude-sonnet-4-6' }
    ]
  },
  {
    label: 'OpenRouter',
    options: [{ value: 'openrouter:deepseek/deepseek-chat', label: 'deepseek/deepseek-chat' }]
  }
]

describe('ModelPicker — cross-provider grouping (#103)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the friendly label (not the raw ref) on the trigger', () => {
    render(<ModelPicker value="anthropic:claude-opus-4-8" groups={GROUPS} onChange={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('claude-opus-4-8')
    expect(screen.getByRole('button')).not.toHaveTextContent('anthropic:')
  })

  it('renders a header per provider and the models beneath them', async () => {
    const user = userEvent.setup()
    render(<ModelPicker value="anthropic:claude-opus-4-8" groups={GROUPS} onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText('OpenRouter')).toBeInTheDocument()
    expect(screen.getByText('deepseek/deepseek-chat')).toBeInTheDocument()
  })

  it('emits the qualified ref (not the label) when a model is chosen', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelPicker value="anthropic:claude-opus-4-8" groups={GROUPS} onChange={onChange} />)
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('deepseek/deepseek-chat'))
    expect(onChange).toHaveBeenCalledWith('openrouter:deepseek/deepseek-chat')
  })

  it('filters across providers by the friendly label', async () => {
    const user = userEvent.setup()
    render(<ModelPicker value="anthropic:claude-opus-4-8" groups={GROUPS} onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    await user.type(screen.getByRole('combobox'), 'deepseek')
    expect(screen.getByText('deepseek/deepseek-chat')).toBeInTheDocument()
    expect(screen.queryByText('claude-sonnet-4-6')).toBeNull()
  })
})
