'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { submitDriverMutation } from '@/lib/offline/driver-sync'
import type { CheckItem } from '@/lib/api'

type InspectionType = 'pre_trip' | 'post_trip'

const CHECK_GROUPS = [
  { category: 'Safety', items: ['Fire extinguisher', 'First aid kit', 'Warning triangles', 'Seat belts', 'Mirror condition'] },
  { category: 'Lights', items: ['Headlights', 'Brake lights', 'Indicators', 'Hazard lights', 'Reverse lights'] },
  { category: 'Engine', items: ['Oil level', 'Coolant level', 'Battery', 'Belt condition'] },
  { category: 'Tyres', items: ['Tyre tread depth', 'Tyre pressure', 'Spare tyre'] },
  { category: 'Brakes', items: ['Brake pedal', 'Air pressure'] },
  { category: 'Body', items: ['Windshield', 'Load securing equipment', 'Overall condition'] },
  { category: 'Documents', items: ['Insurance certificate', 'Roadworthy certificate'] },
] as const

function buildCheckItems(type: InspectionType): CheckItem[] {
  return CHECK_GROUPS.flatMap((group) => group.items
    .filter((name) => !(type === 'post_trip' && name === 'Roadworthy certificate'))
    .map((name) => ({
      name,
      category: group.category,
      status: 'ok' as const,
      notes: '',
      severity: 'low',
    })))
}

function nextStatus(status: CheckItem['status']): CheckItem['status'] {
  if (status === 'ok') return 'warning'
  if (status === 'warning') return 'fail'
  return 'ok'
}

function StatusIcon({ status }: { status: CheckItem['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-600" />
  return <XCircle className="h-4 w-4 text-red-600" />
}

export interface DriverInspectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  truckId: string
  tripId: string
  driverId: string
  plateNumber: string
  inspectorName?: string
}

export function DriverInspectionDialog({
  open,
  onOpenChange,
  truckId,
  tripId,
  driverId,
  plateNumber,
  inspectorName,
}: DriverInspectionDialogProps) {
  const [type, setType] = React.useState<InspectionType>('pre_trip')
  const [odometerReading, setOdometerReading] = React.useState('')
  const [overallNotes, setOverallNotes] = React.useState('')
  const [checkItems, setCheckItems] = React.useState<CheckItem[]>(() => buildCheckItems('pre_trip'))
  const [saving, setSaving] = React.useState(false)
  const mutationIdRef = React.useRef(crypto.randomUUID())

  React.useEffect(() => {
    if (!open) return
    setType('pre_trip')
    setOdometerReading('')
    setOverallNotes('')
    setCheckItems(buildCheckItems('pre_trip'))
    mutationIdRef.current = crypto.randomUUID()
  }, [open])

  const changeType = (value: InspectionType) => {
    setType(value)
    setCheckItems(buildCheckItems(value))
  }

  const cycleItem = (index: number) => {
    setCheckItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, status: nextStatus(item.status) } : item
    )))
  }

  const updateNotes = (index: number, notes: string) => {
    setCheckItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, notes } : item
    )))
  }

  const passCount = checkItems.filter((item) => item.status === 'ok').length
  const warningCount = checkItems.filter((item) => item.status === 'warning').length
  const failCount = checkItems.filter((item) => item.status === 'fail').length

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const result = await submitDriverMutation({
        clientMutationId: mutationIdRef.current,
        kind: 'inspection',
        request: {
          method: 'POST',
          url: '/api/inspections',
          body: {
            truckId,
            tripId,
            driverId,
            type,
            odometerReading: odometerReading ? Number(odometerReading) : undefined,
            overallNotes,
            inspectorName,
            checkItems,
          },
        },
      })

      mutationIdRef.current = crypto.randomUUID()
      toast.success(result.queued ? 'Inspection saved offline and queued for sync' : result.replayed ? 'Inspection already synced' : 'Inspection submitted')
      onOpenChange(false)
    } catch (error) {
      mutationIdRef.current = crypto.randomUUID()
      toast.error(error instanceof Error ? error.message : 'Failed to submit inspection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-amber-600" />
            Vehicle Inspection · {plateNumber}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={type === 'pre_trip' ? 'default' : 'outline'} onClick={() => changeType('pre_trip')}>
              Pre-Trip
            </Button>
            <Button type="button" variant={type === 'post_trip' ? 'default' : 'outline'} onClick={() => changeType('post_trip')}>
              Post-Trip
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Odometer (km)</label>
              <Input type="number" min="0" inputMode="decimal" value={odometerReading} onChange={(event) => setOdometerReading(event.target.value)} placeholder="Current reading" />
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-xs">
                <span className="text-emerald-600 font-semibold">{passCount} OK</span>
                <span className="text-amber-600 font-semibold">{warningCount} Warn</span>
                <span className="text-red-600 font-semibold">{failCount} Fail</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {CHECK_GROUPS.map((group) => {
              const groupItems = checkItems.map((item, index) => ({ item, index })).filter(({ item }) => item.category === group.category)
              if (groupItems.length === 0) return null
              return (
                <section key={group.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{group.category}</h4>
                    {groupItems.every(({ item }) => item.status === 'ok') && <Badge variant="outline" className="text-emerald-700">All OK</Badge>}
                  </div>
                  <div className="space-y-2">
                    {groupItems.map(({ item, index }) => (
                      <div key={item.name} className="rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => cycleItem(index)} className="shrink-0" aria-label={`Change ${item.name} status`}>
                            <StatusIcon status={item.status} />
                          </button>
                          <button type="button" onClick={() => cycleItem(index)} className="flex-1 text-left text-sm font-medium">
                            {item.name}
                          </button>
                          <Badge variant="outline" className="text-[10px] capitalize">{item.status}</Badge>
                        </div>
                        {item.status !== 'ok' && (
                          <Input className="mt-2 h-8 text-xs" value={item.notes ?? ''} onChange={(event) => updateNotes(index, event.target.value)} placeholder="Describe the issue" />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Overall notes</label>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={overallNotes}
              onChange={(event) => setOverallNotes(event.target.value)}
              placeholder="Anything the workshop or dispatcher should know"
            />
          </div>

          <p className="text-xs text-muted-foreground">This form works offline. If the network is unavailable, the inspection is kept on this device and synced automatically when connectivity returns.</p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
            Submit Inspection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
