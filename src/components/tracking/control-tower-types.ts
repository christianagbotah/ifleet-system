export type ConnectionState = 'online' | 'stale' | 'offline'

export interface ControlTowerLiveRecord {
  assetType: string
  assetId: string
  label: string
  driverName: string | null
  tripId: string | null
  tripNumber: string | null
  tripStatus: string | null
  destination: string | null
  revenue?: number | null
  fuelCost?: number | null
  latitude: number
  longitude: number
  speedKph: number | null
  headingDeg: number | null
  accuracyMeters: number | null
  ignitionOn: boolean | null
  source: string
  trust: string
  provider: string
  deviceId: string | null
  deviceTimestamp: string
  receivedAt: string
  connectionState: ConnectionState
}

export interface ReplayPoint {
  id: string
  assetType: string
  assetId: string
  tripId: string | null
  latitude: number
  longitude: number
  speedKph: number | null
  headingDeg?: number | null
  source: string
  trust: string
  deviceTimestamp: string
}
