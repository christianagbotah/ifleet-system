import fs from 'node:fs'
import path from 'node:path'

export type MetricDirection = 'higher' | 'lower'

export interface PromotionCriterion {
  direction: MetricDirection
  minRelativeImprovement: number
}

export interface PromotionEvaluationInput {
  modelMetrics: Record<string, number>
  baselineMetrics: Record<string, number>
  criteria: Record<string, PromotionCriterion>
}

export interface PromotionEvaluationResult {
  passed: boolean
  failures: string[]
  comparisons: Record<string, { model: number; baseline: number; relativeImprovement: number }>
}

export function evaluatePromotion(input: PromotionEvaluationInput): PromotionEvaluationResult {
  const failures: string[] = []
  const comparisons: PromotionEvaluationResult['comparisons'] = {}

  for (const [metric, criterion] of Object.entries(input.criteria)) {
    const model = input.modelMetrics[metric]
    const baseline = input.baselineMetrics[metric]
    if (!Number.isFinite(model) || !Number.isFinite(baseline)) {
      failures.push(`${metric}: required metric is missing or non-finite`)
      continue
    }
    if (!Number.isFinite(criterion.minRelativeImprovement) || criterion.minRelativeImprovement < 0) {
      failures.push(`${metric}: minimum relative improvement must be a finite non-negative number`)
      continue
    }

    const denominator = Math.abs(baseline) || 1
    const relativeImprovement = criterion.direction === 'lower'
      ? (baseline - model) / denominator
      : (model - baseline) / denominator

    comparisons[metric] = { model, baseline, relativeImprovement }
    if (relativeImprovement < criterion.minRelativeImprovement) {
      failures.push(`${metric}: learned model improvement ${(relativeImprovement * 100).toFixed(2)}% is below required ${(criterion.minRelativeImprovement * 100).toFixed(2)}%`)
    }
  }

  if (Object.keys(input.criteria).length === 0) failures.push('No promotion criteria were configured.')
  return { passed: failures.length === 0, failures, comparisons }
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

async function main() {
  const input = readArg('input')
  if (!input) throw new Error('Usage: bun scripts/ai/evaluate-model.ts --input=evaluation.json')
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8')) as PromotionEvaluationInput
  const result = evaluatePromotion(payload)
  console.log(JSON.stringify(result, null, 2))
  if (!result.passed) process.exit(2)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
