// Registers @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveTextContent, …) on vitest's `expect`. Loaded for every test file via
// vitest.config `setupFiles`; the matchers only touch the DOM when invoked, so
// this is inert for the node-env (main-process) tests.
import '@testing-library/jest-dom/vitest'
