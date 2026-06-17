// Registers @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveTextContent, …) on vitest's `expect`. Loaded for every test file via
// vitest.config `setupFiles`; the matchers only touch the DOM when invoked, so
// this is inert for the node-env (main-process) tests.
import '@testing-library/jest-dom/vitest'

// The renderer store wires `window.api.onAgentEvent` at module-eval time, so a
// minimal preload bridge must exist before any jsdom test imports it. Tests that
// need richer behavior overwrite `window.api` with their own mock.
if (typeof window !== 'undefined') {
  const w = window as unknown as { api?: { onAgentEvent?: () => () => void } }
  if (!w.api) w.api = { onAgentEvent: () => () => {} }
}
