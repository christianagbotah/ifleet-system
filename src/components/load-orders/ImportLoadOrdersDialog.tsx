'use client'

import * as React from 'react'
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/lib/store/auth'

interface ShipperOption { id: string; name: string }
interface LoadingPointOption { id: string; name: string; loadingCity?: { name: string } }
interface ImportResult { batchId: string; acceptedCount: number; rejectedRowCount: number; rowErrors: Array<{ row: number; blocking: string[] }> }

export function ImportLoadOrdersDialog({ open, onOpenChange, shippers, loadingPoints, onImported }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shippers: ShipperOption[]
  loadingPoints: LoadingPointOption[]
  onImported: () => Promise<void> | void
}) {
  const token = useAuthStore((state) => state.token)
  const [shipperProfileId, setShipperProfileId] = React.useState('')
  const [loadingPointId, setLoadingPointId] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [result, setResult] = React.useState<ImportResult | null>(null)

  React.useEffect(() => { if (!open) { setFile(null); setResult(null) } }, [open])

  function downloadTemplate() {
    const csv = [
      'externalReference,destinationRef,destinationName,destinationAddress,lineRef,itemName,externalProductCode,quantity,unit,pickupWindowStart,pickupWindowEnd,requiredVehicleType,requiredTrailerType,offeredRate,priority,specialHandling',
      'FACTORY-ORDER-001,stop-1,Kumasi Depot,Asokwa Kumasi,line-1,50kg Cement,,600,bags,2026-10-10T08:00,2026-10-10T12:00,tractor,flatbed,2500,normal,Keep dry',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'ifleetpro-load-order-import-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function submit() {
    if (!file || !shipperProfileId || !loadingPointId || !token) {
      toast.error('Select a shipper, loading site, and CSV/XLSX file.')
      return
    }
    const mapping = {
      defaults: { shipperProfileId, loadingPointId, currency: 'GHS', priority: 'normal' },
      unitMap: { bag: 'bags', bags: 'bags', tonne: 'tonnes', tonnes: 'tonnes', ton: 'tonnes', tons: 'tonnes', carton: 'cartons', cartons: 'cartons' },
    }
    const formData = new FormData()
    formData.set('file', file)
    formData.set('mapping', JSON.stringify(mapping))
    setUploading(true)
    try {
      const response = await fetch('/api/load-orders/import', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData })
      const payload = await response.json()
      if (!response.ok && response.status !== 422) throw new Error(payload.error || 'Import failed')
      setResult(payload)
      if (payload.acceptedCount > 0) { toast.success(`${payload.acceptedCount} load order${payload.acceptedCount === 1 ? '' : 's'} imported`); await onImported() }
      if (payload.rejectedRowCount > 0) toast.warning(`${payload.rejectedRowCount} row${payload.rejectedRowCount === 1 ? '' : 's'} need attention`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed')
    } finally { setUploading(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Import load orders</DialogTitle><DialogDescription>Upload factory or shipper CSV/XLSX instructions. Valid rows are imported even when other rows need correction.</DialogDescription></DialogHeader><DialogBody className="space-y-5">
    <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Download template</Button></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Shipper profile</Label><Select value={shipperProfileId || 'none'} onValueChange={(value) => setShipperProfileId(value === 'none' ? '' : value)}><SelectTrigger><SelectValue placeholder="Select shipper" /></SelectTrigger><SelectContent><SelectItem value="none">Select shipper</SelectItem>{shippers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Loading site</Label><Select value={loadingPointId || 'none'} onValueChange={(value) => setLoadingPointId(value === 'none' ? '' : value)}><SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger><SelectContent><SelectItem value="none">Select site</SelectItem>{loadingPoints.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.loadingCity?.name ? ` · ${item.loadingCity.name}` : ''}</SelectItem>)}</SelectContent></Select></div></div>
    <div className="space-y-2"><Label>CSV or Excel file</Label><Input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">Rows sharing the same external reference are grouped into one multi-line / multi-drop load order.</p></div>
    {result && <div className="rounded-xl border bg-muted/30 p-4 text-sm"><div className="font-semibold">Batch {result.batchId}</div><div className="mt-1 text-muted-foreground">Accepted: {result.acceptedCount} · Rejected rows: {result.rejectedRowCount}</div>{result.rowErrors.length > 0 && <div className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs">{result.rowErrors.slice(0, 30).map((error) => <div key={`${error.row}-${error.blocking.join('-')}`}>Row {error.row}: {error.blocking.join(', ')}</div>)}</div>}</div>}
  </DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button type="button" onClick={submit} disabled={uploading || !file || !shipperProfileId || !loadingPointId}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{uploading ? 'Importing…' : 'Import orders'}</Button></DialogFooter></DialogContent></Dialog>
}
