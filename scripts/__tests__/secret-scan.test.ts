import { describe, expect, it } from 'vitest'

import { scanText } from '../secret-scan'

const join = (...parts: string[]) => parts.join('')

describe('scanText', () => {
  it('detects database URLs containing credentials without exposing the value', () => {
    const content = `DATABASE_URL=${join('mariadb://app:', 'not-for-production', '@db.internal:3306/app')}`
    const findings = scanText('config.txt', content)

    expect(findings.map((finding) => finding.ruleId)).toContain('database-url-credentials')
    expect(JSON.stringify(findings)).not.toContain('not-for-production')
  })

  it('detects long webhook secrets in contextual assignments', () => {
    const value = 'a'.repeat(48)
    const findings = scanText('hooks.conf', `WEBHOOK_SECRET=${value}`)

    expect(findings.map((finding) => finding.ruleId)).toContain('webhook-secret')
    expect(JSON.stringify(findings)).not.toContain(value)
  })

  it('detects long documented secret values such as deployment webhook secrets', () => {
    const value = 'b'.repeat(64)
    const findings = scanText('deployment.md', `- **Secret**: ${value}`)

    expect(findings.map((finding) => finding.ruleId)).toContain('webhook-secret')
    expect(JSON.stringify(findings)).not.toContain(value)
  })

  it('detects private key material', () => {
    const marker = join('-----BEGIN ', 'PRIVATE KEY', '-----')
    const findings = scanText('key.pem', `${marker}\nabc\n-----END PRIVATE KEY-----`)

    expect(findings.map((finding) => finding.ruleId)).toContain('private-key')
  })

  it('detects generic secret and token assignments with real-looking values', () => {
    const content = [
      `SERVICE_SECRET=${join('live_', 'v'.repeat(36))}`,
      `ACCESS_TOKEN=${join('tok_', 'x'.repeat(36))}`,
    ].join('\n')
    const findings = scanText('runtime.env', content)

    expect(findings.map((finding) => finding.ruleId)).toContain('secret-assignment')
    expect(findings.map((finding) => finding.ruleId)).toContain('token-assignment')
  })

  it('detects common API token prefixes', () => {
    const githubLike = join('ghp_', 'A'.repeat(36))
    const findings = scanText('notes.txt', `token=${githubLike}`)

    expect(findings.map((finding) => finding.ruleId)).toContain('api-token')
    expect(JSON.stringify(findings)).not.toContain(githubLike)
  })

  it('does not flag runtime variable references as hard-coded secrets', () => {
    const content = [
      'const WARMUP_SECRET = process.env.SCHEDULER_WARMUP_SECRET',
      'process.env.HUBTEL_API_SECRET = settings.hubtelApiSecret',
    ].join('\n')

    expect(scanText('runtime.ts', content)).toEqual([])
  })

  it('does not flag printf-style database URL format placeholders', () => {
    const content = "printf -v DB_URL 'mariadb://%s:%s@%s:%s/%s' user pass host port name"

    expect(scanText('deploy.sh', content)).toEqual([])
  })

  it('allows documented placeholders and test-safe values', () => {
    const content = [
      'DATABASE_URL=mariadb://user@127.0.0.1:3306/example',
      'WEBHOOK_SECRET=<stored-on-vps>',
      'NEXTAUTH_SECRET=<set-in-environment>',
      'ACCESS_TOKEN=${ACCESS_TOKEN}',
      'API_TOKEN=ci-only-placeholder-not-for-production',
    ].join('\n')

    expect(scanText('example.env', content)).toEqual([])
  })
})
