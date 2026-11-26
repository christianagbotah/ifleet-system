import { describe, expect, it } from 'vitest'

// Vitest transpiles the TypeScript config for this test environment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../vitest.config.ts')

describe('Vitest test discovery boundaries', () => {
  it('excludes preserved git worktrees from the main repository test run', () => {
    expect(config.test?.exclude).toContain('**/.worktrees/**')
  })
})
