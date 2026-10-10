'use client'

import * as React from 'react'
import { AlertTriangle, Bot, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

interface FuelReviewCase {
  id: string
  subjectId: string | null
  severity: string
  status: string
  modelKey: string
  modelVersion: string
  confidence: number
  dataQualityGrade: string
  explanation: string
  evidence: string | null
  resolution: string | null
  createdAt: string
}

interface ReviewResponse {
  cases: FuelReviewCase[]
}

function parseJson(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function FuelAiReviewQueue() {
  const isDemo = useAuthStore((state) => Boolean(state.user?.isDemo))
  const [cases, setCases] = React.useState<FuelReviewCase[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [notes, setNotes] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiFetch<ReviewResponse>('/api/ai-ops/fuel/review-cases?status=all&limit=50')
      setCases(result.cases)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load AI review cases')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  async function act(reviewCase: FuelReviewCase, action: 'confirm_data_error' | 'explain' | 'dismiss' | 'escalate') {
    const note = (notes[reviewCase.id] ?? '').trim()
    if (action !== 'dismiss' && !note) {
      toast.error('Add a review note before applying this action.')
      return
    }
    setBusyId(reviewCase.id)
    try {
      await apiFetch(`/api/ai-ops/fuel/review-cases/${reviewCase.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, note }),
      })
      toast.success('Fuel review case updated')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update review case')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading AI review queue…</CardContent></Card>
  }

  if (cases.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
          <p className="font-medium">No fuel cases need human review</p>
          <p className="mt-1 text-sm text-muted-foreground">Deterministic checks remain advisory and only create cases above the review threshold.</p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {isDemo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Demo mode is read-only. You can inspect review evidence, but resolution actions are disabled.
        </div>
      )}
      {cases.map((reviewCase) => {
        const explanation = parseJson(reviewCase.explanation)
        const evidence = parseJson(reviewCase.evidence)
        const reasons = Array.isArray(explanation.reasons) ? explanation.reasons.map(String) : []
        const open = reviewCase.status === 'open' || reviewCase.status === 'escalated'
        return (
          <Card key={reviewCase.id} className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" />AI fuel review</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{reviewCase.modelKey} · v{reviewCase.modelVersion} · {new Date(reviewCase.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{reviewCase.dataQualityGrade}</Badge>
                  <Badge variant={reviewCase.status === 'open' ? 'destructive' : 'secondary'}>{reviewCase.status.replaceAll('_', ' ')}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Confidence</p><p className="font-semibold">{Math.round(reviewCase.confidence * 100)}%</p></div>
                <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Vehicle</p><p className="font-semibold">{String(evidence.plateNumber ?? '—')}</p></div>
                <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Fuel log</p><p className="truncate font-mono text-xs">{reviewCase.subjectId ?? '—'}</p></div>
              </div>

              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">{String(explanation.summary ?? 'Fuel evidence requires operator review.')}</p>
                {reasons.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Evidence: {reasons.join(' · ')}</p>}
              </div>

              {open && (
                <div className="space-y-3">
                  <Textarea
                    value={notes[reviewCase.id] ?? ''}
                    onChange={(event) => setNotes((current) => ({ ...current, [reviewCase.id]: event.target.value }))}
                    placeholder="Operator review note…"
                    disabled={isDemo || busyId === reviewCase.id}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={isDemo || busyId === reviewCase.id} onClick={() => void act(reviewCase, 'confirm_data_error')}>
                      <AlertTriangle className="mr-2 h-4 w-4" />Confirm data error
                    </Button>
                    <Button size="sm" variant="outline" disabled={isDemo || busyId === reviewCase.id} onClick={() => void act(reviewCase, 'explain')}>Add explanation</Button>
                    <Button size="sm" variant="outline" disabled={isDemo || busyId === reviewCase.id} onClick={() => void act(reviewCase, 'dismiss')}>Dismiss</Button>
                    <Button size="sm" variant="destructive" disabled={isDemo || busyId === reviewCase.id} onClick={() => void act(reviewCase, 'escalate')}>
                      <ShieldAlert className="mr-2 h-4 w-4" />Escalate
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
