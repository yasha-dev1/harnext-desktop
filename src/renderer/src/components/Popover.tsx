import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSX, ReactNode, RefObject } from 'react'

interface PopoverProps {
  open: boolean
  /** The trigger to anchor the menu to. */
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  /** Applied to the portaled menu element (e.g. `mp-pop`); supplies the visuals. */
  className?: string
  /** Gap between the trigger and the menu. */
  gap?: number
}

interface Pos {
  left: number
  top?: number | 'auto'
  bottom?: number
}

/**
 * A clip-proof dropdown menu: renders `children` in a portal on `document.body`
 * with `position: fixed`, positioned from the trigger's rect. It flips up/down by
 * the real available space, follows the trigger on scroll/resize, and closes on
 * outside-click / Esc. Because it escapes the DOM, no `overflow: hidden` ancestor
 * can clip it and opening it never shifts the surrounding layout (#101).
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  children,
  className,
  gap = 5
}: PopoverProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  const place = (): void => {
    const a = anchorRef.current
    const m = menuRef.current
    if (!a) return
    const r = a.getBoundingClientRect()
    const h = m?.offsetHeight ?? 0
    const w = m?.offsetWidth ?? 280
    const below = window.innerHeight - r.bottom
    const above = r.top
    // Flip up only once we know the height and it genuinely won't fit below.
    const up = h > 0 && below < h + gap + 8 && above > below
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      top: up ? 'auto' : r.bottom + gap,
      bottom: up ? window.innerHeight - r.top + gap : undefined
    })
  }

  // Position before paint; re-measure on the next frame to flip up if needed.
  // Measuring the anchor/menu rects requires a layout effect that setStates the
  // position — the legitimate DOM-sync exception to set-state-in-effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return
    const onMove = (): void => place()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    // capture: catch scrolls in any ancestor, not just window.
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      ref={menuRef}
      className={className}
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top,
        bottom: pos?.bottom,
        zIndex: 1000,
        // Hide for the first (unmeasured) frame to avoid a flicker before flip.
        visibility: pos ? 'visible' : 'hidden'
      }}
    >
      {children}
    </div>,
    document.body
  )
}
