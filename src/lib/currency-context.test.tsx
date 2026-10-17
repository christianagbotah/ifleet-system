import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('CurrencyProvider public settings bootstrap', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('loads currency from the narrow public settings endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ currency: 'USD' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const { CurrencyProvider, useCurrency } = await import('./currency-context')

    function Probe() {
      const { currencyCode, currencySymbol } = useCurrency()
      return <div data-testid="currency">{currencyCode}:{currencySymbol}</div>
    }

    render(<CurrencyProvider><Probe /></CurrencyProvider>)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/settings/public')
      expect(screen.getByTestId('currency')).toHaveTextContent('USD:$')
    })
  })
})
