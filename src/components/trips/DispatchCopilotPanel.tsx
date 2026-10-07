'use client'

import * as React from 'react'
import { Loader2, Sparkles, ShieldAlert, CheckCircle2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

type DispatchOption = {
  id: string
  label: string
}

type DispatchCandidate = {
  driverId: string
  truckId: string
  score: number
  confidence: number
  dataQuality: number
  reasons: string[]
  explanation: string
}

type DispatchResponse = {
  recommendationId: string
  candidates: DispatchCandidate[]
  confidence: number
  dataQuality: number
  explanationSource: 'ai' | 'deterministic'
  summary: string | null
  blockedDrivers: Array<{ id: string; eligibility?: { hardBlocks?: string[]; warnings?: string[] } }>
  blockedTrucks: Array<{ id: string; eligibility?: { hardBlocks?: string[]; warnings?: string[] } }>
}

type DispatchDecisionResponse = {
  recommendationId: string
  decision: string | null
  selectedDriverId: string | null
  selectedTruckId: string | null
  stale: boolean
  status: string
}

export type DispatchCopilotPanelProps = {
  tripId?: string | null
  departureTime?: string | null
  destinationZoneId?: string | null
  quantity?: number | null
  cargoUnit?: string | null
  driverOptions: DispatchOption[]
  truckOptions: DispatchOption[]
  disabled?: boolean
  onUseRecommendation: (selection: {
    driverId: string
    truckId: string
    recommendationId: string
  }) => void
}

function percent(value: number): string {
  const normalized = value <= 1 ? value * 100 : value
  return `${Math.round(Math.max(0, Math.min(100, normalized)))}%`
}

export function DispatchCopilotPanel({
  tripId,
  departureTime,
  destinationZoneId,
  quantity,
  cargoUnit,
  driverOptions,
  truckOptions,
  disabled,
  onUseRecommendation,
}: DispatchCopilotPanelProps) {
  const [loading, setLoading] = React.useState(false)
  const [applyingId, setApplyingId] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<DispatchResponse | null>(null)

  const driverLabels = React.useMemo(
    () => new Map(driverOptions.map((option) => [option.id, option.label])),
    [driverOptions],
  )
  const truckLabels = React.useMemo(
    () => new Map(truckOptions.map((option) => [option.id, option.label])),
    [truckOptions],
  )

  const canRequest = Boolean(tripId || departureTime)

  async function requestRecommendations() {
    if (!canRequest || loading || disabled) return

    setLoading(true)
    try {
      const body = tripId
        ? { tripId }
        : {
            tripDraft: {
              departureTime: new Date(departureTime as string).toISOString(),
              destinationZoneId: destinationZoneId || null,
              quantity: typeof quantity === 'number' && quantity > 0 ? quantity : null,
              cargoUnit: cargoUnit || null,
            },
          }

      const response = await apiFetch<DispatchResponse>('/api/ai/dispatch-suggest', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setResult(response)

      if (response.candidates.length === 0) {
        toast.info('No eligible driver/truck pair is available for this trip yet.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate dispatch recommendations')
    } finally {
      setLoading(false)
    }
  }

  async function useRecommendation(candidate: DispatchCandidate) {
    if (!result?.recommendationId || applyingId || disabled) return

    const recommendationId = result.recommendationId
    setApplyingId(`${candidate.driverId}:${candidate.truckId}`)
    try {
      const decision = await apiFetch<DispatchDecisionResponse>(
        `/api/ai/dispatch-recommendations/${recommendationId}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision: 'accepted',
            selectedDriverId: candidate.driverId,
            selectedTruckId: candidate.truckId,
            reason: 'Dispatcher selected Dispatch Copilot recommendation',
          }),
        },
      )

      if (decision.stale) {
        toast.error('This recommendation is no longer available. Refresh the suggestions before using it.')
        return
      }

      onUseRecommendation({
        driverId: candidate.driverId,
        truckId: candidate.truckId,
        recommendationId,
      })
      toast.success('Driver and truck prefilled. Review the trip before saving.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not apply dispatch recommendation')
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Dispatch Copilot</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Server-verified driver and truck suggestions. You remain in control of the assignment.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestRecommendations}
          disabled={!canRequest || loading || disabled}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {result ? 'Refresh suggestions' : 'Suggest assignment'}
        </Button>
      </div>

      {!canRequest && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
          <span>Set the departure time first so Dispatch Copilot can verify availability.</span>
        </div>
      )}

      {result?.summary && (
        <p className="text-xs text-muted-foreground">{result.summary}</p>
      )}

      {result && result.candidates.length > 0 && (
        <div className="space-y-3">
          {result.candidates.slice(0, 3).map((candidate, index) => {
            const pairId = `${candidate.driverId}:${candidate.truckId}`
            const isApplying = applyingId === pairId
            const lowEvidence = candidate.dataQuality < 0.75

            return (
              <div key={pairId} className="rounded-lg border bg-background p-3 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {index + 1}. {driverLabels.get(candidate.driverId) || candidate.driverId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {truckLabels.get(candidate.truckId) || candidate.truckId}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-right text-[11px]">
                    <div><span className="block text-muted-foreground">Score</span><strong>{candidate.score.toFixed(1)}</strong></div>
                    <div><span className="block text-muted-foreground">Confidence</span><strong>{percent(candidate.confidence)}</strong></div>
                    <div><span className="block text-muted-foreground">Data</span><strong>{percent(candidate.dataQuality)}</strong></div>
                  </div>
                </div>

                <p className="text-xs">{candidate.explanation}</p>

                {candidate.reasons.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {candidate.reasons.slice(0, 4).map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {lowEvidence && (
                  <div className="flex gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>Some optional evidence is missing. Review the assignment before saving.</span>
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={() => useRecommendation(candidate)}
                  disabled={Boolean(applyingId) || disabled}
                >
                  {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Use recommendation
                </Button>
              </div>
            )
          })}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setResult(null)}
            disabled={Boolean(applyingId)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Choose manually
          </Button>
        </div>
      )}
    </div>
  )
}
