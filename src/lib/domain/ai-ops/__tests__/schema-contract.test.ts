import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schemaPath = join(process.cwd(), 'prisma/models/ai-ops.prisma')

function schema(): string {
  return readFileSync(schemaPath, 'utf8')
}

describe('AI advisory persistence schema', () => {
  it('stores immutable model and evidence metadata on recommendations', () => {
    const text = schema()

    expect(text).toContain('model AiRecommendation')
    expect(text).toContain('modelKey')
    expect(text).toContain('modelVersion')
    expect(text).toContain('confidence')
    expect(text).toContain('inputSnapshotRef')
    expect(text).toContain('explanation')
    expect(text).toContain('dataQualityScore')
  })

  it('stores versioned predictions and human review cases separately', () => {
    const text = schema()

    expect(text).toContain('model AiPrediction')
    expect(text).toContain('model AiReviewCase')
    expect(text).toContain('resolution')
    expect(text).toContain('resolvedAt')
  })
})
