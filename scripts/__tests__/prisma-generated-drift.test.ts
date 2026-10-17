import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const CHECKER = resolve(ROOT, 'scripts/verify-prisma-generated.sh')

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ifleetpro-prisma-drift-'))
  mkdirSync(join(dir, 'src/generated'), { recursive: true })
  writeFileSync(join(dir, 'src/generated/client.ts'), 'export const generated = true\n')
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['add', 'src/generated/client.ts'], { cwd: dir })
  execFileSync(
    'git',
    ['-c', 'user.name=iFleetPro Tests', '-c', 'user.email=tests@ifleetpro.invalid', 'commit', '-qm', 'baseline'],
    { cwd: dir },
  )
  return dir
}

describe('Prisma generated-source drift guard', () => {
  it('ships the verifier as an executable shell script', () => {
    expect(existsSync(CHECKER)).toBe(true)
  })

  it('passes when src/generated exactly matches Git', () => {
    const dir = makeRepo()
    const result = spawnSync('bash', [CHECKER, dir], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('in sync')
  })

  it('fails for changed tracked generated files', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'src/generated/client.ts'), 'export const generated = false\n')
    const result = spawnSync('bash', [CHECKER, dir], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('out of sync')
    expect(result.stderr).toContain('src/generated/client.ts')
  })

  it('fails for new untracked generated files', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'src/generated/new-model.ts'), 'export const model = true\n')
    const result = spawnSync('bash', [CHECKER, dir], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('src/generated/new-model.ts')
  })
})
