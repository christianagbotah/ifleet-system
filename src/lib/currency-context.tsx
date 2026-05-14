'use client'

import React, { createContext, useContext, useEffect, useSyncExternalStore, useCallback, type ReactNode } from 'react'
import { useAuthStore } from '@/lib/store/auth'

// ============ TYPES ============

export interface ExchangeRate {
  code: string        // e.g. "GHS", "USD", "XOF"
  name: string        // e.g. "Ghana Cedi"
  symbol: string      // e.g. "₵", "$", "CFA"
  rateToBase: number  // relative to base currency (base = 1.0)
}

export interface LiveRateInfo {
  /** ISO timestamp of when live rates were last fetched */
  lastFetched: string | null
  /** Whether live rates are currently being fetched */
  isFetching: boolean
  /** Error message from last fetch attempt, if any */
  fetchError: string | null
  /** Source of the rates (e.g., "open.er-api.com" or "manual") */
  source: string
}

export interface CurrencyContextValue {
  /** Display symbol, e.g. "₵" or "$" */
  currencySymbol: string
  /** ISO 4217 code, e.g. "GHS" or "USD" */
  currencyCode: string
  /** The base (default) currency code */
  baseCurrency: string
  /** All supported exchange rates */
  exchangeRates: ExchangeRate[]
  /** Convert an amount from one currency to another */
  convert: (amount: number, from: string, to: string) => number
  /** Format an amount with the given currency symbol */
  formatCurrency: (amount: number, currency?: string) => string
  /** Update exchange rates (persists to localStorage) */
  updateExchangeRates: (rates: ExchangeRate[]) => void
  /** Set the base currency */
  setBaseCurrency: (code: string) => void
  /** Get rate for a specific currency code */
  getRate: (code: string) => number
  /** Whether the context has been hydrated from localStorage */
  isHydrated: boolean
  /** Fetch live exchange rates from external API */
  fetchLiveRates: () => Promise<boolean>
  /** Information about the last live rate fetch */
  liveRateInfo: LiveRateInfo
}

// ============ CONSTANTS ============

const SUPPORTED_CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP', 'XOF', 'NGN', 'CNY'] as const

export const DEFAULT_EXCHANGE_RATES: ExchangeRate[] = [
  { code: 'GHS', name: 'Ghana Cedi',       symbol: '₵',   rateToBase: 1 },
  { code: 'USD', name: 'US Dollar',        symbol: '$',   rateToBase: 1 / 14.5 },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA', rateToBase: 1 / 41.4 },
]

const LS_RATES_KEY = 'ifleet_exchange_rates'
const LS_BASE_KEY = 'ifleet_base_currency'
const LS_LIVE_INFO_KEY = 'ifleet_live_rate_info'

// ============ SYMBOL MAP ============

const CURRENCY_SYMBOLS: Record<string, string> = {
  GHS: '₵',
  USD: '$',
  EUR: '€',
  GBP: '£',
  NGN: '₦',
  XOF: 'CFA',
  CNY: '¥',
}

function codeToSymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code
}

// ============ CURRENCY META ============

const CURRENCY_NAMES: Record<string, string> = {
  GHS: 'Ghana Cedi',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  XOF: 'West African CFA',
  NGN: 'Nigerian Naira',
  CNY: 'Chinese Yuan',
}

function codeToName(code: string): string {
  return CURRENCY_NAMES[code] ?? code
}

// ============ EXTERNAL STORE ============

interface StoreState {
  currencySymbol: string
  currencyCode: string
  baseCurrency: string
  exchangeRates: ExchangeRate[]
  isHydrated: boolean
  liveRateInfo: LiveRateInfo
}

const DEFAULT_BASE = 'GHS'
const DEFAULT_LIVE_INFO: LiveRateInfo = {
  lastFetched: null,
  isFetching: false,
  fetchError: null,
  source: 'manual',
}
const FALLBACK: CurrencyContextValue = {
  currencySymbol: '₵',
  currencyCode: 'GHS',
  baseCurrency: DEFAULT_BASE,
  exchangeRates: DEFAULT_EXCHANGE_RATES,
  convert: () => 0,
  formatCurrency: () => '',
  updateExchangeRates: () => {},
  setBaseCurrency: () => {},
  getRate: () => 1,
  isHydrated: false,
  fetchLiveRates: async () => false,
  liveRateInfo: DEFAULT_LIVE_INFO,
}

let storeState: StoreState = {
  currencySymbol: '₵',
  currencyCode: 'GHS',
  baseCurrency: DEFAULT_BASE,
  exchangeRates: DEFAULT_EXCHANGE_RATES,
  isHydrated: false,
  liveRateInfo: { ...DEFAULT_LIVE_INFO },
}
const listeners = new Set<() => void>()
let hasFetched = false

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): StoreState {
  return storeState
}

const SERVER_SNAPSHOT: StoreState = { ...storeState, isHydrated: false }
function getServerSnapshot(): StoreState {
  return SERVER_SNAPSHOT
}

