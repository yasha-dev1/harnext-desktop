import { useRef } from 'react'
import type { JSX } from 'react'
import type { Attachment } from '../lib/attachments'
import { Icon } from './icons'

/** A small "image" glyph (the icon set has none). */
function ImageGlyph({ size = 15 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.5" cy="9.5" r="1.7" fill="currentColor" />
      <path
        d="M4 17l5-5 4 4 3-2 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AttachButton({
  onPick,
  disabled
}: {
  onPick: (files: FileList | null) => void
  disabled?: boolean
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        className="attach-btn"
        title="Attach images"
        aria-label="Attach images"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        <ImageGlyph size={15} />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onPick(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )
}

export function AttachmentBar({
  items,
  onRemove
}: {
  items: Attachment[]
  onRemove: (id: string) => void
}): JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div className="attach-bar">
      {items.map((a) => (
        <div className="attach-chip" key={a.id} title={a.name}>
          <img src={a.dataUrl} alt={a.name} />
          <button
            className="attach-x"
            title="Remove"
            aria-label="Remove"
            onClick={() => onRemove(a.id)}
          >
            <Icon.x size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Inline images on a transcript message. */
export function MessageImages({ images }: { images: string[] }): JSX.Element {
  return (
    <div className="msg-images">
      {images.map((src, i) => (
        <img key={i} src={src} alt="attachment" />
      ))}
    </div>
  )
}
