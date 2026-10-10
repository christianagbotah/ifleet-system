'use client'

import { Camera, ShieldCheck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/lib/store/auth'
import { IncidentTimeline } from './IncidentTimeline'

export function VideoIncidentsView() {
  const { token } = useAuthStore()

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-amber-500 p-2 text-white shadow-lg shadow-amber-500/20"><Camera className="h-5 w-5" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Video Incidents</h1>
              <p className="text-sm text-muted-foreground">Review ADAS/DMS alarms and request short-lived incident playback on demand.</p>
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Audited access · no continuous autoplay
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <IncidentTimeline token={token} limit={60} />
          </CardContent>
        </Card>
        <div className="space-y-3">
          <Card><CardContent className="p-4 text-xs text-muted-foreground"><p className="font-semibold text-foreground">Privacy by design</p><p className="mt-2">Driver-facing channels require elevated privacy permission. Every allowed, denied and failed access attempt is audited.</p></CardContent></Card>
          <Card><CardContent className="p-4 text-xs text-muted-foreground"><p className="font-semibold text-foreground">On-demand media</p><p className="mt-2">Video sessions are created only after an explicit operator action and expire within minutes.</p></CardContent></Card>
        </div>
      </div>
    </div>
  )
}
