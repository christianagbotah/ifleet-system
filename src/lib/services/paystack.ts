import { db } from '@/lib/db'

// ============ Types ============

const PAYSTACK_BASE_URL = 'https://api.paystack.co'

export interface PaystackConfig {
  secretKey: string
  publicKey: string
  mode: 'test' | 'live'
}

export interface InitializePaymentParams {
  email: string
  amount: number // in kobo (GHS * 100)
  reference?: string
  metadata?: Record<string, unknown>
  channels?: string[] // ['mobile_money', 'card']
  mobile_money?: {
    phone: string
    provider: 'mtn' | 'vodafone' | 'airteltigo'
  }
}

export interface PaystackInitData {
  authorization_url: string
  access_code: string
  reference: string
}

export interface PaystackCustomer {
  email: string
  first_name?: string
  last_name?: string
  phone?: string
}

export interface PaymentData {
  reference: string
  amount: number
  status: string
  gateway_response: string
  paid_at?: string
  channel: string
  currency: string
  customer: PaystackCustomer
  metadata?: Record<string, unknown>
}

export interface PaystackResponse<T> {
  status: boolean
  message: string
  data: T
}

// ============ Config Helpers ============

export async function getPaystackConfig(): Promise<PaystackConfig | null> {
  const settings = await db.systemSettings.findFirst()
  if (!settings || !settings.paystackEnabled || !settings.paystackSecretKey) {
    return null
  }
  return {
    secretKey: settings.paystackSecretKey,
    publicKey: settings.paystackPublicKey,
    mode: (settings.paystackMode === 'live' ? 'live' : 'test') as 'test' | 'live',
  }
}

export async function isPaystackEnabled(): Promise<boolean> {
  const settings = await db.systemSettings.findFirst()
  return !!settings?.paystackEnabled && !!settings?.paystackSecretKey
}

// ============ Reference Generator ============

export function generateReference(prefix = 'FP-PAY'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

// ============ Core API Calls ============

/**
 * Initialize a payment transaction on Paystack
 * POST /transaction/initialize
 */
export async function initializePayment(
  params: InitializePaymentParams
): Promise<PaystackResponse<PaystackInitData>> {
  const config = await getPaystackConfig()
  if (!config) {
    throw new Error('Paystack is not configured. Enable it in Settings → Channels.')
  }

  const body: Record<string, unknown> = {
    email: params.email,
    amount: params.amount,
    reference: params.reference || generateReference(),
    channels: params.channels || ['mobile_money', 'card'],
    currency: 'GHS',
  }

  if (params.metadata) {
    body.metadata = params.metadata
  }

  if (params.mobile_money && params.channels?.includes('mobile_money')) {
    body.mobile_money = params.mobile_money
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[PAYSTACK] Initialize error:', response.status, errorData)
    throw new Error(
      (errorData as Record<string, unknown>).message as string ||
        `Paystack initialization failed (${response.status})`
    )
  }

  return response.json()
}

/**
 * Verify a payment transaction on Paystack
 * GET /transaction/verify/:reference
 */
export async function verifyPayment(
  reference: string
): Promise<PaystackResponse<PaymentData>> {
  const config = await getPaystackConfig()
  if (!config) {
    throw new Error('Paystack is not configured.')
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[PAYSTACK] Verify error:', response.status, errorData)
    throw new Error(
      (errorData as Record<string, unknown>).message as string ||
        `Paystack verification failed (${response.status})`
    )
  }

  return response.json()
}

/**
 * Test the Paystack connection by fetching the integration's bank list
 * GET /bank?currency=GHS&perPage=1
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getPaystackConfig()
    if (!config) {
      return { success: false, message: 'Paystack is not enabled or secret key is missing.' }
    }

    const response = await fetch(`${PAYSTACK_BASE_URL}/bank?currency=GHS&perPage=1`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
      },
    })

    if (!response.ok) {
      return { success: false, message: `Paystack rejected the secret key (HTTP ${response.status}). Check your key and mode.` }
    }

    const data = await response.json()
    if (data.status) {
      return { success: true, message: `Connected successfully (${config.mode} mode).` }
    }
    return { success: false, message: 'Paystack returned an unexpected response.' }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Connection test failed.' }
  }
}
