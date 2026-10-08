'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, RotateCcw, Scale, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

interface AxleRecord {
  id: string
  axleNumber: number
  axleGroup?: string | null
  weightKg: number
  legalLimitKg?: number | null
  toleranceKg?: number | null
  exceeded: boolean
}

interface WeighingRecord {
  id: string
  stage: string
  source: string
  status: string
  grossWeightKg?: number | null
  tareWeightKg?: number | null
  netWeightKg?: number | null
  requiredAxleCount: number
  tolerancePercent: number
  clearancePassed?: boolean | null
  weighbridgeName?: string | null
  ticketNumber?: string | null
  certificateNumber?: string | null
  recordedAt: string
  supersedesEventId?: string | null
  axleReadings: AxleRecord[]
}

interface WeighingResponse {
  data: WeighingRecord[]
  effective?: {
    tare?: { tareWeightKg?: number | null } | null
    gross?: { grossWeightKg?: number | null; tareWeightKg?: number | null; netWeightKg?: number | null } | null
    axle?: { grossWeightKg?: number | null; tareWeightKg?: number | null; netWeightKg?: number | null } | null
  }
}

interface AxleDraft {
  axleNumber: number
  group: string
  weightKg: string
}

const STAGES = ['TARE', 'GROSS', 'AXLE', 'DESTINATION', 'ROAD_CHECK'] as const
const SOURCES = ['MANUAL', 'WEIGHBRIDGE_API', 'DOCUMENT_SCAN'] as const

