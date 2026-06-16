// Makes the @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveValue, …) visible to TypeScript on vitest's `expect`. The runtime
// registration happens in vitest.setup.ts; this only supplies the types.
import '@testing-library/jest-dom/vitest'
