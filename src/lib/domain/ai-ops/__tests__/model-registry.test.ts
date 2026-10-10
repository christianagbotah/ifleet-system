import { describe, expect, it } from 'vitest'

import { AiModelRegistry, type AiModelAdapter } from '../model-registry'

function model(version: string, status: 'shadow' | 'advisory' | 'disabled' = 'shadow', minimumDataQuality = 0.7): AiModelAdapter<{ value: number }, { value: number }> {
  return {
    modelKey: 'eta-learned',
    version,
    status,
    minimumDataQuality,
    predict: async (input) => ({ value: input.value + Number(version.split('.')[0]) }),
    explain: (output) => ({ summary: `prediction ${output.value}` }),
  }
}

describe('AiModelRegistry', () => {
  it('rejects an unknown model', async () => {
    const registry = new AiModelRegistry()
    await expect(registry.predict('missing', '1.0.0', { value: 1 }, 1)).rejects.toThrow(/unknown/i)
  })

  it('rejects a disabled model', async () => {
    const registry = new AiModelRegistry().register(model('1.0.0', 'disabled'))
    await expect(registry.predict('eta-learned', '1.0.0', { value: 1 }, 1)).rejects.toThrow(/disabled/i)
  })

  it('pins prediction to the requested version even when a newer version exists', async () => {
    const registry = new AiModelRegistry().register(model('1.0.0')).register(model('2.0.0'))
    const result = await registry.predict('eta-learned', '1.0.0', { value: 3 }, 1)
    expect(result.modelVersion).toBe('1.0.0')
    expect(result.output.value).toBe(4)
  })

  it('rejects inputs below the model minimum data quality', async () => {
    const registry = new AiModelRegistry().register(model('1.0.0', 'shadow', 0.8))
    await expect(registry.predict('eta-learned', '1.0.0', { value: 1 }, 0.79)).rejects.toThrow(/data quality/i)
  })

  it('resolves historical predictions by their stored model version rather than latest registration', () => {
    const registry = new AiModelRegistry().register(model('1.0.0')).register(model('2.0.0'))
    expect(registry.resolveHistorical({ modelKey: 'eta-learned', modelVersion: '1.0.0' }).version).toBe('1.0.0')
  })

  it('does not expose an autonomous execution status', () => {
    const registry = new AiModelRegistry().register(model('1.0.0', 'advisory'))
    expect(registry.list().map((item) => item.status)).toEqual(['advisory'])
    expect(JSON.stringify(registry.list())).not.toContain('autonomous')
  })
})
