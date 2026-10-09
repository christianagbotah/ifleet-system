'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, WalletCards } from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface ReconciliationResponse {
  trip: { id: string; tripNumber: string; status: string }
  snapshot: {
    totals: { fuel: number; tolls: number; expenses: number; adjustments: number; operationalCost: number; advances: number }
    blockers: Array<{ code: string; sourceId: string; message: string }>
    duplicates: Array<{ sourceId: string; duplicateOf: string }>
  }
  latest: { id: string; version: number; status: string; approvedAt?: string | null } | null
}

export function TripReconciliationPanel({ tripId, status, onFinalized }: { tripId: string; status: string; onFinalized?: () => void }) {
  const user = useAuthStore((store) => store.user)
  const canResolve = user?.role === 'Admin' || user?.role === 'Manager'
  const [data, setData] = React.useState<ReconciliationResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [finalizing, setFinalizing] = React.useState(false)
  const [resolvingId, setResolvingId] = React.useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = React.useState('')
  const [adjustmentAmount, setAdjustmentAmount] = React.useState('0')
  const [adjustmentReason, setAdjustmentReason] = React.useState('')
  const [savingResolution, setSavingResolution] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await apiFetch<ReconciliationResponse>(`/api/trips/${tripId}/reconciliation`))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load reconciliation')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  React.useEffect(() => { load() }, [load])

  async function finalize() {
    setFinalizing(true)
    try {
      await apiFetch(`/api/trips/${tripId}/reconciliation`, { method: 'POST', body: JSON.stringify({ action: 'finalize' }) })
      toast.success('Trip reconciliation finalized')
      await load()
      onFinalized?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reconciliation could not be finalized')
    } finally {
      setFinalizing(false)
    }
  }

  async function resolveFinancialReview() {
    if (!resolvingId || !resolutionNotes.trim()) {
      toast.error('Resolution notes are required')
      return
    }
    const amount = Number(adjustmentAmount || 0)
    if (!Number.isFinite(amount)) {
      toast.error('Adjustment amount must be a valid number')
      return
    }
    if (amount !== 0 && !adjustmentReason.trim()) {
      toast.error('Explain the financial adjustment before resolving this review')
      return
    }

    setSavingResolution(true)
    try {
      await apiFetch(`/api/trips/${tripId}/reconciliation`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'resolve_exception',
          exceptionId: resolvingId,
          resolutionNotes: resolutionNotes.trim(),
          adjustmentAmount: amount,
          adjustmentReason: amount === 0 ? null : adjustmentReason.trim(),
        }),
      })
      toast.success(amount === 0 ? 'Financial review resolved with no adjustment' : 'Financial review resolved and adjustment recorded')
      setResolvingId(null)
      setResolutionNotes('')
      setAdjustmentAmount('0')
      setAdjustmentReason('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Financial review could not be resolved')
    } finally {
      setSavingResolution(false)
    }
  }

  if (loading && !data) {
    return <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading reconciliation…</CardContent></Card>
  }
  if (!data) return null
  const { totals, blockers, duplicates } = data.snapshot
  const canFinalize = status === 'awaiting_reconciliation' && blockers.length === 0

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold"><WalletCards className="h-4 w-4" /> Trip reconciliation</div>
            <p className="mt-1 text-xs text-muted-foreground">Live source facts with de-duplication and delivery-exception gates.</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[
            ['Fuel', totals.fuel], ['Tolls', totals.tolls], ['Other expenses', totals.expenses],
            ['Adjustments', totals.adjustments], ['Operational cost', totals.operationalCost], ['Advances', totals.advances],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="mt-1 text-sm font-semibold">GHS {Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          ))}
        </div>

        {duplicates.length > 0 && <p className="text-xs text-muted-foreground">{duplicates.length} duplicate expense reference{duplicates.length === 1 ? '' : 's'} excluded from cost.</p>}

        {blockers.length > 0 ? (
          <div className="space-y-2">
            {blockers.map((blocker) => (
              <div key={`${blocker.code}-${blocker.sourceId}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{blocker.message}</div>
                {canResolve && blocker.code === 'RECONCILIATION_EXCEPTION_OPEN' && resolvingId !== blocker.sourceId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 bg-white"
                    onClick={() => {
                      setResolvingId(blocker.sourceId)
                      setResolutionNotes('')
                      setAdjustmentAmount('0')
                      setAdjustmentReason('')
                    }}
                  >
                    Resolve financial review
                  </Button>
                )}
                {canResolve && resolvingId === blocker.sourceId && (
                  <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-white p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`resolution-notes-${blocker.sourceId}`}>Resolution notes *</Label>
                      <Textarea
                        id={`resolution-notes-${blocker.sourceId}`}
                        value={resolutionNotes}
                        onChange={(event) => setResolutionNotes(event.target.value)}
                        placeholder="Record what was reviewed and why this closes the exception"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`adjustment-amount-${blocker.sourceId}`}>Financial adjustment (GHS)</Label>
                        <Input
                          id={`adjustment-amount-${blocker.sourceId}`}
                          inputMode="decimal"
                          value={adjustmentAmount}
                          onChange={(event) => setAdjustmentAmount(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`adjustment-reason-${blocker.sourceId}`}>Adjustment reason</Label>
                        <Input
                          id={`adjustment-reason-${blocker.sourceId}`}
                          value={adjustmentReason}
                          onChange={(event) => setAdjustmentReason(event.target.value)}
                          placeholder="Required when amount is not zero"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={resolveFinancialReview} disabled={savingResolution || !resolutionNotes.trim()}>
                        {savingResolution && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        Save review decision
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setResolvingId(null)} disabled={savingResolution}>Cancel</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Use 0.00 when the corrected evidence has no financial impact. Non-zero adjustments are recorded as approved reconciliation adjustments; prior paid snapshots are not rewritten.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" />No blocking delivery or financial exceptions.</div>
        )}

        {data.latest && <p className="text-xs text-muted-foreground">Latest saved reconciliation: v{data.latest.version} · {data.latest.status}</p>}

        <Button className="w-full" disabled={!canFinalize || finalizing} onClick={finalize}>
          {finalizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Finalize reconciliation
        </Button>
        {status !== 'awaiting_reconciliation' && <p className="text-center text-[11px] text-muted-foreground">Move the trip to Awaiting Reconciliation before final approval.</p>}
      </CardContent>
    </Card>
  )
}
