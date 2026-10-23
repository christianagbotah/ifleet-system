import { db } from '@/lib/db'

export interface HubtelDeliveryConfig {
  clientId: string
  apiSecret: string
}

export interface SmtpDeliveryConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
  secure: boolean
  requireTLS: boolean
}

export type ChannelConfigResult<T> =
  | { enabled: true; config: T }
  | { enabled: false; error: string }

type SettingsLoadResult =
  | { ok: true; settings: Awaited<ReturnType<typeof db.systemSettings.findFirst>> }
  | { ok: false }

async function loadSettings(): Promise<SettingsLoadResult> {
  try {
    return { ok: true, settings: await db.systemSettings.findFirst() }
  } catch (error) {
    console.warn('[Channels] Could not load saved channel settings; external delivery is disabled until settings are readable.', error)
    return { ok: false }
  }
}

function envValue(name: string): string {
  return process.env[name]?.trim() ?? ''
}

export async function resolveSmsDeliveryConfig(): Promise<ChannelConfigResult<HubtelDeliveryConfig>> {
  const loaded = await loadSettings()
  if (!loaded.ok) {
    return { enabled: false, error: 'Channel settings unavailable' }
  }

  const settings = loaded.settings
  if (settings && settings.smsEnabled === false) {
    return { enabled: false, error: 'SMS channel is disabled' }
  }

  const provider = settings?.smsProvider?.trim() || 'hubtel'
  if (provider !== 'hubtel') {
    return { enabled: false, error: `Unsupported SMS provider: ${provider}` }
  }

  const clientId = settings?.hubtelClientId?.trim() || envValue('HUBTEL_CLIENT_ID')
  const apiSecret = settings?.hubtelApiSecret?.trim() || envValue('HUBTEL_API_SECRET')
  if (!clientId || !apiSecret) {
    return { enabled: false, error: 'SMS credentials not configured' }
  }

  return { enabled: true, config: { clientId, apiSecret } }
}

export async function resolveEmailDeliveryConfig(): Promise<ChannelConfigResult<SmtpDeliveryConfig>> {
  const loaded = await loadSettings()
  if (!loaded.ok) {
    return { enabled: false, error: 'Channel settings unavailable' }
  }

  const settings = loaded.settings
  if (settings && settings.emailEnabled === false) {
    return { enabled: false, error: 'Email channel is disabled' }
  }

  const host = settings?.smtpHost?.trim() || envValue('SMTP_HOST')
  const portText = settings?.smtpPort ? String(settings.smtpPort) : envValue('SMTP_PORT')
  const user = settings?.smtpUser?.trim() || envValue('SMTP_USER')
  const pass = settings?.smtpPass?.trim() || envValue('SMTP_PASS')
  const from = settings?.smtpFrom?.trim() || envValue('SMTP_FROM') || user
  const port = Number.parseInt(portText || '', 10)

  if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass || !from) {
    return { enabled: false, error: 'SMTP not configured' }
  }

  const tlsRequested = settings ? settings.smtpSecure !== false : port === 465
  return {
    enabled: true,
    config: {
      host,
      port,
      user,
      pass,
      from,
      secure: port === 465,
      requireTLS: port !== 465 && tlsRequested,
    },
  }
}
