// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FailurePanel } from './FailurePanel'

// A realistic raw failure: the meaningful cause buried under repeated
// "variable is not set" warnings (the #118 repro shape).
const RAW = [
  'WARN[0000] The "POSTGRES_USER" variable is not set. Defaulting to a blank string.',
  'WARN[0000] The "REDIS_URL" variable is not set. Defaulting to a blank string.',
  'WARN[0000] The "API_KEY" variable is not set. Defaulting to a blank string.',
  'Error response from daemon: Conflict. The container name "/redis-master" is already in use.'
].join('\n')

describe('FailurePanel — structured failure, not a wall of text (#118)', () => {
  it('headlines the real cause and collapses the noisy log by default', () => {
    render(<FailurePanel error={RAW} onDismiss={() => {}} />)
    // The concise cause is shown…
    expect(
      screen.getByText(/container name "\/redis-master" is already in use/i)
    ).toBeInTheDocument()
    // …and the raw warning lines are NOT dumped into the view.
    expect(screen.queryByText(/POSTGRES_USER/)).not.toBeInTheDocument()
    // Known-shape guidance is surfaced.
    expect(screen.getByText(/Stop your local stack/i)).toBeInTheDocument()
  })

  it('reveals a cleaned, collapsible full log on demand', async () => {
    render(<FailurePanel error={RAW} onDismiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Show full log/i }))
    // The full log appears, with the repetitive warnings summarised, not listed.
    expect(screen.getByText(/warnings hidden/i)).toBeInTheDocument()
  })

  it('wires Dismiss and Retry', async () => {
    const onDismiss = vi.fn()
    const onRetry = vi.fn()
    render(<FailurePanel error={RAW} onDismiss={onDismiss} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    // Both the header ✕ and the footer button dismiss; click the footer one.
    const dismiss = screen.getAllByRole('button', { name: /Dismiss/i })
    await userEvent.click(dismiss[dismiss.length - 1])
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('omits the collapsible log for a short single-line error', () => {
    render(<FailurePanel error="Invalid API key." onDismiss={() => {}} />)
    expect(screen.getByText('Invalid API key.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show full log/i })).not.toBeInTheDocument()
  })
})
