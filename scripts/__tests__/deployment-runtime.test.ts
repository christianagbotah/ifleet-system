import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const APP_DIR = '/home/lightworld/webapps/ifleetpro'
const STALE_PATHS = ['/home/ifleetpro/app', '/home/z/my-project']
const runtimeFiles = [
  'start-server.sh',
  'scripts/webhook-deploy.sh',
  'update.sh',
  'hooks.json.example',
  'ecosystem.config.js',
]

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

describe('production deployment runtime configuration', () => {
  it('uses the current Webuzo application path everywhere', () => {
    for (const file of runtimeFiles) {
      const content = read(file)
      expect(content, file).toContain(APP_DIR)
      for (const stalePath of STALE_PATHS) {
        expect(content, `${file} contains stale path ${stalePath}`).not.toContain(stalePath)
      }
    }
  })

  it('starts the standalone Next.js server rather than a development loop', () => {
    const content = read('start-server.sh')
    expect(content).toContain('.next/standalone/server.js')
    expect(content).not.toContain('next dev')
    expect(content).not.toContain('while true')
  })

  it('restarts only iFleetPro services, never every PM2 application on the VPS', () => {
    const content = read('update.sh')
    expect(content).not.toContain('pm2 restart all')
  })

  it('keeps deployment shell scripts syntactically valid', () => {
    for (const file of ['start-server.sh', 'scripts/webhook-deploy.sh', 'update.sh']) {
      expect(() => execFileSync('bash', ['-n', resolve(ROOT, file)])).not.toThrow()
    }
  })
})
