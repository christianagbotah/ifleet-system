import { describe, expect, it } from 'vitest'

import { parsePolicyList, serializePolicyList } from '../privacy-policy'

describe('video privacy policy lists', () => {
  it('preserves an explicit empty list as deny-all rather than unrestricted', () => {
    expect(serializePolicyList([])).toBe('[]')
    expect(parsePolicyList('[]')).toEqual([])
  })
})
