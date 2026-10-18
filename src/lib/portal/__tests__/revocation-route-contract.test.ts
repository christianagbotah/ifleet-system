import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const routes = [
  'src/app/api/portal/public/client/route.ts',
  'src/app/api/portal/public/shipment/[tripId]/route.ts',
  'src/app/api/portal/public/invoices/[invoiceId]/pdf/route.ts',
]

describe('portal revocation route contract', () => {
  it('enforces active share-version validation before every public portal resource', () => {
    for (const route of routes) {
      const source = readFileSync(join(process.cwd(), route), 'utf8')
      expect(source, route).toContain('verifyActivePortalShareToken')
      expect(source, route).not.toContain('verifyPortalShareToken(token)')
    }
  })
})
