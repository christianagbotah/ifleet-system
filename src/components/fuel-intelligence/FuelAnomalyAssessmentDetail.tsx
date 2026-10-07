'use client'

import * as React from 'react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FuelAnomalyAssessmentDetailView } from '@/lib/services/fuel-anomaly-query-service'

type ReviewStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive'
type OutcomeCode = 'verified_legitimate' | 'data_entry_error' | 'duplicate_record' | 'mechanical_issue' | 'route_or_operational_factor' | 'supplier_or_price_issue' | 'fuel_loss_confirmed' | 'policy_violation_confirmed' | 'insufficient_evidence' | 'other'

const OUTCOMES: Array<{ value: OutcomeCode; label: string }> = [
  { value: 'verified_legitimate', label: 'Verified legitimate' },
  { value: 'data_entry_error', label: 'Data entry error' },
  { value: 'duplicate_record', label: 'Duplicate record' },
  { value: 'mechanical_issue', label: 'Mechanical issue' },
  { value: 'route_or_operational_factor', label: 'Route / operational factor' },
  { value: 'supplier_or_price_issue', label: 'Supplier / price issue' },
  { value: 'fuel_loss_confirmed', label: 'Fuel loss confirmed' },
  { value: 'policy_violation_confirmed', label: 'Policy violation confirmed' },
  { value: 'insufficient_evidence', label: 'Insufficient evidence' },
  { value: 'other', label: 'Other' },
]

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function nextStatuses(status: ReviewStatus): ReviewStatus[] {
  if (status === 'open') return ['acknowledged']
  if (status === 'acknowledged') return ['investigating']
  if (status === 'investigating') return ['resolved', 'false_positive']
  return ['investigating']
}

function parseExplanation(raw: string | null): { summary?: string; investigationQuestions?: string[] } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { summary?: string; investigationQuestions?: string[] }
    return parsed
  } catch {
    return { summary: raw }
  }
}

export function FuelAnomalyAssessmentDetail({ assessmentId, onReviewed }: { assessmentId: string; onReviewed?: () => void }) {
  const [assessment, setAssessment] = React.useState<FuelAnomalyAssessmentDetailView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [toStatus, setToStatus] = React.useState<ReviewStatus | ''>('')
  const [outcomeCode, setOutcomeCode] = React.useState<OutcomeCode | ''>('')
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<{ assessment: FuelAnomalyAssessmentDetailView }>(`/api/ai/fuel-anomaly/${assessmentId}`)
      setAssessment(response.assessment)
      setToStatus('')
      setOutcomeCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fuel variance review')
    } finally {
      setLoading(false)
    }
  }, [assessmentId])

  React.useEffect(() => { void load() }, [load])

  const submitReview = async () => {
    if (!assessment || !toStatus) return
    if ((toStatus === 'resolved' || toStatus === 'false_positive') && !outcomeCode) {
      setError('Select an outcome before closing this review.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/ai/fuel-anomaly/${assessment.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ toStatus, outcomeCode: outcomeCode || undefined, notes: notes.trim() || undefined }),
      })
      setNotes('')
      await load()
      onReviewed?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review update failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card><CardContent className="py-10 text-sm text-muted-foreground">Loading Fuel variance review…</CardContent></Card>
  if (error && !assessment) return <Card><CardContent className="py-8 text-sm text-destructive">{error}</CardContent></Card>
  if (!assessment) return null

  const explanation = parseExplanation(assessment.explanationOutput)
  const options = nextStatuses(assessment.status)

  return (
    <div className="space-y-4" data-testid="fuel-anomaly-detail">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Fuel variance review</CardTitle>
              <CardDescription>{assessment.subjectType.replace('_', ' ')} · {assessment.subjectKey}</CardDescription>
            </div>
            <Badge variant="outline">{assessment.status.replace('_', ' ')}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Risk score</p><p className="text-2xl font-semibold">{assessment.overallRiskScore}/100</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Confidence</p><p className="text-2xl font-semibold">{percent(assessment.confidence)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Data quality</p><p className="text-2xl font-semibold">{percent(assessment.dataQuality)}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Deterministic findings</CardTitle><CardDescription>Evidence-backed indicators generated by versioned server rules and baselines.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {assessment.findings.length === 0 && <p className="text-sm text-muted-foreground">No integrity findings for this assessment.</p>}
          {assessment.findings.map((finding) => {
            const cohort = typeof finding.evidence.cohortType === 'string' ? finding.evidence.cohortType : null
            const sampleSize = typeof finding.evidence.sampleSize === 'number' ? finding.evidence.sampleSize : null
            return (
              <div key={finding.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2"><Badge>{finding.severity}</Badge><span className="text-xs text-muted-foreground">Finding code</span><code className="text-xs">{finding.code}</code></div>
                <p className="text-sm">{finding.reason}</p>
                <p className="text-xs text-muted-foreground">{finding.recommendedAction}</p>
                {(cohort || sampleSize != null) && <div className="flex gap-4 text-xs"><span>Baseline cohort: <strong>{cohort ?? '—'}</strong></span><span>Sample size: <strong>{sampleSize ?? '—'}</strong></span></div>}
                <details className="text-xs"><summary className="cursor-pointer font-medium">Evidence</summary><pre className="mt-2 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{JSON.stringify(finding.evidence, null, 2)}</pre></details>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">AI explanation — non-authoritative</CardTitle><CardDescription>Explanation only. Deterministic findings, severity and risk remain server-owned.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{explanation?.summary ?? 'No AI explanation was stored for this assessment.'}</p>
          {explanation?.investigationQuestions?.length ? <ul className="list-disc pl-5 text-muted-foreground">{explanation.investigationQuestions.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          <p className="text-xs text-muted-foreground">Source: {assessment.explanationSource ?? 'none'}{assessment.explanationProvider ? ` · ${assessment.explanationProvider}` : ''}{assessment.explanationModel ? ` · ${assessment.explanationModel}` : ''}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Review history</CardTitle><CardDescription>Append-only human review trail.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {assessment.reviewEvents.length === 0 ? <p className="text-sm text-muted-foreground">No review actions yet.</p> : assessment.reviewEvents.map((event) => (
            <div key={event.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span>{event.fromStatus} → <strong>{event.toStatus}</strong></span><span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span></div>
              {event.outcomeCode && <p className="text-xs mt-1">Outcome: {event.outcomeCode.replaceAll('_', ' ')}</p>}
              {event.notes && <p className="text-xs text-muted-foreground mt-1">{event.notes}</p>}
            </div>
          ))}

          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="mb-1 text-xs font-medium">Next review state</p><Select value={toStatus} onValueChange={(value) => setToStatus(value as ReviewStatus)}><SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger><SelectContent>{options.map((status) => <SelectItem key={status} value={status}>{status.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
            {(toStatus === 'resolved' || toStatus === 'false_positive') && <div><p className="mb-1 text-xs font-medium">Outcome</p><Select value={outcomeCode} onValueChange={(value) => setOutcomeCode(value as OutcomeCode)}><SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger><SelectContent>{OUTCOMES.map((outcome) => <SelectItem key={outcome.value} value={outcome.value}>{outcome.label}</SelectItem>)}</SelectContent></Select></div>}
          </div>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Review notes (optional)" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={!toStatus || saving} onClick={submitReview}>{saving ? 'Saving…' : 'Save review action'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
