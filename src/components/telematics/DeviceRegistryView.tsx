'use client'

import * as React from 'react'
import { Activity, Cable, Camera, Link2, Link2Off, Plus, RadioTower, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'

type AssetType = 'tractor' | 'trailer'

interface Installation {
  id: string
  assetType: AssetType
  assetId: string
  installedAt: string
  uninstalledAt: string | null
}

interface CameraChannelRecord {
  id?: string
  key: string
  label: string
  orientation: string
  privacyClass: string
  enabled: boolean
}

interface VideoRetentionPolicyRecord {
  videoEnabled: boolean
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
  currentInstallation: Installation | null
  cameraChannels: CameraChannelRecord[]
  videoRetentionPolicy: VideoRetentionPolicyRecord | null
}

interface AssetOption {
  id: string
  plateNumber: string
}

const blankForm = {
  name: '',
  provider: 'generic-http',
  deviceType: 'gnss-tracker',
  imei: '',
  serialNumber: '',
  credentialRef: '',
}

const blankVideoPolicy: VideoRetentionPolicyRecord = {
  videoEnabled: false,
  supportsLive: false,
  supportsPlayback: false,
  supportsSnapshot: false,
}

const defaultCameraChannels: CameraChannelRecord[] = [
  { key: 'front', label: 'Front road', orientation: 'front', privacyClass: 'road', enabled: true },
  { key: 'cabin', label: 'Driver cabin', orientation: 'cabin', privacyClass: 'driver', enabled: false },
  { key: 'rear', label: 'Rear', orientation: 'rear', privacyClass: 'exterior', enabled: false },
  { key: 'cargo', label: 'Cargo', orientation: 'cargo', privacyClass: 'cargo', enabled: false },
]

export function DeviceRegistryView() {
  const { user } = useAuthStore()
  const canWrite = user?.role === 'Admin' || user?.role === 'Manager'
  const [devices, setDevices] = React.useState<DeviceRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [formOpen, setFormOpen] = React.useState(false)
  const [installOpen, setInstallOpen] = React.useState(false)
  const [selectedDevice, setSelectedDevice] = React.useState<DeviceRecord | null>(null)
  const [form, setForm] = React.useState(blankForm)
  const [videoRetentionPolicy, setVideoRetentionPolicy] = React.useState<VideoRetentionPolicyRecord>(blankVideoPolicy)
  const [cameraChannels, setCameraChannels] = React.useState<CameraChannelRecord[]>(defaultCameraChannels)
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
          videoRetentionPolicy,
          cameraChannels: videoRetentionPolicy.videoEnabled ? cameraChannels : [],
        }),
      })
      toast.success('Telematics device registered')
      setForm(blankForm)
      setVideoRetentionPolicy(blankVideoPolicy)
      setCameraChannels(defaultCameraChannels)
      setFormOpen(false)
      await loadDevices()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to register device')
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

  function updateCameraChannel(key: string, patch: Partial<CameraChannelRecord>) {
    setCameraChannels((current) => current.map((channel) => channel.key === key ? { ...channel, ...patch } : channel))
  }

  const online = devices.filter((device) => device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 15 * 60_000).length
  const installed = devices.filter((device) => device.currentInstallation).length

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

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric title="Registered" value={devices.length} icon={Cable} />
        <Metric title="Installed" value={installed} icon={Link2} />
        <Metric title="Recently seen" value={online} icon={Activity} />
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
                  {device.videoRetentionPolicy?.videoEnabled && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/20">
                      <Camera className="h-4 w-4 text-amber-600" />
                      <span className="font-semibold">Video enabled</span>
                      <span className="text-muted-foreground">{device.cameraChannels.filter((channel) => channel.enabled).length} active channels</span>
                      {device.videoRetentionPolicy.supportsLive && <Badge variant="outline">Live</Badge>}
                      {device.videoRetentionPolicy.supportsPlayback && <Badge variant="outline">Playback</Badge>}
                      {device.videoRetentionPolicy.supportsSnapshot && <Badge variant="outline">Snapshot</Badge>}
                    </div>
                  )}
                  {canWrite && (
                    <div className="mt-4 flex gap-2 border-t pt-3">
                      <Button size="sm" variant="outline" onClick={() => openInstall(device)} disabled={saving}>
                        <Link2 className="mr-2 h-4 w-4" />{device.currentInstallation ? 'Move device' : 'Install'}
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
        <DialogContent className="max-w-3xl">
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

              <div className="sm:col-span-2 rounded-2xl border p-4">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Video telematics</div>
                    <p className="mt-1 text-xs text-muted-foreground">Enable only when this hardware/provider supports MDVR or dashcam channels.</p>
                  </div>
                  <input type="checkbox" checked={videoRetentionPolicy.videoEnabled} onChange={(e) => setVideoRetentionPolicy({ ...videoRetentionPolicy, videoEnabled: e.target.checked })} className="h-4 w-4" />
                </label>

                {videoRetentionPolicy.videoEnabled && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div className="flex flex-wrap gap-4 text-xs">
                      {[
                        ['supportsLive', 'Live view'],
                        ['supportsPlayback', 'Playback'],
                        ['supportsSnapshot', 'Snapshot'],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={videoRetentionPolicy[key as keyof VideoRetentionPolicyRecord]}
                            onChange={(e) => setVideoRetentionPolicy({ ...videoRetentionPolicy, [key]: e.target.checked })}
                            className="h-4 w-4"
                          />
                          {label}
                        </label>
                      ))}
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Camera channels</div>
                      <div className="space-y-2">
                        {cameraChannels.map((channel) => (
                          <div key={channel.key} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-[auto_1.2fr_1fr_1fr] sm:items-center">
                            <label className="flex items-center gap-2 text-xs font-medium">
                              <input type="checkbox" checked={channel.enabled} onChange={(e) => updateCameraChannel(channel.key, { enabled: e.target.checked })} className="h-4 w-4" />
                              {channel.key}
                            </label>
                            <Input value={channel.label} onChange={(e) => updateCameraChannel(channel.key, { label: e.target.value })} aria-label={`${channel.key} camera label`} />
                            <Select value={channel.orientation} onValueChange={(value) => updateCameraChannel(channel.key, { orientation: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{['front', 'cabin', 'rear', 'left', 'right', 'cargo', 'unknown'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={channel.privacyClass} onValueChange={(value) => updateCameraChannel(channel.key, { privacyClass: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{['road', 'driver', 'cargo', 'exterior'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
