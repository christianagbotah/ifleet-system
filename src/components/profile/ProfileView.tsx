'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  Clock,
  Camera,
  Key,
  Save,
  Loader2,
  Navigation,
} from 'lucide-react'
import { useAuthStore, getUserInitials, getRoleBadgeColor } from '@/lib/store/auth'
import { toast } from 'sonner'

interface UserProfile {
  id: string
  email: string
  name: string
  phone: string | null
  avatar: string | null
  role: { id: string; name: string; permissions: string[] }
  driver: { id: string; firstName: string; lastName: string } | null
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  updatedAt: string
  roleId: string
}

export function ProfileView() {
  const { user: authUser, setUser, logout } = useAuthStore()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [editing, setEditing] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const fetchProfile = useCallback(async () => {
    if (!authUser?.id) return
    try {
      // Use apiFetch to ensure Authorization header is sent.
      // Previously used raw fetch() without Bearer token, which caused
      // middleware to return 401 → auto-logout → redirect loop.
      const { apiFetch } = await import('@/lib/api')
      const data = await apiFetch<Record<string, unknown>>(`/api/auth/profile?userId=${encodeURIComponent(authUser.id)}`)
      if (!data) throw new Error('No profile data received')
      setProfile(data)
      setEditName((data as Record<string, string>).name || '')
      setEditEmail((data as Record<string, string>).email || '')
      setEditPhone((data as Record<string, string>).phone || '')
    } catch (error) {
      // Global 401 interceptor in apiFetch handles session expiry auto-logout.
      // Only show a generic error for non-auth failures.
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (!message.includes('expired') && !message.includes('Authentication')) {
        console.error('Error fetching profile:', error)
        toast.error('Failed to load profile')
      }
    } finally {
      setLoading(false)
    }
  }, [authUser?.id])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleSaveProfile = async () => {
    if (!profile) return
    if (!editName.trim()) {
      toast.error('Name is required')
      return
    }
    if (!editEmail.trim()) {
      toast.error('Email is required')
      return
    }

    setSaving(true)
    try {
      // Use apiFetch to ensure Authorization header is included
      const { apiFetch } = await import('@/lib/api')
      const updated = await apiFetch<Record<string, unknown>>(`/api/users/${profile.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim() || null,
        }),
      })

      setProfile(updated as UserProfile)

      // Update the auth store with new info
      setUser({
        ...authUser!,
        name: (updated as Record<string, string>).name,
        email: (updated as Record<string, string>).email,
        phone: (updated as Record<string, string>).phone,
      })

      setEditing(false)
      toast.success('Profile updated successfully')
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error('Please enter your current password')
      return
    }
    if (!newPassword) {
      toast.error('Please enter a new password')
      return
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (!profile) return
    setChangingPassword(true)
    try {
      // Use apiFetch to ensure Authorization header is included
      const { apiFetch } = await import('@/lib/api')
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          userId: profile.id,
          currentPassword,
          newPassword,
        }),
      })

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password changed successfully')
    } catch (error) {
      console.error('Error changing password:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleCancelEdit = () => {
    if (profile) {
      setEditName(profile.name)
      setEditEmail(profile.email)
      setEditPhone(profile.phone || '')
    }
    setEditing(false)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
          <p className="text-sm text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-muted-foreground">Profile not found</h2>
          <p className="text-sm text-muted-foreground mt-1">Unable to load your profile.</p>
        </div>
      </div>
    )
  }

  const initials = profile.name ? getUserInitials(profile.name) : '?'
  const roleBadgeClass = getRoleBadgeColor(profile.role?.name || '')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">View and manage your account information</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <AvatarFallback className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-2xl font-bold">
                      {initials}
                    </AvatarFallback>
                  )}
                </Avatar>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border-2 border-background bg-background"
                  onClick={() => setEditing(!editing)}
                >
                  <Camera className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div>
                <h3 className="text-lg font-semibold">{profile.name}</h3>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                <Badge variant="outline" className={`mt-2 text-[10px] border-transparent font-medium ${roleBadgeClass}`}>
                  {profile.role?.name || 'Unknown'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="space-y-3">
              {profile.driver && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Linked Driver</p>
                    <p className="font-medium">{profile.driver.firstName} {profile.driver.lastName}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-muted-foreground">Member since</p>
                  <p className="font-medium">{new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-muted-foreground">Last login</p>
                  <p className="font-medium">{formatDate(profile.lastLogin)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={profile.isActive ? 'default' : 'destructive'} className="mt-0.5">
                    {profile.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit & Password Cards */}
        <div className="md:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Personal Information</CardTitle>
                  <CardDescription>Update your personal details</CardDescription>
                </div>
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-3.5 w-3.5" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name" className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Full Name
                  </Label>
                  {editing ? (
                    <Input
                      id="profile-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <p className="text-sm font-medium py-2 px-3 bg-muted/50 rounded-md">
                      {profile.name}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email" className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email Address
                  </Label>
                  {editing ? (
                    <Input
                      id="profile-email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Enter your email"
                    />
                  ) : (
                    <p className="text-sm font-medium py-2 px-3 bg-muted/50 rounded-md">
                      {profile.email}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-phone" className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    Phone Number
                  </Label>
                  {editing ? (
                    <Input
                      id="profile-phone"
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+233 XX XXX XXXX"
                    />
                  ) : (
                    <p className="text-sm font-medium py-2 px-3 bg-muted/50 rounded-md">
                      {profile.phone || 'Not set'}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    Role
                  </Label>
                  <p className="text-sm font-medium py-2 px-3 bg-muted/50 rounded-md">
                    {profile.role?.name || 'Unknown'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-3.5 w-3.5" />
                      Change Password
                    </>
                  )}
                </Button>
                {newPassword && newPassword.length < 6 && (
                  <p className="text-xs text-destructive">Password must be at least 6 characters</p>
                )}
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Driver Quick Actions */}
          {profile.role?.name === 'Driver' && profile.driver && (
            <Card className="border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Location Sharing
                </CardTitle>
                <CardDescription>Share your real-time location with the fleet admin for live tracking.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => window.dispatchEvent(new CustomEvent('navigate-page', { detail: 'driver-tracking' }))}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Navigation className="mr-2 h-4 w-4" />
                  Open Location Sharing
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Permissions Info */}
          {profile.role?.permissions && profile.role.permissions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Permissions</CardTitle>
                <CardDescription>
                  Permissions assigned to your role: {profile.role?.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {profile.role.permissions.map((perm) => (
                    <Badge key={perm} variant="secondary" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
