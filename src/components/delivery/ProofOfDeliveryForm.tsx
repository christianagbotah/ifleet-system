'use client'

import * as React from 'react'
import { Camera, CheckCircle2, Loader2, MapPin, PackageCheck, RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'
import { submitDriverMutation } from '@/lib/offline/driver-sync'
import { useAuthStore } from '@/lib/store/auth'

interface PodTarget {
  kind: 'destination' | 'delivery_stop' | 'trip'
  id: string | null
  label: string
  customerName: string | null
  customerPhone: string | null
  expectedQty: number
  unit: string
  completed: boolean
}

interface PodProofSummary {
  id: string
  receiverName: string
  receiverPhone: string | null
  receivedQty: number
  damagedQty: number
  rejectedQty: number
  discrepancyNotes: string | null
  completedAt: string
  deliveryStopId?: string | null
  deliveryDestinationId?: string | null
  activeTargetKey?: string | null
  supersedesId?: string | null
  correctionReason?: string | null
}

interface PodState {
  requirements: string[]
  targets: PodTarget[]
  proofs: PodProofSummary[]
}

interface Props {
  tripId: string
  onSubmitted?: () => void
}

const MAX_EVIDENCE_BYTES = 1024 * 1024

function targetKey(target: PodTarget) {
  return `${target.kind}:${target.id ?? 'trip'}`
}

function fileAsDataUrl(file: File | null): Promise<string | null> {
  if (!file) return Promise.resolve(null)
  if (file.size > MAX_EVIDENCE_BYTES) {
    return Promise.reject(new Error(`${file.name} exceeds the 1 MB POD evidence limit`))
  }
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error(`${file.name} must be an image`))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  })
}

