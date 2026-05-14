'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle, XCircle, Clock, ImagePlus, ShieldCheck, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchDriverDetail, updateDriverVerification, type DriverDetail } from '@/lib/api'

const verifySchema = z.object({
  status: z.string().min(1, 'Status is required'),
  notes: z.string().optional(),
})

type VerifyFormValues = z.infer<typeof verifySchema>

interface DriverVerificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  driverId: string | null
  onVerified?: () => void
}

function getVerificationColor(status?: string | null) {
  switch (status) {
    case 'verified': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'submitted': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
    case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  }
}

function getVerificationIcon(status?: string | null) {
  switch (status) {
    case 'verified': return <CheckCircle className="h-5 w-5 text-emerald-600" />
    case 'rejected': return <XCircle className="h-5 w-5 text-red-600" />
    case 'submitted': return <Clock className="h-5 w-5 text-sky-600" />
    default: return <Clock className="h-5 w-5 text-amber-600" />
  }
}

function DocumentCard({ label, src }: { label: string; src?: string | null }) {
  if (src) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium">{label}</p>
        <img
          src={src}
          alt={label}
          className="h-36 w-full max-w-[260px] rounded-lg border object-cover cursor-pointer hover:ring-2 hover:ring-amber-500 transition-all"
          onClick={() => window.open(src, '_blank')}
        />
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="h-36 w-full max-w-[260px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
        <ImagePlus className="h-5 w-5 mb-1" />
        <span className="text-xs">Not uploaded yet</span>
      </div>
    </div>
  )
}

export function DriverVerificationDialog({
  open, onOpenChange, driverId, onVerified,
}: DriverVerificationDialogProps) {
  const [driver, setDriver] = React.useState<DriverDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const form = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { status: '', notes: '' },
  })

  React.useEffect(() => {
    if (open && driverId) {
      setLoading(true)
      fetchDriverDetail(driverId)
        .then((d) => {
          setDriver(d)
          form.reset({ status: d.verificationStatus, notes: d.verificationNotes || '' })
        })
        .catch(() => toast.error('Failed to load driver'))
        .finally(() => setLoading(false))
    }
  }, [open, driverId, form])

  async function onSubmit(data: VerifyFormValues) {
    if (!driverId) return
    setSubmitting(true)
    try {
      await updateDriverVerification(driverId, { status: data.status, notes: data.notes })
      toast.success(`Driver verification ${data.status}`)
      onVerified?.()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to update verification')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] !flex !flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-6 pt-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-500" />
              Driver Document Verification
            </DialogTitle>
            <DialogDescription>
              Review driver documents and verify their identity
            </DialogDescription>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex-1 px-6 py-4 space-y-4">
            <Skeleton className="h-20 w-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          </div>
        ) : driver ? (
          <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
            {/* Driver Info Card */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  {driver.photo ? (
                    <img src={driver.photo} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-bold text-sm">
                      {driver.firstName[0]}{driver.lastName[0]}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">{driver.firstName} {driver.lastName}</h4>
                  <p className="text-sm text-muted-foreground">{driver.employeeId} · {driver.phone}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getVerificationIcon(driver.verificationStatus)}
                    <Badge variant="outline" className={`text-[10px] border-transparent font-medium ${getVerificationColor(driver.verificationStatus)}`}>
                      {driver.verificationStatus ? (driver.verificationStatus.charAt(0).toUpperCase() + driver.verificationStatus.slice(1)) : 'Pending'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Ghana Card Info */}
            {driver.ghanaCardNumber && (
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-semibold">Ghana Card Details</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Card Number:</span>{' '}
                    <span className="font-mono font-medium">{driver.ghanaCardNumber}</span>
                  </div>
                  {driver.ghanaCardExpiry && (
                    <div>
                      <span className="text-muted-foreground">Expiry:</span>{' '}
                      <span className="font-medium">{new Date(driver.ghanaCardExpiry).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Document Previews */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Submitted Documents</p>
              <div className="grid grid-cols-2 gap-4">
                <DocumentCard label="Driver Photo" src={driver.photo} />
                <DocumentCard label="Ghana Card (Front)" src={driver.ghanaCardFrontImage} />
                <DocumentCard label="Ghana Card (Back)" src={driver.ghanaCardBackImage} />
                <DocumentCard label="Driver License" src={driver.licenseImage} />
              </div>
            </div>

            <Separator />

            {/* Verification Form */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Verification Action</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status *</label>
                  <Select onValueChange={(v) => form.setValue('status', v)} value={form.watch('status')}>
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
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Verification notes..."
                    {...form.register('notes')}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex-shrink-0 border-t px-6 py-3 flex items-center justify-end gap-2 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={submitting || !form.watch('status')}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Verification
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
