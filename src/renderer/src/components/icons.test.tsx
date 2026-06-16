// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon } from './icons'

describe('Icon.settings — cog/gear, not two concentric circles (#112)', () => {
  it('renders a gear: a cog path plus a single centre circle', () => {
    const { container } = render(<Icon.settings />)
    const svg = container.querySelector('svg')!
    expect(svg).toBeInTheDocument()

    // The gear outline is a <path> (the bug shipped only <circle> elements).
    expect(svg.querySelector('path')).not.toBeNull()

    // Exactly one circle — the centre hub — not the old r=3 + r=9 pair.
    const circles = svg.querySelectorAll('circle')
    expect(circles).toHaveLength(1)
    expect(circles[0].getAttribute('r')).toBe('3')
  })

  it('still honours the size prop', () => {
    const { container } = render(<Icon.settings size={28} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '28')
  })
})
