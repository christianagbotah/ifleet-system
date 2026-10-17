import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const APP_DIR = '/home/lightworld/webapps/ifleetpro'
const STALE_PATHS = ['/home/ifleetpro/app', '/home/z/my-project']
const runtimeFiles = [
  'start-server.sh',
  'deploy.sh',
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

  it('marks production deployment scripts as production before Prisma runs', () => {
    for (const file of ['start-server.sh', 'deploy.sh', 'scripts/webhook-deploy.sh', 'update.sh']) {
      expect(read(file), file).toContain('NODE_ENV=production')
    }
  })

  it('uses a cross-namespace atomic flock before any deploy work starts', () => {
    const content = read('scripts/webhook-deploy.sh')
    const lockPathIndex = content.indexOf('LOCK_FILE="/run/lock/ifleetpro-deploy.lock"')
    const fdIndex = content.indexOf('exec 9>"$LOCK_FILE"')
    const flockIndex = content.indexOf('flock -n 9')
    const deployStartIndex = content.indexOf('AUTO-DEPLOY TRIGGERED')

    expect(lockPathIndex).toBeGreaterThanOrEqual(0)
    expect(fdIndex).toBeGreaterThan(lockPathIndex)
    expect(flockIndex).toBeGreaterThan(fdIndex)
    expect(deployStartIndex).toBeGreaterThan(flockIndex)
    expect(content).not.toContain('if [ -f "$LOCK_FILE" ]')
    expect(content).not.toContain('touch "$LOCK_FILE"')
    expect(content).not.toContain(`trap 'rm -f "$LOCK_FILE"' EXIT`)
  })

  it('allows only one non-blocking flock holder at a time', () => {
    const result = execFileSync(
      'bash',
      [
        '-c',
        'dir=$(mktemp -d); lock="$dir/lock"; ready="$dir/ready"; (exec 9>"$lock"; flock -n 9 || exit 91; : >"$ready"; sleep 0.4) & holder=$!; for _ in $(seq 1 100); do [ -e "$ready" ] && break; sleep 0.01; done; [ -e "$ready" ] || exit 92; if (exec 9>"$lock"; flock -n 9); then second=0; else second=$?; fi; wait "$holder"; rm -rf "$dir"; printf "%s" "$second"',
      ],
      { encoding: 'utf8' },
    )

    expect(result).not.toBe('0')
  })

  it('blocks deployment if Prisma generation changes committed generated sources', () => {
    const content = read('scripts/webhook-deploy.sh')
    const generateIndex = content.indexOf('bunx prisma generate')
    const driftIndex = content.indexOf('scripts/verify-prisma-generated.sh')
    const dbPushIndex = content.indexOf('bunx prisma db push')

    expect(generateIndex).toBeGreaterThanOrEqual(0)
    expect(driftIndex).toBeGreaterThan(generateIndex)
    expect(dbPushIndex).toBeGreaterThan(driftIndex)
  })

  it('checks Prisma generated-source drift in CI after the build generates the client', () => {
    const content = read('.github/workflows/ci.yml')
    const buildIndex = content.indexOf('- name: Build')
    const driftIndex = content.indexOf('- name: Prisma generated-source drift')

    expect(buildIndex).toBeGreaterThanOrEqual(0)
    expect(driftIndex).toBeGreaterThan(buildIndex)
    expect(content).toContain('bash scripts/verify-prisma-generated.sh')
  })

  it('keeps deployment shell scripts syntactically valid', () => {
    for (const file of ['start-server.sh', 'deploy.sh', 'scripts/webhook-deploy.sh', 'update.sh']) {
      expect(() => execFileSync('bash', ['-n', resolve(ROOT, file)])).not.toThrow()
    }
  })
})
