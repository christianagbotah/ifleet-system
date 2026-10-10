'use client'

import * as React from 'react'
import { Camera, Loader2, Play, ShieldAlert, VideoOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { requestUiVideoSession, type UiVideoSessionState } from '@/lib/domain/video/ui-session'

interface CameraChannel {
  key: string
  label: string
  orientation: string
  privacyClass: string
  enabled: boolean
}

interface VideoCapabilities {
  deviceId: string
  name: string
  provider: string
  cameraChannels: CameraChannel[]
  videoRetentionPolicy: {
    videoEnabled: boolean
    supportsLive: boolean
    supportsPlayback: boolean
    supportsSnapshot: boolean
  }
}

export function LiveCameraDialog({
  deviceId,
  token,
  vehicleLabel,
}: {
  deviceId: string
  token: string | null
  vehicleLabel?: string
}) {
  const [capabilities, setCapabilities] = React.useState<VideoCapabilities | null>(null)
  const [capabilityState, setCapabilityState] = React.useState<'loading' | 'ready' | 'unavailable' | 'denied'>('loading')
  const [selectedChannel, setSelectedChannel] = React.useState<string>('')
  const [sessionState, setSessionState] = React.useState<UiVideoSessionState | null>(null)
  const [requesting, setRequesting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function loadCapabilities() {
      if (!token) {
        setCapabilityState('denied')
        return
      }
      setCapabilityState('loading')
      try {
        const response = await fetch(`/api/video/devices/${encodeURIComponent(deviceId)}/capabilities`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (cancelled) return
        if (response.status === 401 || response.status === 403) {
          setCapabilityState('denied')
          return
        }
        if (!response.ok) {
          setCapabilityState('unavailable')
          return
        }
        const body = await response.json() as VideoCapabilities
        if (!body.videoRetentionPolicy?.supportsLive || body.cameraChannels.length === 0) {
          setCapabilityState('unavailable')
          return
        }
        setCapabilities(body)
        setSelectedChannel((current) => current || body.cameraChannels[0]?.key || '')
        setCapabilityState('ready')
      } catch {
        if (!cancelled) setCapabilityState('unavailable')
      }
    }
    loadCapabilities()
    return () => { cancelled = true }
  }, [deviceId, token])

  async function requestLive() {
    if (!token || !selectedChannel) return
    setRequesting(true)
    setSessionState(null)
    const result = await requestUiVideoSession(
      fetch,
      `/api/video/devices/${encodeURIComponent(deviceId)}/live`,
      { channelKey: selectedChannel },
      token,
    )
    setSessionState(result)
    setRequesting(false)
  }

  if (capabilityState === 'loading') {
    return <div className="h-9 animate-pulse rounded-lg bg-muted" aria-label="Checking camera availability" />
  }
  if (capabilityState !== 'ready' || !capabilities) return null

  return (
    <Dialog onOpenChange={(open) => { if (!open) setSessionState(null) }}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full gap-2">
          <Camera className="h-4 w-4" /> Live Camera
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Live Camera · {vehicleLabel || capabilities.name}</DialogTitle>
          <DialogDescription>
            On-demand view only. A short-lived provider session is created after you choose a channel and start viewing.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {capabilities.cameraChannels.map((channel) => (
              <Button
                key={channel.key}
                type="button"
                size="sm"
                variant={selectedChannel === channel.key ? 'default' : 'outline'}
                onClick={() => { setSelectedChannel(channel.key); setSessionState(null) }}
              >
                {channel.label}
              </Button>
            ))}
          </div>

          {!sessionState && (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 text-center">
              <Camera className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Camera is ready on demand</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">No stream is opened until you explicitly request it.</p>
              <Button className="mt-4 gap-2" onClick={requestLive} disabled={requesting}>
                {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start live view
              </Button>
            </div>
          )}

          {sessionState?.state === 'ready' && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl bg-black">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={sessionState.session.url}
                  className="aspect-video w-full bg-black"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Provider: {sessionState.session.provider}</span>
                <span>Session expires {new Date(sessionState.session.expiresAt).toLocaleTimeString()}</span>
              </div>
            </div>
          )}

          {sessionState?.state === 'denied' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex gap-2"><ShieldAlert className="h-4 w-4 shrink-0" /> {sessionState.message}</div>
            </div>
          )}
          {(sessionState?.state === 'unavailable' || sessionState?.state === 'error') && (
            <div className="rounded-xl border p-4 text-sm text-muted-foreground">
              <div className="flex gap-2"><VideoOff className="h-4 w-4 shrink-0" /> {sessionState.message}</div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
