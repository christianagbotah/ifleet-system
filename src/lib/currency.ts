'use client'

import { useMemo } from 'react'

const CURRENCY_LOCALE_MAP: Record<string, string> = {
  GHS: 'en-GH',
  USD: 'en-US',
  EUR: 'de-DE',
}

const DEFAULT_CURRENCY = 'GHS'

function getCurrencyPreference(): string {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY
  return localStorage.getItem('ifleetpro-currency') || DEFAULT_CURRENCY
}

export function useCurrency() {
  const currency = useMemo(() => getCurrencyPreference(), [])

  const format = useMemo(
    () =>
      (amount: number) =>
        new Intl.NumberFormat(CURRENCY_LOCALE_MAP[currency] || 'en-US', {
          style: 'currency',
          currency,
        }).format(amount),
    [currency],
  )

  const formatShort = useMemo(
    () =>
      (amount: number) =>
        new Intl.NumberFormat(CURRENCY_LOCALE_MAP[currency] || 'en-US', {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(amount),
    [currency],
  )

  return { currency, format, formatShort }
}

/**
 * Non-hook versions for use in contexts where hooks aren't available
 * (e.g. inside helper functions, callbacks).
 */
export function formatCurrency(amount: number): string {
  const currency = typeof window !== 'undefined'
    ? localStorage.getItem('ifleetpro-currency') || DEFAULT_CURRENCY
    : DEFAULT_CURRENCY
  return new Intl.NumberFormat(CURRENCY_LOCALE_MAP[currency] || 'en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatShortCurrency(amount: number): string {
  const currency = typeof window !== 'undefined'
    ? localStorage.getItem('ifleetpro-currency') || DEFAULT_CURRENCY
    : DEFAULT_CURRENCY
  return new Intl.NumberFormat(CURRENCY_LOCALE_MAP[currency] || 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
