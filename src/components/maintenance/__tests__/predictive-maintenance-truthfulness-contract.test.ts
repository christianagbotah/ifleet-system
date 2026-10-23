import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/maintenance/PredictiveMaintenancePanel.tsx'), 'utf8')

describe('predictive maintenance truthfulness', () => {
  it('describes the deterministic forecast as history-and-interval based rather than AI-powered', () => {
    expect(source).not.toContain('AI-powered service predictions')
    expect(source).toContain('Service forecasts based on recorded maintenance history and interval rules')
  })

  it('presents the heuristic grade as evidence rather than calibrated confidence', () => {
    expect(source).not.toContain(' confidence')
    expect(source).toContain(' evidence')
  })
})
