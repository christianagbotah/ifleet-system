'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface DispatchOrderLine {
  id: string
  itemName: string
  unit: string
  remaining: number
}

export interface DispatchOrderForAssignment {
  id: string
  orderNumber: string
  shipperName: string
  loadingPointName: string
  requiredTrailerType?: string | null
  lines: DispatchOrderLine[]
}

interface DriverOption { id: string; firstName: string; lastName: string; licenseClass: string; status: string }
interface TruckOption { id: string; plateNumber: string; make: string; model: string; status: string }
interface TrailerOption { id: string; plateNumber: string; trailerType: string; status: string }
interface EligibilityPreview { passed: boolean; blocking: string[]; warnings: string[]; overrideApplied: boolean }
interface AssignmentRecommendation {
  candidateId: string
  driverId: string
  tractorId: string
  trailerId: string | null
  score: number
  confidence: number
  scoreComponents: Record<string, number>
  reasons: string[]
  warnings: string[]
  fallbackAssumptions: string[]
}
interface RecommendationResponse {
  recommendationId: string
  recommendations: AssignmentRecommendation[]
  configVersion: string
  modelVersion: string
}

const labels: Record<string, string> = {
  driver_status: 'Driver is not active',
  driver_unverified: 'Driver identity/credentials are not verified',
  driver_license_expired: 'Driver licence has expired',
  driver_license_class: 'Driver licence class does not meet this load requirement',
  driver_license_expiring_soon: 'Driver licence expires within 30 days',
  tractor_unavailable: 'Tractor is not operationally available',
  tractor_insurance_expired: 'Tractor insurance is missing or expired',
  tractor_insurance_expiring_soon: 'Tractor insurance expires within 30 days',
  tractor_roadworthy_invalid: 'Tractor roadworthy inspection is not valid/fit',
  tractor_roadworthy_expired: 'Tractor roadworthy certificate has expired',
  tractor_roadworthy_expiring_soon: 'Tractor roadworthy certificate expires within 30 days',
  tractor_maintenance_block: 'Tractor has blocking maintenance work',
  trailer_required: 'This load requires a trailer',
  trailer_unavailable: 'Selected trailer is not available',
  trailer_type: 'Selected trailer type is not allowed for this load',
  trailer_registration_expired: 'Trailer registration has expired',
  trailer_roadworthy_expired: 'Trailer roadworthy certificate has expired',
  override_applied: 'Authorized compliance override will be recorded in the audit trail',
}

function reasonLabel(code: string) {
  if (code.startsWith('missing_document:')) return `Missing required document: ${code.split(':')[1].replaceAll('_', ' ')}`
  if (code.startsWith('document_expired:')) return `Required document expired: ${code.split(':')[1].replaceAll('_', ' ')}`
  if (code.startsWith('document_expiring_soon:')) return `Document expires within 30 days: ${code.split(':')[1].replaceAll('_', ' ')}`
  return labels[code] ?? code.replaceAll('_', ' ')
}

