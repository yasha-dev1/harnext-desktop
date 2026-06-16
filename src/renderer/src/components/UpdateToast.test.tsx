// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { UpdateInfo } from '@shared/types'
import { UpdateToast } from './UpdateToast'

const info: UpdateInfo = {
  current: '0.1.16',
  latest: '0.2.0',
  url: 'https://github.com/yasha-dev1/harnext-desktop/releases/tag/v0.2.0',
  isUpdate: true
}

afterEach(cleanup)

describe('UpdateToast (#162)', () => {
  it('shows the available version with both tags', () => {
    render(<UpdateToast info={info} onUpdate={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('Update available')).toBeInTheDocument()
    expect(screen.getByText('v0.1.16 → v0.2.0')).toBeInTheDocument()
  })

  it('fires onUpdate when the primary button is clicked', () => {
    const onUpdate = vi.fn()
    render(<UpdateToast info={info} onUpdate={onUpdate} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('Update now'))
    expect(onUpdate).toHaveBeenCalledOnce()
  })

  it('fires onDismiss when the ✕ is clicked', () => {
    const onDismiss = vi.fn()
    render(<UpdateToast info={info} onUpdate={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText('Dismiss update'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
