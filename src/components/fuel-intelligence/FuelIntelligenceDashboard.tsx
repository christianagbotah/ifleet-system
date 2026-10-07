'use client'

import * as React from 'react'
import { AlertTriangle, BarChart3, Database, Eye, RefreshCw, ShieldCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FuelAnomalyAssessmentDetail } from './FuelAnomalyAssessmentDetail'
import type { FuelAnomalyDashboardSummary, FuelAnomalyListResult } from '@/lib/services/fuel-anomaly-query-service'

const STATUSES = ['all', 'open', 'acknowledged', 'investigating', 'resolved', 'false_positive'] as const
const SEVERITIES = ['all', 'info', 'low', 'medium', 'high', 'critical'] as const

function pct(value: number) { return `${Math.round(value * 100)}%` }
function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) }

export function FuelIntelligenceDashboard() {
  const [summary, setSummary] = React.useState<FuelAnomalyDashboardSummary | null>(null)
  const [list, setList] = React.useState<FuelAnomalyListResult | null>(null)
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]>('all')
  const [severity, setSeverity] = React.useState<(typeof SEVERITIES)[number]>('all')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: '1', pageSize: '50' })
    if (status !== 'all') params.set('status', status)
    if (severity !== 'all') params.set('severity', severity)
    try {
      const [summaryResponse, listResponse] = await Promise.all([
        apiFetch<{ summary: FuelAnomalyDashboardSummary }>('/api/ai/fuel-anomaly?view=summary'),
        apiFetch<FuelAnomalyListResult>(`/api/ai/fuel-anomaly?${params.toString()}`),
      ])
      setSummary(summaryResponse.summary)
      setList(listResponse)
      if (selectedId && !listResponse.items.some((item) => item.id === selectedId)) setSelectedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Fuel Intelligence')
    } finally {
      setLoading(false)
    }
  }, [severity, selectedId, status])

  React.useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-5 p-1 sm:p-2" data-testid="fuel-intelligence-dashboard">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">Fuel Intelligence</h1><Badge variant="outline"><Eye className="mr-1 h-3 w-3" />Observer mode</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">Evidence-led fuel variance review. Findings are indicators for human investigation, not automatic enforcement.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><p className="mb-1 text-xs font-medium">Status</p><Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((item) => <SelectItem key={item} value={item}>{label(item)}</SelectItem>)}</SelectContent></Select></div>
          <div><p className="mb-1 text-xs font-medium">Severity</p><Select value={severity} onValueChange={(value) => setSeverity(value as typeof severity)}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{SEVERITIES.map((item) => <SelectItem key={item} value={item}>{label(item)}</SelectItem>)}</SelectContent></Select></div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>
      </div>

      {error && <Card className="border-destructive/40"><CardContent className="py-4 text-sm text-destructive">{error}</CardContent></Card>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Open assessments</p><p className="text-2xl font-semibold">{summary ? Object.values(summary.openBySeverity).reduce((a, b) => a + b, 0) : '—'}</p></div><AlertTriangle className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Average confidence</p><p className="text-2xl font-semibold">{summary ? pct(summary.averageConfidence) : '—'}</p></div><ShieldCheck className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Average data quality</p><p className="text-2xl font-semibold">{summary ? pct(summary.averageDataQuality) : '—'}</p></div><Database className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">False-positive rate</p><p className="text-2xl font-semibold">{summary ? pct(summary.review.falsePositiveRate) : '—'}</p></div><BarChart3 className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
      </div>

      {summary && <div className="grid gap-3 xl:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-base">Risk trend</CardTitle><CardDescription>Server-computed average risk by day.</CardDescription></CardHeader><CardContent className="space-y-2">{summary.riskTrend.slice(-8).map((point) => <div key={point.date} className="grid grid-cols-[90px_1fr_42px] items-center gap-2 text-xs"><span>{point.date}</span><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-foreground/60" style={{ width: `${Math.max(2, point.averageRisk)}%` }} /></div><span className="text-right">{point.averageRisk}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Data quality trend</CardTitle><CardDescription>Evidence completeness over time.</CardDescription></CardHeader><CardContent className="space-y-2">{summary.dataQualityTrend.slice(-8).map((point) => <div key={point.date} className="grid grid-cols-[90px_1fr_42px] items-center gap-2 text-xs"><span>{point.date}</span><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-foreground/60" style={{ width: `${Math.max(2, point.averageDataQuality * 100)}%` }} /></div><span className="text-right">{pct(point.averageDataQuality)}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Finding distribution</CardTitle><CardDescription>Deterministic finding codes in the selected period.</CardDescription></CardHeader><CardContent className="max-h-56 space-y-2 overflow-auto">{Object.entries(summary.findingsByCode).slice(0, 12).map(([code, count]) => <div key={code} className="flex items-center justify-between gap-3 text-xs"><code className="truncate">{code}</code><Badge variant="secondary">{count}</Badge></div>)}</CardContent></Card>
      </div>}

      {summary && <div className="grid gap-3 lg:grid-cols-3">
        {([['Top trucks', summary.topTrucks], ['Top routes', summary.topRoutes], ['Top stations', summary.topStations]] as const).map(([title, rows]) => <Card key={title}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-2">{rows.length ? rows.slice(0, 5).map((row) => <div key={row.key} className="flex justify-between gap-2 text-sm"><span className="truncate">{row.key}</span><Badge variant="outline">{row.count}</Badge></div>) : <p className="text-sm text-muted-foreground">No known evidence in this period.</p>}</CardContent></Card>)}
      </div>}

      {summary && <Card><CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4 text-sm"><div><span className="text-muted-foreground">Ruleset</span><p className="font-medium">{summary.rulesetVersions.join(', ') || '—'}</p></div><div><span className="text-muted-foreground">Baseline</span><p className="font-medium">{summary.baselineVersions.join(', ') || '—'}</p></div><div><span className="text-muted-foreground">AI explanations</span><p className="font-medium">{summary.aiExplanations.success} success · {summary.aiExplanations.fallback} fallback</p></div><div><span className="text-muted-foreground">Baseline samples</span><p className="font-medium">{summary.baselines.sampleSizeDistribution.preferred12Plus} preferred · {summary.baselines.sampleSizeDistribution.advisory6To11} advisory</p></div></CardContent></Card>}

      <div className={`grid gap-4 ${selectedId ? 'xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]' : ''}`}>
        <Card>
          <CardHeader><CardTitle className="text-base">Assessments</CardTitle><CardDescription>{list?.total ?? 0} records match the current Status / Severity filters.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {loading && !list && <p className="py-8 text-center text-sm text-muted-foreground">Loading assessments…</p>}
            {list?.items.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/50 ${selectedId === item.id ? 'ring-2 ring-ring' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><Badge>{item.overallSeverity}</Badge><Badge variant="outline">{item.status.replace('_', ' ')}</Badge></div><span className="text-xs text-muted-foreground">{new Date(item.requestedAt).toLocaleString()}</span></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm"><span>Risk <strong>{item.overallRiskScore}</strong></span><span>Confidence <strong>{pct(item.confidence)}</strong></span><span>Data quality <strong>{pct(item.dataQuality)}</strong></span><span>{item.findingCount} finding(s)</span></div></button>)}
            {list && list.items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No assessments match these filters.</p>}
          </CardContent>
        </Card>
        {selectedId && <FuelAnomalyAssessmentDetail assessmentId={selectedId} onReviewed={() => void load()} />}
      </div>
    </div>
  )
}
