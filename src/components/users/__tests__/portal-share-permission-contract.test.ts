import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/constants'

const roleForm = readFileSync(join(process.cwd(), 'src/components/users/RoleFormDialog.tsx'), 'utf8')

describe('portal share permission catalog', () => {
  it('defines portal.share as a first-class assignable permission', () => {
    expect(PERMISSIONS['portal.share' as keyof typeof PERMISSIONS]).toBe('Manage Client Portal Links')
    expect(roleForm).toContain("name: 'Client Portal'")
    expect(roleForm).toContain("keys: ['portal.share']")
  })
})
