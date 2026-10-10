import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('AI model health integration', () => {
  it('exposes an authenticated read-only model-health API', () => {
    const source = read('src/app/api/ai-ops/model-health/route.ts')
    expect(source).toContain('requireAuth')
    expect(source).toContain('buildModelHealthSnapshot')
    expect(source).toContain('aiPrediction.findMany')
    expect(source).not.toContain('export async function POST')
    expect(source).not.toContain('predict(')
  })

  it('adds a reachable SPA model-health view', () => {
    const page = read('src/app/page.tsx')
    const constants = read('src/lib/constants.ts')
    const auth = read('src/lib/store/auth.ts')
    const view = read('src/components/ai/ModelHealthView.tsx')

    expect(page).toContain("case 'model-health':")
    expect(page).toContain('ModelHealthView')
    expect(constants).toContain('id: "model-health"')
    expect(auth).toContain("'model-health':")
    expect(view).toContain('/api/ai-ops/model-health')
    expect(view).toContain('Shadow')
    expect(view).toContain('Data quality')
  })
})
