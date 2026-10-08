// Vitest 5 loads this .ts config as CommonJS in this package; keep these config-only imports explicit.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