function formatWeight(value?: number | null) {
  return value == null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`
}

export function WeighingPanel({ tripId }: { tripId: string }) {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const [records, setRecords] = React.useState<WeighingRecord[]>([])
  const [effective, setEffective] = React.useState<WeighingResponse['effective']>()
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [stage, setStage] = React.useState<(typeof STAGES)[number]>('TARE')
  const [source, setSource] = React.useState<(typeof SOURCES)[number]>('MANUAL')
  const [tareWeightKg, setTareWeightKg] = React.useState('')
  const [grossWeightKg, setGrossWeightKg] = React.useState('')
  const [requiredAxleCount, setRequiredAxleCount] = React.useState('')
  const [tolerancePercent, setTolerancePercent] = React.useState('0')
  const [weighbridgeName, setWeighbridgeName] = React.useState('')
  const [ticketNumber, setTicketNumber] = React.useState('')
  const [supersedesEventId, setSupersedesEventId] = React.useState<string | null>(null)
  const [axles, setAxles] = React.useState<AxleDraft[]>([])

  const load = React.useCallback(async () => {
    if (!tripId) return
    setLoading(true)
    try {
      const result = await apiFetch<WeighingResponse>(`/api/trips/${tripId}/weighings`)
      setRecords(result.data ?? [])
      setEffective(result.effective)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load weighings')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (stage !== 'TARE' && !tareWeightKg && effective?.tare?.tareWeightKg != null) {
      setTareWeightKg(String(effective.tare.tareWeightKg))
    }
    if (stage === 'AXLE' && !grossWeightKg && effective?.gross?.grossWeightKg != null) {
      setGrossWeightKg(String(effective.gross.grossWeightKg))
    }
  }, [stage, effective, tareWeightKg, grossWeightKg])

  function addAxle() {
    const axleNumber = axles.length ? Math.max(...axles.map((item) => item.axleNumber)) + 1 : 1
    setAxles((current) => [...current, { axleNumber, group: '', weightKg: '' }])
  }

  function updateAxle(index: number, patch: Partial<AxleDraft>) {
    setAxles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  function resetForm() {
    setSupersedesEventId(null)
    setTicketNumber('')
    setWeighbridgeName('')
    setAxles([])
    if (stage === 'TARE') setTareWeightKg('')
    if (stage !== 'TARE') setGrossWeightKg('')
  }

  function correct(record: WeighingRecord) {
    setStage(record.stage as (typeof STAGES)[number])
    setSource(record.source as (typeof SOURCES)[number])
    setTareWeightKg(record.tareWeightKg == null ? '' : String(record.tareWeightKg))
    setGrossWeightKg(record.grossWeightKg == null ? '' : String(record.grossWeightKg))
    setRequiredAxleCount(String(record.requiredAxleCount ?? ''))
    setTolerancePercent(String(record.tolerancePercent ?? 0))
    setWeighbridgeName(record.weighbridgeName ?? '')
    setTicketNumber(record.ticketNumber ?? '')
    setSupersedesEventId(record.id)
    setAxles(record.axleReadings.map((item) => ({
      axleNumber: item.axleNumber,
      group: item.axleGroup ?? '',
      weightKg: String(item.weightKg),
    })))
  }

  async function submit() {
    if (!tripId) return
    if (stage === 'TARE' && !tareWeightKg) {
      toast.error('Enter tare weight')
      return
    }
    if (stage !== 'TARE' && !grossWeightKg && effective?.gross?.grossWeightKg == null) {
      toast.error('Enter gross weight or record a GROSS weighing first')
      return
    }
    if (axles.some((item) => !item.weightKg)) {
      toast.error('Complete every axle weight or remove the empty axle row')
      return
    }

    setSaving(true)
    try {
      const result = await apiFetch<{ clearance?: { passed: boolean; reasons?: string[]; blocking?: Array<{ type: string }> } | null }>(`/api/trips/${tripId}/weighings`, {
        method: 'POST',
        body: JSON.stringify({
          stage,
          source,
          tareWeightKg: tareWeightKg || undefined,
          grossWeightKg: grossWeightKg || undefined,
          requiredAxleCount: requiredAxleCount || undefined,
          tolerancePercent: tolerancePercent || 0,
          weighbridgeName: weighbridgeName || undefined,
          ticketNumber: ticketNumber || undefined,
          supersedesEventId: supersedesEventId || undefined,
          axleReadings: axles.map((item) => ({
            axleNumber: item.axleNumber,
            group: item.group || undefined,
            weightKg: item.weightKg,
          })),
        }),
      })
      if (result.clearance?.passed === false) {
        toast.error('Weight clearance failed. Trip moved to exception hold.')
      } else {
        toast.success(supersedesEventId ? 'Corrected weighing recorded' : 'Weighing recorded')
      }
      resetForm()
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record weighing')
    } finally {
      setSaving(false)
    }
  }

  const latestClearance = records.find((record) => record.clearancePassed != null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Scale className="size-4" /> Weighbridge & Axle Clearance</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Tare, gross, net and axle history for the selected trip. Corrections preserve the original record.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="cursor-pointer"><RefreshCw className="mr-2 size-4" />Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Effective Tare</p><p className="mt-1 font-semibold">{formatWeight(effective?.tare?.tareWeightKg)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Effective Gross</p><p className="mt-1 font-semibold">{formatWeight(effective?.gross?.grossWeightKg)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Net Payload</p><p className="mt-1 font-semibold">{formatWeight(effective?.gross?.netWeightKg ?? effective?.axle?.netWeightKg)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Latest Clearance</p><div className="mt-1">{latestClearance?.clearancePassed === true ? <Badge className="gap-1"><CheckCircle2 className="size-3" />Passed</Badge> : latestClearance?.clearancePassed === false ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />Hold</Badge> : <Badge variant="outline">Pending</Badge>}</div></div>
        </div>

        {canWrite && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{supersedesEventId ? 'Correct Weighing' : 'Record Weighing'}</p>
                {supersedesEventId && <p className="text-xs text-amber-600">This creates a correction record; the original remains immutable.</p>}
              </div>
              {supersedesEventId && <Button variant="ghost" size="sm" onClick={resetForm} className="cursor-pointer"><RotateCcw className="mr-2 size-4" />Cancel correction</Button>}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5"><Label>Stage</Label><Select value={stage} onValueChange={(value) => setStage(value as (typeof STAGES)[number])}><SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Source</Label><Select value={source} onValueChange={(value) => setSource(value as (typeof SOURCES)[number])}><SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger><SelectContent>{SOURCES.map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Tare weight (kg)</Label><Input type="number" min="0" step="0.1" value={tareWeightKg} onChange={(event) => setTareWeightKg(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Gross weight (kg)</Label><Input type="number" min="0" step="0.1" value={grossWeightKg} onChange={(event) => setGrossWeightKg(event.target.value)} disabled={stage === 'TARE'} /></div>
              <div className="space-y-1.5"><Label>Required axle count</Label><Input type="number" min="0" value={requiredAxleCount} onChange={(event) => setRequiredAxleCount(event.target.value)} placeholder="Uses trailer config" /></div>
              <div className="space-y-1.5"><Label>Tolerance (%)</Label><Input type="number" min="0" step="0.1" value={tolerancePercent} onChange={(event) => setTolerancePercent(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Weighbridge</Label><Input value={weighbridgeName} onChange={(event) => setWeighbridgeName(event.target.value)} placeholder="Site / station" /></div>
              <div className="space-y-1.5"><Label>Ticket / certificate</Label><Input value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder="Ticket number" /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Axle readings</p><p className="text-xs text-muted-foreground">Add individual axle weights and optional groups such as STEER, DRIVE or TRAILER.</p></div><Button variant="outline" size="sm" onClick={addAxle} className="cursor-pointer"><Plus className="mr-2 size-4" />Add Axle</Button></div>
              {axles.length > 0 && <div className="space-y-2">{axles.map((axle, index) => <div key={`${axle.axleNumber}-${index}`} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[90px_1fr_1fr_auto]">
                <Input type="number" min="1" value={axle.axleNumber} onChange={(event) => updateAxle(index, { axleNumber: Number(event.target.value) })} aria-label={`Axle ${index + 1} number`} />
                <Input value={axle.group} onChange={(event) => updateAxle(index, { group: event.target.value.toUpperCase() })} placeholder="Group e.g. DRIVE" />
                <Input type="number" min="0" step="0.1" value={axle.weightKg} onChange={(event) => updateAxle(index, { weightKg: event.target.value })} placeholder="Weight kg" />
                <Button variant="ghost" size="icon" onClick={() => setAxles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="cursor-pointer text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button>
              </div>)}</div>}
            </div>

            <div className="flex justify-end"><Button onClick={() => void submit()} disabled={saving} className="cursor-pointer">{saving ? 'Saving…' : supersedesEventId ? 'Save Correction' : 'Record & Evaluate'}</Button></div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Stage</TableHead><TableHead>Tare</TableHead><TableHead>Gross</TableHead><TableHead>Net</TableHead><TableHead>Axles</TableHead><TableHead>Clearance</TableHead><TableHead>Ticket</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{records.length === 0 ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No weighing records for this trip.</TableCell></TableRow> : records.map((record) => <TableRow key={record.id}>
              <TableCell className="whitespace-nowrap text-xs">{new Date(record.recordedAt).toLocaleString('en-GB')}</TableCell>
              <TableCell><Badge variant="outline">{record.stage}</Badge></TableCell>
              <TableCell>{formatWeight(record.tareWeightKg)}</TableCell><TableCell>{formatWeight(record.grossWeightKg)}</TableCell><TableCell>{formatWeight(record.netWeightKg)}</TableCell>
              <TableCell>{record.axleReadings.length ? <span className={record.axleReadings.some((item) => item.exceeded) ? 'font-semibold text-red-600' : ''}>{record.axleReadings.length} Axle{record.axleReadings.length === 1 ? '' : 's'}</span> : '—'}</TableCell>
              <TableCell>{record.clearancePassed === true ? <Badge>Passed</Badge> : record.clearancePassed === false ? <Badge variant="destructive">Hold</Badge> : <Badge variant="outline">Recorded</Badge>}</TableCell>
              <TableCell>{record.ticketNumber || record.certificateNumber || '—'}</TableCell>
              <TableCell className="text-right">{canWrite && <Button variant="ghost" size="sm" onClick={() => correct(record)} className="cursor-pointer">Correct</Button>}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
