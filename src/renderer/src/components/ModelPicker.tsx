import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from './icons'
import { Popover } from './Popover'

/**
 * Searchable model dropdown — a custom combobox that replaces the native
 * `<select>` model pickers across the app. Type to filter, ↑/↓ to move,
 * Enter to select, Esc / click-outside to close. A `value` not present in
 * `models` is preserved and shown (mirrors the old prepend behaviour).
 */
export function ModelPicker({
  value,
  models,
  onChange,
  mono = false,
  placeholder = 'Search models…',
  icon
}: {
  value: string
  models: string[]
  onChange: (v: string) => void
  mono?: boolean
  placeholder?: string
  /** Optional leading brand/icon per option, shown on the trigger and in the list. */
  icon?: (value: string) => JSX.Element
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()

  const all = useMemo(
    () => (value && !models.includes(value) ? [value, ...models] : models),
    [value, models]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? all.filter((m) => m.toLowerCase().includes(q)) : all
  }, [all, query])
  // Clamp the highlight during render (avoids a cascading setState-in-effect).
  const hiSafe = filtered.length ? Math.min(Math.max(0, hi), filtered.length - 1) : 0

  const openMenu = (): void => {
    setQuery('')
    const idx = all.indexOf(value)
    setHi(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  // Focus the search box when the menu opens — with preventScroll so focusing
  // the portaled, off-screen-for-a-frame input never scrolls the Settings panel
  // (the layout-shift half of #102; `autoFocus` did exactly that).
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])

  // Keep the highlighted row scrolled into view (DOM side-effect only).
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-idx="${hiSafe}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [hiSafe, open])

  const choose = (m: string): void => {
    onChange(m)
    setOpen(false)
  }

  const onKey = (e: ReactKeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi(Math.min(filtered.length - 1, hiSafe + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi(Math.max(0, hiSafe - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[hiSafe]) choose(filtered[hiSafe])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={'mp' + (mono ? ' mono' : '')} ref={rootRef}>
      <button
        type="button"
        className="mp-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        {icon && value && <span className="mp-ic">{icon(value)}</span>}
        <span className="mp-val">{value || placeholder}</span>
        <Icon.chevron size={12} />
      </button>
      <Popover open={open} anchorRef={rootRef} onClose={() => setOpen(false)} className="mp-pop">
        <div role="listbox">
          <div className="mp-search">
            <Icon.search size={13} />
            <input
              ref={inputRef}
              value={query}
              placeholder={placeholder}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              role="combobox"
              aria-expanded={open}
              aria-controls={baseId}
              aria-activedescendant={filtered[hiSafe] ? `${baseId}-${hiSafe}` : undefined}
            />
          </div>
          <div className="mp-list" id={baseId} ref={listRef}>
            {filtered.length === 0 && <div className="mp-empty">No models match</div>}
            {filtered.map((m, i) => (
              <div
                key={m}
                id={`${baseId}-${i}`}
                data-idx={i}
                role="option"
                aria-selected={m === value}
                className={'mp-opt' + (i === hiSafe ? ' hi' : '') + (m === value ? ' sel' : '')}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(m)
                }}
              >
                <span className="mp-check">{m === value && <Icon.check size={12} />}</span>
                {icon && <span className="mp-ic">{icon(m)}</span>}
                <span className="mp-opt-label">{m}</span>
              </div>
            ))}
          </div>
        </div>
      </Popover>
    </div>
  )
}