function notifyAll(): void {
  listeners.forEach((l) => l())
}

// ============ HELPERS ============

function loadFromLocalStorage(): { base: string; rates: ExchangeRate[]; liveInfo: LiveRateInfo } {
  if (typeof window === 'undefined') {
    return { base: DEFAULT_BASE, rates: DEFAULT_EXCHANGE_RATES, liveInfo: { ...DEFAULT_LIVE_INFO } }
  }
  try {
    const savedBase = localStorage.getItem(LS_BASE_KEY)
    const savedRates = localStorage.getItem(LS_RATES_KEY)
    const savedLiveInfo = localStorage.getItem(LS_LIVE_INFO_KEY)
    const base = savedBase || DEFAULT_BASE
    const rates = savedRates ? JSON.parse(savedRates) as ExchangeRate[] : DEFAULT_EXCHANGE_RATES
    const liveInfo = savedLiveInfo ? JSON.parse(savedLiveInfo) as LiveRateInfo : { ...DEFAULT_LIVE_INFO }
    return { base, rates, liveInfo }
  } catch {
    return { base: DEFAULT_BASE, rates: DEFAULT_EXCHANGE_RATES, liveInfo: { ...DEFAULT_LIVE_INFO } }
  }
}

function persistRates(rates: ExchangeRate[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_RATES_KEY, JSON.stringify(rates))
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

function persistBase(base: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_BASE_KEY, base)
  } catch {
    // silently fail
  }
}

function persistLiveInfo(info: LiveRateInfo): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_LIVE_INFO_KEY, JSON.stringify(info))
  } catch {
    // silently fail
  }
}

function recalculateRates(newBase: string, currentRates: ExchangeRate[]): ExchangeRate[] {
  const currentBaseRate = currentRates.find((r) => r.code === newBase)
  if (!currentBaseRate) return currentRates

  return currentRates.map((r) => ({
    ...r,
    rateToBase: r.code === newBase ? 1 : r.rateToBase / currentBaseRate.rateToBase,
  }))
}

/**
 * Merge live API rates into the current exchange rates array.
 * Preserves all currencies already in the array, adds new ones, removes stale ones.
 */
function mergeLiveRates(
  currentRates: ExchangeRate[],
  base: string,
  apiRates: { code: string; name: string; symbol: string; rateToBase: number }[]
): ExchangeRate[] {
  const rateMap = new Map<string, ExchangeRate>()

  // Start with existing rates (normalized to new base)
  for (const r of currentRates) {
    rateMap.set(r.code, r)
  }

  // Update/insert from API
  for (const api of apiRates) {
    rateMap.set(api.code, {
      code: api.code,
      name: api.name || codeToName(api.code),
      symbol: api.symbol || codeToSymbol(api.code),
      rateToBase: api.rateToBase,
    })
  }

  // Ensure base is always 1.0
  const baseEntry = rateMap.get(base)
  if (baseEntry) {
    baseEntry.rateToBase = 1
  } else {
    rateMap.set(base, {
      code: base,
      name: codeToName(base),
      symbol: codeToSymbol(base),
      rateToBase: 1,
    })
  }

  // Return sorted: base first, then alphabetically
  return Array.from(rateMap.values()).sort((a, b) => {
    if (a.code === base) return -1
    if (b.code === base) return 1
    return a.code.localeCompare(b.code)
  })
}

// ============ CONTEXT ============

const CurrencyContext = createContext<CurrencyContextValue>(FALLBACK)

// ============ CONVERSION FUNCTIONS ============

function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: ExchangeRate[],
  base: string
): number {
  if (from === to) return amount
  if (amount === 0) return 0

  const fromRate = rates.find((r) => r.code === from)
  const toRate = rates.find((r) => r.code === to)

  if (!fromRate || !toRate) return amount

  const amountInBase = amount / fromRate.rateToBase
  const result = amountInBase * toRate.rateToBase

  return Math.round(result * 100) / 100
}

function formatAmount(
  amount: number,
  currencyCode: string,
  rates: ExchangeRate[]
): string {
  const rate = rates.find((r) => r.code === currencyCode)
  const symbol = rate?.symbol ?? codeToSymbol(currencyCode)
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const sign = amount < 0 ? '-' : ''
  // XOF typically doesn't use decimals
  if (currencyCode === 'XOF') {
    const formattedXof = Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    return `${sign}${formattedXof} ${symbol}`
  }
  return `${sign}${symbol}${formatted}`
}

// ============ PROVIDER ============

