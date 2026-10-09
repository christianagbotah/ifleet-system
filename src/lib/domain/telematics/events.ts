export type TelematicsSource = 'hardwired' | 'mdvr' | 'phone' | 'manual'
export type TelematicsTrust = 'hardwired' | 'mdvr' | 'phone' | 'manual'

export interface NormalizationContext {
  receivedAt: Date
  rawEventRef: string
  deviceId?: string | null
  providerEventId?: string | null
}

export interface NormalizedEventBase {
  provider: string
  deviceId: string | null
  providerEventId: string | null
  source: TelematicsSource
  trust: TelematicsTrust
  externalAssetRef: string | null
  deviceTimestamp: Date
  receivedAt: Date
  rawEventRef: string
}

export interface LocationEventInput extends NormalizedEventBase {
  kind: 'location'
  latitude: number
  longitude: number
  speedKph: number | null
  headingDeg: number | null
  accuracyMeters: number | null
}

export interface SensorEventInput extends NormalizedEventBase {
  kind: 'sensor'
  sensorType: string
  value: number | string | boolean | null
  unit: string | null
}

export interface AlarmEventInput extends NormalizedEventBase {
  kind: 'alarm'
  alarmType: string
  severity: 'info' | 'warning' | 'critical'
  message: string | null
}

export interface IgnitionEventInput extends NormalizedEventBase {
  kind: 'ignition'
  ignitionOn: boolean
}
