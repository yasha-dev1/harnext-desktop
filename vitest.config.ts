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
      // Include the main process too, so the growing main-process test suite
      // actually counts toward coverage (#138 — it was silently excluded).
      include: ['src/shared/**', 'src/renderer/src/**', 'src/main/**'],
      // Ratcheting floor (#138): fail the build if coverage drops below today's
      // baseline (~35% stmts / 33% branch / 32% func, dragged down by the big
      // still-untested modules like db.ts/agent-manager.ts). Set a few points
      // under current so normal variation doesn't flake; raise as coverage grows.
      thresholds: {
        statements: 33,
        branches: 30,
        functions: 29,
        lines: 33
      }
    }
  }
})