/**
 * Enhanced currency provider with multi-currency support, live exchange rates,
 * conversion functions, and localStorage persistence.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Hydrate from localStorage on mount
  useEffect(() => {
    if (hasFetched) return
    hasFetched = true

    const { base, rates, liveInfo } = loadFromLocalStorage()
    const recalculated = recalculateRates(base, rates)

    storeState = {
      baseCurrency: base,
      currencySymbol: codeToSymbol(base),
      currencyCode: base,
      exchangeRates: recalculated,
      isHydrated: true,
      liveRateInfo: { ...liveInfo, isFetching: false },
    }
    notifyAll()

    // Also fetch currency from /api/settings for backward compatibility
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const currencyCode: string = data?.display?.currency ?? base
        if (currencyCode !== storeState.currencyCode) {
          storeState = {
            ...storeState,
            currencySymbol: codeToSymbol(currencyCode),
            currencyCode,
          }
          notifyAll()
        }
      })
      .catch(() => {
        // keep defaults
      })
  }, [])

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const convert = useCallback(
    (amount: number, from: string, to: string) =>
      convertAmount(amount, from, to, state.exchangeRates, state.baseCurrency),
    [state.exchangeRates, state.baseCurrency]
  )

  const formatCurrency = useCallback(
    (amount: number, currency?: string) =>
      formatAmount(amount, currency ?? state.currencyCode, state.exchangeRates),
    [state.exchangeRates, state.currencyCode]
  )

  const updateExchangeRates = useCallback((rates: ExchangeRate[]) => {
    const recalculated = recalculateRates(storeState.baseCurrency, rates)
    storeState = {
      ...storeState,
      exchangeRates: recalculated,
      liveRateInfo: { ...storeState.liveRateInfo, source: 'manual' },
    }
    persistRates(recalculated)
    persistLiveInfo(storeState.liveRateInfo)
    notifyAll()
  }, [])

  const setBaseCurrency = useCallback((code: string) => {
    const recalculated = recalculateRates(code, storeState.exchangeRates)
    storeState = {
      ...storeState,
      baseCurrency: code,
      currencySymbol: codeToSymbol(code),
      currencyCode: code,
      exchangeRates: recalculated,
    }
    persistBase(code)
    persistRates(recalculated)
    notifyAll()
  }, [])

  const getRate = useCallback(
    (code: string) => {
      const rate = state.exchangeRates.find((r) => r.code === code)
      return rate?.rateToBase ?? 1
    },
    [state.exchangeRates]
  )

  const fetchLiveRates = useCallback(async (): Promise<boolean> => {
    // Set fetching state
    storeState = {
      ...storeState,
      liveRateInfo: { ...storeState.liveRateInfo, isFetching: true, fetchError: null },
    }
    notifyAll()

    try {
      const token = useAuthStore.getState().token
      const res = await fetch(`/api/exchange-rates/live?base=${storeState.baseCurrency}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.error || 'Failed to fetch live rates'
        storeState = {
          ...storeState,
          liveRateInfo: {
            ...storeState.liveRateInfo,
            isFetching: false,
            fetchError: errorMsg,
          },
        }
        persistLiveInfo(storeState.liveRateInfo)
        notifyAll()
        return false
      }

      // Merge live rates into existing rates
      const merged = mergeLiveRates(
        storeState.exchangeRates,
        data.base || storeState.baseCurrency,
        data.exchangeRates.map((r: { code: string; name: string; symbol: string; rateToBase: number }) => ({
          code: r.code,
          name: r.name,
          symbol: r.symbol,
          rateToBase: r.rateToBase,
        }))
      )

      const recalculated = recalculateRates(storeState.baseCurrency, merged)

      storeState = {
        ...storeState,
        exchangeRates: recalculated,
        liveRateInfo: {
          lastFetched: data.timestamp || new Date().toISOString(),
          isFetching: false,
          fetchError: null,
          source: data.source || 'live',
        },
      }
      persistRates(recalculated)
      persistLiveInfo(storeState.liveRateInfo)
      notifyAll()
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error'
      storeState = {
        ...storeState,
        liveRateInfo: {
          ...storeState.liveRateInfo,
          isFetching: false,
          fetchError: errorMsg,
        },
      }
      persistLiveInfo(storeState.liveRateInfo)
      notifyAll()
      return false
    }
  }, [])

  const value: CurrencyContextValue = {
    currencySymbol: state.currencySymbol,
    currencyCode: state.currencyCode,
    baseCurrency: state.baseCurrency,
    exchangeRates: state.exchangeRates,
    convert,
    formatCurrency,
    updateExchangeRates,
    setBaseCurrency,
    getRate,
    isHydrated: state.isHydrated,
    fetchLiveRates,
    liveRateInfo: state.liveRateInfo,
  }

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

// ============ HOOK ============

/**
 * Returns the full currency context:
 * - `currencySymbol` — display symbol (e.g. "₵")
 * - `currencyCode` — ISO code (e.g. "GHS")
 * - `baseCurrency` — the default base currency code
 * - `exchangeRates` — array of ExchangeRate objects
 * - `convert(amount, from, to)` — convert between currencies
 * - `formatCurrency(amount, currency?)` — format with symbol
 * - `updateExchangeRates(rates)` — update rates (persists to localStorage)
 * - `setBaseCurrency(code)` — change base currency
 * - `getRate(code)` — get rate for a currency code
 * - `isHydrated` — whether context has loaded from localStorage
 * - `fetchLiveRates()` — fetch live rates from external API
 * - `liveRateInfo` — info about last live rate fetch
 */
export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext)
}
