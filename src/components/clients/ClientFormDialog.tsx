'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Badge } from '@/components/ui/badge'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import { MapPin, Plus, X, Building2, Loader2 } from 'lucide-react'
import { apiFetch, createClient, updateClient, type Client, type ClientZoneDetail } from '@/lib/api'
import { toast } from 'sonner'

interface ZoneEntry {
  destinationZoneId: string
  zoneName: string
  cityName: string
  cityRegion: string
  branchName: string
  address: string
  contactPerson: string
  phone: string
  isPrimary: boolean
}

const clientFormSchema = z.object({
  companyName: z.string().min(2, 'Shop/Store name is required'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z.string().min(5, 'Phone number is required'),
  email: z.string().email('Invalid email address').or(z.literal('')).optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  linkExistingTrips: z.boolean().default(false),
})

type ClientFormValues = z.infer<typeof clientFormSchema>

interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  onUpdated?: () => void
  client?: Client | null
}

interface DestCity {
  id: string
  name: string
  region: string | null
}

interface DestZone {
  id: string
  name: string
  destinationCityId: string
  destinationCity: { name: string; region: string | null }
}

export function ClientFormDialog({ open, onOpenChange, onCreated, onUpdated, client }: ClientFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [zoneEntries, setZoneEntries] = React.useState<ZoneEntry[]>([])
  const [loadingZones, setLoadingZones] = React.useState(false)

  // Region / City / Zone state
  const [allCities, setAllCities] = React.useState<DestCity[]>([])
  const [selectedRegion, setSelectedRegion] = React.useState('')
  const [selectedCityId, setSelectedCityId] = React.useState('')
  const [zones, setZones] = React.useState<DestZone[]>([])
  const [selectedZoneId, setSelectedZoneId] = React.useState('')
  const [newBranchName, setNewBranchName] = React.useState('')

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
      linkExistingTrips: false,
    },
  })

  // Derive regions from cities
  const regions = React.useMemo(() => {
    const regionSet = new Set<string>()
    allCities.forEach((c) => {
      if (c.region) regionSet.add(c.region)
    })
    return Array.from(regionSet).sort()
  }, [allCities])

  // Filtered cities by selected region
  const filteredCities = React.useMemo(() => {
    if (!selectedRegion) return allCities
    return allCities.filter((c) => c.region === selectedRegion)
  }, [allCities, selectedRegion])

  // Load destination cities on open
  React.useEffect(() => {
    if (open) {
      apiFetch<{ data: DestCity[] }>('/api/destination-cities?limit=200')
        .then((res) => {
          setAllCities((res.data || []).map((c) => ({
            id: c.id,
            name: c.name,
            region: c.region || null,
          })))
        })
        .catch(() => {})
    }
  }, [open])

  // Load zones when city changes
  React.useEffect(() => {
    if (selectedCityId) {
      setLoadingZones(true)
      apiFetch<{ data: DestZone[] }>(`/api/destination-zones?destinationCityId=${selectedCityId}&limit=200`)
        .then((res) => {
          setZones((res.data || []).map((z) => ({
            id: z.id,
            name: z.name,
            destinationCityId: z.destinationCityId,
            destinationCity: {
              name: z.destinationCity?.name || '',
              region: z.destinationCity?.region || null,
            },
          })))
        })
        .catch(() => setZones([]))
        .finally(() => setLoadingZones(false))
    } else {
      setZones([])
      setSelectedZoneId('')
    }
  }, [selectedCityId])

  // Reset downstream selections when region changes
  // Auto-select city if there's exactly one in the region (e.g., capital city)
  function handleRegionChange(val: string) {
    setSelectedRegion(val)
    setSelectedZoneId('')
    setZones([])

    // Auto-select the city if there's exactly one in this region
    const citiesInRegion = val
      ? allCities.filter((c) => c.region === val)
      : []

    if (citiesInRegion.length === 1) {
      setSelectedCityId(citiesInRegion[0].id)
    } else {
      setSelectedCityId('')
    }
  }

  // Reset zone when city changes
  function handleCityChange(val: string) {
    setSelectedCityId(val)
    setSelectedZoneId('')
  }

  // Pre-fill form when editing
  React.useEffect(() => {
    if (open) {
      if (client) {
        form.reset({
          companyName: client.companyName,
          contactPerson: client.contactPerson,
          phone: client.phone,
          email: client.email || '',
          address: client.address || '',
          notes: client.notes || '',
          linkExistingTrips: false,
        })
        // Pre-fill zone entries from client data
        if (client.zones && client.zones.length > 0) {
          setZoneEntries((client.zones as unknown as ClientZoneDetail[]).map((z) => ({
            destinationZoneId: z.destinationZoneId,
            zoneName: z.zoneName || '',
            cityName: z.cityName || '',
            cityRegion: z.cityRegion || '',
            branchName: z.branchName || '',
            address: z.address || '',
            contactPerson: z.contactPerson || '',
            phone: z.phone || '',
            isPrimary: z.isPrimary,
          })))
        } else {
          setZoneEntries([])
        }
      } else {
        form.reset({
          companyName: '',
          contactPerson: '',
          phone: '',
          email: '',
          address: '',
          notes: '',
          linkExistingTrips: false,
        })
        setZoneEntries([])
      }
      setSelectedRegion('')
      setSelectedCityId('')
      setZones([])
      setSelectedZoneId('')
      setNewBranchName('')
    }
  }, [client, form, open])

  function addZone() {
    if (!selectedZoneId) {
      toast.error('Please select a destination zone')
      return
    }
    // Check if zone already added
    if (zoneEntries.find((z) => z.destinationZoneId === selectedZoneId)) {
      toast.error('This zone is already added')
      return
    }
    const zone = zones.find((z) => z.id === selectedZoneId)
    const city = allCities.find((c) => c.id === selectedCityId)
    setZoneEntries([
      ...zoneEntries,
      {
        destinationZoneId: selectedZoneId,
        zoneName: zone?.name || '',
        cityName: city?.name || zone?.destinationCity?.name || '',
        cityRegion: city?.region || zone?.destinationCity?.region || '',
        branchName: newBranchName,
        address: '',
        contactPerson: '',
        phone: '',
        isPrimary: zoneEntries.length === 0,
      },
    ])
    setSelectedZoneId('')
    setNewBranchName('')
  }

  function removeZone(zoneId: string) {
    setZoneEntries(zoneEntries.filter((z) => z.destinationZoneId !== zoneId))
  }

  function setPrimary(zoneId: string) {
    setZoneEntries(zoneEntries.map((z) => ({ ...z, isPrimary: z.destinationZoneId === zoneId })))
  }

  async function onSubmit(data: ClientFormValues) {
    setSubmitting(true)
    if (zoneEntries.length === 0) {
      toast.error('Please add at least one destination zone (Region → City → Zone)')
      return
    }

    try {
      const body: Record<string, unknown> = {
        companyName: data.companyName,
        contactPerson: data.contactPerson,
        phone: data.phone,
        linkExistingTrips: data.linkExistingTrips,
        zones: zoneEntries,
      }
      if (data.email) body.email = data.email
      if (data.address) body.address = data.address
      if (data.notes) body.notes = data.notes

      if (client) {
        const result = await updateClient(client.id, body as Parameters<typeof updateClient>[1])
        toast.success('Client updated successfully', {
          description: data.companyName,
        })
        if (result.linkedTrips && result.linkedTrips > 0) {
          toast.info(`${result.linkedTrips} existing trip(s) linked to this client`)
        }
        onOpenChange(false)
        onUpdated?.()
      } else {
        const result = await createClient(body as Parameters<typeof createClient>[0])
        toast.success('Client added successfully', {
          description: data.companyName,
        })
        if (result.linkedTrips && result.linkedTrips > 0) {
          toast.info(`${result.linkedTrips} existing trip(s) linked to this client`)
        }
        onOpenChange(false)
        onCreated?.()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : client ? 'Failed to update client' : 'Failed to create client')
    } finally {
      setSubmitting(false)
    }
  }

  const regionOptions: SearchableOption[] = regions.map((r) => ({
    value: r,
    label: r,
  }))

  const cityOptions: SearchableOption[] = filteredCities.map((c) => ({
    value: c.id,
    label: c.region ? `${c.name} (${c.region})` : c.name,
  }))

  const zoneOptions: SearchableOption[] = zones
    .filter((z) => !zoneEntries.find((e) => e.destinationZoneId === z.id))
    .map((z) => ({
      value: z.id,
      label: z.name,
    }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-500" />
            {client ? 'Edit Client' : 'Add New Client'}
          </DialogTitle>
          <DialogDescription>
            {client
              ? 'Update client information and zone associations below.'
              : 'Fill in the details to register a new shop or store.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
        <DialogBody>
        <Form {...form}>
          <form id="client-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Shop/Store & Contact */}
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shop / Store Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Kwame Hardware Store" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Person *</FormLabel>
                  <FormControl>
                    <Input placeholder="Kwame Asante" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone *</FormLabel>
                    <FormControl>
                      <Input placeholder="+233 24 567 8901" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="info@company.com.gh" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="37 Ring Road Central, North Industrial Area" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Destination Zones: Region → City → Zone ── */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-500" />
                <Label className="text-sm font-semibold">Destination Zones *</Label>
                {zoneEntries.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{zoneEntries.length}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select the region, city, then zone where this client operates.
              </p>

              {/* Row 1: Region → City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <SearchableSelect
                  placeholder="Select region..."
                  searchPlaceholder="Search regions..."
                  emptyMessage="No regions found"
                  value={selectedRegion}
                  onValueChange={handleRegionChange}
                  options={regionOptions}
                  alwaysSearchable
                />
                {selectedRegion ? (
                  <SearchableSelect
                    placeholder={filteredCities.length === 0 ? 'No cities in this region' : 'Select city...'}
                    searchPlaceholder="Search cities..."
                    emptyMessage="No city found"
                    value={selectedCityId}
                    onValueChange={handleCityChange}
                    options={cityOptions}
                    disabled={filteredCities.length === 0}
                  />
                ) : (
                  <div className="h-9 rounded-md border bg-muted/50 flex items-center px-3 text-xs text-muted-foreground">
                    Select a region first
                  </div>
                )}
              </div>

              {/* Row 2: Zone → Add button */}
              <div className="flex gap-2">
                <div className="flex-1">
                  {selectedCityId ? (
                    <SearchableSelect
                      placeholder={loadingZones ? 'Loading zones...' : 'Select zone...'}
                      searchPlaceholder="Search zones..."
                      emptyMessage={zones.length === 0 ? 'No zones in this city' : 'No zone found'}
                      value={selectedZoneId}
                      onValueChange={setSelectedZoneId}
                      options={zoneOptions}
                      disabled={loadingZones}
                    />
                  ) : (
                    <div className="h-9 rounded-md border bg-muted/50 flex items-center px-3 text-xs text-muted-foreground">
                      Select a city first
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addZone}
                  disabled={!selectedZoneId}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {/* Branch name (optional, when zone is selected) */}
              {selectedZoneId && (
                <Input
                  placeholder="Branch name (optional, e.g., Accra Main Branch)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="text-sm"
                />
              )}

              {/* Added zones list */}
              {zoneEntries.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {zoneEntries.map((entry) => {
                    const locationParts = [entry.cityRegion, entry.cityName].filter(Boolean).join(', ')
                    const fullLabel = entry.zoneName + (locationParts ? ` — ${locationParts}` : '')

                    return (
                      <div
                        key={entry.destinationZoneId}
                        className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium truncate">{entry.zoneName}</span>
                            {locationParts && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                ({locationParts})
                              </span>
                            )}
                            {entry.isPrimary && (
                              <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                                Primary
                              </Badge>
                            )}
                          </div>
                          {entry.branchName && (
                            <p className="text-xs text-muted-foreground truncate">{entry.branchName}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => setPrimary(entry.destinationZoneId)}
                          disabled={entry.isPrimary}
                          title={entry.isPrimary ? 'Already primary' : 'Set as primary zone'}
                        >
                          <MapPin className="h-3 w-3 mr-0.5" />
                          {entry.isPrimary ? 'Primary' : 'Set Primary'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => removeZone(entry.destinationZoneId)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Link trips toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Switch
                id="linkTrips"
                checked={form.watch('linkExistingTrips')}
                onCheckedChange={(checked) => form.setValue('linkExistingTrips', checked)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="linkTrips" className="text-sm font-medium cursor-pointer">
                  Link existing trips
                </Label>
                <p className="text-xs text-muted-foreground">
                  Auto-link unlinked trips with matching customer name to this client
                </p>
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Payment terms, special agreements, delivery preferences..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </form>
        </Form>
        </DialogBody>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" className="bg-amber-500 hover:bg-amber-600 text-white" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : client ? 'Update Client' : 'Add Client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
