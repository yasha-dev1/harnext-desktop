// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UpdateInfo } from '@shared/types'
import { UpdateBanner } from './UpdateBanner'

const setApi = (checkForUpdate: () => Promise<UpdateInfo>): ReturnType<typeof vi.fn> => {
  const openExternal = vi.fn().mockResolvedValue(undefined)
  ;(window as unknown as { api: unknown }).api = {
    onAgentEvent: () => () => {},
    checkForUpdate: vi.fn(checkForUpdate),
    openExternal
  }
  return openExternal
}

const info = (over: Partial<UpdateInfo>): UpdateInfo => ({
  current: '0.1.14',
  latest: 'v0.2.0',
  url: 'https://github.com/yasha-dev1/harnext-desktop/releases/tag/v0.2.0',
  isUpdate: true,
  ...over
})

beforeEach(() => vi.restoreAllMocks())

describe('UpdateBanner — startup update toast (#162)', () => {
  it('shows the toast with the latest version when an update is available', async () => {
    setApi(async () => info({}))
    render(<UpdateBanner />)
    expect(await screen.findByText('Update available')).toBeInTheDocument()
    expect(screen.getByText(/v0\.2\.0/)).toBeInTheDocument()
    expect(screen.getByText(/you’re on 0\.1\.14/)).toBeInTheDocument()
  })

  it('opens the release page when Update is clicked', async () => {
    const openExternal = setApi(async () => info({}))
    render(<UpdateBanner />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update' }))
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/yasha-dev1/harnext-desktop/releases/tag/v0.2.0'
    )
  })

  it('dismisses and does not nag again', async () => {
    setApi(async () => info({}))
    render(<UpdateBanner />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  })

  it('renders nothing when already up to date', async () => {
    setApi(async () => info({ isUpdate: false, latest: 'v0.1.14' }))
    render(<UpdateBanner />)
    // Give the resolved check a tick; the toast must never appear.
    await waitFor(() => expect(window.api.checkForUpdate).toHaveBeenCalled())
    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  })

  it('stays silent when the check fails', async () => {
    setApi(async () => {
      throw new Error('offline')
    })
    render(<UpdateBanner />)
    await waitFor(() => expect(window.api.checkForUpdate).toHaveBeenCalled())
    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  })
})
