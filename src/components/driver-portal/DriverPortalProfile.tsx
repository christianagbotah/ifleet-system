'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  Edit,
  FileText,
  Key,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Shield,
  Star,
  Truck,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch, type Driver, type Truck } from '@/lib/api'
import { APP_NAME } from '@/lib/constants'
import { useAuthStore } from '@/lib/store/auth'
import { DriverPortalDocuments } from '@/components/driver-portal/DriverPortalDocuments'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

interface DriverPortalProfileProps {
  driver: Driver | null
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
}

function InfoRow({
  icon: Icon,
  label,
  value,
  warning = false,
}: {
  icon: React.ElementType
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`truncate text-sm font-medium ${warning ? 'text-red-600' : 'text-gray-900'}`}>
          {value}
        </p>
      </div>
      {warning && <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />}
    </div>
  )
}

function RatingStars({ rating }: { rating: number }) {
  if (!rating || rating <= 0) return null
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${star <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
        />
      ))}
      <span className="ml-1 text-xs font-medium text-gray-600">{rating.toFixed(1)}</span>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4 p-4 pb-6">
      {[0, 1, 2, 3].map((card) => (
        <Card key={card} className="rounded-xl">
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function DriverPortalProfile({ driver }: DriverPortalProfileProps) {
  const router = useRouter()
  const { logout } = useAuthStore()
  const [showDocuments, setShowDocuments] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)
  const [editPhone, setEditPhone] = React.useState('')
  const [editEmail, setEditEmail] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [showPasswordForm, setShowPasswordForm] = React.useState(false)
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [changingPassword, setChangingPassword] = React.useState(false)
  const [passwordError, setPasswordError] = React.useState('')
  const [truckData, setTruckData] = React.useState<Truck | null>(null)
  const [truckLoading, setTruckLoading] = React.useState(false)

  React.useEffect(() => {
    if (!driver) return
    setEditPhone(driver.phone ?? '')
    setEditEmail(driver.email ?? '')

    const truckId = driver.trucks?.[0]?.id
    if (!truckId) {
      setTruckData(null)
      return
    }

    setTruckLoading(true)
    apiFetch<Truck>(`/api/trucks/${truckId}`)
      .then(setTruckData)
      .catch(() => setTruckData(null))
      .finally(() => setTruckLoading(false))
  }, [driver])

  async function saveProfile() {
    if (!driver) return
    setSaving(true)
    try {
      await apiFetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        body: JSON.stringify({ phone: editPhone, email: editEmail || null }),
      })
      toast.success('Profile updated successfully')
      setIsEditing(false)
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  function resetPasswordForm() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setShowPasswordForm(false)
  }

  async function changePassword() {
    setPasswordError('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    setChangingPassword(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      toast.success('Password changed successfully')
      resetPasswordForm()
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  function handleLogout() {
    logout()
    router.push('/driver')
    toast.success('Signed out successfully')
  }

  if (!driver) return <ProfileSkeleton />
  if (showDocuments) {
    return <DriverPortalDocuments driver={driver} onBack={() => setShowDocuments(false)} />
  }

  const assignedTruck = driver.trucks?.[0] ?? null
  const licenseExpiryDays = daysUntil(driver.licenseExpiry)
  const licenseExpired = licenseExpiryDays <= 0
  const licenseExpiringSoon = licenseExpiryDays > 0 && licenseExpiryDays <= 90

  return (
    <div className="space-y-4 p-4 pb-6">
      <Card className="overflow-hidden rounded-xl">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 to-orange-400" />
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-amber-500 text-2xl font-bold text-white">
              {(driver.firstName?.[0] ?? '').toUpperCase()}{(driver.lastName?.[0] ?? '').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-gray-900">{driver.firstName} {driver.lastName}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {driver.employeeId && <Badge variant="secondary" className="text-xs">ID: {driver.employeeId}</Badge>}
                <Badge className={driver.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}>
                  {driver.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="mt-2"><RatingStars rating={driver.rating} /></div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {isEditing ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                </Button>
                <Button type="button" size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={() => void saveProfile()} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="px-5 pb-0 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <User className="h-4 w-4 text-amber-500" /> Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="divide-y divide-gray-100">
            {isEditing ? (
              <div className="space-y-3 py-3">
                <div>
                  <Label htmlFor="driver-profile-phone" className="text-xs text-gray-500">Phone Number</Label>
                  <Input id="driver-profile-phone" type="tel" value={editPhone} onChange={(event) => setEditPhone(event.target.value)} className="mt-1 h-9" />
                </div>
                <div>
                  <Label htmlFor="driver-profile-email" className="text-xs text-gray-500">Email Address</Label>
                  <Input id="driver-profile-email" type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className="mt-1 h-9" />
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                  <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Licence, employee and identity records are controlled by your fleet office.
                </div>
              </div>
            ) : (
              <>
                <InfoRow icon={Phone} label="Phone Number" value={driver.phone || '—'} />
                <InfoRow icon={Mail} label="Email Address" value={driver.email || 'Not provided'} />
              </>
            )}
            <InfoRow icon={CreditCard} label="Licence Number" value={driver.licenseNumber || '—'} />
            <InfoRow icon={Shield} label="Licence Class" value={driver.licenseClass || '—'} />
            <InfoRow icon={CalendarClock} label="Licence Expiry" value={formatDate(driver.licenseExpiry)} warning={licenseExpired || licenseExpiringSoon} />
            {driver.ghanaCardNumber && <InfoRow icon={CreditCard} label="Ghana Card Number" value={driver.ghanaCardNumber} />}
          </div>
          {licenseExpired && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Licence expired. Please contact your fleet manager.
            </div>
          )}
          {licenseExpiringSoon && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Licence expires in {licenseExpiryDays} day{licenseExpiryDays === 1 ? '' : 's'}.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="px-5 pb-0 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Truck className="h-4 w-4 text-amber-500" /> Assigned Truck
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {truckLoading ? (
            <div className="space-y-3 py-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : assignedTruck ? (
            <div className="divide-y divide-gray-100">
              <InfoRow icon={Truck} label="Plate Number" value={assignedTruck.plateNumber} />
              <InfoRow icon={Truck} label="Make / Model" value={[assignedTruck.make, assignedTruck.model].filter(Boolean).join(' ') || '—'} />
              <InfoRow icon={Shield} label="Status" value={truckData?.status ? truckData.status.replace(/_/g, ' ') : '—'} />
              {truckData?.currentMileage != null && <InfoRow icon={CalendarClock} label="Mileage" value={`${Math.round(truckData.currentMileage).toLocaleString()} km`} />}
            </div>
          ) : (
            <div className="py-6 text-center">
              <Truck className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No Truck Assigned</p>
              <p className="mt-1 text-xs text-gray-400">Contact your fleet manager to get assigned a vehicle.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-xl">
        <CardContent className="p-0">
          <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50" onClick={() => setShowDocuments(true)}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50"><FileText className="h-4 w-4 text-sky-600" /></div>
            <span className="flex-1 text-sm font-medium text-gray-900">My Documents</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>

          <Separator />

          <div>
            <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50" onClick={() => { setShowPasswordForm((value) => !value); setPasswordError('') }}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50"><Key className="h-4 w-4 text-violet-600" /></div>
              <span className="flex-1 text-sm font-medium text-gray-900">Change Password</span>
              <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${showPasswordForm ? 'rotate-90' : ''}`} />
            </button>
            {showPasswordForm && (
              <div className="space-y-3 border-t border-gray-100 px-5 pb-4 pt-3">
                <div><Label htmlFor="current-password" className="text-xs text-gray-500">Current Password</Label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 h-9" /></div>
                <div><Label htmlFor="new-password" className="text-xs text-gray-500">New Password</Label><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 h-9" /></div>
                <div><Label htmlFor="confirm-password" className="text-xs text-gray-500">Confirm New Password</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 h-9" /></div>
                {passwordError && <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" />{passwordError}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={resetPasswordForm} disabled={changingPassword}>Cancel</Button>
                  <Button type="button" size="sm" className="flex-1 bg-amber-500 text-white hover:bg-amber-600" onClick={() => void changePassword()} disabled={changingPassword}>
                    {changingPassword && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{changingPassword ? 'Changing...' : 'Change Password'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50" onClick={() => toast.info('Notification settings coming soon')}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50"><Bell className="h-4 w-4 text-amber-600" /></div>
            <span className="flex-1 text-sm font-medium text-gray-900">Notification Settings</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>

          <Separator />

          <button type="button" className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-red-50" onClick={handleLogout}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50"><LogOut className="h-4 w-4 text-red-600" /></div>
            <span className="flex-1 text-sm font-medium text-red-600">Log Out</span>
          </button>
        </CardContent>
      </Card>

      <div className="py-4 text-center text-xs text-gray-400">{APP_NAME} v1.0.0</div>
    </div>
  )
}
