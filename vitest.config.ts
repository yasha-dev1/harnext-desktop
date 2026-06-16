import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    // Match .ts and .tsx so renderer component tests are picked up.
    include: ['src/**/*.test.{ts,tsx}'],
    // Default to the fast `node` env for main-process/shared tests; renderer
    // tests opt into a DOM with a per-file `// @vitest-environment jsdom`.
    environment: 'node',
    // Exposes afterEach() globally so @testing-library/react auto-cleans the
    // DOM between renders (otherwise renders leak and queries find duplicates).
    globals: true,
    // jest-dom matchers (toBeInTheDocument, etc.) — registered on `expect`,
    // inert until a DOM test invokes them, so loading them globally is safe.
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/shared/**', 'src/renderer/src/**']
    }
  }
})
