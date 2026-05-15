'use client'

import * as React from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle, XCircle, Clock, ShieldCheck, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { bulkVerifyDrivers } from '@/lib/api'

interface BulkVerificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  driverIds: string[]
  driverNames: string[]
  defaultStatus?: string // 'verified' | 'rejected'
  onCompleted?: () => void
}

function getStatusColor(status: string) {
  switch (status) {
    case 'verified': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'submitted': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
    case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  }
}

export function BulkVerificationDialog({
  open, onOpenChange, driverIds, driverNames, defaultStatus, onCompleted,
}: BulkVerificationDialogProps) {
  const [status, setStatus] = React.useState(defaultStatus || '')
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setStatus(defaultStatus || '')
      setNotes('')
    }
  }, [open, defaultStatus])

  async function handleSubmit() {
    if (!status || driverIds.length === 0) return
    setSubmitting(true)
    try {
      const result = await bulkVerifyDrivers({
        driverIds,
        status,
        notes: notes || undefined,
      })
      toast.success(`Successfully updated ${result.updated} driver(s)`)
      onCompleted?.()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to perform bulk verification')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            Bulk Verification
          </DialogTitle>
          <DialogDescription>
            Update verification status for {driverIds.length} driver(s)
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 min-h-0 overflow-hidden space-y-4 py-2">
          {/* Selected drivers list */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Selected Drivers ({driverIds.length})</p>
            <ScrollArea className="h-32 rounded-md border p-2">
              <div className="flex flex-wrap gap-1.5">
                {driverNames.map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Status select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Verification Status *</label>
            <Select onValueChange={setStatus} value={status}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  <span className="flex items-center gap-2"><Clock className="h-3 w-3 text-amber-500" /> Pending</span>
                </SelectItem>
                <SelectItem value="submitted">
                  <span className="flex items-center gap-2"><Clock className="h-3 w-3 text-sky-500" /> Submitted</span>
                </SelectItem>
                <SelectItem value="verified">
                  <span className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> Verified</span>
                </SelectItem>
                <SelectItem value="rejected">
                  <span className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Rejected</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preview badge */}
          {status && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Preview:</span>
              <Badge variant="outline" className={`text-xs border-transparent font-medium ${getStatusColor(status)}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">for all {driverIds.length} driver(s)</span>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Add verification notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </DialogBody>

        <DialogFooter className="flex-shrink-0 border-t pt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !status}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update {driverIds.length} Driver(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
