// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModelPicker } from './ModelPicker'

const MODELS = ['anthropic/opus', 'anthropic/sonnet', 'openai/gpt-5']

describe('ModelPicker — open without scroll-jumping the page (#102)', () => {
  let focusSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Spy on focus to assert HOW the search input is focused.
    focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')
    // jsdom doesn't implement scrollIntoView — stub it so the highlight effect is a no-op.
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('focuses the search box with preventScroll when opened', async () => {
    const user = userEvent.setup()
    render(<ModelPicker value="anthropic/opus" models={MODELS} onChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: /anthropic\/opus/ }))

    const search = screen.getByRole('combobox')
    expect(search).toHaveFocus()
    // The fix: focus is called with { preventScroll: true } (not the old autoFocus,
    // which scrolled the Settings panel to the off-screen portaled input).
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('still lets you filter and pick a model', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelPicker value="anthropic/opus" models={MODELS} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /anthropic\/opus/ }))
    await user.type(screen.getByRole('combobox'), 'gpt')
    await user.click(screen.getByText('openai/gpt-5'))
    expect(onChange).toHaveBeenCalledWith('openai/gpt-5')
  })
})