export function AssignmentDialog({
  open,
  onOpenChange,
  order,
  onAssigned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: DispatchOrderForAssignment | null
  onAssigned: () => void
}) {
  const [drivers, setDrivers] = React.useState<DriverOption[]>([])
  const [trucks, setTrucks] = React.useState<TruckOption[]>([])
  const [trailers, setTrailers] = React.useState<TrailerOption[]>([])
  const [driverId, setDriverId] = React.useState('')
  const [tractorId, setTractorId] = React.useState('')
  const [trailerId, setTrailerId] = React.useState('none')
  const [allocations, setAllocations] = React.useState<Record<string, string>>({})
  const [override, setOverride] = React.useState(false)
  const [overrideReason, setOverrideReason] = React.useState('')
  const [eligibility, setEligibility] = React.useState<EligibilityPreview | null>(null)
  const [loadingOptions, setLoadingOptions] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [recommendations, setRecommendations] = React.useState<AssignmentRecommendation[]>([])
  const [recommendationId, setRecommendationId] = React.useState<string | null>(null)
  const [selectedRecommendationCandidateId, setSelectedRecommendationCandidateId] = React.useState<string | null>(null)
  const [recommendationsLoading, setRecommendationsLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open || !order) return
    setDriverId('')
    setTractorId('')
    setTrailerId('none')
    setOverride(false)
    setOverrideReason('')
    setEligibility(null)
    setRecommendations([])
    setRecommendationId(null)
    setSelectedRecommendationCandidateId(null)
    setAllocations(Object.fromEntries(order.lines.map((line) => [line.id, String(line.remaining)])))
    setLoadingOptions(true)
    setRecommendationsLoading(true)
    apiFetch<RecommendationResponse>(`/api/load-orders/${order.id}/recommendations`)
      .then((result) => { setRecommendations(result.recommendations); setRecommendationId(result.recommendationId) })
      .catch(() => { setRecommendations([]); setRecommendationId(null) })
      .finally(() => setRecommendationsLoading(false))
    Promise.all([
      apiFetch<{ data: DriverOption[] }>('/api/drivers?status=active&limit=100'),
      apiFetch<{ data: TruckOption[] }>('/api/trucks?status=active&limit=100'),
      apiFetch<{ data: TrailerOption[] }>('/api/trailers?status=active&limit=100'),
    ]).then(([driverResult, truckResult, trailerResult]) => {
      setDrivers(driverResult.data)
      setTrucks(truckResult.data)
      setTrailers(trailerResult.data)
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load assignment candidates'))
      .finally(() => setLoadingOptions(false))
  }, [open, order])

  const payload = React.useCallback((preview = false) => ({
    driverId,
    tractorId,
    trailerId: trailerId === 'none' ? null : trailerId,
    override,
    overrideReason,
    recommendationId: selectedRecommendationCandidateId ? recommendationId : null,
    preview,
    allocations: order?.lines.map((line) => ({ lineId: line.id, quantity: Number(allocations[line.id] || 0) })) ?? [],
  }), [allocations, driverId, order, override, overrideReason, recommendationId, selectedRecommendationCandidateId, tractorId, trailerId])

  const applyRecommendation = (recommendation: AssignmentRecommendation) => {
    setDriverId(recommendation.driverId)
    setTractorId(recommendation.tractorId)
    setTrailerId(recommendation.trailerId ?? 'none')
    setEligibility(null)
    setSelectedRecommendationCandidateId(recommendation.candidateId)
    toast.success('AI recommendation applied. Run eligibility before assignment.')
  }

  const checkEligibility = async () => {
    if (!order || !driverId || !tractorId) return toast.error('Select a driver and tractor first')
    setChecking(true)
    try {
      const result = await apiFetch<{ eligibility: EligibilityPreview }>(`/api/load-orders/${order.id}/assign`, {
        method: 'POST', body: JSON.stringify(payload(true)),
      })
      setEligibility(result.eligibility)
    } catch (error) {
      setEligibility(null)
      toast.error(error instanceof Error ? error.message : 'Eligibility check failed')
    } finally {
      setChecking(false)
    }
  }

  const assign = async () => {
    if (!order || !driverId || !tractorId) return toast.error('Select a driver and tractor')
    if (!eligibility) return toast.error('Run eligibility check before assignment')
    if (!eligibility.passed && !override) return toast.error('Resolve blockers or use an authorized override')
    if (override && overrideReason.trim().length < 8) return toast.error('Enter a clear override reason')
    setSubmitting(true)
    try {
      const result = await apiFetch<{ trip: { tripNumber: string }; eligibility: EligibilityPreview }>(`/api/load-orders/${order.id}/assign`, {
        method: 'POST', body: JSON.stringify(payload(false)),
      })
      toast.success(`Assigned to trip ${result.trip.tripNumber}`)
      onOpenChange(false)
      onAssigned()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-amber-500" /> Dispatch {order?.orderNumber}</DialogTitle>
          <DialogDescription>{order?.shipperName} · {order?.loadingPointName}. Select resources, confirm quantities, then run eligibility before assignment.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">AI recommendation</h3>
              <p className="text-xs text-muted-foreground">Advisory ranking only. Compliance eligibility remains authoritative and assignment still requires your confirmation.</p>
            </div>
            {recommendationsLoading && <Badge variant="outline">Analyzing…</Badge>}
          </div>
          {!recommendationsLoading && recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible recommendation is available from the current evidence.</p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-3">
              {recommendations.slice(0, 3).map((recommendation, index) => {
                const driver = drivers.find((item) => item.id === recommendation.driverId)
                const truck = trucks.find((item) => item.id === recommendation.tractorId)
                const trailer = trailers.find((item) => item.id === recommendation.trailerId)
                return (
                  <button
                    key={recommendation.candidateId}
                    type="button"
                    onClick={() => applyRecommendation(recommendation)}
                    className={`rounded-md border bg-background p-3 text-left transition hover:border-sky-400 ${selectedRecommendationCandidateId === recommendation.candidateId ? 'border-sky-500 ring-1 ring-sky-500' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">#{index + 1} · {recommendation.score.toFixed(1)}</span><Badge variant="secondary">{Math.round(recommendation.confidence * 100)}% confidence</Badge></div>
                    <p className="mt-2 text-xs font-medium">{driver ? `${driver.firstName} ${driver.lastName}` : recommendation.driverId}</p>
                    <p className="text-xs text-muted-foreground">{truck?.plateNumber ?? recommendation.tractorId}{trailer ? ` · ${trailer.plateNumber}` : ''}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">Reasons: {recommendation.reasons.join(' · ')}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Score components: {Object.entries(recommendation.scoreComponents).slice(0, 4).map(([key, value]) => `${key} ${value.toFixed(1)}`).join(' · ')}</p>
                    {recommendation.fallbackAssumptions.length > 0 && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Fallback assumptions: {recommendation.fallbackAssumptions.join(' · ')}</p>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label>Driver</Label><Select value={driverId || 'none'} onValueChange={(value) => { setDriverId(value === 'none' ? '' : value); setEligibility(null); setSelectedRecommendationCandidateId(null) }} disabled={loadingOptions}><SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger><SelectContent><SelectItem value="none">Select driver</SelectItem>{drivers.map((driver) => <SelectItem key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName} · Class {driver.licenseClass}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Tractor</Label><Select value={tractorId || 'none'} onValueChange={(value) => { setTractorId(value === 'none' ? '' : value); setEligibility(null); setSelectedRecommendationCandidateId(null) }} disabled={loadingOptions}><SelectTrigger><SelectValue placeholder="Select tractor" /></SelectTrigger><SelectContent><SelectItem value="none">Select tractor</SelectItem>{trucks.map((truck) => <SelectItem key={truck.id} value={truck.id}>{truck.plateNumber} · {truck.make} {truck.model}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Trailer {order?.requiredTrailerType ? `(${order.requiredTrailerType} required)` : '(optional)'}</Label><Select value={trailerId} onValueChange={(value) => { setTrailerId(value); setEligibility(null); setSelectedRecommendationCandidateId(null) }} disabled={loadingOptions}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No trailer / rigid truck</SelectItem>{trailers.map((trailer) => <SelectItem key={trailer.id} value={trailer.id}>{trailer.plateNumber} · {trailer.trailerType}</SelectItem>)}</SelectContent></Select></div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold">Load allocation</h3><p className="text-xs text-muted-foreground">Split loads are supported. Quantities cannot exceed the remaining order balance.</p></div><Badge variant="outline">{order?.lines.length ?? 0} line(s)</Badge></div>
          {order?.lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_140px] gap-3 items-center"><div><p className="text-sm font-medium">{line.itemName}</p><p className="text-xs text-muted-foreground">Remaining {line.remaining.toLocaleString()} {line.unit}</p></div><Input type="number" min="0" max={line.remaining} step="any" value={allocations[line.id] ?? ''} onChange={(event) => { setAllocations((current) => ({ ...current, [line.id]: event.target.value })); setEligibility(null) }} /></div>)}
        </div>

        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={checkEligibility} disabled={checking || loadingOptions || !driverId || !tractorId}>{checking ? 'Checking…' : 'Check eligibility'}</Button>{eligibility && <Badge className={eligibility.passed ? 'bg-emerald-600' : 'bg-red-600'}>{eligibility.passed ? 'Eligible' : 'Blocked'}</Badge>}</div>

        {eligibility && (eligibility.blocking.length > 0 || eligibility.warnings.length > 0) && <div className="grid gap-3 sm:grid-cols-2">{eligibility.blocking.length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400"><AlertTriangle className="h-4 w-4" /> Blocking</div><ul className="space-y-1 text-xs">{eligibility.blocking.map((reason) => <li key={reason}>• {reasonLabel(reason)}</li>)}</ul></div>}{eligibility.warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400"><ShieldCheck className="h-4 w-4" /> Warnings</div><ul className="space-y-1 text-xs">{eligibility.warnings.map((warning) => <li key={warning}>• {reasonLabel(warning)}</li>)}</ul></div>}</div>}

        {eligibility && eligibility.blocking.length > 0 && <div className="rounded-lg border p-4 space-y-3"><label className="flex items-start gap-3 cursor-pointer"><Checkbox checked={override} onCheckedChange={(checked) => { setOverride(checked === true); setEligibility(null) }} /><span><span className="block text-sm font-medium">Authorized compliance override</span><span className="block text-xs text-muted-foreground">Use only when operations management has accepted the documented risk. Physical resource conflicts cannot be overridden.</span></span></label>{override && <div className="space-y-2"><Label>Override reason</Label><Input value={overrideReason} onChange={(event) => { setOverrideReason(event.target.value); setEligibility(null) }} placeholder="State who approved and why this assignment must proceed" /></div>}</div>}

        {eligibility?.passed && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Eligibility gate passed. Assignment can be committed.</div>}

        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={assign} disabled={submitting || !eligibility?.passed} className="bg-amber-500 text-white hover:bg-amber-600">{submitting ? 'Assigning…' : 'Create assignment'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
