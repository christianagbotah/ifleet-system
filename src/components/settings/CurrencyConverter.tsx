'use client'

import * as React from 'react'
import {
  ArrowRightLeft, DollarSign, Calculator, RefreshCw, Save, Info,
  TrendingUp, TrendingDown, Minus, Loader2, Radio, Clock, WifiOff, Globe,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useCurrency, type ExchangeRate, DEFAULT_EXCHANGE_RATES } from '@/lib/currency-context'
import { useAuthStore } from '@/lib/store/auth'

// ============ EXCHANGE RATES DISPLAY CARD ============

function ExchangeRatesCard() {
  const { exchangeRates, baseCurrency, getRate, liveRateInfo } = useCurrency()

  const nonBase = exchangeRates.filter((r) => r.code !== baseCurrency)

  const isLive = liveRateInfo.source === 'live' || liveRateInfo.source === 'open.er-api.com'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Current Exchange Rates (Base: {baseCurrency})
        </div>
        {liveRateInfo.lastFetched && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {isLive ? 'Live' : 'Manual'} &middot; {formatTimestamp(liveRateInfo.lastFetched)}
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Base currency always 1:1 */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm font-bold text-amber-700 dark:text-amber-400">
              {exchangeRates.find((r) => r.code === baseCurrency)?.symbol ?? baseCurrency}
            </div>
            <div>
              <div className="font-medium text-sm">{baseCurrency}</div>
              <div className="text-xs text-muted-foreground">
                {exchangeRates.find((r) => r.code === baseCurrency)?.name}
              </div>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            1 {baseCurrency} = 1 {baseCurrency}
          </Badge>
        </div>

        {nonBase.map((rate) => {
          const inverseRate = rate.rateToBase > 0 ? Math.round((1 / rate.rateToBase) * 100) / 100 : 0
          return (
            <div key={rate.code} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-sm font-bold text-sky-700 dark:text-sky-400">
                  {rate.symbol}
                </div>
                <div>
                  <div className="font-medium text-sm">{rate.code}</div>
                  <div className="text-xs text-muted-foreground">{rate.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs">
                  1 {baseCurrency} = {rate.rateToBase < 1 ? rate.rateToBase.toFixed(4) : rate.rateToBase.toFixed(2)} {rate.code}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  1 {rate.code} = {inverseRate.toFixed(inverseRate < 10 ? 4 : 2)} {baseCurrency}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============ LIVE RATES CONTROLS ============

function LiveRatesControls() {
  const { fetchLiveRates, liveRateInfo, baseCurrency } = useCurrency()
  const [autoRefresh, setAutoRefresh] = React.useState(false)

  const handleFetchLive = React.useCallback(async () => {
    const success = await fetchLiveRates()
    if (success) {
      toast.success('Exchange rates updated from live market data')
    } else {
      toast.error(liveRateInfo.fetchError || 'Failed to fetch live rates')
    }
  }, [fetchLiveRates, liveRateInfo.fetchError])

  // Auto-refresh every 10 minutes
  React.useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(async () => {
      await fetchLiveRates()
    }, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLiveRates])

  const isLive = liveRateInfo.source === 'live' || liveRateInfo.source === 'open.er-api.com'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Live Market Rates
        </div>
        {isLive && liveRateInfo.lastFetched && (
          <Badge
            variant="outline"
            className="border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 text-[10px]"
          >
            <Radio className="h-3 w-3 mr-1" />
            Live
          </Badge>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <Button
          variant="outline"
          onClick={handleFetchLive}
          disabled={liveRateInfo.isFetching}
          className="flex-1 sm:flex-none gap-2"
        >
          {liveRateInfo.isFetching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" />
              Fetch Live Rates
            </>
          )}
        </Button>
      </div>

      {/* Auto-refresh toggle */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Auto-refresh every 10 min
          </Label>
          <p className="text-xs text-muted-foreground">
            Automatically update rates from market data
          </p>
        </div>
        <Switch
          checked={autoRefresh}
          onCheckedChange={setAutoRefresh}
        />
      </div>

      {/* Status info */}
      {liveRateInfo.fetchError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
          <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-700 dark:text-red-300">
            {liveRateInfo.fetchError}
          </div>
        </div>
      )}

      {isLive && liveRateInfo.lastFetched && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30">
          <Radio className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <div className="text-xs text-emerald-700 dark:text-emerald-300">
            Rates sourced from open.er-api.com &middot; Last updated: {formatTimestamp(liveRateInfo.lastFetched)}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ QUICK CONVERTER ============

function QuickConverter() {
  const { exchangeRates, baseCurrency, convert, formatCurrency, liveRateInfo } = useCurrency()
  const [amount, setAmount] = React.useState<string>('')
  const [fromCurrency, setFromCurrency] = React.useState<string>(baseCurrency)

  const numericAmount = parseFloat(amount) || 0
  const otherCurrencies = exchangeRates.filter((r) => r.code !== fromCurrency)

  const isLive = liveRateInfo.source === 'live' || liveRateInfo.source === 'open.er-api.com'

  // Sync fromCurrency when base changes
  React.useEffect(() => {
    if (fromCurrency === baseCurrency) return
    // Keep user's selection unless it was the base
  }, [baseCurrency, fromCurrency])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0">
          Quick Conversion Calculator
        </div>
        {isLive && (
          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-700">
            <Radio className="h-3 w-3 mr-1" />
            Live Rates
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div className="space-y-2">
          <Label htmlFor="convert-amount">Amount</Label>
          <Input
            id="convert-amount"
            type="number"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-lg font-mono h-12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="convert-from">Currency</Label>
          <Select value={fromCurrency} onValueChange={setFromCurrency}>
            <SelectTrigger id="convert-from" className="w-full h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {exchangeRates.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                  {r.code} ({r.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {numericAmount > 0 && (
        <div className="space-y-1.5 pt-1">
          {otherCurrencies.map((toRate) => {
            const converted = convert(numericAmount, fromCurrency, toRate.code)
            const trendIcon =
              converted > numericAmount ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              ) : converted < numericAmount ? (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              )
            return (
              <div
                key={toRate.code}
                className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border"
              >
                <div className="flex items-center gap-2">
                  {trendIcon}
                  <span className="text-sm font-medium text-muted-foreground">{toRate.code}</span>
                </div>
                <span className="font-mono text-sm font-semibold">
                  {formatCurrency(converted, toRate.code)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {numericAmount === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          Enter an amount above to see conversions
        </div>
      )}
    </div>
  )
}

// ============ RATE EDITOR (ADMIN ONLY) ============

function RateEditor() {
  const { exchangeRates, baseCurrency, updateExchangeRates } = useCurrency()
  const [editRates, setEditRates] = React.useState<ExchangeRate[]>([])
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const startEditing = React.useCallback(() => {
    setEditRates(exchangeRates.map((r) => ({ ...r })))
    setEditing(true)
  }, [exchangeRates])

  const cancelEditing = React.useCallback(() => {
    setEditing(false)
    setEditRates([])
  }, [])

  const handleRateChange = React.useCallback((code: string, value: string) => {
    setEditRates((prev) =>
      prev.map((r) => {
        if (r.code !== code) return r
        const parsed = parseFloat(value)
        if (isNaN(parsed) || parsed < 0) return r
        return { ...r, rateToBase: parsed }
      })
    )
  }, [])

  const handleSave = React.useCallback(async () => {
    setSaving(true)
    try {
      const token = useAuthStore.getState().token
      const res = await fetch('/api/currencies', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ exchangeRates: editRates, baseCurrency }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save' }))
        throw new Error(data.error || 'Failed to save exchange rates')
      }
      updateExchangeRates(editRates)
      setEditing(false)
      toast.success('Exchange rates updated successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rates')
    } finally {
      setSaving(false)
    }
  }, [editRates, baseCurrency, updateExchangeRates])

  const handleReset = React.useCallback(() => {
    setEditRates(DEFAULT_EXCHANGE_RATES.map((r) => ({ ...r })))
  }, [])

  if (!editing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          Edit Rates Manually
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 mt-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Edit Exchange Rates (relative to {baseCurrency})
      </div>
      <div className="space-y-2">
        {editRates.map((rate) => (
          <div key={rate.code} className="flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-[90px]">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                {rate.symbol}
              </div>
              <span className="font-medium text-sm">{rate.code}</span>
            </div>
            <div className="flex-1">
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={rate.rateToBase}
                onChange={(e) => handleRateChange(rate.code, e.target.value)}
                className="font-mono text-sm h-9"
                disabled={rate.code === baseCurrency}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {rate.code === baseCurrency ? '(base)' : `per 1 ${baseCurrency}`}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Rates
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Reset Defaults
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelEditing}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ============ BASE CURRENCY SELECTOR ============

function BaseCurrencySelector() {
  const { baseCurrency, exchangeRates, setBaseCurrency } = useCurrency()

  const handleChange = (code: string) => {
    setBaseCurrency(code)
    toast.success(`Base currency changed to ${code}`)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="base-currency">Base Currency</Label>
      <Select value={baseCurrency} onValueChange={handleChange}>
        <SelectTrigger id="base-currency" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {exchangeRates.map((r) => (
            <SelectItem key={r.code} value={r.code}>
              {r.symbol} {r.code} — {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground">
        All amounts are stored in this currency. Changing it will recalculate all exchange rates.
      </p>
    </div>
  )
}

// ============ HELPERS ============

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`

    const diffHrs = Math.floor(diffMin / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoString
  }
}

// ============ MAIN CURRENCY CONVERTER COMPONENT ============

export function CurrencyConverter() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager'

  return (
    <div className="space-y-4">
      {/* Exchange Rates Display + Live Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-2">
              <ArrowRightLeft className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <CardTitle className="text-base">Exchange Rates</CardTitle>
              <CardDescription>
                Real-time currency conversion between GHS, USD, EUR, GBP, XOF, NGN, CNY
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <LiveRatesControls />
          <Separator />
          <ExchangeRatesCard />
          <Separator />
          <QuickConverter />
        </CardContent>
      </Card>

      {/* Admin: Rate Editing & Base Currency */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                <DollarSign className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base">Currency Settings</CardTitle>
                <CardDescription>
                  Configure base currency and manually edit exchange rate values
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <BaseCurrencySelector />
            <Separator />
            <RateEditor />
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Live rates</strong> are fetched from open.er-api.com and cached for 10 minutes.
                You can also manually edit rates below. Supported currencies: GHS, USD, EUR, GBP, XOF, NGN, CNY.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
