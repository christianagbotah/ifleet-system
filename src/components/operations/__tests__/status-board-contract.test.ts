import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('operational status board contract', () => {
  it('routes drag transitions through the guarded transition endpoint', () => {
    const path = join(root, 'src/components/operations/OperationalStatusBoard.tsx')
    expect(existsSync(path)).toBe(true)
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('canTransition')
    expect(source).toContain('/transition')
    expect(source).toContain('draggable')
    expect(source).toContain('onDrop')
  })

  it('limits drag controls to privileged operational roles', () => {
    const source = readFileSync(join(root, 'src/components/operations/OperationalStatusBoard.tsx'), 'utf8')
    expect(source).toContain("user?.role === 'Admin'")
    expect(source).toContain("user?.role === 'Manager'")
  })
})
