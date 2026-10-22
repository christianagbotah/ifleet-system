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
  'scripts/webhook-entrypoint.sh',
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

  it('launches webhook deploys through a stable shared entrypoint that snapshots canonical main', () => {
    const hooksExample = read('hooks.json.example')
    const entrypoint = read('scripts/webhook-entrypoint.sh')

    expect(hooksExample).toContain('/home/lightworld/shared/ops/ifleetpro-webhook-deploy.sh')
    expect(entrypoint).toContain('git -C "$APP_DIR" fetch')
    expect(entrypoint).toContain('git -C "$APP_DIR" show origin/main:scripts/webhook-deploy.sh')
    expect(entrypoint).toContain('"$SNAPSHOT" "$@"')
    expect(entrypoint).not.toContain('bun run build')
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

  it('restarts and verifies the tracking service when webhook code is deployed', () => {
    const content = read('scripts/webhook-deploy.sh')
    const appRestart = content.indexOf('systemctl restart ifleetpro.service')
    const trackingRestart = content.indexOf('systemctl restart ifleetpro-tracking.service')
    const trackingVerify = content.indexOf('systemctl is-active --quiet ifleetpro-tracking.service')

    expect(appRestart).toBeGreaterThanOrEqual(0)
    expect(trackingRestart).toBeGreaterThan(appRestart)
    expect(trackingVerify).toBeGreaterThan(trackingRestart)
  })

  it('does not inherit the stable launcher private umask into build artifacts', () => {
    const content = read('scripts/webhook-deploy.sh')
    const umaskIndex = content.indexOf('umask 022')
    const buildIndex = content.indexOf('bun run build')

    expect(umaskIndex).toBeGreaterThanOrEqual(0)
    expect(umaskIndex).toBeLessThan(buildIndex)
  })

  it('hands standalone artifacts to the service user and validates readability before restart', () => {
    const content = read('scripts/webhook-deploy.sh')
    const buildIndex = content.indexOf('bun run build')
    const ownershipIndex = content.indexOf('chown -R lightworld:lightworld .next/standalone')
    const readabilityIndex = content.indexOf('runuser -u lightworld -- test -r .next/standalone/server.js')
    const appRestart = content.indexOf('systemctl restart ifleetpro.service')

    expect(ownershipIndex).toBeGreaterThan(buildIndex)
    expect(readabilityIndex).toBeGreaterThan(ownershipIndex)
    expect(appRestart).toBeGreaterThan(readabilityIndex)
  })

  it('requires an actual local HTTP response before treating the app restart as healthy', () => {
    const content = read('scripts/webhook-deploy.sh')
    const appRestart = content.indexOf('systemctl restart ifleetpro.service')
    const appProbe = content.indexOf('http://127.0.0.1:3000/')
    const trackingRestart = content.indexOf('systemctl restart ifleetpro-tracking.service')
    const cacheFlush = content.indexOf('Flushing nginx proxy cache')

    expect(appProbe).toBeGreaterThan(appRestart)
    expect(trackingRestart).toBeGreaterThan(appProbe)
    expect(cacheFlush).toBeGreaterThan(trackingRestart)
  })

  it('marks production deployment scripts as production before Prisma runs', () => {
    for (const file of ['start-server.sh', 'deploy.sh', 'scripts/webhook-deploy.sh', 'update.sh']) {
      expect(read(file), file).toContain('NODE_ENV=production')
    }
  })

  it('uses a cross-namespace atomic flock before any deploy work starts', () => {
    const content = read('scripts/webhook-deploy.sh')
    const lockPathIndex = content.indexOf('LOCK_FILE="/run/lock/ifleetpro-deploy.lock"')
    const wrapperIndex = content.indexOf('flock -n -E 75 -o "$LOCK_FILE" "$0" "$@"')
    const deployStartIndex = content.indexOf('AUTO-DEPLOY TRIGGERED')

    expect(lockPathIndex).toBeGreaterThanOrEqual(0)
    expect(wrapperIndex).toBeGreaterThan(lockPathIndex)
    expect(deployStartIndex).toBeGreaterThan(wrapperIndex)
    expect(content).toContain('IFLEETPRO_DEPLOY_LOCK_HELD')
    expect(content).not.toContain('exec 9>"$LOCK_FILE"')
    expect(content).not.toContain('if [ -f "$LOCK_FILE" ]')
    expect(content).not.toContain('touch "$LOCK_FILE"')
    expect(content).not.toContain(`trap 'rm -f "$LOCK_FILE"' EXIT`)
  })

  it('does not leak the flock descriptor into surviving child processes', () => {
    const result = execFileSync(
      'bash',
      [
        '-c',
        `dir=$(mktemp -d); lock="$dir/lock"; flock -n -o "$lock" sh -c 'sleep 1 &'; if flock -n "$lock" -c true; then result=free; else result=held; fi; rm -rf "$dir"; printf "%s" "$result"`,
      ],
      { encoding: 'utf8' },
    )

    expect(result).toBe('free')
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

  it('defines the public build identifier through Next config so client bundles receive a literal', () => {
    const content = read('next.config.ts')

    expect(content).toContain('env: {')
    expect(content).toContain('NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA ||')
  })

  it('verifies CI actually embeds the build identifier into browser assets', () => {
    const workflow = read('.github/workflows/ci.yml')
    const buildIndex = workflow.indexOf('- name: Build')
    const metadataIndex = workflow.indexOf('- name: Build metadata bundle')
    const verifier = read('scripts/verify-build-metadata.sh')

    expect(workflow).toContain('NEXT_PUBLIC_BUILD_SHA: ${{ github.sha }}')
    expect(buildIndex).toBeGreaterThanOrEqual(0)
    expect(metadataIndex).toBeGreaterThan(buildIndex)
    expect(verifier).toContain('.next/static')
    expect(verifier).toContain('NEXT_PUBLIC_BUILD_SHA')
  })

  it('exposes the deployed Git commit as the public build identifier before building', () => {
    const content = read('scripts/webhook-deploy.sh')
    const commitIndex = content.indexOf('COMMIT=$(git rev-parse --short HEAD)')
    const exportIndex = content.indexOf('export NEXT_PUBLIC_BUILD_SHA="$COMMIT"')
    const buildIndex = content.indexOf('bun run build')

    expect(commitIndex).toBeGreaterThanOrEqual(0)
    expect(exportIndex).toBeGreaterThan(commitIndex)
    expect(buildIndex).toBeGreaterThan(exportIndex)
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
    for (const file of ['start-server.sh', 'deploy.sh', 'scripts/webhook-deploy.sh', 'scripts/webhook-entrypoint.sh', 'update.sh']) {
      expect(() => execFileSync('bash', ['-n', resolve(ROOT, file)])).not.toThrow()
    }
  })
})
