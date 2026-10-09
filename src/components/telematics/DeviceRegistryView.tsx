'use client'

import * as React from 'react'
import {
  Activity,
  Cable,
  Camera,
  Link2,
  Link2Off,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

type AssetType = 'tractor' | 'trailer'
type PrivacyClass = 'road' | 'driver' | 'cargo' | 'exterior'
type CameraOrientation = 'front' | 'cabin' | 'rear' | 'left' | 'right' | 'cargo' | 'unknown'

interface Installation {
  id: string
  assetType: AssetType
  assetId: string
  installedAt: string
  uninstalledAt: string | null
}

interface CameraChannelRecord {
  id: string
  channelKey: string
  label: string
  orientation: CameraOrientation
  privacyClass: PrivacyClass
  isEnabled: boolean
  supportsLive: boolean
  supportsPlayback: boolean
  supportsSnapshot: boolean
}

interface DeviceRecord {
  id: string
  name: string
  provider: string
  deviceType: string
  imei: string | null
  serialNumber: string | null
  credentialRef: string | null
  status: string
  lastSeenAt: string | null
  videoEnabled: boolean
  supportsLiveVideo: boolean
  supportsVideoPlayback: boolean
  supportsVideoSnapshot: boolean
  cameraChannels: CameraChannelRecord[]
  currentInstallation: Installation | null
}

interface AssetOption {
  id: string
  plateNumber: string
}

interface VideoChannelForm {
  key: string
  label: string
  orientation: CameraOrientation
  privacyClass: PrivacyClass
  enabled: boolean
}

const blankForm = {
  name: '',
  provider: 'generic-http',
  deviceType: 'gnss-tracker',
  imei: '',
  serialNumber: '',
  credentialRef: '',
}

const blankVideoForm = {
  videoEnabled: false,
  supportsLiveVideo: false,
  supportsVideoPlayback: false,
  supportsVideoSnapshot: false,
}

function suggestedChannels(): VideoChannelForm[] {
  return [
    { key: 'front', label: 'Road camera', orientation: 'front', privacyClass: 'road', enabled: true },
    { key: 'cabin', label: 'Driver camera', orientation: 'cabin', privacyClass: 'driver', enabled: true },
  ]
}

export function DeviceRegistryView() {
  const { user } = useAuthStore()
  const canWrite = user?.role === 'Admin' || user?.role === 'Manager'
  const [devices, setDevices] = React.useState<DeviceRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [formOpen, setFormOpen] = React.useState(false)
  const [installOpen, setInstallOpen] = React.useState(false)
  const [videoOpen, setVideoOpen] = React.useState(false)
  const [selectedDevice, setSelectedDevice] = React.useState<DeviceRecord | null>(null)
  const [form, setForm] = React.useState(blankForm)
  const [videoForm, setVideoForm] = React.useState(blankVideoForm)
  const [videoChannels, setVideoChannels] = React.useState<VideoChannelForm[]>([])
  const [assetType, setAssetType] = React.useState<AssetType>('tractor')
  const [assetId, setAssetId] = React.useState('')
  const [assets, setAssets] = React.useState<AssetOption[]>([])
  const [saving, setSaving] = React.useState(false)

  const loadDevices = React.useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ limit: '200' })
      if (search.trim()) query.set('search', search.trim())
      const response = await apiFetch<{ data: DeviceRecord[] }>('/api/telematics/devices?' + query.toString())
      setDevices(response.data ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load device registry')
    } finally {
      setLoading(false)
    }
  }, [search])

  React.useEffect(() => {
    const timer = setTimeout(loadDevices, 250)
    return () => clearTimeout(timer)
  }, [loadDevices])

  async function saveDevice(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/telematics/devices', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          imei: form.imei || null,
          serialNumber: form.serialNumber || null,
          credentialRef: form.credentialRef || null,
        }),
      })
      toast.success('Telematics device registered')
      setForm(blankForm)
      setFormOpen(false)
      await loadDevices()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to register device')
    } finally {
      setSaving(false)
    }
  }

  function openVideoConfiguration(device: DeviceRecord) {
    setSelectedDevice(device)
    setVideoForm({
      videoEnabled: device.videoEnabled,
      supportsLiveVideo: device.supportsLiveVideo,
      supportsVideoPlayback: device.supportsVideoPlayback,
      supportsVideoSnapshot: device.supportsVideoSnapshot,
    })
    setVideoChannels(device.cameraChannels?.length
      ? device.cameraChannels.map((channel) => ({
          key: channel.channelKey,
          label: channel.label,
          orientation: channel.orientation,
          privacyClass: channel.privacyClass,
          enabled: channel.isEnabled,
        }))
      : suggestedChannels())
    setVideoOpen(true)
  }

  function updateVideoChannel(index: number, patch: Partial<VideoChannelForm>) {
    setVideoChannels((current) => current.map((channel, channelIndex) => (
      channelIndex === index ? { ...channel, ...patch } : channel
    )))
  }

  async function saveVideoConfiguration() {
    if (!selectedDevice) return
    const duplicateKeys = videoChannels
      .map((channel) => channel.key.trim())
      .filter((key, index, all) => key && all.indexOf(key) !== index)
    if (duplicateKeys.length) {
      toast.error('Camera channel keys must be unique')
      return
    }

    setSaving(true)
    try {
      await apiFetch(`/api/telematics/devices/${selectedDevice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'configure-video',
          ...videoForm,
          channels: videoChannels.map((channel) => ({ ...channel, key: channel.key.trim(), label: channel.label.trim() })),
        }),
      })
      toast.success('Video capabilities updated')
      setVideoOpen(false)
      await loadDevices()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update video capabilities')
    } finally {
      setSaving(false)
    }
  }

  async function openInstall(device: DeviceRecord) {
    setSelectedDevice(device)
    setAssetId('')
    setAssetType(device.currentInstallation?.assetType ?? 'tractor')
    setInstallOpen(true)
  }

  React.useEffect(() => {
    if (!installOpen) return
    const url = assetType === 'tractor' ? '/api/trucks?limit=200' : '/api/trailers?limit=200&status=active'
    apiFetch<{ data: AssetOption[] }>(url)
      .then((result) => setAssets(result.data ?? []))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load fleet assets'))
  }, [assetType, installOpen])

  async function installSelected() {
    if (!selectedDevice || !assetId) return
    setSaving(true)
    try {
      await apiFetch(`/api/telematics/devices/${selectedDevice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'install', assetType, assetId, installedAt: new Date().toISOString() }),
      })
      toast.success('Device installation recorded')
      setInstallOpen(false)
      await loadDevices()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to install device')
    } finally {
      setSaving(false)
    }
  }

  async function uninstall(device: DeviceRecord) {
    setSaving(true)
    try {
      await apiFetch(`/api/telematics/devices/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'uninstall', uninstalledAt: new Date().toISOString() }),
      })
      toast.success('Device uninstalled')
      await loadDevices()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to uninstall device')
    } finally {
      setSaving(false)
    }
  }

  const online = devices.filter((device) => device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 15 * 60_000).length
  const installed = devices.filter((device) => device.currentInstallation).length
  const videoDevices = devices.filter((device) => device.videoEnabled).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-600">
            <RadioTower className="h-4 w-4" /> Telematics foundation
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Device Registry</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Register hardware-neutral GPS/MDVR devices, bind them to tractor or trailer assets, and preserve installation history.
          </p>
        </div>
        {canWrite && <Button onClick={() => setFormOpen(true)}><Plus className="mr-2 h-4 w-4" />Register device</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Registered" value={devices.length} icon={Cable} />
        <Metric title="Installed" value={installed} icon={Link2} />
        <Metric title="Recently seen" value={online} icon={Activity} />
        <Metric title="Video capable" value={videoDevices} icon={Video} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Fleet devices</CardTitle>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search IMEI, serial, provider…" className="pl-9" />
              </div>
              <Button variant="outline" size="icon" onClick={loadDevices} aria-label="Refresh devices"><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div>
          ) : devices.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <RadioTower className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">No telematics devices registered</h3>
              <p className="mt-1 text-sm text-muted-foreground">Add a hardwired tracker, MDVR, or provider-neutral device to begin.</p>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {devices.map((device) => (
                <div key={device.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{device.name}</span>
                        <Badge variant={device.status === 'active' ? 'default' : 'secondary'}>{device.status}</Badge>
                        {device.videoEnabled && <Badge variant="outline"><Camera className="mr-1 h-3 w-3" />{device.cameraChannels?.filter((channel) => channel.isEnabled).length ?? 0} cameras</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{device.provider} · {device.deviceType}</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Detail label="IMEI" value={device.imei ?? '—'} />
                    <Detail label="Serial" value={device.serialNumber ?? '—'} />
                    <Detail label="Credential" value={device.credentialRef ? 'Server reference set' : 'Not configured'} />
                    <Detail label="Installed on" value={device.currentInstallation ? `${device.currentInstallation.assetType} · ${device.currentInstallation.assetId.slice(-8)}` : 'Not installed'} />
                  </div>
                  {device.videoEnabled && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {device.supportsLiveVideo && <Badge variant="secondary">Live</Badge>}
                      {device.supportsVideoPlayback && <Badge variant="secondary">Playback</Badge>}
                      {device.supportsVideoSnapshot && <Badge variant="secondary">Snapshot</Badge>}
                    </div>
                  )}
                  {canWrite && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                      <Button size="sm" variant="outline" onClick={() => openInstall(device)} disabled={saving}>
                        <Link2 className="mr-2 h-4 w-4" />{device.currentInstallation ? 'Move device' : 'Install'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openVideoConfiguration(device)} disabled={saving}>
                        <Settings2 className="mr-2 h-4 w-4" />Cameras
                      </Button>
                      {device.currentInstallation && (
                        <Button size="sm" variant="ghost" onClick={() => uninstall(device)} disabled={saving}>
                          <Link2Off className="mr-2 h-4 w-4" />Uninstall
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl">
          <form onSubmit={saveDevice}>
            <DialogHeader><DialogTitle>Register telematics device</DialogTitle></DialogHeader>
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Device name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field label="Provider adapter"><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} required /></Field>
              <Field label="Device type"><Input value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} required /></Field>
              <Field label="IMEI"><Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} /></Field>
              <Field label="Serial number"><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></Field>
              <Field label="Credential reference"><Input value={form.credentialRef} onChange={(e) => setForm({ ...form, credentialRef: e.target.value })} placeholder="vault://provider/device" /></Field>
              <p className="sm:col-span-2 text-xs leading-5 text-muted-foreground">Raw API keys, passwords and provider secrets are rejected. Store them server-side and enter only the credential reference.</p>
            </DialogBody>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Registering…' : 'Register device'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Install {selectedDevice?.name}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Asset type">
              <Select value={assetType} onValueChange={(value) => { setAssetType(value as AssetType); setAssetId('') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tractor">Tractor</SelectItem><SelectItem value="trailer">Trailer</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Fleet asset">
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger><SelectValue placeholder="Choose vehicle" /></SelectTrigger>
                <SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.plateNumber}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <p className="text-xs leading-5 text-muted-foreground">Moving a device automatically closes its previous active installation at the new installation time; the historical binding remains immutable.</p>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setInstallOpen(false)}>Cancel</Button><Button disabled={!assetId || saving} onClick={installSelected}>{saving ? 'Saving…' : 'Record installation'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Video capabilities · {selectedDevice?.name}</DialogTitle></DialogHeader>
          <DialogBody className="max-h-[70vh] space-y-5 overflow-y-auto">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <ToggleRow
                label="Video enabled"
                description="Enable camera capabilities for this MDVR or dashcam device."
                checked={videoForm.videoEnabled}
                onCheckedChange={(checked) => setVideoForm((current) => ({ ...current, videoEnabled: checked }))}
              />
              <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
                <CompactToggle label="Live view" checked={videoForm.supportsLiveVideo} disabled={!videoForm.videoEnabled} onCheckedChange={(checked) => setVideoForm((current) => ({ ...current, supportsLiveVideo: checked }))} />
                <CompactToggle label="Playback" checked={videoForm.supportsVideoPlayback} disabled={!videoForm.videoEnabled} onCheckedChange={(checked) => setVideoForm((current) => ({ ...current, supportsVideoPlayback: checked }))} />
                <CompactToggle label="Snapshot" checked={videoForm.supportsVideoSnapshot} disabled={!videoForm.videoEnabled} onCheckedChange={(checked) => setVideoForm((current) => ({ ...current, supportsVideoSnapshot: checked }))} />
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Camera channels</h3>
                  <p className="text-xs text-muted-foreground">Classify each physical channel for privacy-aware live view and incident evidence.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!videoForm.videoEnabled}
                  onClick={() => setVideoChannels((current) => [...current, { key: `channel-${current.length + 1}`, label: 'Camera', orientation: 'unknown', privacyClass: 'exterior', enabled: true }])}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />Add channel
                </Button>
              </div>

              <div className="space-y-3">
                {videoChannels.map((channel, index) => (
                  <div key={`${channel.key}-${index}`} className="grid gap-3 rounded-2xl border p-3 md:grid-cols-[1fr_1.4fr_1fr_1fr_auto] md:items-end">
                    <Field label="Channel key"><Input value={channel.key} disabled={!videoForm.videoEnabled} onChange={(event) => updateVideoChannel(index, { key: event.target.value })} /></Field>
                    <Field label="Label"><Input value={channel.label} disabled={!videoForm.videoEnabled} onChange={(event) => updateVideoChannel(index, { label: event.target.value })} /></Field>
                    <Field label="Orientation">
                      <Select value={channel.orientation} disabled={!videoForm.videoEnabled} onValueChange={(value) => updateVideoChannel(index, { orientation: value as CameraOrientation })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['front', 'cabin', 'rear', 'left', 'right', 'cargo', 'unknown'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Privacy class">
                      <Select value={channel.privacyClass} disabled={!videoForm.videoEnabled} onValueChange={(value) => updateVideoChannel(index, { privacyClass: value as PrivacyClass })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="road">Road</SelectItem>
                          <SelectItem value="driver">Driver / cabin</SelectItem>
                          <SelectItem value="cargo">Cargo</SelectItem>
                          <SelectItem value="exterior">Exterior</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="flex items-center gap-2 pb-1">
                      <Switch checked={channel.enabled} disabled={!videoForm.videoEnabled} onCheckedChange={(checked) => updateVideoChannel(index, { enabled: checked })} aria-label={`Enable ${channel.label}`} />
                      <Button type="button" variant="ghost" size="icon" disabled={!videoForm.videoEnabled} onClick={() => setVideoChannels((current) => current.filter((_, channelIndex) => channelIndex !== index))} aria-label={`Remove ${channel.label}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">No stream URL, playback URL, provider token, or camera password is stored here. Provider media access is brokered later through short-lived server-side sessions.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoOpen(false)}>Cancel</Button>
            <Button onClick={saveVideoConfiguration} disabled={saving}>{saving ? 'Saving…' : 'Save video configuration'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-amber-500" /></CardContent></Card>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</div><div className="mt-1 truncate text-xs font-medium" title={value}>{value}</div></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>
}

function ToggleRow({ label, description, checked, onCheckedChange }: { label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4"><div><Label>{label}</Label><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>
}

function CompactToggle({ label, checked, disabled, onCheckedChange }: { label: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-xl border bg-background p-3"><Label className="text-xs">{label}</Label><Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} /></div>
}
