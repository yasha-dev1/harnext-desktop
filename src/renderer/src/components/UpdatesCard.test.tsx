// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { UpdateInfo } from '@shared/types'
import { UpdatesCard } from './UpdatesCard'

function setApi(over: Record<string, unknown>): void {
  ;(window as unknown as { api: unknown }).api = { onAgentEvent: () => () => {}, ...over }
}

const upToDate: UpdateInfo = { current: '0.1.18', latest: '0.1.18', url: null, isUpdate: false }
const available: UpdateInfo = {
  current: '0.1.18',
  latest: '0.2.0',
  url: 'https://example.test/release',
  isUpdate: true
}

afterEach(cleanup)
beforeEach(() => setApi({}))

describe('UpdatesCard (#125)', () => {
  it('checks on click and reports up-to-date', async () => {
    const checkForUpdate = vi.fn().mockResolvedValue(upToDate)
    setApi({ checkForUpdate })
    render(<UpdatesCard />)
    fireEvent.click(screen.getByText('Check for updates'))
    expect(checkForUpdate).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.getByText(/on the latest version \(v0\.1\.18\)/)).toBeInTheDocument()
    )
    // No download link when up to date.
    expect(screen.queryByText('Download')).toBeNull()
  })

  it('surfaces an available update with a Download link that opens the release', async () => {
    const openExternal = vi.fn()
    setApi({ checkForUpdate: vi.fn().mockResolvedValue(available), openExternal })
    render(<UpdatesCard />)
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => expect(screen.getByText(/Update available/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Download'))
    expect(openExternal).toHaveBeenCalledWith('https://example.test/release')
  })

  it('does not throw when the bridge lacks checkForUpdate', async () => {
    render(<UpdatesCard />)
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => expect(screen.getByText(/Could not check for updates/)).toBeInTheDocument())
  })
})
