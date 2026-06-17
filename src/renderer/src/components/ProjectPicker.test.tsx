// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Project } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import ProjectPicker from './ProjectPicker'

const project = { id: 1, name: 'demo', path: '/tmp/demo', isGit: true, branch: 'main' } as Project

/**
 * Regression test for #191: deleting a project must not strand native keyboard
 * focus on the (now-removed) dialog button. The dialog's close path blurs the
 * active element *before* React unmounts the modal, so Electron re-attaches a
 * live text widget when the new-task composer claims focus next.
 */
describe('ProjectPicker — confirm dialog blurs focus before closing (#191)', () => {
  let removeProject: ReturnType<typeof vi.fn>

  beforeEach(() => {
    removeProject = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      projects: [project],
      removeProject: removeProject as never,
      openProjectDialog: vi.fn().mockResolvedValue(null) as never
    })
  })

  const openConfirm = async (): Promise<HTMLElement> => {
    render(<ProjectPicker onOpen={vi.fn()} />)
    await userEvent.click(screen.getByLabelText('Remove demo'))
    return screen.getByText('Remove project').closest('.modal-card') as HTMLElement
  }

  it('blurs the focused Remove button, then removes the project and closes', async () => {
    const modal = await openConfirm()
    const removeBtn = within(modal).getByRole('button', { name: 'Remove' })
    removeBtn.focus()
    expect(document.activeElement).toBe(removeBtn)
    const blurSpy = vi.spyOn(removeBtn, 'blur')

    await userEvent.click(removeBtn)

    // The crux: focus was dropped from the button before it unmounted.
    expect(blurSpy).toHaveBeenCalled()
    expect(removeProject).toHaveBeenCalledWith(1)
    expect(screen.queryByText('Remove project')).toBeNull()
    expect(document.activeElement).not.toBe(removeBtn)
  })

  it('blurs and closes on Cancel without removing the project', async () => {
    const modal = await openConfirm()
    const cancelBtn = within(modal).getByRole('button', { name: 'Cancel' })
    cancelBtn.focus()
    const blurSpy = vi.spyOn(cancelBtn, 'blur')

    await userEvent.click(cancelBtn)

    expect(blurSpy).toHaveBeenCalled()
    expect(removeProject).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove project')).toBeNull()
  })
})
