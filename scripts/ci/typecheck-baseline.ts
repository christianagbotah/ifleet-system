import { readFileSync } from "node:fs"
import { join } from "node:path"

export type DiagnosticCounts = Map<string, number>

export function parseTypeScriptDiagnostics(output: string): DiagnosticCounts {
  const counts: DiagnosticCounts = new Map()
  const pattern = /^(.+?)\(\d+,\d+\): error TS(\d+): (.*)$/gm
  for (const match of output.matchAll(pattern)) {
    const key = `${match[1]}\tTS${match[2]}\t${match[3]}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function parseBaseline(text: string): DiagnosticCounts {
  const counts: DiagnosticCounts = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const tab = line.indexOf("\t")
    if (tab <= 0) throw new Error(`Invalid typecheck baseline line: ${line}`)
    const count = Number(line.slice(0, tab))
    if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid typecheck baseline count: ${line}`)
    counts.set(line.slice(tab + 1), count)
  }
  return counts
}

export function findNewDiagnostics(current: DiagnosticCounts, baseline: DiagnosticCounts): string[] {
  const added: string[] = []
  for (const [key, count] of current) {
    const allowed = baseline.get(key) ?? 0
    if (count > allowed) added.push(`${count - allowed}\t${key}`)
  }
  return added.sort()
}

function total(counts: DiagnosticCounts): number {
  let value = 0
  for (const count of counts.values()) value += count
  return value
}

if (import.meta.main) {
  const result = Bun.spawnSync(["bunx", "tsc", "--noEmit", "--pretty", "false"], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })
  const output = `${result.stdout.toString()}${result.stderr.toString()}`
  const current = parseTypeScriptDiagnostics(output)

  if (result.exitCode === 0) {
    console.log("Strict TypeScript check passed with 0 diagnostics")
    process.exit(0)
  }
  if (current.size === 0) {
    console.error("TypeScript failed without parseable diagnostics")
    console.error(output.slice(-4000))
    process.exit(result.exitCode || 1)
  }

  const baselinePath = join(import.meta.dir, "typecheck-baseline.txt")
  const baseline = parseBaseline(readFileSync(baselinePath, "utf8"))
  const added = findNewDiagnostics(current, baseline)
  if (added.length > 0) {
    console.error(`TypeScript baseline gate failed: ${added.length} new diagnostic group(s)`)
    for (const line of added.slice(0, 50)) console.error(line)
    process.exit(1)
  }

  console.log(`TypeScript baseline gate passed: ${total(current)} legacy diagnostic(s), 0 new`)
}
