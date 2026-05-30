'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Building2, Bell, MapPin, Palette, Database, Shield, Globe, Clock,
  Truck, Fuel, DollarSign, Mail, Phone, Navigation, Save, RotateCcw,
  CheckCircle2, Circle, Info, Download, Trash2, Plus, Pencil, X,
  Wifi, Smartphone, Cpu, Loader2, Star, Eye, EyeOff, Send, Lock, CreditCard
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Switch as SwitchToggle } from '@/components/ui/switch'
import { toast } from 'sonner'
import { fetchSettings, saveSettings, type SystemSettings, fetchChannelSettings, updateChannelSettings, testSmsChannel, testEmailChannel, testPaystackChannel, type ChannelSettings, generateReport } from '@/lib/api'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/lib/store/auth'
import { APP_COMPANY } from '@/lib/constants'
import { CurrencyConverter } from '@/components/settings/CurrencyConverter'

function navigateToReports(reportType: string, format: 'pdf' | 'xlsx' | 'csv') {
  // Navigate to Reports page and trigger generation
  const event = new CustomEvent('navigate-page', { detail: 'reports' })
  window.dispatchEvent(event)
  // Use setTimeout to allow navigation to complete before generating
  setTimeout(() => {
    generateReport({ type: reportType, format }).then(
      () => toast.success('Report downloaded successfully'),
      (err) => toast.error(err instanceof Error ? err.message : 'Failed to generate report')
    )
  }, 500)
}

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  show: { opacity: 1, y: 0 },
}

const DEFAULT_COMPANY = {
  name: APP_COMPANY, email: 'info@fleetpro.com.gh', phone: '+233 30 277 8899',
  address: '37 Ring Road Central', city: 'Accra', country: 'Ghana',
  website: 'www.fleetpro.com.gh', registrationNumber: '',
}
const DEFAULT_NOTIFICATIONS = {
  tripStarted: true, tripCompleted: true, maintenanceDue: true,
  insuranceExpiring: true, speedingAlert: true, geofenceAlert: true,
  driverOffline: true, dailyReport: false,
}
const DEFAULT_TRACKING = { defaultUpdateInterval: 30, speedThreshold: 80, enableGeofence: true, idleTimeout: 15 }
const DEFAULT_DISPLAY = {
  currency: 'GHS', distanceUnit: 'km', fuelUnit: 'litres',
  dateFormat: 'DD/MM/YYYY', timezone: 'Africa/Accra', language: 'English',
}
const DEFAULT_DRIVER_ID = { prefix: 'FP-DRV-', counter: 7, padding: 3 }

