'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  User,
  Bell,
  Shield,
  Database,
  Palette,
  HardDrive,
  Download,
  Trash2,
  ChevronRight,
  Save,
  Loader2,
  Upload,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  Info,
  CheckCircle2,
  Clock,
  Monitor,
  Sun,
  Moon,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { useTourStore } from '@/lib/tour-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { toast } from '@/lib/toast-config'

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
}

export default function SettingsPage() {
  const { setCurrentView } = useAppStore()
  const { startTour } = useTourStore()

  // Company Profile State - load from localStorage
  const [companyName, setCompanyName] = useState(() => {
    if (typeof window === 'undefined') return 'iFleetPro Logistics Ltd.'
    return localStorage.getItem('ifleetpro-company-name') || 'iFleetPro Logistics Ltd.'
  })
  const [companyEmail, setCompanyEmail] = useState(() => {
    if (typeof window === 'undefined') return 'admin@ifleetpro.com'
    return localStorage.getItem('ifleetpro-company-email') || 'admin@ifleetpro.com'
  })
  const [companyPhone, setCompanyPhone] = useState(() => {
    if (typeof window === 'undefined') return '+233 30 000 0000'
    return localStorage.getItem('ifleetpro-company-phone') || '+233 30 000 0000'
  })
  const [companyAddress, setCompanyAddress] = useState(() => {
    if (typeof window === 'undefined') return 'Accra, Greater Accra Region, Ghana'
    return localStorage.getItem('ifleetpro-company-address') || 'Accra, Greater Accra Region, Ghana'
  })

  // User Preferences State - load from localStorage
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === 'undefined') return 'Fleet Admin'
    return localStorage.getItem('ifleetpro-display-name') || 'Fleet Admin'
  })
  const [userEmail, setUserEmail] = useState(() => {
    if (typeof window === 'undefined') return 'admin@ifleetpro.com'
    return localStorage.getItem('ifleetpro-user-email') || 'admin@ifleetpro.com'
  })
  const [emailReadOnly, setEmailReadOnly] = useState(true)
  const [notifyTripCreated, setNotifyTripCreated] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('ifleetpro-notify-trip-created') !== 'false'
  })
  const [notifyTripCompleted, setNotifyTripCompleted] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('ifleetpro-notify-trip-completed') !== 'false'
  })
  const [notifyTripCancelled, setNotifyTripCancelled] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('ifleetpro-notify-trip-cancelled') === 'true'
  })
  const [notifyCashAdvance, setNotifyCashAdvance] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('ifleetpro-notify-cash-advance') !== 'false'
  })
  const [notifyIncentive, setNotifyIncentive] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('ifleetpro-notify-incentive') === 'true'
  })
  const [currency, setCurrency] = useState(() => {
    if (typeof window === 'undefined') return 'GHS'
    return localStorage.getItem('ifleetpro-currency') || 'GHS'
  })

  // Appearance State - load from localStorage
  const [compactMode, setCompactMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('ifleetpro-compact-mode') === 'true'
  })
  const [sidebarDefault, setSidebarDefault] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('ifleetpro-sidebar-default') !== 'false'
  })

  // System State
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [lastSynced, setLastSynced] = useState<string>('')
  const [storageUsed, setStorageUsed] = useState(0)
  const [storageTotal] = useState(100)

  // Loading states
  const [savingCompany, setSavingCompany] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Danger dialogs
  const [clearDataOpen, setClearDataOpen] = useState(false)
  const [resetDbOpen, setResetDbOpen] = useState(false)

  useEffect(() => {
    checkDbStatus()
  }, [])

  const checkDbStatus = async () => {
    setDbStatus('checking')
    try {
      const res = await fetch('/api/drivers')
      if (res.ok) {
        setDbStatus('connected')
        setLastSynced(new Date().toLocaleString())
        // Estimate storage (mock based on records count)
        const data = await res.json()
        const records = Array.isArray(data) ? data.length : 0
        setStorageUsed(Math.min(Math.max(records * 0.15, 3), 85))
      } else {
        setDbStatus('error')
      }
    } catch {
      setDbStatus('error')
    }
  }

  const handleSaveCompany = () => {
    setSavingCompany(true)
    setTimeout(() => {
      localStorage.setItem('ifleetpro-company-name', companyName)
      localStorage.setItem('ifleetpro-company-email', companyEmail)
      localStorage.setItem('ifleetpro-company-phone', companyPhone)
      localStorage.setItem('ifleetpro-company-address', companyAddress)
      setSavingCompany(false)
      toast.success('Company profile updated', {
        description: 'Your company information has been saved.',
      })
    }, 800)
  }

  const handleSavePrefs = () => {
    setSavingPrefs(true)
    setTimeout(() => {
      localStorage.setItem('ifleetpro-display-name', displayName)
      localStorage.setItem('ifleetpro-user-email', userEmail)
      localStorage.setItem('ifleetpro-notify-trip-created', String(notifyTripCreated))
      localStorage.setItem('ifleetpro-notify-trip-completed', String(notifyTripCompleted))
      localStorage.setItem('ifleetpro-notify-trip-cancelled', String(notifyTripCancelled))
      localStorage.setItem('ifleetpro-notify-cash-advance', String(notifyCashAdvance))
      localStorage.setItem('ifleetpro-notify-incentive', String(notifyIncentive))
      localStorage.setItem('ifleetpro-currency', currency)
      setSavingPrefs(false)
      toast.success('Preferences saved', {
        description: 'Your user preferences have been updated.',
      })
    }, 800)
  }

  const handleExportData = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export/financial')
      if (res.ok) {
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ifleetpro-export-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Data exported successfully')
      } else {
        throw new Error('Export failed')
      }
    } catch {
      toast.error('Export failed', {
        description: 'Could not export data. Please try again.',
      })
    } finally {
      setExporting(false)
    }
  }

  const handleClearData = () => {
    toast.info('Clear All Data', {
      description: 'This feature requires server-side implementation. Contact your system administrator.',
    })
    setClearDataOpen(false)
  }

  const handleResetDb = async () => {
    try {
      const res = await fetch('/api/seed', { method: 'DELETE' })
      if (res.ok) {
        toast.success('Database reset successfully', {
          description: 'All data has been cleared. Refresh the page.',
        })
        setTimeout(() => window.location.reload(), 2000)
      } else {
        toast.info('Database Reset', {
          description: 'Reset endpoint not available. Contact your system administrator.',
        })
      }
    } catch {
      toast.info('Database Reset', {
        description: 'Reset endpoint not available. Contact your system administrator.',
      })
    }
    setResetDbOpen(false)
  }

  const environment = process.env.NODE_ENV === 'production' ? 'Production' : 'Development'

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <motion.div {...fadeIn} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => setCurrentView('dashboard')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </button>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Settings</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <p className="text-muted-foreground text-sm">Manage your system configuration and preferences</p>
        </div>
      </motion.div>

      {/* Settings Sections */}
      <div className="space-y-6">

        {/* 1. Company Profile Section */}
        <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.05 }}>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Company Profile</CardTitle>
                  <CardDescription>Your organization&apos;s basic information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo Placeholder */}
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center size-16 rounded-xl bg-muted border-2 border-dashed border-muted-foreground/20">
                  <Upload className="size-6 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-sm font-medium">Company Logo</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG up to 2MB. Recommended 200x200px.</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="flex items-center gap-2">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    Company Name
                  </Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyEmail" className="flex items-center gap-2">
                    <Mail className="size-3.5 text-muted-foreground" />
                    Contact Email
                  </Label>
                  <Input
                    id="companyEmail"
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="contact@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyPhone" className="flex items-center gap-2">
                    <Phone className="size-3.5 text-muted-foreground" />
                    Phone Number
                  </Label>
                  <Input
                    id="companyPhone"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="+233 30 000 0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress" className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    Address
                  </Label>
                  <Input
                    id="companyAddress"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    placeholder="Company address"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveCompany} disabled={savingCompany}>
                  {savingCompany ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 2. User Preferences Section */}
        <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                  <User className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">User Preferences</CardTitle>
                  <CardDescription>Customize your personal settings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* User Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="flex items-center gap-2">
                    <User className="size-3.5 text-muted-foreground" />
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="userEmail" className="flex items-center gap-2">
                    <Mail className="size-3.5 text-muted-foreground" />
                    Email Address
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="userEmail"
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      readOnly={emailReadOnly}
                      className={cn(emailReadOnly && 'bg-muted')}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setEmailReadOnly(!emailReadOnly)}
                      className="shrink-0"
                      aria-label="Toggle email edit"
                    >
                      <Mail className="size-4" />
                    </Button>
                  </div>
                  {emailReadOnly && (
                    <p className="text-xs text-muted-foreground">Click the icon to enable editing</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Notification Preferences */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Trip Status Notifications</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox
                      id="notifyCreated"
                      checked={notifyTripCreated}
                      onCheckedChange={(checked) => setNotifyTripCreated(checked === true)}
                    />
                    <Label htmlFor="notifyCreated" className="cursor-pointer flex-1 text-sm">
                      Trip Created
                    </Label>
                    <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                      On
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox
                      id="notifyCompleted"
                      checked={notifyTripCompleted}
                      onCheckedChange={(checked) => setNotifyTripCompleted(checked === true)}
                    />
                    <Label htmlFor="notifyCompleted" className="cursor-pointer flex-1 text-sm">
                      Trip Completed
                    </Label>
                    <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                      On
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox
                      id="notifyCancelled"
                      checked={notifyTripCancelled}
                      onCheckedChange={(checked) => setNotifyTripCancelled(checked === true)}
                    />
                    <Label htmlFor="notifyCancelled" className="cursor-pointer flex-1 text-sm">
                      Trip Cancelled
                    </Label>
                    <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      Off
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox
                      id="notifyCashAdvance"
                      checked={notifyCashAdvance}
                      onCheckedChange={(checked) => setNotifyCashAdvance(checked === true)}
                    />
                    <Label htmlFor="notifyCashAdvance" className="cursor-pointer flex-1 text-sm">
                      Cash Advance Requests
                    </Label>
                    <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                      On
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox
                      id="notifyIncentive"
                      checked={notifyIncentive}
                      onCheckedChange={(checked) => setNotifyIncentive(checked === true)}
                    />
                    <Label htmlFor="notifyIncentive" className="cursor-pointer flex-1 text-sm">
                      Incentive Payouts
                    </Label>
                    <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      Off
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Currency Format */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Currency Format</span>
                </Label>
                <div className="flex items-center gap-3">
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GHS">🇬🇭 GHS - Ghana Cedi</SelectItem>
                      <SelectItem value="USD">🇺🇸 USD - US Dollar</SelectItem>
                      <SelectItem value="EUR">🇪🇺 EUR - Euro</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Used for displaying monetary values across the app
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSavePrefs} disabled={savingPrefs}>
                  {savingPrefs ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 3. System Information Section */}
        <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.15 }}>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
                  <Shield className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">System Information</CardTitle>
                  <CardDescription>Current system status and diagnostics</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* System Version */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Info className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">System Version</p>
                      <p className="text-xs text-muted-foreground">iFleetPro application version</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-sm">
                    v1.0.0
                  </Badge>
                </div>

                {/* Environment */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Monitor className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Environment</p>
                      <p className="text-xs text-muted-foreground">Current runtime environment</p>
                    </div>
                  </div>
                  <Badge
                    className={cn(
                      'font-medium',
                      environment === 'Production'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400'
                    )}
                  >
                    {environment}
                  </Badge>
                </div>

                {/* Database Status */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Database className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Database Status</p>
                      <p className="text-xs text-muted-foreground">SQLite connection status</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {dbStatus === 'connected' && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400">
                        <CheckCircle2 className="size-3 mr-1" />
                        Connected
                      </Badge>
                    )}
                    {dbStatus === 'checking' && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400">
                        <Loader2 className="size-3 mr-1 animate-spin" />
                        Checking
                      </Badge>
                    )}
                    {dbStatus === 'error' && (
                      <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-400">
                        Disconnected
                      </Badge>
                    )}
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        dbStatus === 'connected' && 'bg-emerald-500',
                        dbStatus === 'checking' && 'bg-amber-500 animate-pulse',
                        dbStatus === 'error' && 'bg-red-500'
                      )}
                    />
                  </div>
                </div>

                {/* Last Synced */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Clock className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Last Synced</p>
                      <p className="text-xs text-muted-foreground">Most recent data refresh</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="size-8" onClick={checkDbStatus} aria-label="Refresh sync">
                      <RefreshCw className="size-3.5 text-muted-foreground" />
                    </Button>
                    <span className="text-sm text-muted-foreground">{lastSynced || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Storage Usage */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <HardDrive className="size-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Storage Usage</p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {storageUsed.toFixed(1)} MB / {storageTotal} MB
                  </span>
                </div>
                <Progress value={(storageUsed / storageTotal) * 100} className="h-2.5" />
                <p className="text-xs text-muted-foreground">
                  {storageUsed < 50
                    ? 'Storage usage is well within limits.'
                    : storageUsed < 80
                      ? 'Storage usage is moderate. Consider archiving old data.'
                      : 'Storage usage is high. Please clean up old records.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 4. Data Management Section */}
        <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card className="border-amber-200 dark:border-amber-900/50">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  <Database className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Data Management</CardTitle>
                  <CardDescription>Export, clear, or reset your application data</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Export */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                    <Download className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Export All Data</p>
                    <p className="text-xs text-muted-foreground">
                      Download a complete backup of all your financial and operational data as JSON
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={handleExportData} disabled={exporting} className="shrink-0">
                  {exporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export Data
                </Button>
              </div>

              <Separator />

              {/* Clear All Data */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-red-200 dark:border-red-900/50 p-4 bg-red-50/50 dark:bg-red-950/20">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                    <Trash2 className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">Clear All Data</p>
                    <p className="text-xs text-muted-foreground">
                      Remove all application data. This action cannot be undone.
                    </p>
                  </div>
                </div>
                <AlertDialog open={clearDataOpen} onOpenChange={setClearDataOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="shrink-0">
                      <Trash2 className="size-4" />
                      Clear All Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all your data including drivers, trucks, trips, cash advances,
                        incentives, and financial records. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearData}
                        className="bg-destructive text-white hover:bg-destructive/90"
                      >
                        Yes, clear everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <Separator />

              {/* Reset Database */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-red-200 dark:border-red-900/50 p-4 bg-red-50/50 dark:bg-red-950/20">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                    <RefreshCw className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">Reset Database</p>
                    <p className="text-xs text-muted-foreground">
                      Reset the entire database to a clean state and re-seed with sample data
                    </p>
                  </div>
                </div>
                <AlertDialog open={resetDbOpen} onOpenChange={setResetDbOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="shrink-0">
                      <RefreshCw className="size-4" />
                      Reset Database
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset entire database?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will drop all existing data and re-seed the database with fresh sample data.
                        All your custom data will be lost. The application will reload automatically.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleResetDb}
                        className="bg-destructive text-white hover:bg-destructive/90"
                      >
                        Yes, reset database
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 5. Appearance Section */}
        <motion.div {...fadeIn} transition={{ duration: 0.3, delay: 0.25 }}>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400">
                  <Palette className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Appearance</CardTitle>
                  <CardDescription>Customize the look and feel of your dashboard</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Sun className="size-4 text-muted-foreground" />
                    <Moon className="size-4 text-muted-foreground" />
                    <Monitor className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Theme</p>
                    <p className="text-xs text-muted-foreground">Switch between light, dark, or system theme</p>
                  </div>
                </div>
                <ThemeToggle />
              </div>

              <Separator />

              {/* Compact Mode */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-8 rounded-lg bg-muted">
                    <Monitor className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Compact Mode</p>
                    <p className="text-xs text-muted-foreground">Reduce spacing for a denser layout</p>
                  </div>
                </div>
                <Switch
                  checked={compactMode}
                  onCheckedChange={(checked) => {
                    setCompactMode(checked)
                    localStorage.setItem('ifleetpro-compact-mode', String(checked))
                    toast.success(checked ? 'Compact mode enabled' : 'Compact mode disabled')
                  }}
                />
              </div>

              <Separator />

              {/* Sidebar Default */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-8 rounded-lg bg-muted">
                    <Building2 className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Sidebar Expanded by Default</p>
                    <p className="text-xs text-muted-foreground">Show the sidebar in expanded state on page load</p>
                  </div>
                </div>
                <Switch
                  checked={sidebarDefault}
                  onCheckedChange={(checked) => {
                    setSidebarDefault(checked)
                    localStorage.setItem('ifleetpro-sidebar-default', String(checked))
                    toast.success(
                      checked
                        ? 'Sidebar will be expanded by default'
                        : 'Sidebar will be collapsed by default'
                    )
                  }}
                />
              </div>

              <Separator />

              {/* Restart Tour */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-8 rounded-lg bg-muted">
                    <RotateCcw className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Restart Onboarding Tour</p>
                    <p className="text-xs text-muted-foreground">Show the interactive tour that introduces the app features</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startTour}
                  className="shrink-0"
                >
                  <RotateCcw className="size-3.5" />
                  Start Tour
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </div>
  )
}
