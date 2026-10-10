'use client'

import * as React from 'react'
import { Activity, Clock3, Database, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'

interface ModelHealthItem {
  modelKey: string
  version: string
  family: string
  status: 'shadow' | 'advisory' | 'disabled'
  minimumDataQuality: number
  deterministicBaseline: string
  sampleCount: number
  latestPredictionAt: string | null
  freshnessMinutes: number | null
  averageDataQuality: number | null
  evaluation: null | {
    passed: boolean
    metrics: Record<string, number>
    baselineMetrics: Record<string, number>
  }
  drift: null | {
    status: string
    score: number
    measuredAt: string
  }
}

interface ModelHealthResponse {
  models: ModelHealthItem[]
  generatedAt: string
  policy: {
    learnedModelsAreAdvisoryOnly: boolean
    promotionRequiresOfflineGate: boolean
    autonomousExecutionEnabled: boolean
  }
}

function statusLabel(status: ModelHealthItem['status']): string {
  if (status === 'shadow') return 'Shadow'
  if (status === 'advisory') return 'Advisory'
  return 'Disabled'
}

function pct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

export function ModelHealthView() {
  const [data, setData] = React.useState<ModelHealthResponse | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await apiFetch<ModelHealthResponse>('/api/ai-ops/model-health'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load AI model health')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Governed intelligence
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">AI Model Health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Shadow and advisory model hooks are observable here. Learned models cannot dispatch vehicles or promote themselves; promotion requires the offline baseline gate.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="w-fit">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <PolicyCard icon={ShieldCheck} label="Human authority" value="Required" detail="No autonomous execution" />
        <PolicyCard icon={TrendingUp} label="Promotion gate" value="Offline only" detail="Must beat deterministic baseline" />
        <PolicyCard icon={Database} label="Data quality" value="Enforced" detail="Low-quality inputs lower confidence" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {(data?.models ?? []).map((model) => (
          <Card key={`${model.modelKey}@${model.version}`} className="border-slate-200/80 dark:border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{model.family.replaceAll('_', ' ')}</CardTitle>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">{model.modelKey}@{model.version}</div>
                </div>
                <Badge variant={model.status === 'disabled' ? 'secondary' : 'outline'}>{statusLabel(model.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Samples" value={String(model.sampleCount)} />
                <Metric label="Data quality" value={pct(model.averageDataQuality)} />
                <Metric label="Freshness" value={model.freshnessMinutes == null ? '—' : `${model.freshnessMinutes}m`} />
                <Metric label="Minimum quality" value={pct(model.minimumDataQuality)} />
              </div>

              <div className="rounded-xl border bg-muted/30 p-3 text-xs">
                <div className="font-semibold">Deterministic baseline</div>
                <div className="mt-1 break-all text-muted-foreground">{model.deterministicBaseline}</div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <EvidenceRow
                  icon={Activity}
                  title="Evaluation"
                  detail={model.evaluation ? (model.evaluation.passed ? 'Promotion criteria passed' : 'Promotion criteria failed') : 'Not evaluated'}
                />
                <EvidenceRow
                  icon={Clock3}
                  title="Drift"
                  detail={model.drift ? `${model.drift.status} · ${model.drift.score.toFixed(3)}` : 'No drift evidence yet'}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && data && data.models.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No model hooks are registered.</div>
      )}
    </div>
  )
}

function PolicyCard({ icon: Icon, label, value, detail }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div>
      <div className="mt-3 text-xl font-black">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 p-3"><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</div><div className="mt-1 text-sm font-bold">{value}</div></div>
}

function EvidenceRow({ icon: Icon, title, detail }: { icon: React.ComponentType<{ className?: string }>; title: string; detail: string }) {
  return <div className="flex gap-2 rounded-xl border p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" /><div><div className="text-xs font-semibold">{title}</div><div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{detail}</div></div></div>
}
