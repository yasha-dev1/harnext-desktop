// harnext — stroke icons (feather-style), ported from the design system.
/* eslint-disable react-refresh/only-export-components */
import type { JSX, ReactNode, SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
  sw?: number
}

const Svg = ({
  size = 16,
  sw = 1.6,
  fill = 'none',
  children,
  ...p
}: IconProps & { children: ReactNode }): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {children}
  </svg>
)

export type IconName = keyof typeof Icon

export const Icon = {
  plus: (p: IconProps) => (
    <Svg {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  ),
  chevron: (p: IconProps) => (
    <Svg {...p}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  ),
  chevronR: (p: IconProps) => (
    <Svg {...p}>
      <polyline points="9 6 15 12 9 18" />
    </Svg>
  ),
  chevronL: (p: IconProps) => (
    <Svg {...p}>
      <polyline points="15 18 9 12 15 6" />
    </Svg>
  ),
  arrowR: (p: IconProps) => (
    <Svg {...p}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Svg>
  ),
  arrowL: (p: IconProps) => (
    <Svg {...p}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </Svg>
  ),
  x: (p: IconProps) => (
    <Svg {...p}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Svg>
  ),
  wcMin: (p: IconProps) => (
    <Svg {...p} sw={1.4}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  ),
  wcMax: (p: IconProps) => (
    <Svg {...p} sw={1.4}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </Svg>
  ),
  branch: (p: IconProps) => (
    <Svg {...p}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Svg>
  ),
  merge: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </Svg>
  ),
  folder: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 5h5l2 2.5h9a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V6.5A1.5 1.5 0 0 1 4 5Z" />
    </Svg>
  ),
  folderOpen: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h7.5A1.5 1.5 0 0 1 20 10" />
      <path d="M2.5 11.5h18l-2.2 7.2a1 1 0 0 1-1 .8H5.7a1 1 0 0 1-1-.8Z" />
    </Svg>
  ),
  file: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 3 14 8 19 8" />
    </Svg>
  ),
  fileCode: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 3 14 8 19 8" />
      <polyline points="9.5 13 8 14.5 9.5 16" />
      <polyline points="13.5 13 15 14.5 13.5 16" />
    </Svg>
  ),
  diff: (p: IconProps) => (
    <Svg {...p}>
      <line x1="12" y1="3" x2="12" y2="9" />
      <line x1="9" y1="6" x2="15" y2="6" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </Svg>
  ),
  play: (p: IconProps) => (
    <Svg {...p}>
      <polygon points="6 4 19 12 6 20 6 4" />
    </Svg>
  ),
  pause: (p: IconProps) => (
    <Svg {...p}>
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </Svg>
  ),
  stop: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </Svg>
  ),
  alert: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </Svg>
  ),
  spark: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </Svg>
  ),
  brain: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8" />
      <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8" />
      <line x1="9" y1="4" x2="9" y2="20" opacity=".5" />
      <line x1="15" y1="4" x2="15" y2="20" opacity=".5" />
    </Svg>
  ),
  zap: (p: IconProps) => (
    <Svg {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  ),
  terminal: (p: IconProps) => (
    <Svg {...p}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </Svg>
  ),
  edit: (p: IconProps) => (
    <Svg {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </Svg>
  ),
  eye: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.7" y2="16.7" />
    </Svg>
  ),
  settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  ),
  key: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11 21 21" />
      <path d="M18 18l2-2M15.5 15.5 17.5 13.5" />
    </Svg>
  ),
  cube: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 2 3 7v10l9 5 9-5V7Z" />
      <path d="m3 7 9 5 9-5" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </Svg>
  ),
  trash: (p: IconProps) => (
    <Svg {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  ),
  refresh: (p: IconProps) => (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </Svg>
  ),
  clock: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </Svg>
  ),
  external: (p: IconProps) => (
    <Svg {...p}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Svg>
  ),
  send: (p: IconProps) => (
    <Svg {...p}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Svg>
  ),
  bolt: (p: IconProps) => (
    <Svg {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  ),
  layers: (p: IconProps) => (
    <Svg {...p}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3Z" />
    </Svg>
  ),
  user: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  ),
  loop: (p: IconProps) => (
    <Svg {...p}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Svg>
  ),
  check2: (p: IconProps) => (
    <Svg {...p} sw={2}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  )
}

export function Logo({ cls = 'tb-logo' }: { cls?: string }): JSX.Element {
  return (
    <svg className={'logo ' + cls} viewBox="0 0 60 64" aria-hidden="true">
      <use href="#logoMark" />
    </svg>
  )
}