export function SettingsView() {
  const { user } = useAuthStore()
  const isDriver = user?.role === 'Driver'
  const [activeTab, setActiveTab] = React.useState(isDriver ? 'notifications' : 'company')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [company, setCompany] = React.useState(DEFAULT_COMPANY)
  const [notifications, setNotifications] = React.useState(DEFAULT_NOTIFICATIONS)
  const [tracking, setTracking] = React.useState(DEFAULT_TRACKING)
  const [display, setDisplay] = React.useState(DEFAULT_DISPLAY)
  const [driverId, setDriverId] = React.useState(DEFAULT_DRIVER_ID)
  const [settingsId, setSettingsId] = React.useState<string>('')
  const [resetOpen, setResetOpen] = React.useState(false)
  const [currencyFormOpen, setCurrencyFormOpen] = React.useState(false)

  // Channel settings state
  const [channels, setChannels] = React.useState<ChannelSettings>({
    smsEnabled: false, smsProvider: 'hubtel', hubtelClientId: '', hubtelApiSecret: '',
    arkeselApiKey: '', arkeselSenderId: '', emailEnabled: false, smtpHost: '',
    smtpPort: 587, smtpUser: '', smtpFrom: '', smtpSecure: true, hasSmtpPass: false, smtpPass: '',
    // Paystack
    paystackEnabled: false, paystackSecretKey: '', paystackPublicKey: '', paystackMode: 'test',
    mobileMoneyProvider: 'mtn', paystackWebhookSecret: '', hasPaystackSecret: false,
    hasPaystackWebhookSecret: false,
  })
  const [channelsLoaded, setChannelsLoaded] = React.useState(false)
  const [savingChannels, setSavingChannels] = React.useState(false)
  const [testingSms, setTestingSms] = React.useState(false)
  const [testingEmail, setTestingEmail] = React.useState(false)
  const [testingPaystack, setTestingPaystack] = React.useState(false)
  // Password visibility toggles
  const [showHubtelSecret, setShowHubtelSecret] = React.useState(false)
  const [showArkeselKey, setShowArkeselKey] = React.useState(false)
  const [showSmtpPass, setShowSmtpPass] = React.useState(false)
  const [showPaystackSecret, setShowPaystackSecret] = React.useState(false)
  const [showPaystackWebhookSecret, setShowPaystackWebhookSecret] = React.useState(false)

  // Load settings from database
  React.useEffect(() => {
    async function load() {
      try {
        const data = await fetchSettings()
        setSettingsId(data.id)
        setCompany(data.company)
        setNotifications(data.notifications)
        setTracking(data.tracking)
        setDisplay(data.display)
        if (data.driverId) setDriverId(data.driverId)
      } catch (err) {
        toast.error('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Load channel settings separately
  React.useEffect(() => {
    async function loadChannels() {
      try {
        const data = await fetchChannelSettings()
        setChannels(data)
        setChannelsLoaded(true)
      } catch {
        setChannelsLoaded(true)
      }
    }
    loadChannels()
  }, [])

  const handleSave = React.useCallback(async () => {
    setSaving(true)
    try {
      const payload: SystemSettings = {
        id: settingsId,
        company,
        notifications,
        tracking,
        display,
        driverId,
      }
      const result = await saveSettings(payload)
      setSettingsId(result.id)
      toast.success('Settings saved successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }, [settingsId, company, notifications, tracking, display])

  const handleNotificationToggle = React.useCallback((key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleReset = React.useCallback(async () => {
    setResetting(true)
    try {
      const payload: SystemSettings = {
        id: settingsId,
        company: DEFAULT_COMPANY,
        notifications: DEFAULT_NOTIFICATIONS,
        tracking: DEFAULT_TRACKING,
        display: DEFAULT_DISPLAY,
        driverId: DEFAULT_DRIVER_ID,
      }
      const result = await saveSettings(payload)
      setSettingsId(result.id)
      setCompany(DEFAULT_COMPANY)
      setNotifications(DEFAULT_NOTIFICATIONS)
      setTracking(DEFAULT_TRACKING)
      setDisplay(DEFAULT_DISPLAY)
      setDriverId(DEFAULT_DRIVER_ID)
      setResetOpen(false)
      toast.success('Settings reset to defaults')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset settings'
      toast.error(message)
    } finally {
      setResetting(false)
    }
  }, [settingsId])

  // Channel save handler
  const handleSaveChannels = React.useCallback(async () => {
    setSavingChannels(true)
    try {
      const result = await updateChannelSettings(channels)
      setChannels(result)
      toast.success('Channel settings saved successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save channel settings'
      toast.error(message)
    } finally {
      setSavingChannels(false)
    }
  }, [channels])

  // Test SMS handler
  const handleTestSms = React.useCallback(async () => {
    setTestingSms(true)
    try {
      const result = await testSmsChannel()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error('Failed to send test SMS')
    } finally {
      setTestingSms(false)
    }
  }, [])

  // Test Email handler
  const handleTestEmail = React.useCallback(async () => {
    setTestingEmail(true)
    try {
      const result = await testEmailChannel()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error('Failed to send test email')
    } finally {
      setTestingEmail(false)
    }
  }, [])

  // Test Paystack handler
  const handleTestPaystack = React.useCallback(async () => {
    setTestingPaystack(true)
    try {
      const result = await testPaystackChannel()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error('Failed to test Paystack connection')
    } finally {
      setTestingPaystack(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">{isDriver ? 'Manage your display preferences and notification settings.' : 'Manage your company profile, preferences, and system configuration.'}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {!isDriver && (
          <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={saving || resetting}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Settings</AlertDialogTitle>
                <AlertDialogDescription>
                  This will restore all settings to their default values. Any changes you&apos;ve made will be lost. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} disabled={resetting} className="bg-red-600 hover:bg-red-700 text-white">
                  {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  {resetting ? 'Resetting...' : 'Reset to Defaults'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
          {!isDriver && (
          <Button onClick={handleSave} disabled={saving || resetting} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          )}
        </div>
      </motion.div>

      {/* Settings Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid gap-1 h-auto p-1 ${isDriver ? 'grid-cols-2' : 'grid-cols-3 sm:grid-cols-5'}`}>
            {!isDriver && (
            <TabsTrigger value="company" className="text-xs sm:text-sm gap-1.5 py-2">
              <Building2 className="h-3.5 w-3.5 hidden sm:block" />
              Company
            </TabsTrigger>
            )}
            <TabsTrigger value="notifications" className="text-xs sm:text-sm gap-1.5 py-2">
              <Bell className="h-3.5 w-3.5 hidden sm:block" />
              Notifications
            </TabsTrigger>
            {!isDriver && (
            <TabsTrigger value="channels" className="text-xs sm:text-sm gap-1.5 py-2">
              <Send className="h-3.5 w-3.5 hidden sm:block" />
              Channels
            </TabsTrigger>
            )}
            {!isDriver && (
            <TabsTrigger value="tracking" className="text-xs sm:text-sm gap-1.5 py-2">
              <MapPin className="h-3.5 w-3.5 hidden sm:block" />
              Tracking
            </TabsTrigger>
            )}
            <TabsTrigger value="display" className="text-xs sm:text-sm gap-1.5 py-2">
              <Palette className="h-3.5 w-3.5 hidden sm:block" />
              Display
            </TabsTrigger>
          </TabsList>

          {/* =================== COMPANY TAB =================== */}
          {!isDriver && (
          <TabsContent value="company" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                    <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Company Profile</CardTitle>
                    <CardDescription>Your company details used on invoices, reports, and waybills.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name</Label>
                    <Input
                      id="company-name"
                      value={company.name}
                      onChange={e => setCompany(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-number">Registration Number</Label>
                    <Input
                      id="reg-number"
                      value={company.registrationNumber}
                      onChange={e => setCompany(prev => ({ ...prev, registrationNumber: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="company-email"
                        type="email"
                        className="pl-9"
                        value={company.email}
                        onChange={e => setCompany(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="company-phone"
                        type="tel"
                        className="pl-9"
                        value={company.phone}
                        onChange={e => setCompany(prev => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-address">Address</Label>
                  <Input
                    id="company-address"
                    value={company.address}
                    onChange={e => setCompany(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-city">City</Label>
                    <Input
                      id="company-city"
                      value={company.city}
                      onChange={e => setCompany(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-country">Country</Label>
                    <Input
                      id="company-country"
                      value={company.country}
                      onChange={e => setCompany(prev => ({ ...prev, country: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-website">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company-website"
                      className="pl-9"
                      value={company.website}
                      onChange={e => setCompany(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                    <Database className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Data Management</CardTitle>
                    <CardDescription>Export and manage your fleet data.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" className="flex-1 justify-start gap-3 h-auto py-3" onClick={() => navigateToReports('trip_summary', 'xlsx')}>
                    <Download className="h-4 w-4 text-emerald-600" />
                    <div className="text-left">
                      <div className="font-medium text-sm">Export All Data</div>
                      <div className="text-xs text-muted-foreground">Download trucks, drivers, trips as Excel</div>
                    </div>
                  </Button>
                  <Button variant="outline" className="flex-1 justify-start gap-3 h-auto py-3" onClick={() => navigateToReports('fleet_overview', 'pdf')}>
                    <Truck className="h-4 w-4 text-amber-600" />
                    <div className="text-left">
                      <div className="font-medium text-sm">Export Fleet Report</div>
                      <div className="text-xs text-muted-foreground">Truck status and maintenance summary</div>
                    </div>
                  </Button>
                </div>
                <Separator />
                <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 justify-start gap-3 h-auto py-3 w-full">
                  <Trash2 className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium text-sm">Clear All Sample Data</div>
                    <div className="text-xs text-muted-foreground">Remove demo data, keep company settings</div>
                  </div>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* =================== NOTIFICATIONS TAB =================== */}
          <TabsContent value="notifications" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                    <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Notification Preferences</CardTitle>
                    <CardDescription>Choose which events trigger notifications.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trip Events</div>
                <NotificationItem
                  icon={<Navigation className="h-4 w-4 text-emerald-600" />}
                  title="Trip Started"
                  description="When a driver starts a new trip"
                  checked={notifications.tripStarted}
                  onChange={() => handleNotificationToggle('tripStarted')}
                />
                <NotificationItem
                  icon={<CheckCircle2 className="h-4 w-4 text-sky-600" />}
                  title="Trip Completed"
                  description="When a trip reaches its destination"
                  checked={notifications.tripCompleted}
                  onChange={() => handleNotificationToggle('tripCompleted')}
                />

                <Separator className="my-3" />

                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Maintenance &amp; Compliance</div>
                <NotificationItem
                  icon={<Fuel className="h-4 w-4 text-amber-600" />}
                  title="Maintenance Due"
                  description="When a truck is due for scheduled service"
                  checked={notifications.maintenanceDue}
                  onChange={() => handleNotificationToggle('maintenanceDue')}
                />
                <NotificationItem
                  icon={<Shield className="h-4 w-4 text-red-600" />}
                  title="Insurance Expiring"
                  description="When an insurance policy is within 30 days of expiry"
                  checked={notifications.insuranceExpiring}
                  onChange={() => handleNotificationToggle('insuranceExpiring')}
                />

                <Separator className="my-3" />

                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tracking &amp; Safety</div>
                <NotificationItem
                  icon={<DollarSign className="h-4 w-4 text-red-500" />}
                  title="Speeding Alert"
                  description="When a truck exceeds the speed threshold"
                  checked={notifications.speedingAlert}
                  onChange={() => handleNotificationToggle('speedingAlert')}
                />
                <NotificationItem
                  icon={<MapPin className="h-4 w-4 text-orange-500" />}
                  title="Geofence Alert"
                  description="When a truck enters or exits a geofence zone"
                  checked={notifications.geofenceAlert}
                  onChange={() => handleNotificationToggle('geofenceAlert')}
                />
                <NotificationItem
                  icon={<Wifi className="h-4 w-4 text-gray-500" />}
                  title="Driver Offline"
                  description="When a driver's GPS signal is lost for more than 10 minutes"
                  checked={notifications.driverOffline}
                  onChange={() => handleNotificationToggle('driverOffline')}
                />

                <Separator className="my-3" />

                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Reports</div>
                <NotificationItem
                  icon={<Info className="h-4 w-4 text-sky-500" />}
                  title="Daily Summary Report"
                  description="Receive a daily email with fleet activity summary"
                  checked={notifications.dailyReport}
                  onChange={() => handleNotificationToggle('dailyReport')}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* =================== CHANNELS TAB =================== */}
          {!isDriver && (
          <TabsContent value="channels" className="mt-4 space-y-4">
            {/* SMS Channel Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                      <Smartphone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">SMS Channel</CardTitle>
                      <CardDescription>Send SMS notifications via Hubtel or Arkesel.</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={channels.smsEnabled}
                    onCheckedChange={checked => setChannels(prev => ({ ...prev, smsEnabled: checked }))}
                    aria-label="Enable SMS"
                  />
                </div>
              </CardHeader>
              <CardContent className={`space-y-4 ${!channels.smsEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* Provider selector */}
                <div className="space-y-2">
                  <Label htmlFor="sms-provider">SMS Provider</Label>
                  <Select
                    value={channels.smsProvider}
                    onValueChange={value => setChannels(prev => ({ ...prev, smsProvider: value }))}
                  >
                    <SelectTrigger id="sms-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hubtel">Hubtel</SelectItem>
                      <SelectItem value="arkesel">Arkesel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {channels.smsProvider === 'hubtel' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="hubtel-client-id">Hubtel Client ID</Label>
                      <Input
                        id="hubtel-client-id"
                        placeholder="e.g., a1b2c3d4e5"
                        value={channels.hubtelClientId}
                        onChange={e => setChannels(prev => ({ ...prev, hubtelClientId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hubtel-api-secret">Hubtel API Secret</Label>
                      <div className="relative">
                        <Input
                          id="hubtel-api-secret"
                          type={showHubtelSecret ? 'text' : 'password'}
                          placeholder={channels.hubtelApiSecret ? '••••••••' : 'Enter API secret'}
                          value={channels.hubtelApiSecret.includes('••') ? '' : channels.hubtelApiSecret}
                          onChange={e => setChannels(prev => ({ ...prev, hubtelApiSecret: e.target.value }))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowHubtelSecret(!showHubtelSecret)}
                          aria-label={showHubtelSecret ? 'Hide secret' : 'Show secret'}
                        >
                          {showHubtelSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      {channels.hubtelApiSecret.includes('••') && (
                        <p className="text-xs text-muted-foreground">Leave blank to keep the existing secret unchanged.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="arkesel-api-key">Arkesel API Key</Label>
                      <div className="relative">
                        <Input
                          id="arkesel-api-key"
                          type={showArkeselKey ? 'text' : 'password'}
                          placeholder={channels.arkeselApiKey ? '••••••••' : 'Enter API key'}
                          value={channels.arkeselApiKey.includes('••') ? '' : channels.arkeselApiKey}
                          onChange={e => setChannels(prev => ({ ...prev, arkeselApiKey: e.target.value }))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowArkeselKey(!showArkeselKey)}
                          aria-label={showArkeselKey ? 'Hide key' : 'Show key'}
                        >
                          {showArkeselKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      {channels.arkeselApiKey.includes('••') && (
                        <p className="text-xs text-muted-foreground">Leave blank to keep the existing key unchanged.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="arkesel-sender-id">Arkesel Sender ID</Label>
                      <Input
                        id="arkesel-sender-id"
                        placeholder="e.g., iFleetPro"
                        value={channels.arkeselSenderId}
                        onChange={e => setChannels(prev => ({ ...prev, arkeselSenderId: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    SMS will be sent to drivers when trip events occur. Ghana phone numbers (+233 format) are required.
                    {channels.smsProvider === 'hubtel' && ' Register at '}
                    {channels.smsProvider === 'hubtel' && (
                      <a href="https://hubtel.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        hubtel.com
                      </a>
                    )}
                    {'.'}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveChannels}
                    disabled={savingChannels}
                    className="bg-amber-500 hover:bg-amber-600 text-white border-0 flex-1 sm:flex-initial"
                  >
                    {savingChannels ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                    Save SMS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestSms()}
                    disabled={testingSms || !channels.smsEnabled}
                  >
                    {testingSms ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                    {testingSms ? 'Sending...' : 'Send Test SMS'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Email Channel Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-2">
                      <Mail className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Email Channel (SMTP)</CardTitle>
                      <CardDescription>Send email notifications via your own SMTP server.</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={channels.emailEnabled}
                    onCheckedChange={checked => setChannels(prev => ({ ...prev, emailEnabled: checked }))}
                    aria-label="Enable Email"
                  />
                </div>
              </CardHeader>
              <CardContent className={`space-y-4 ${!channels.emailEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      placeholder="e.g., smtp.gmail.com"
                      value={channels.smtpHost}
                      onChange={e => setChannels(prev => ({ ...prev, smtpHost: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">SMTP Port</Label>
                    <Select
                      value={String(channels.smtpPort)}
                      onValueChange={value => setChannels(prev => ({ ...prev, smtpPort: Number(value) }))}
                    >
                      <SelectTrigger id="smtp-port">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="587">587 (STARTTLS)</SelectItem>
                        <SelectItem value="465">465 (SSL/TLS)</SelectItem>
                        <SelectItem value="25">25 (Unencrypted)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-from">From Email</Label>
                    <Input
                      id="smtp-from"
                      type="email"
                      placeholder="e.g., noreply@fleetpro.com.gh"
                      value={channels.smtpFrom}
                      onChange={e => setChannels(prev => ({ ...prev, smtpFrom: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-user">SMTP Username</Label>
                    <Input
                      id="smtp-user"
                      placeholder="e.g., user@gmail.com"
                      value={channels.smtpUser}
                      onChange={e => setChannels(prev => ({ ...prev, smtpUser: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-pass">SMTP Password</Label>
                    <div className="relative">
                      <Input
                        id="smtp-pass"
                        type={showSmtpPass ? 'text' : 'password'}
                        placeholder={channels.hasSmtpPass ? '••••••••' : 'Enter password'}
                        onChange={e => setChannels(prev => ({ ...prev, smtpPass: e.target.value }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        aria-label={showSmtpPass ? 'Hide password' : 'Show password'}
                      >
                        {showSmtpPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    {channels.hasSmtpPass && (
                      <p className="text-xs text-muted-foreground">Leave blank to keep the existing password unchanged.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Use TLS (SSL)</Label>
                    <div className="text-xs text-muted-foreground">Enable TLS encryption for port 465 or STARTTLS for port 587.</div>
                  </div>
                  <Switch
                    checked={channels.smtpSecure}
                    onCheckedChange={checked => setChannels(prev => ({ ...prev, smtpSecure: checked }))}
                  />
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    For Gmail, use an <strong>App Password</strong> (not your regular password). Go to Google Account → Security → 2-Step Verification → App passwords.
                    TLS is automatically enabled for port 465.
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveChannels}
                    disabled={savingChannels}
                    className="bg-sky-500 hover:bg-sky-600 text-white border-0 flex-1 sm:flex-initial"
                  >
                    {savingChannels ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                    Save Email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestEmail()}
                    disabled={testingEmail || !channels.emailEnabled}
                  >
                    {testingEmail ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                    {testingEmail ? 'Sending...' : 'Send Test Email'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Paystack Payment Channel Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                      <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Paystack Payments</CardTitle>
                      <CardDescription>Accept Mobile Money (MTN, Vodafone, AirtelTigo) and Card payments.</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={channels.paystackEnabled}
                    onCheckedChange={checked => setChannels(prev => ({ ...prev, paystackEnabled: checked }))}
                    aria-label="Enable Paystack"
                  />
                </div>
              </CardHeader>
              <CardContent className={`space-y-4 ${!channels.paystackEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* Mode selector */}
                <div className="space-y-2">
                  <Label htmlFor="paystack-mode">Mode</Label>
                  <Select
                    value={channels.paystackMode || 'test'}
                    onValueChange={value => setChannels(prev => ({ ...prev, paystackMode: value }))}
                  >
                    <SelectTrigger id="paystack-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Public Key */}
                <div className="space-y-2">
                  <Label htmlFor="paystack-public-key">Public Key</Label>
                  <Input
                    id="paystack-public-key"
                    placeholder="pk_test_xxxxxxxxxxxxxxxx"
                    value={channels.paystackPublicKey}
                    onChange={e => setChannels(prev => ({ ...prev, paystackPublicKey: e.target.value }))}
                  />
                </div>

                {/* Secret Key */}
                <div className="space-y-2">
                  <Label htmlFor="paystack-secret-key">Secret Key</Label>
                  <div className="relative">
                    <Input
                      id="paystack-secret-key"
                      type={showPaystackSecret ? 'text' : 'password'}
                      placeholder={channels.hasPaystackSecret ? '••••••••' : 'sk_test_xxxxxxxxxxxxxxxx'}
                      value={channels.paystackSecretKey.includes('••') ? '' : channels.paystackSecretKey}
                      onChange={e => setChannels(prev => ({ ...prev, paystackSecretKey: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPaystackSecret(!showPaystackSecret)}
                      aria-label={showPaystackSecret ? 'Hide secret' : 'Show secret'}
                    >
                      {showPaystackSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {channels.hasPaystackSecret && (
                    <p className="text-xs text-muted-foreground">Leave blank to keep the existing secret key unchanged.</p>
                  )}
                </div>

                {/* Webhook Secret */}
                <div className="space-y-2">
                  <Label htmlFor="paystack-webhook-secret">Webhook Secret</Label>
                  <div className="relative">
                    <Input
                      id="paystack-webhook-secret"
                      type={showPaystackWebhookSecret ? 'text' : 'password'}
                      placeholder={channels.hasPaystackWebhookSecret ? '••••••••' : 'Enter webhook secret from Paystack dashboard'}
                      value={channels.paystackWebhookSecret.includes('••') ? '' : channels.paystackWebhookSecret}
                      onChange={e => setChannels(prev => ({ ...prev, paystackWebhookSecret: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowPaystackWebhookSecret(!showPaystackWebhookSecret)}
                      aria-label={showPaystackWebhookSecret ? 'Hide webhook secret' : 'Show webhook secret'}
                    >
                      {showPaystackWebhookSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {channels.hasPaystackWebhookSecret && (
                    <p className="text-xs text-muted-foreground">Leave blank to keep the existing webhook secret unchanged.</p>
                  )}
                </div>

                {/* Mobile Money Provider */}
                <div className="space-y-2">
                  <Label htmlFor="mobile-money-provider">Default Mobile Money Provider</Label>
                  <Select
                    value={channels.mobileMoneyProvider || 'mtn'}
                    onValueChange={value => setChannels(prev => ({ ...prev, mobileMoneyProvider: value }))}
                  >
                    <SelectTrigger id="mobile-money-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                      <SelectItem value="vodafone">Vodafone Cash</SelectItem>
                      <SelectItem value="airteltigo">AirtelTigo Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Webhook URL display */}
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-md border bg-muted text-sm font-mono text-muted-foreground truncate">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/payments/paystack/webhook` : '/api/payments/paystack/webhook'}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const url = typeof window !== 'undefined' ? `${window.location.origin}/api/payments/paystack/webhook` : ''
                        if (url) {
                          navigator.clipboard.writeText(url)
                          toast.success('Webhook URL copied to clipboard')
                        }
                      }}
                      aria-label="Copy webhook URL"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Copy this URL to your Paystack Dashboard → Settings → Webhooks.</p>
                </div>

                {/* Info callout */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    Paystack supports <strong>Mobile Money</strong> (MTN, Vodafone, AirtelTigo) and <strong>Card</strong> payments in Ghana Cedi (GHS).
                    Create an account at{' '}
                    <a href="https://paystack.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                      paystack.com
                    </a>
                    {' '}and configure your API keys. Use <strong>Test</strong> mode during development.
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveChannels}
                    disabled={savingChannels}
                    className="bg-amber-500 hover:bg-amber-600 text-white border-0 flex-1 sm:flex-initial"
                  >
                    {savingChannels ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                    Save Paystack
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestPaystack()}
                    disabled={testingPaystack || !channels.paystackEnabled}
                  >
                    {testingPaystack ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                    {testingPaystack ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* =================== TRACKING TAB =================== */}
          {!isDriver && (
          <TabsContent value="tracking" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                    <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">GPS Tracking Settings</CardTitle>
                    <CardDescription>Configure real-time tracking behavior and thresholds.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="update-interval">Default Update Interval</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="update-interval"
                      type="number"
                      min={5}
                      max={300}
                      className="w-32"
                      value={tracking.defaultUpdateInterval}
                      onChange={e => setTracking(prev => ({ ...prev, defaultUpdateInterval: Number(e.target.value) }))}
                    />
                    <span className="text-sm text-muted-foreground">seconds</span>
                  </div>
                  <div className="text-xs text-muted-foreground">How often drivers&apos; phones send location updates. Lower = more accurate but uses more data.</div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="speed-threshold">Speeding Threshold</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="speed-threshold"
                      type="number"
                      min={30}
                      max={150}
                      className="w-32"
                      value={tracking.speedThreshold}
                      onChange={e => setTracking(prev => ({ ...prev, speedThreshold: Number(e.target.value) }))}
                    />
                    <span className="text-sm text-muted-foreground">km/h</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Trucks exceeding this speed will trigger a speeding alert. Ghana highway limit is 100 km/h.</div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Geofence Monitoring</Label>
                    <div className="text-xs text-muted-foreground">Enable automatic detection when trucks enter/exit geofence zones.</div>
                  </div>
                  <Switch
                    checked={tracking.enableGeofence}
                    onCheckedChange={checked => setTracking(prev => ({ ...prev, enableGeofence: checked }))}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="idle-timeout">Idle Timeout</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="idle-timeout"
                      type="number"
                      min={5}
                      max={120}
                      className="w-32"
                      value={tracking.idleTimeout}
                      onChange={e => setTracking(prev => ({ ...prev, idleTimeout: Number(e.target.value) }))}
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Mark a truck as &quot;idle&quot; if it hasn&apos;t moved for this long.</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-2">
                    <Smartphone className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Tracking Sources</CardTitle>
                    <CardDescription>Hybrid GPS tracking combines phone and hardware data.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg border">
                    <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2 mt-0.5">
                      <Smartphone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">Phone GPS</span>
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">Active</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Driver&apos;s smartphone sends location via the iFleetPro driver app. Requires mobile data.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-lg border">
                    <div className="rounded-lg bg-sky-100 dark:bg-sky-900/30 p-2 mt-0.5">
                      <Cpu className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">Hardware Tracker</span>
                        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-[10px]">Available</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Dedicated GPS device installed in the truck. Reports via REST API endpoint.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    When both sources are active, iFleetPro uses the most recent data point from either source.
                    Configure per-truck tracking settings in the <strong>Live Tracking</strong> page.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* =================== DISPLAY TAB =================== */}
          <TabsContent value="display" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-100 dark:bg-violet-900/30 p-2">
                    <Palette className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Display Preferences</CardTitle>
                    <CardDescription>Customize how data is displayed across the system.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="currency"
                        className="pl-9"
                        value={display.currency}
                        onChange={e => setDisplay(prev => ({ ...prev, currency: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="distance-unit">Distance Unit</Label>
                    <div className="relative">
                      <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="distance-unit"
                        className="pl-9"
                        value={display.distanceUnit}
                        onChange={e => setDisplay(prev => ({ ...prev, distanceUnit: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fuel-unit">Fuel Unit</Label>
                    <div className="relative">
                      <Fuel className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fuel-unit"
                        className="pl-9"
                        value={display.fuelUnit}
                        onChange={e => setDisplay(prev => ({ ...prev, fuelUnit: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-format">Date Format</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="date-format"
                        className="pl-9"
                        value={display.dateFormat}
                        onChange={e => setDisplay(prev => ({ ...prev, dateFormat: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="timezone"
                        className="pl-9"
                        value={display.timezone}
                        onChange={e => setDisplay(prev => ({ ...prev, timezone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="language"
                        className="pl-9"
                        value={display.language}
                        onChange={e => setDisplay(prev => ({ ...prev, language: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* =================== DRIVER ID AUTO-GENERATION =================== */}
            {!isDriver && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
                    <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Driver ID Auto-Generation</CardTitle>
                    <CardDescription>Configure the format for automatically generated driver employee IDs.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="driver-id-prefix">ID Prefix</Label>
                    <Input
                      id="driver-id-prefix"
                      value={driverId.prefix}
                      onChange={e => setDriverId(prev => ({ ...prev, prefix: e.target.value }))}
                      placeholder="FP-DRV-"
                    />
                    <p className="text-xs text-muted-foreground">e.g. FP-DRV-, DRV-, DRIVER-</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driver-id-counter">Next Number</Label>
                    <Input
                      id="driver-id-counter"
                      type="number"
                      min={1}
                      value={driverId.counter}
                      onChange={e => setDriverId(prev => ({ ...prev, counter: parseInt(e.target.value) || 1 }))}
                    />
                    <p className="text-xs text-muted-foreground">Counter for the next driver</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driver-id-padding">Zero-Pad Width</Label>
                    <Input
                      id="driver-id-padding"
                      type="number"
                      min={1}
                      max={10}
                      value={driverId.padding}
                      onChange={e => setDriverId(prev => ({ ...prev, padding: parseInt(e.target.value) || 3 }))}
                    />
                    <p className="text-xs text-muted-foreground">Digits width (3 = 001, 4 = 0001)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    <strong>Preview:</strong> Next driver will be assigned{' '}
                    <span className="font-mono font-bold bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                      {driverId.prefix}{String(driverId.counter).padStart(driverId.padding, '0')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            {/* =================== CURRENCY MANAGEMENT =================== */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                      <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Currency Management</CardTitle>
                      <CardDescription>Add, edit, and manage supported currencies.</CardDescription>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setCurrencyFormOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white h-8">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Currency
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <CurrenciesManager />
              </CardContent>
            </Card>

            {/* =================== CURRENCY CONVERTER =================== */}
            <CurrencyConverter />

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gray-100 dark:bg-gray-800 p-2">
                    <Shield className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">System Information</CardTitle>
                    <CardDescription>iFleetPro system details and version info.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-medium">2.1.0</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Build</span>
                    <span className="font-medium">2024.01.15</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Environment</span>
                    <Badge variant="outline" className="text-xs">Production</Badge>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">API Status</span>
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs gap-1">
                      <Circle className="h-1.5 w-1.5 fill-emerald-500" />
                      Online
                    </Badge>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Database</span>
                    <span className="font-medium">MySQL</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Tracking Service</span>
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs gap-1">
                      <Circle className="h-1.5 w-1.5 fill-emerald-500" />
                      Connected
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  )
}

function NotificationItem({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// ============ CURRENCY MANAGEMENT ============

interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  isActive: boolean
  isDefault: boolean
  position: number
  createdAt: string
  updatedAt: string
}

function CurrenciesManager() {
  const [currencies, setCurrencies] = React.useState<Currency[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editingCurrency, setEditingCurrency] = React.useState<Currency | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)

  // Form state
  const [formCode, setFormCode] = React.useState('')
  const [formName, setFormName] = React.useState('')
  const [formSymbol, setFormSymbol] = React.useState('')
  const [formIsDefault, setFormIsDefault] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const loadCurrencies = React.useCallback(async () => {
    try {
      const res = await fetch('/api/currencies')
      if (res.ok) {
        const data = await res.json()
        setCurrencies(data)
      }
    } catch (err) {
      console.error('Failed to load currencies:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadCurrencies()
  }, [loadCurrencies])

  const openCreateForm = React.useCallback(() => {
    setEditingCurrency(null)
    setFormCode('')
    setFormName('')
    setFormSymbol('')
    setFormIsDefault(false)
    setFormOpen(true)
  }, [])

  const openEditForm = React.useCallback((currency: Currency) => {
    setEditingCurrency(currency)
    setFormCode(currency.code)
    setFormName(currency.name)
    setFormSymbol(currency.symbol)
    setFormIsDefault(currency.isDefault)
    setFormOpen(true)
  }, [])

  const handleSubmit = React.useCallback(async () => {
    if (!formCode.trim() || !formName.trim() || !formSymbol.trim()) {
      toast.error('Please fill in all required fields')
      return
    }
    setSubmitting(true)
    try {
      const url = editingCurrency ? `/api/currencies/${editingCurrency.id}` : '/api/currencies'
      const method = editingCurrency ? 'PUT' : 'POST'
      const body: Record<string, unknown> = {
        code: formCode,
        name: formName,
        symbol: formSymbol,
        isDefault: formIsDefault,
      }
      if (editingCurrency) {
        body.isActive = true
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error)
      }

      toast.success(editingCurrency ? 'Currency updated' : 'Currency added')
      setFormOpen(false)
      loadCurrencies()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save currency')
    } finally {
      setSubmitting(false)
    }
  }, [editingCurrency, formCode, formName, formSymbol, formIsDefault, loadCurrencies])

  const handleToggleActive = React.useCallback(async (currency: Currency) => {
    try {
      const res = await fetch(`/api/currencies/${currency.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currency.isActive }),
      })
      if (res.ok) {
        loadCurrencies()
        toast.success(`Currency ${currency.isActive ? 'deactivated' : 'activated'}`)
      }
    } catch {
      toast.error('Failed to toggle currency')
    }
  }, [loadCurrencies])

  const handleSetDefault = React.useCallback(async (currency: Currency) => {
    if (currency.isDefault) return
    try {
      const res = await fetch(`/api/currencies/${currency.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      if (res.ok) {
        loadCurrencies()
        toast.success(`${currency.code} set as default currency`)
      }
    } catch {
      toast.error('Failed to set default currency')
    }
  }, [loadCurrencies])

  const handleDelete = React.useCallback(async (currency: Currency) => {
    if (currency.isDefault) {
      toast.error('Cannot delete the default currency')
      return
    }
    try {
      const res = await fetch(`/api/currencies/${currency.id}`, { method: 'DELETE' })
      if (res.ok) {
        loadCurrencies()
        toast.success(`${currency.code} removed`)
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        toast.error(err.error)
      }
    } catch {
      toast.error('Failed to delete currency')
    }
  }, [loadCurrencies])

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 w-full rounded" />
        ))}
      </div>
    )
  }

  if (currencies.length === 0) {
    return (
      <div className="text-center py-8">
        <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No currencies configured</p>
        <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Currency&quot; to get started</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {currencies.map((currency) => (
          <div
            key={currency.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              !currency.isActive ? 'opacity-50 bg-muted/30' : 'hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                currency.isDefault
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {currency.symbol}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{currency.code}</span>
                  {currency.isDefault && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5 py-0">
                      <Star className="h-2.5 w-2.5 mr-0.5" />
                      Default
                    </Badge>
                  )}
                  {!currency.isActive && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Inactive</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{currency.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!currency.isDefault && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleSetDefault(currency)}
                  title="Set as default"
                >
                  <Star className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => openEditForm(currency)}
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleToggleActive(currency)}
                title={currency.isActive ? 'Deactivate' : 'Activate'}
              >
                <SwitchToggle checked={currency.isActive} className="scale-75 pointer-events-none" />
              </Button>
              {!currency.isDefault && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(currency)}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Currency Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCurrency ? 'Edit Currency' : 'Add New Currency'}</DialogTitle>
            <DialogDescription>
              {editingCurrency ? 'Update the currency details below.' : 'Add a new currency to the system.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="curr-code">Currency Code <span className="text-red-500">*</span></Label>
              <Input
                id="curr-code"
                placeholder="e.g. GHS, USD, EUR"
                value={formCode}
                onChange={e => setFormCode(e.target.value.toUpperCase())}
                maxLength={3}
                disabled={!!editingCurrency}
                className="uppercase"
              />
              <p className="text-[10px] text-muted-foreground">3-letter ISO 4217 code</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="curr-name">Currency Name <span className="text-red-500">*</span></Label>
              <Input
                id="curr-name"
                placeholder="e.g. Ghana Cedi, US Dollar"
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="curr-symbol">Symbol <span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-2">
                <Input
                  id="curr-symbol"
                  placeholder="e.g. \u20B5, $, €"
                  value={formSymbol}
                  onChange={e => setFormSymbol(e.target.value)}
                  maxLength={5}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">Preview:</span>
                <span className="text-lg font-bold">{formSymbol || '?'}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">The symbol displayed throughout the app (max 5 chars)</p>
            </div>
            {!editingCurrency && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="text-sm font-medium">Set as Default</div>
                  <div className="text-xs text-muted-foreground">This currency will be used as the primary currency</div>
                </div>
                <SwitchToggle checked={formIsDefault} onCheckedChange={setFormIsDefault} />
              </div>
            )}
          </DialogBody>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !formCode.trim() || !formName.trim() || !formSymbol.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
              ) : editingCurrency ? (
                'Update Currency'
              ) : (
                'Add Currency'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
