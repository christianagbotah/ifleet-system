'use client'

import * as React from 'react'
import { Camera, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DRIVER_EVIDENCE_ALLOWED_MIME_TYPES, driverEvidenceUrl } from '@/lib/offline/driver-evidence'
import { submitDriverMutation } from '@/lib/offline/driver-sync'

const MAX_EVIDENCE_FILES = 5
const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024

export interface DriverStatusUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  targetStatus: string
  actionLabel: string
  onSynced: () => void
}

export function DriverStatusUpdateDialog({
  open,
  onOpenChange,
  tripId,
  targetStatus,
  actionLabel,
  onSynced,
}: DriverStatusUpdateDialogProps) {
  const [notes, setNotes] = React.useState('')
  const [evidenceFiles, setEvidenceFiles] = React.useState<File[]>([])
  const [saving, setSaving] = React.useState(false)
  const statusMutationIdRef = React.useRef(crypto.randomUUID())
  const evidenceMutationIdRef = React.useRef(crypto.randomUUID())

  React.useEffect(() => {
    if (!open) return
    setNotes('')
    setEvidenceFiles([])
    statusMutationIdRef.current = crypto.randomUUID()
    evidenceMutationIdRef.current = crypto.randomUUID()
  }, [open])

  const handleEvidenceSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selected.length === 0) return
    if (selected.length > MAX_EVIDENCE_FILES) {
      toast.error(`Choose up to ${MAX_EVIDENCE_FILES} status photos`)
      return
    }
    for (const file of selected) {
      if (!DRIVER_EVIDENCE_ALLOWED_MIME_TYPES.includes(file.type as (typeof DRIVER_EVIDENCE_ALLOWED_MIME_TYPES)[number])) {
        toast.error(`${file.name}: only JPG, PNG and WebP photos are supported`)
        return
      }
      if (file.size > MAX_EVIDENCE_FILE_SIZE) {
        toast.error(`${file.name}: maximum file size is 5MB`)
        return
      }
    }
    setEvidenceFiles(selected)
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const evidenceDependencyIds: string[] = []
      const evidenceUrls: string[] = []

      if (evidenceFiles.length > 0) {
        const evidenceMutationId = evidenceMutationIdRef.current
        for (const [index, file] of evidenceFiles.entries()) {
          evidenceUrls.push(driverEvidenceUrl(evidenceMutationId, index, file.type))
        }
        await submitDriverMutation({
          clientMutationId: evidenceMutationId,
          kind: 'upload',
          request: {
            method: 'POST',
            url: '/api/upload',
            bodyEncoding: 'multipart',
            body: { files: evidenceFiles, tripId },
          },
        })
        evidenceDependencyIds.push(evidenceMutationId)
      }

      const result = await submitDriverMutation({
        clientMutationId: statusMutationIdRef.current,
        kind: 'status',
        dependencyIds: evidenceDependencyIds,
        request: {
          method: 'POST',
          url: `/api/trips/${tripId}/transition`,
          body: {
            to: targetStatus,
            notes,
            evidence: evidenceUrls.length > 0 ? { photos: evidenceUrls } : undefined,
          },
        },
      })

      statusMutationIdRef.current = crypto.randomUUID()
      evidenceMutationIdRef.current = crypto.randomUUID()
      toast.success(result.queued ? 'Status update saved offline and queued for sync' : result.replayed ? 'Status update already synced' : 'Trip status updated')
      if (!result.queued) onSynced()
      onOpenChange(false)
    } catch (error) {
      statusMutationIdRef.current = crypto.randomUUID()
      evidenceMutationIdRef.current = crypto.randomUUID()
      toast.error(error instanceof Error ? error.message : 'Failed to update trip status')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Update trip status</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Next action</p>
            <p className="mt-0.5 text-muted-foreground">{actionLabel}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Driver note <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Queue delay, gate instruction, delivery note…"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Camera className="h-4 w-4 text-amber-600" />
                Status evidence <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              {evidenceFiles.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setEvidenceFiles([])} disabled={saving}>Clear</Button>
              )}
            </div>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              capture="environment"
              onChange={handleEvidenceSelection}
              disabled={saving}
            />
            {evidenceFiles.length > 0 ? (
              <div className="space-y-1 rounded-lg border bg-muted/30 p-2">
                {evidenceFiles.map((file) => (
                  <p key={`${file.name}-${file.lastModified}`} className="truncate text-xs text-muted-foreground">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Up to 5 JPG, PNG or WebP photos. Evidence remains linked to this status update while offline.</p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={saving} className="bg-amber-600 text-white hover:bg-amber-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
