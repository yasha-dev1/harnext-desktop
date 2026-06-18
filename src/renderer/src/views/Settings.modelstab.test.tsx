// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppSettings } from '@shared/types'
import { ModelsTab } from './Settings'
import { toPickerGroups } from '../lib/model-picker'

// Two connected providers — the #103 acceptance scenario.
const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    authenticated: true,
    models: ['claude-opus-4-8', 'claude-sonnet-4-6']
  },
  { id: 'openrouter', name: 'OpenRouter', authenticated: true, models: ['deepseek/deepseek-chat'] }
]
const GROUPS = toPickerGroups(PROVIDERS)
const IDS = PROVIDERS.map((p) => p.id)

const SETTINGS = {
  provider: 'anthropic',
  model: 'anthropic:claude-opus-4-8',
  smart: 'anthropic:claude-opus-4-8',
  executor: 'anthropic:claude-sonnet-4-6',
  thinkingLevel: 'medium',
  mode: 'acceptEdits',
  evalLoop: true
} as AppSettings

function renderTab(): { save: ReturnType<typeof vi.fn> } {
  const save = vi.fn()
  render(<ModelsTab settings={SETTINGS} save={save} groups={GROUPS} providerIds={IDS} />)
  return { save }
}

describe('ModelsTab — cross-provider model selection (#103)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('the default-model picker lists models from every connected provider', async () => {
    const user = userEvent.setup()
    renderTab()
    // The default model trigger shows the friendly label of the current ref.
    await user.click(screen.getByRole('button', { name: /claude-opus-4-8/ }))
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText('OpenRouter')).toBeInTheDocument()
    expect(screen.getByText('deepseek/deepseek-chat')).toBeInTheDocument()
  })

  it('stores the provider-qualified ref when a cross-provider model is chosen', async () => {
    const user = userEvent.setup()
    const { save } = renderTab()
    await user.click(screen.getByRole('button', { name: /claude-opus-4-8/ }))
    await user.click(screen.getByText('deepseek/deepseek-chat'))
    expect(save).toHaveBeenCalledWith({ model: 'openrouter:deepseek/deepseek-chat' })
  })

  it('lets the goal-mode executor run on a different provider than the smart model', async () => {
    const user = userEvent.setup()
    const { save } = renderTab()
    // Smart/executor live under Advanced — expand it.
    await user.click(screen.getByRole('button', { name: /Advanced/ }))
    // The executor trigger currently shows the Anthropic sonnet label; open it…
    const executorTrigger = screen.getByRole('button', { name: /claude-sonnet-4-6/ })
    await user.click(executorTrigger)
    // …and pick the OpenRouter model. Smart stays on Anthropic (untouched).
    await user.click(screen.getByText('deepseek/deepseek-chat'))
    expect(save).toHaveBeenCalledWith({ executor: 'openrouter:deepseek/deepseek-chat' })
  })

  it('shows a legacy bare selection as its model label, not the raw ref', () => {
    const save = vi.fn()
    render(
      <ModelsTab
        settings={{ ...SETTINGS, model: 'claude-opus-4-8' } as AppSettings}
        save={save}
        groups={GROUPS}
        providerIds={IDS}
      />
    )
    // A bare legacy id normalizes to a ref under the default provider for display.
    const trigger = screen.getByRole('button', { name: /claude-opus-4-8/ })
    expect(within(trigger).queryByText(/anthropic:/)).toBeNull()
  })
})
