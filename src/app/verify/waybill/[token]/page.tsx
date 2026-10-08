'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, ShieldCheck, Truck, XCircle } from 'lucide-react'

interface PublicWaybill {
  waybillNumber: string
  version: number
  status: string
  finalizedAt: string
  tripNumber: string
  origin: string
  destination: string
  tractorPlate: string
  trailerPlate?: string | null
  product: string
  quantity: number
  unit: string
  tareWeightKg: number
  grossWeightKg: number
  netWeightKg: number
  seals: Array<{ sealNumber: string; type?: string | null }>
  contentHash: string
}

export default function WaybillVerificationPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params?.token === 'string' ? params.token : ''
  const [loading, setLoading] = React.useState(true)
  const [waybill, setWaybill] = React.useState<PublicWaybill | null>(null)
  const [valid, setValid] = React.useState(false)

  React.useEffect(() => {
    let active = true
    async function verify() {
      setLoading(true)
      try {
        const response = await fetch(`/api/public/waybills/${encodeURIComponent(token)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({})) as { valid?: boolean; waybill?: PublicWaybill }
        if (!active) return
        setValid(response.ok && payload.valid === true && Boolean(payload.waybill))
        setWaybill(payload.waybill ?? null)
      } catch {
        if (!active) return
        setValid(false)
        setWaybill(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    if (token) void verify()
    else setLoading(false)
    return () => { active = false }
  }, [token])

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 text-foreground">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl border bg-background p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><ShieldCheck className="size-6" /></div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Waybill Verification</h1>
              <p className="text-sm text-muted-foreground">Verify an iFleetPro electronic haulage waybill without exposing private driver or commercial data.</p>
            </div>
          </div>
        </header>

        {loading ? (
          <section className="flex items-center justify-center rounded-2xl border bg-background p-12 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" /> Verifying waybill…
          </section>
        ) : !valid || !waybill ? (
          <section className="rounded-2xl border border-destructive/30 bg-background p-8 text-center">
            <XCircle className="mx-auto mb-3 size-9 text-destructive" />
            <h2 className="text-lg font-semibold">Waybill not verified</h2>
            <p className="mt-1 text-sm text-muted-foreground">This verification token is invalid, unavailable, or no longer points to a finalized waybill.</p>
          </section>
        ) : (
          <section className="space-y-4 rounded-2xl border bg-background p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="size-5" /><span className="font-semibold">Verified electronic waybill</span></div>
              <span className="rounded-full border px-3 py-1 text-xs font-medium">Version {waybill.version}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Waybill" value={waybill.waybillNumber} />
              <Field label="Trip" value={waybill.tripNumber} />
              <Field label="Origin" value={waybill.origin} />
              <Field label="Destination" value={waybill.destination} />
              <Field label="Product" value={`${waybill.product} · ${waybill.quantity} ${waybill.unit}`} />
              <Field label="Finalized" value={new Date(waybill.finalizedAt).toLocaleString()} />
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2 font-medium"><Truck className="size-4" /> Vehicle combination</div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <Field label="Tractor" value={waybill.tractorPlate} compact />
                <Field label="Trailer" value={waybill.trailerPlate || 'Rigid / none'} compact />
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
              <Field label="Tare" value={`${waybill.tareWeightKg.toLocaleString()} kg`} compact />
              <Field label="Gross" value={`${waybill.grossWeightKg.toLocaleString()} kg`} compact />
              <Field label="Net" value={`${waybill.netWeightKg.toLocaleString()} kg`} compact />
            </div>

            {waybill.seals.length > 0 && (
              <div className="rounded-xl border p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cargo seals</p>
                <div className="flex flex-wrap gap-2">{waybill.seals.map((seal) => <span key={seal.sealNumber} className="rounded-full bg-muted px-3 py-1 text-sm">{seal.sealNumber}</span>)}</div>
              </div>
            )}

            <p className="break-all text-xs text-muted-foreground">Document fingerprint: {waybill.contentHash}</p>
          </section>
        )}
      </div>
    </main>
  )
}

function Field({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className={compact ? '' : 'rounded-xl border p-3'}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>
}
