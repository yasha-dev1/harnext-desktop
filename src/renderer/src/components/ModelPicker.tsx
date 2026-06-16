import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from './icons'
import { Popover } from './Popover'

/** One selectable model within a provider group (#103). `value` is the stored
 * (typically provider-qualified) ref; `label` is what the user sees. */
export interface ModelGroupOption {
  value: string
  label?: string
}

/** A provider's models, shown under a labelled header in the picker (#103). */
export interface ModelPickerGroup {
  label: string
  options: ModelGroupOption[]
}

/**
 * Searchable model dropdown — a custom combobox that replaces the native
 * `<select>` model pickers across the app. Type to filter, ↑/↓ to move,
 * Enter to select, Esc / click-outside to close. A `value` not present in
 * the option set is preserved and shown (mirrors the old prepend behaviour).
 *
 * Two modes: pass a flat `models` list (single provider, today's behaviour), or
 * pass `groups` to list models across **all connected providers** under
 * per-provider headers (#103). With `groups`, each option's stored value is its
 * qualified ref while the list shows the friendlier `label`.
 */
export function ModelPicker({
  value,
  models = [],
  groups,
  onChange,
  mono = false,
  placeholder = 'Search models…',
  icon
}: {
  value: string
  models?: string[]
  groups?: ModelPickerGroup[]
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

  // Flat list of option values the filter/keyboard logic operates on — derived
  // from `groups` when grouped, else the plain `models` list.
  const optionValues = useMemo(
    () => (groups ? groups.flatMap((g) => g.options.map((o) => o.value)) : models),
    [groups, models]
  )
  // value → { group label, display label } for grouped rendering.
  const meta = useMemo(() => {
    const m = new Map<string, { group: string; label: string }>()
    groups?.forEach((g) =>
      g.options.forEach((o) => m.set(o.value, { group: g.label, label: o.label ?? o.value }))
    )
    return m
  }, [groups])
  const labelFor = (v: string): string => meta.get(v)?.label ?? v

  const all = useMemo(
    () => (value && !optionValues.includes(value) ? [value, ...optionValues] : optionValues),
    [value, optionValues]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((m) => {
      const lbl = meta.get(m)?.label ?? m
      return m.toLowerCase().includes(q) || lbl.toLowerCase().includes(q)
    })
  }, [all, query, meta])
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
        <span className="mp-val">{value ? labelFor(value) : placeholder}</span>
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
            {filtered.map((m, i) => {
              // Insert a provider header when the group changes (grouped mode).
              const group = meta.get(m)?.group
              const prevGroup = i > 0 ? meta.get(filtered[i - 1])?.group : undefined
              const header = group && group !== prevGroup ? group : null
              return (
                <div key={m}>
                  {header && <div className="mp-group">{header}</div>}
                  <div
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
                    <span className="mp-opt-label">{labelFor(m)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Popover>
    </div>
  )
}
