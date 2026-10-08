import { describe, expect, it, vi } from 'vitest'

import { loadDriverAssignmentOptions } from '../driver-assignment-options'

describe('driver assignment options', () => {
  it('uses synthetic drivers for demo sessions without requesting real driver data', async () => {
    const fetchRealDrivers = vi.fn()

    const options = await loadDriverAssignmentOptions(true, fetchRealDrivers)

    expect(fetchRealDrivers).not.toHaveBeenCalled()
    expect(options.length).toBeGreaterThanOrEqual(3)
    expect(options.every((driver) => driver.id.startsWith('demo-driver-'))).toBe(true)
    expect(options.map((driver) => driver.label)).toEqual(expect.arrayContaining([
      'Kwame Demo Driver',
      'Ama Demo Driver',
    ]))
  })

  it('uses the real driver loader for standard sessions', async () => {
    const fetchRealDrivers = vi.fn().mockResolvedValue([
      { id: 'driver-1', firstName: 'Yaw', lastName: 'Mensah', phone: '0200000000' },
    ])

    const options = await loadDriverAssignmentOptions(false, fetchRealDrivers)

    expect(fetchRealDrivers).toHaveBeenCalledTimes(1)
    expect(options).toEqual([
      { id: 'driver-1', label: 'Yaw Mensah', description: '0200000000' },
    ])
  })
})
