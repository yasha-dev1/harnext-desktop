// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EffortPicker } from './EffortPicker'

// Reference example for the renderer DOM harness (#146): a real component
// rendered into jsdom, driven with userEvent, asserted with jest-dom matchers.
describe('EffortPicker', () => {
  it('renders the current level as the selected option', () => {
    render(<EffortPicker value="medium" onChange={() => {}} />)
    const select = screen.getByRole('combobox', { name: 'Reasoning effort' })
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('medium')
    // All six levels are offered regardless of model.
    expect(screen.getAllByRole('option')).toHaveLength(6)
  })

  it('calls onChange with the chosen level when the user picks one', async () => {
    const onChange = vi.fn()
    render(<EffortPicker value="off" onChange={onChange} />)
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Reasoning effort' }), 'high')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('high')
  })
})
