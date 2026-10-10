import { describe, expect, it } from 'vitest'
import { validateIntegrationConnection } from '../connection'

describe('validateIntegrationConnection', () => {
  it('accepts non-secret config with a server secret reference', () => {
    const result = validateIntegrationConnection({
      name: 'GHACEM Orders',
      provider: 'ghacem',
      type: 'webhook',
      config: { endpointPath: '/orders', timeoutMs: 10000 },
      secretRef: 'vault://ifleetpro/integrations/ghacem-orders',
    })
    expect(result.success).toBe(true)
  })

  it.each(['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'])('rejects raw secret field %s anywhere in config', (field) => {
    const result = validateIntegrationConnection({
      name: 'Unsafe', provider: 'custom', type: 'api', secretRef: 'env://SAFE_REF',
      config: { nested: { [field]: 'do-not-store-me' } },
    })
    expect(result.success).toBe(false)
    expect(result.errors.join(' ')).toMatch(/secret|credential/i)
  })

  it('rejects a secretRef that looks like raw credential material', () => {
    const result = validateIntegrationConnection({
      name: 'Unsafe', provider: 'custom', type: 'api', config: {}, secretRef: 'plain-secret-value',
    })
    expect(result.success).toBe(false)
  })

  it('normalizes provider/type/name and preserves safe config only', () => {
    const result = validateIntegrationConnection({
      name: '  Unilever Orders  ', provider: ' Unilever ', type: ' WEBHOOK ',
      config: { warehouse: 'Tema' }, secretRef: 'env://UNILEVER_WEBHOOK_SECRET',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value.name).toBe('Unilever Orders')
      expect(result.value.provider).toBe('unilever')
      expect(result.value.type).toBe('webhook')
    }
  })
})
