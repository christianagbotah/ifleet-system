export type AssetType = 'tractor' | 'trailer'

export interface DeviceIdentity {
  id?: string
  imei?: string | null
  serialNumber?: string | null
}

export interface DeviceInstallation {
  id: string
  deviceId: string
  assetType: AssetType
  assetId: string
  installedAt: Date
  uninstalledAt: Date | null
}

export interface AssetBinding {
  assetType: AssetType
  assetId: string
  installationId?: string
}

export interface InstallationDecision {
  accepted: boolean
  reason?: 'installation_overlap'
  closeInstallationId?: string
  closeAt?: Date
  binding?: AssetBinding
}

function normalized(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text.toLowerCase() : null
}

export function validateDeviceIdentity(candidate: DeviceIdentity, existing: DeviceIdentity[]) {
  const imei = normalized(candidate.imei)
  const serialNumber = normalized(candidate.serialNumber)
  const conflicts: Array<'imei' | 'serialNumber'> = []

  for (const device of existing) {
    if (candidate.id && device.id === candidate.id) continue
    if (imei && normalized(device.imei) === imei && !conflicts.includes('imei')) conflicts.push('imei')
    if (serialNumber && normalized(device.serialNumber) === serialNumber && !conflicts.includes('serialNumber')) conflicts.push('serialNumber')
  }

  return { valid: conflicts.length === 0, conflicts }
}

export function installDevice(input: {
  deviceId: string
  assetType: AssetType
  assetId: string
  installedAt: Date
}, history: DeviceInstallation[]): InstallationDecision {
  const at = input.installedAt.getTime()
  if (!Number.isFinite(at)) return { accepted: false, reason: 'installation_overlap' }

  const deviceHistory = history
    .filter((item) => item.deviceId === input.deviceId)
    .sort((a, b) => a.installedAt.getTime() - b.installedAt.getTime())

  const active = deviceHistory.find((item) => item.uninstalledAt == null) ?? null
  for (const installation of deviceHistory) {
    const start = installation.installedAt.getTime()
    const end = installation.uninstalledAt?.getTime() ?? Number.POSITIVE_INFINITY

    if (installation.id === active?.id && at >= start) continue
    if (at >= start && at < end) return { accepted: false, reason: 'installation_overlap' }
    if (installation.id === active?.id && at < start) return { accepted: false, reason: 'installation_overlap' }
  }

  if (active && active.assetType === input.assetType && active.assetId === input.assetId) {
    return {
      accepted: true,
      binding: { assetType: active.assetType, assetId: active.assetId, installationId: active.id },
    }
  }

  return {
    accepted: true,
    ...(active ? { closeInstallationId: active.id, closeAt: new Date(input.installedAt) } : {}),
    binding: { assetType: input.assetType, assetId: input.assetId },
  }
}

export function resolveInstalledAsset(deviceId: string, at: Date, history: DeviceInstallation[]): AssetBinding | null {
  const time = at.getTime()
  if (!Number.isFinite(time)) return null

  const installation = history
    .filter((item) => item.deviceId === deviceId)
    .filter((item) => {
      const start = item.installedAt.getTime()
      const end = item.uninstalledAt?.getTime() ?? Number.POSITIVE_INFINITY
      return start <= time && time < end
    })
    .sort((a, b) => b.installedAt.getTime() - a.installedAt.getTime())[0]

  return installation
    ? { assetType: installation.assetType, assetId: installation.assetId, installationId: installation.id }
    : null
}
