import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// Electron's <webview> tag. Unlike an <iframe>, its content is a separate guest
// page exempt from the host renderer's CSP — which is why the explorer uses it to
// embed the agent's forwarded dev server (the page CSP is default-src 'self').
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        allowpopups?: string
      }
    }
  }
}
