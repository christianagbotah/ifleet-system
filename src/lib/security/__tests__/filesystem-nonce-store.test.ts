import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { FilesystemNonceStore } from '@/lib/security/machine-auth'

describe('FilesystemNonceStore', () => {
  it('persists replay claims across store instances and releases expired claims', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ifleetpro-nonces-'))
    let now = 1_796_000_000_000

    try {
      const first = new FilesystemNonceStore(dir, () => now)
      const second = new FilesystemNonceStore(dir, () => now)

      await expect(first.claim('provider-a', 'nonce-1', now + 60_000)).resolves.toBe(true)
      await expect(second.claim('provider-a', 'nonce-1', now + 60_000)).resolves.toBe(false)

      now += 61_000
      const afterRestart = new FilesystemNonceStore(dir, () => now)
      await expect(afterRestart.claim('provider-a', 'nonce-1', now + 60_000)).resolves.toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
