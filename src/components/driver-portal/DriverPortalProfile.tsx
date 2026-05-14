'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  Phone,
  Mail,
  Shield,
  Truck,
  FileText,
  Bell,
  Key,
  LogOut,
  Edit,
  Check,
  X,
  Star,
  CalendarClock,
  CreditCard,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch, type Driver, type Truck } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { APP_NAME } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

// ── Types ──────────────────────────────────────────────────────────────────

interface DriverPortalProfileProps {
  driver: Driver | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitials(firstName: string, lastName: string): string {
  return `${(firstName?.[0] ?? '').toUpperCase()}${(lastName?.[0] ?? '').toUpperCase()}`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatMileage(km: number): string {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`
  return `${Math.round(km).toLocaleString()} km`
}

// ── Rating Stars ───────────────────────────────────────────────────────────

function RatingStars({ rating }: { rating: number }) {
  if (!rating || rating <= 0) return null

  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${
            star <= Math.round(rating)
              ? 'text-amber-400 fill-amber-400'
              : 'text-gray-300'
          }`}
        />
      ))}
      <span className="text-xs font-medium text-gray-600 ml-1">
        {rating.toFixed(1)}
      </span>
    </div>
  )
}

// ── Info Row ───────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
  warning,
}: {
  icon: React.ElementType
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 shrink-0">
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-sm font-medium text-gray-900 truncate ${warning ? 'text-red-600' : ''}`}>
          {value}
        </p>
      </div>
      {warning && (
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
      )}
    </div>
  )
}

// ── Profile Loading Skeleton ───────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="p-4 space-y-4 pb-6">
      {/* Header skeleton */}
      <Card className="rounded-xl">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal info skeleton */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2 px-5 pt-4">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Truck skeleton */}
      <Card className="rounded-xl">
        <CardContent className="p-5 space-y-2">
          <Skeleton className="h-5 w-36" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick links skeleton */}
      <Card className="rounded-xl">
        <CardContent className="p-0">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <Skeleton className="h-4 w-32 flex-1" />
              <Skeleton className="h-4 w-4" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function DriverPortalProfile({ driver }: DriverPortalProfileProps) {
  const router = useRouter()
  const { logout } = useAuthStore()

  // ── Edit profile state ─────────────────────────────────────────────────

  const [isEditing, setIsEditing] = React.useState(false)
  const [editPhone, setEditPhone] = React.useState('')
  const [editEmail, setEditEmail] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // ── Change password state ──────────────────────────────────────────────

  const [showPasswordForm, setShowPasswordForm] = React.useState(false)
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [changingPassword, setChangingPassword] = React.useState(false)
  const [passwordError, setPasswordError] = React.useState('')

  // ── Assigned truck data ────────────────────────────────────────────────

  const [truckData, setTruckData] = React.useState<Truck | null>(null)
  const [truckLoading, setTruckLoading] = React.useState(false)

  // ── Handlers ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!driver) return

    // Populate edit fields when driver data changes
    setEditPhone(driver.phone ?? '')
    setEditEmail(driver.email ?? '')

    // Fetch assigned truck details
    const truckId = driver.trucks?.[0]?.id
    if (truckId) {
      setTruckLoading(true)
      apiFetch<Truck>(`/api/trucks/${truckId}`)
        .then((data) => {
          if (data) setTruckData(data)
        })
        .catch(() => {
          // Non-critical
        })
        .finally(() => {
          setTruckLoading(false)
        })
    }
  }, [driver])

  // ── Edit profile handlers ──────────────────────────────────────────────

  function startEditing() {
    setEditPhone(driver?.phone ?? '')
    setEditEmail(driver?.email ?? '')
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
  }

  async function saveProfile() {
    if (!driver) return
    setSaving(true)

    try {
      await apiFetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          phone: editPhone,
          email: editEmail || null,
        }),
      })
      toast.success('Profile updated successfully')
      setIsEditing(false)
      // Refresh page to pick up updated data
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  // ── Change password handlers ───────────────────────────────────────────

  function resetPasswordForm() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setShowPasswordForm(false)
  }

  async function handleChangePassword() {
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
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })
      toast.success('Password changed successfully')
      resetPasswordForm()
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  // ── Logout handler ─────────────────────────────────────────────────────

  function handleLogout() {
    logout()
    router.push('/driver')
    toast.success('Signed out successfully')
  }

  // ── Derived values ─────────────────────────────────────────────────────

  const licenseExpiryDays = daysUntil(driver?.licenseExpiry)
  const isLicenseExpiringSoon = licenseExpiryDays <= 90 && licenseExpiryDays > 0
  const isLicenseExpired = licenseExpiryDays <= 0 && driver?.licenseExpiry
  const assignedTruck = driver?.trucks?.[0] ?? null

  // ── Loading state ──────────────────────────────────────────────────────

  if (!driver) {
    return <ProfileSkeleton />
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4 pb-6">
      {/* ════════════════════════════════════════════════════════════════════
          Section 1: Profile Header Card
          ════════════════════════════════════════════════════════════════════ */}
      <Card className="rounded-xl overflow-hidden">
        {/* Amber accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 to-orange-400" />

        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-amber-500 text-white text-2xl font-bold shrink-0 select-none">
              {getInitials(driver.firstName, driver.lastName)}
            </div>

            {/* Name and badges */}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {driver.firstName} {driver.lastName}
              </h2>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {driver.employeeId && (
                  <Badge variant="secondary" className="text-xs font-medium bg-gray-100 text-gray-600">
                    ID: {driver.employeeId}
                  </Badge>
                )}
                <Badge
                  className={
                    driver.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 text-xs'
                      : 'bg-gray-200 text-gray-500 text-xs'
                  }
                >
                  {driver.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {/* Rating */}
              {driver.rating > 0 && (
                <div className="mt-2">
                  <RatingStars rating={driver.rating} />
                </div>
              )}
            </div>
          </div>

          {/* Edit button */}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={saveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={startEditing}
              >
                <Edit className="h-3.5 w-3.5" />
                Edit Profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          Section 2: Personal Information
          ════════════════════════════════════════════════════════════════════ */}
      <Card className="rounded-xl">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <User className="h-4 w-4 text-amber-500" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="divide-y divide-gray-100">
            {/* Phone - editable */}
            {isEditing ? (
              <div className="py-3">
                <Label htmlFor="edit-phone" className="text-xs text-gray-500 mb-1.5 block">
                  Phone Number
                </Label>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                  <Input
                    id="edit-phone"
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. +233 24 123 4567"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            ) : (
              <InfoRow
                icon={Phone}
                label="Phone Number"
                value={driver.phone || '—'}
              />
            )}

            {/* Email - editable */}
            {isEditing ? (
              <div className="py-3">
                <Label htmlFor="edit-email" className="text-xs text-gray-500 mb-1.5 block">
                  Email Address
                </Label>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                  <Input
                    id="edit-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="driver@company.com"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            ) : (
              <InfoRow
                icon={Mail}
                label="Email Address"
                value={driver.email || 'Not provided'}
              />
            )}

            {/* License Number - read-only */}
            <InfoRow
              icon={CreditCard}
              label="License Number"
              value={driver.licenseNumber || '—'}
            />

            {/* License Class - read-only */}
            <InfoRow
              icon={Shield}
              label="License Class"
              value={driver.licenseClass || '—'}
            />

            {/* License Expiry - read-only with warning */}
            <InfoRow
              icon={CalendarClock}
              label="License Expiry"
              value={formatDate(driver.licenseExpiry)}
              warning={isLicenseExpired || isLicenseExpiringSoon}
            />
            {isLicenseExpired && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-xs font-medium px-3 py-2 rounded-lg -mt-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                License expired. Please contact your fleet manager.
              </div>
            )}
            {isLicenseExpiringSoon && !isLicenseExpired && (
              <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-xs font-medium px-3 py-2 rounded-lg -mt-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                License expires in {licenseExpiryDays} day{licenseExpiryDays !== 1 ? 's' : ''}. Please contact your fleet manager.
              </div>
            )}

            {/* Ghana Card Number - read-only */}
            {driver.ghanaCardNumber && (
              <InfoRow
                icon={CreditCard}
                label="Ghana Card Number"
                value={driver.ghanaCardNumber}
              />
            )}
          </div>

          {/* Security notice when editing */}
          {isEditing && (
            <div className="mt-3 flex items-start gap-2 bg-gray-50 text-xs text-gray-500 px-3 py-2.5 rounded-lg">
              <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                For security, you can only update your phone number and email.
                Role, Employee ID, and license details must be updated by your fleet manager.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          Section 3: Assigned Truck
          ════════════════════════════════════════════════════════════════════ */}
      <Card className="rounded-xl">
        <CardHeader className="pb-0 px-5 pt-4">
          <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="h-4 w-4 text-amber-500" />
            Assigned Truck
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {truckLoading ? (
            <div className="space-y-3 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : assignedTruck ? (
            <div className="divide-y divide-gray-100">
              <InfoRow
                icon={Truck}
                label="Plate Number"
                value={assignedTruck.plateNumber}
              />
              <InfoRow
                icon={Truck}
                label="Make / Model"
                value={
                  assignedTruck.make && assignedTruck.model
                    ? `${assignedTruck.make} ${assignedTruck.model}`
                    : assignedTruck.make || assignedTruck.model || '—'
                }
              />
              <InfoRow
                icon={Shield}
                label="Status"
                value={
                  truckData?.status
                    ? truckData.status.charAt(0).toUpperCase() + truckData.status.slice(1).replace(/_/g, ' ')
                    : '—'
                }
              />
              {truckData?.currentMileage != null && (
                <InfoRow
                  icon={CalendarClock}
                  label="Mileage"
                  value={formatMileage(truckData.currentMileage)}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                <Truck className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-600">No Truck Assigned</p>
              <p className="text-xs text-gray-400 mt-1">
                Contact your fleet manager to get assigned a vehicle.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          Section 4: Quick Links
          ════════════════════════════════════════════════════════════════════ */}
      <Card className="rounded-xl overflow-hidden">
        <CardContent className="p-0">
          {/* My Documents */}
          <button
            type="button"
            className="flex items-center gap-3 w-full px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
            onClick={() => {
              toast.info('Documents page coming soon')
            }}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 shrink-0">
              <FileText className="h-4 w-4 text-sky-600" />
            </div>
            <span className="text-sm font-medium text-gray-900 flex-1">My Documents</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>

          <Separator />

          {/* Change Password */}
          <div>
            <button
              type="button"
              className="flex items-center gap-3 w-full px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
              onClick={() => {
                setShowPasswordForm(!showPasswordForm)
                setPasswordError('')
              }}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-50 shrink-0">
                <Key className="h-4 w-4 text-violet-600" />
              </div>
              <span className="text-sm font-medium text-gray-900 flex-1">Change Password</span>
              <ChevronRight
                className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                  showPasswordForm ? 'rotate-90' : ''
                }`}
              />
            </button>

            {/* Expanded password form */}
            {showPasswordForm && (
              <div className="px-5 pb-4 pt-1 space-y-3 border-t border-gray-100 mt-0">
                <div className="pt-3">
                  <Label htmlFor="current-password" className="text-xs text-gray-500">
                    Current Password
                  </Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="h-9 text-sm mt-1"
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <Label htmlFor="new-password" className="text-xs text-gray-500">
                    New Password
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="h-9 text-sm mt-1"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <Label htmlFor="confirm-password" className="text-xs text-gray-500">
                    Confirm New Password
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="h-9 text-sm mt-1"
                    autoComplete="new-password"
                  />
                </div>

                {/* Error message */}
                {passwordError && (
                  <p className="text-xs text-red-600 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {passwordError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={resetPasswordForm}
                    disabled={changingPassword}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        Changing...
                      </>
                    ) : (
                      'Change Password'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Notification Settings */}
          <button
            type="button"
            className="flex items-center gap-3 w-full px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
            onClick={() => {
              toast.info('Notification settings coming soon')
            }}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 shrink-0">
              <Bell className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-gray-900 flex-1">Notification Settings</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>

          <Separator />

          {/* Log Out */}
          <button
            type="button"
            className="flex items-center gap-3 w-full px-5 py-3.5 hover:bg-red-50 transition-colors text-left group"
            onClick={handleLogout}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 shrink-0 group-hover:bg-red-100 transition-colors">
              <LogOut className="h-4 w-4 text-red-600" />
            </div>
            <span className="text-sm font-medium text-red-600 flex-1">Log Out</span>
          </button>
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          Section 5: App Info
          ════════════════════════════════════════════════════════════════════ */}
      <div className="text-center py-4">
        <p className="text-xs text-gray-400 font-medium">
          {APP_NAME} v1.0.0
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          &copy; 2024 FleetPro
        </p>
      </div>
    </div>
  )
}