export function ProofOfDeliveryForm({ tripId, onSubmitted }: Props) {
  const user = useAuthStore((store) => store.user)
  const canCorrect = user?.role === 'Admin' || user?.role === 'Manager'
  const [state, setState] = React.useState<PodState | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [selectedKey, setSelectedKey] = React.useState('')
  const [correctionProofId, setCorrectionProofId] = React.useState<string | null>(null)
  const [correctionReason, setCorrectionReason] = React.useState('')
  const [receiverName, setReceiverName] = React.useState('')
  const [receiverPhone, setReceiverPhone] = React.useState('')
  const [receivedQty, setReceivedQty] = React.useState('')
  const [damagedQty, setDamagedQty] = React.useState('0')
  const [rejectedQty, setRejectedQty] = React.useState('0')
  const [notes, setNotes] = React.useState('')
  const [latitude, setLatitude] = React.useState<number | null>(null)
  const [longitude, setLongitude] = React.useState<number | null>(null)
  const [locating, setLocating] = React.useState(false)
  const [deliveryPhoto, setDeliveryPhoto] = React.useState<File | null>(null)
  const [receiverPhoto, setReceiverPhoto] = React.useState<File | null>(null)
  const [documentPhoto, setDocumentPhoto] = React.useState<File | null>(null)
  const [signaturePhoto, setSignaturePhoto] = React.useState<File | null>(null)
  const [pinVerified, setPinVerified] = React.useState(false)
  const mutationIdRef = React.useRef<string>(crypto.randomUUID())

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<PodState>(`/api/trips/${tripId}/proof-of-delivery`)
      setState(response)
      const next = response.targets.find((target) => !target.completed) ?? response.targets[0]
      if (next) {
        setSelectedKey(targetKey(next))
        setReceivedQty(String(next.expectedQty))
        setReceiverName(next.customerName ?? '')
        setReceiverPhone(next.customerPhone ?? '')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load proof of delivery')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  React.useEffect(() => { load() }, [load])

  const selected = state?.targets.find((target) => targetKey(target) === selectedKey) ?? null
  const allComplete = Boolean(state?.targets.length) && state!.targets.every((target) => target.completed)
  const activeProofs = canCorrect ? (state?.proofs.filter((proof) => proof.activeTargetKey) ?? []) : []

  function targetForProof(proof: PodProofSummary) {
    if (!state) return null
    if (proof.deliveryDestinationId) return state.targets.find((target) => target.kind === 'destination' && target.id === proof.deliveryDestinationId) ?? null
    if (proof.deliveryStopId) return state.targets.find((target) => target.kind === 'delivery_stop' && target.id === proof.deliveryStopId) ?? null
    return state.targets.find((target) => target.kind === 'trip') ?? null
  }

  function beginCorrection(proof: PodProofSummary) {
    const target = targetForProof(proof)
    if (!target) {
      toast.error('The delivery target for this POD is no longer available')
      return
    }
    setCorrectionProofId(proof.id)
    setCorrectionReason('')
    setSelectedKey(targetKey(target))
    setReceiverName(proof.receiverName)
    setReceiverPhone(proof.receiverPhone ?? '')
    setReceivedQty(String(proof.receivedQty))
    setDamagedQty(String(proof.damagedQty ?? 0))
    setRejectedQty(String(proof.rejectedQty ?? 0))
    setNotes(proof.discrepancyNotes ?? '')
    setLatitude(null)
    setLongitude(null)
    setDeliveryPhoto(null)
    setReceiverPhoto(null)
    setDocumentPhoto(null)
    setSignaturePhoto(null)
    setPinVerified(false)
    mutationIdRef.current = crypto.randomUUID()
  }

  React.useEffect(() => {
    if (!selected || correctionProofId) return
    setReceivedQty(String(selected.expectedQty))
    setReceiverName(selected.customerName ?? '')
    setReceiverPhone(selected.customerPhone ?? '')
    setDamagedQty('0')
    setRejectedQty('0')
    setNotes('')
    setDeliveryPhoto(null)
    setReceiverPhoto(null)
    setDocumentPhoto(null)
    setSignaturePhoto(null)
    setPinVerified(false)
    mutationIdRef.current = crypto.randomUUID()
  }, [selectedKey, correctionProofId])

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error('Location services are unavailable on this device')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setLocating(false)
        toast.success('Delivery location captured')
      },
      () => {
        setLocating(false)
        toast.error('Could not capture delivery location')
      },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || (!correctionProofId && selected.completed) || submitting) return
    if (correctionProofId && !correctionReason.trim()) {
      toast.error('Enter a correction reason before saving the corrected POD')
      return
    }
    setSubmitting(true)
    try {
      const [deliveryRef, receiverRef, documentRef, signatureRef] = await Promise.all([
        fileAsDataUrl(deliveryPhoto),
        fileAsDataUrl(receiverPhoto),
        fileAsDataUrl(documentPhoto),
        fileAsDataUrl(signaturePhoto),
      ])
      const evidence = [
        deliveryRef ? { type: 'delivery_photo', ref: deliveryRef } : null,
        receiverRef ? { type: 'receiver_photo', ref: receiverRef } : null,
        documentRef ? { type: 'document', ref: documentRef } : null,
      ].filter(Boolean)

      const payload: Record<string, unknown> = {
        idempotencyKey: mutationIdRef.current,
        receiverName,
        receiverPhone: receiverPhone || null,
        receivedQty: Number(receivedQty),
        damagedQty: Number(damagedQty || 0),
        rejectedQty: Number(rejectedQty || 0),
        discrepancyNotes: notes || null,
        latitude,
        longitude,
        signatureRef,
        pinVerified,
        evidence,
      }
      if (correctionProofId) {
        const result = await apiFetch<{ financialReviewRequired?: boolean }>(`/api/trips/${tripId}/proof-of-delivery`, {
          method: 'PUT',
          body: JSON.stringify({
            ...payload,
            proofOfDeliveryId: correctionProofId,
            correctionReason: correctionReason.trim(),
          }),
        })
        mutationIdRef.current = crypto.randomUUID()
        setCorrectionProofId(null)
        setCorrectionReason('')
        toast.success(result.financialReviewRequired
          ? 'Corrected POD recorded. Finance review is now required.'
          : 'Corrected POD recorded')
        await load()
        onSubmitted?.()
      } else {
        if (selected.kind === 'destination') payload.deliveryDestinationId = selected.id
        if (selected.kind === 'delivery_stop') payload.deliveryStopId = selected.id

        const result = await submitDriverMutation({
          clientMutationId: mutationIdRef.current,
          kind: 'pod',
          request: {
            method: 'POST',
            url: `/api/trips/${tripId}/proof-of-delivery`,
            body: payload,
          },
        })
        mutationIdRef.current = crypto.randomUUID()
        if (result.queued) {
          toast.success('Proof of delivery queued for sync')
        } else {
          toast.success('Proof of delivery recorded')
          await load()
          onSubmitted?.()
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record proof of delivery')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardContent className="flex items-center gap-2 p-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading delivery evidence…
        </CardContent>
      </Card>
    )
  }

  if (!state || state.targets.length === 0) return null

  return (
    <Card className="rounded-xl border-emerald-100 bg-emerald-50/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <PackageCheck className="h-4 w-4 text-emerald-600" /> Proof of Delivery
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500">Record receiver, quantity and evidence before marking this trip delivered.</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm">
            {state.targets.filter((target) => target.completed).length}/{state.targets.length} complete
          </span>
        </div>

        {canCorrect && activeProofs.length > 0 && !correctionProofId && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-amber-800">Auditable POD corrections</div>
            <p className="mt-1 text-xs leading-5 text-amber-700">Corrections preserve the original proof. If finance has already approved the trip, a reconciliation review is opened automatically.</p>
            <div className="mt-3 space-y-2">
              {activeProofs.map((proof) => {
                const target = targetForProof(proof)
                return (
                  <div key={proof.id} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-xs text-gray-600">
                      <div className="font-semibold text-gray-900">{target?.label ?? 'Delivery target'}</div>
                      <div className="mt-0.5">{proof.receivedQty} {target?.unit ?? ''} · {new Date(proof.completedAt).toLocaleString()}</div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => beginCorrection(proof)}>
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Correct recorded POD
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {allComplete && !correctionProofId ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> All required delivery destinations have POD evidence.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            {correctionProofId && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <RotateCcw className="h-4 w-4" /> Correction mode
                </div>
                <p className="mt-1 text-xs leading-5 text-amber-800">The original POD remains in the audit history. Re-capture the required evidence and explain why this correction is necessary.</p>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="pod-correction-reason">Correction reason *</Label>
                  <Textarea id="pod-correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain the correction and supporting evidence" />
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { setCorrectionProofId(null); setCorrectionReason('') }}>
                  Cancel correction
                </Button>
              </div>
            )}
            {state.targets.length > 1 && (
              <div className="space-y-2">
                <Label>Delivery destination</Label>
                <select
                  value={selectedKey}
                  onChange={(event) => setSelectedKey(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                >
                  {state.targets.map((target) => (
                    <option
                      key={targetKey(target)}
                      value={targetKey(target)}
                      disabled={target.completed && !(correctionProofId && targetKey(target) === selectedKey)}
                    >
                      {target.label} · {target.expectedQty} {target.unit}{target.completed ? ' · completed' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selected && (
              <div className="rounded-lg bg-white p-3 text-xs text-gray-600">
                <span className="font-semibold text-gray-900">Expected:</span> {selected.expectedQty} {selected.unit}
                {selected.customerName ? ` · ${selected.customerName}` : ''}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pod-receiver">Receiver name</Label>
                <Input id="pod-receiver" value={receiverName} onChange={(event) => setReceiverName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pod-phone">Receiver phone</Label>
                <Input id="pod-phone" value={receiverPhone} onChange={(event) => setReceiverPhone(event.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="pod-received">Received</Label>
                <Input id="pod-received" inputMode="decimal" value={receivedQty} onChange={(event) => setReceivedQty(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pod-damaged">Damaged</Label>
                <Input id="pod-damaged" inputMode="decimal" value={damagedQty} onChange={(event) => setDamagedQty(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pod-rejected">Rejected</Label>
                <Input id="pod-rejected" inputMode="decimal" value={rejectedQty} onChange={(event) => setRejectedQty(event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pod-notes">Discrepancy notes</Label>
              <Textarea id="pod-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Required when quantity is short, damaged or rejected" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <EvidenceInput label="Delivery photo" required={state.requirements.includes('delivery_photo')} onChange={setDeliveryPhoto} />
              <EvidenceInput label="Receiver photo" required={state.requirements.includes('receiver_photo')} onChange={setReceiverPhoto} />
              <EvidenceInput label="Signed receipt / signature image" required={state.requirements.includes('signature')} onChange={setSignaturePhoto} />
              <EvidenceInput label="Document photo" onChange={setDocumentPhoto} />
            </div>

            {state.requirements.includes('pin') && (
              <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <input type="checkbox" checked={pinVerified} onChange={(event) => setPinVerified(event.target.checked)} />
                Receiver PIN/OTP was verified through the shipper confirmation channel.
              </label>
            )}

            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <div className="min-w-0 text-xs text-gray-500">
                <div className="flex items-center gap-1.5 font-semibold text-gray-800"><MapPin className="h-3.5 w-3.5" /> Delivery GPS</div>
                <div className="mt-1 truncate">{latitude != null && longitude != null ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : 'Not captured'}</div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locating}>
                {locating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <MapPin className="mr-1.5 h-3.5 w-3.5" />}
                Capture
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {state.requirements.map((requirement) => (
                <span key={requirement} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-600 shadow-sm">
                  {requirement.replaceAll('_', ' ')}
                </span>
              ))}
            </div>

            <Button
              type="submit"
              className="h-11 w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={!selected || (!correctionProofId && selected.completed) || submitting || Boolean(correctionProofId && !correctionReason.trim())}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : correctionProofId ? <RotateCcw className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {submitting ? (correctionProofId ? 'Correcting POD…' : 'Recording POD…') : correctionProofId ? 'Save corrected POD' : 'Record proof of delivery'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function EvidenceInput({ label, required = false, onChange }: { label: string; required?: boolean; onChange: (file: File | null) => void }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" /> {label}{required ? ' *' : ''}</Label>
      <Input type="file" accept="image/*" capture="environment" onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
      <p className="text-[10px] text-gray-400">Image evidence, max 1 MB</p>
    </div>
  )
}
