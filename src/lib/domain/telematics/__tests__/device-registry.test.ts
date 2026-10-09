import { describe, expect, it } from 'vitest'
import {
  installDevice,
  resolveInstalledAsset,
  validateDeviceIdentity,
  type DeviceInstallation,
} from '../device-registry'

describe('telematics device registry', () => {
  it('rejects a duplicate IMEI or serial number', () => {
    const existing = [
      { id: 'd1', imei: '359111111111111', serialNumber: 'SN-001' },
      { id: 'd2', imei: '359222222222222', serialNumber: 'SN-002' },
    ]
    expect(validateDeviceIdentity({ imei: '359111111111111', serialNumber: 'SN-003' }, existing)).toEqual({
      valid: false,
      conflicts: ['imei'],
    })
    expect(validateDeviceIdentity({ imei: '359333333333333', serialNumber: 'SN-002' }, existing)).toEqual({
      valid: false,
      conflicts: ['serialNumber'],
    })
  })

  it('moves a device by closing the prior active installation at the new install time', () => {
    const history: DeviceInstallation[] = [
      { id: 'i1', deviceId: 'd1', assetType: 'tractor', assetId: 'truck-1', installedAt: new Date('2026-10-01T08:00:00Z'), uninstalledAt: null },
    ]
    const decision = installDevice({
      deviceId: 'd1',
      assetType: 'tractor',
      assetId: 'truck-2',
      installedAt: new Date('2026-10-08T08:00:00Z'),
    }, history)
    expect(decision.accepted).toBe(true)
    expect(decision.closeInstallationId).toBe('i1')
    expect(decision.closeAt?.toISOString()).toBe('2026-10-08T08:00:00.000Z')
  })

  it('rejects an installation that overlaps historical ownership', () => {
    const history: DeviceInstallation[] = [
      { id: 'i1', deviceId: 'd1', assetType: 'tractor', assetId: 'truck-1', installedAt: new Date('2026-10-01T08:00:00Z'), uninstalledAt: new Date('2026-10-05T08:00:00Z') },
      { id: 'i2', deviceId: 'd1', assetType: 'tractor', assetId: 'truck-2', installedAt: new Date('2026-10-05T08:00:00Z'), uninstalledAt: null },
    ]
    const decision = installDevice({
      deviceId: 'd1', assetType: 'trailer', assetId: 'trailer-9', installedAt: new Date('2026-10-03T08:00:00Z'),
    }, history)
    expect(decision).toMatchObject({ accepted: false, reason: 'installation_overlap' })
  })

  it('supports both tractor and trailer asset bindings', () => {
    const tractor = installDevice({ deviceId: 'd1', assetType: 'tractor', assetId: 'truck-1', installedAt: new Date('2026-10-01T00:00:00Z') }, [])
    const trailer = installDevice({ deviceId: 'd2', assetType: 'trailer', assetId: 'trailer-1', installedAt: new Date('2026-10-01T00:00:00Z') }, [])
    expect(tractor.accepted).toBe(true)
    expect(tractor.binding).toMatchObject({ assetType: 'tractor', assetId: 'truck-1' })
    expect(trailer.accepted).toBe(true)
    expect(trailer.binding).toMatchObject({ assetType: 'trailer', assetId: 'trailer-1' })
  })

  it('resolves the asset that owned a device at a historical timestamp', () => {
    const history: DeviceInstallation[] = [
      { id: 'i1', deviceId: 'd1', assetType: 'tractor', assetId: 'truck-1', installedAt: new Date('2026-10-01T00:00:00Z'), uninstalledAt: new Date('2026-10-05T00:00:00Z') },
      { id: 'i2', deviceId: 'd1', assetType: 'trailer', assetId: 'trailer-4', installedAt: new Date('2026-10-05T00:00:00Z'), uninstalledAt: null },
    ]
    expect(resolveInstalledAsset('d1', new Date('2026-10-03T00:00:00Z'), history)).toMatchObject({ assetType: 'tractor', assetId: 'truck-1' })
    expect(resolveInstalledAsset('d1', new Date('2026-10-06T00:00:00Z'), history)).toMatchObject({ assetType: 'trailer', assetId: 'trailer-4' })
    expect(resolveInstalledAsset('d1', new Date('2026-09-01T00:00:00Z'), history)).toBeNull()
  })
})
