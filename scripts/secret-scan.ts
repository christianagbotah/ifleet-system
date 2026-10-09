import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type Finding = {
  path: string
  ruleId: string
  line: number
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.wav', '.mp3',
  '.mp4', '.mov', '.avi', '.db', '.sqlite', '.sqlite3', '.woff', '.woff2', '.ttf', '.eot',
])

const IGNORED_PREFIXES = [
  '.git/',
  '.next/',
  'node_modules/',
  'src/generated/',
  'skills/',
  'ifleet-fresh/skills/',
]

const IGNORED_FILES = new Set([
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'scripts/__tests__/secret-scan.test.ts',
])

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
  if (!normalized) return true
  if (normalized.startsWith('<') && normalized.endsWith('>')) return true
  if (normalized.startsWith('${') && normalized.endsWith('}')) return true
  return [
    'placeholder',
    'example',
    'sample',
    'redacted',
    'stored-on-vps',
    'set-in-environment',
    'not-for-production',
    'changeme',
    'your_',
    'your-',
  ].some((marker) => normalized.includes(marker))
}

function isTestSource(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/')
  return normalized.includes('/__tests__/') || /\.(?:test|spec)\.[^/]+$/i.test(normalized)
}

function addFinding(findings: Finding[], filePath: string, ruleId: string, line: number): void {
  if (!findings.some((finding) => finding.ruleId === ruleId && finding.line === line)) {
    findings.push({ path: filePath, ruleId, line })
  }
}

export function scanText(filePath: string, content: string): Finding[] {
  const findings: Finding[] = []
  const lines = content.split(/\r?\n/)
  const testSource = isTestSource(filePath)

  lines.forEach((lineText, index) => {
    const line = index + 1

    const databaseCredentialMatch = lineText.match(
      /(?:mysql|mariadb|postgres|postgresql):\/\/([^\s:/@]+):([^\s/@]+)@/i
    )
    const passwordIsFormatPlaceholder = databaseCredentialMatch?.[2] === '%s'
    if (databaseCredentialMatch && !passwordIsFormatPlaceholder) {
      addFinding(findings, filePath, 'database-url-credentials', line)
    }

    const webhookMatch = lineText.match(/(?:\bWEBHOOK_SECRET|\*{0,2}Secret\*{0,2})\s*[:=]\s*['"]?([A-Fa-f0-9]{32,})/i)
    if (webhookMatch && !isPlaceholder(webhookMatch[1])) {
      addFinding(findings, filePath, 'webhook-secret', line)
    }

    if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(lineText)) {
      addFinding(findings, filePath, 'private-key', line)
    }

    const assignment = lineText.match(/\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN))\s*[:=]\s*['"]?([^\s'"#]+)/)
    const assignmentValue = assignment?.[2] ?? ''
    const isRuntimeReference = /^(?:process\.env|settings|config|env)\./.test(assignmentValue)
    if (assignment && assignmentValue.length >= 20 && !isRuntimeReference && !isPlaceholder(assignmentValue)) {
      addFinding(
        findings,
        filePath,
        assignment[1].endsWith('TOKEN') ? 'token-assignment' : 'secret-assignment',
        line
      )
    }

    const apiTokenMatch = lineText.match(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{24,})\b/)
    if (apiTokenMatch && !isPlaceholder(apiTokenMatch[0])) {
      addFinding(findings, filePath, 'api-token', line)
    }

    if (!testSource) {
      const passwordPropertyMatch = lineText.match(
        /\bpassword\s*[:=]\s*(?:await\s+)?(?:hashPassword\s*\(\s*)?['"]([^'"]+)['"]/i
      )
      if (passwordPropertyMatch && !isPlaceholder(passwordPropertyMatch[1])) {
        addFinding(findings, filePath, 'hardcoded-password', line)
      }

      const passwordEnvMatch = lineText.match(/\b[A-Z][A-Z0-9_]*PASSWORD\s*[:=]\s*['"]?([^\s'"#]+)/)
      const passwordEnvValue = passwordEnvMatch?.[1] ?? ''
      const passwordIsRuntimeReference = /^(?:process\.env|settings|config|env)\./.test(passwordEnvValue)
      if (
        passwordEnvMatch &&
        passwordEnvValue &&
        !passwordIsRuntimeReference &&
        !isPlaceholder(passwordEnvValue)
      ) {
        addFinding(findings, filePath, 'hardcoded-password', line)
      }
    }
  })

  return findings
}

function shouldIgnore(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/')
  if (IGNORED_FILES.has(normalized)) return true
  if (IGNORED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true
  return BINARY_EXTENSIONS.has(path.extname(normalized).toLowerCase())
}

export async function scanRepository(root: string): Promise<Finding[]> {
  const { stdout } = await execFileAsync('git', ['-C', root, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  const files = stdout.split('\0').filter(Boolean)
  const findings: Finding[] = []

  for (const relativePath of files) {
    if (shouldIgnore(relativePath)) continue

    try {
      const content = await readFile(path.join(root, relativePath), 'utf8')
      if (content.includes('\0')) continue
      findings.push(...scanText(relativePath, content))
    } catch {
      // Unreadable/non-text tracked files are not eligible for textual secret scanning.
    }
  }

  return findings
}

async function main(): Promise<void> {
  const root = process.cwd()
  const findings = await scanRepository(root)

  if (findings.length === 0) {
    console.log('Secret scan: clean')
    return
  }

  console.error(`Secret scan: ${findings.length} finding(s)`)
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line} [${finding.ruleId}]`)
  }
  process.exitCode = 1
}

if (import.meta.main) {
  await main()
}
