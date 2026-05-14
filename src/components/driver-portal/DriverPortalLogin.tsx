'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Truck, Eye, EyeOff, Loader2, ArrowLeft, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/store/auth'
import { APP_NAME } from '@/lib/constants'

// ── Dev-mode quick-login presets ──────────────────────────────────────────────

const DEV_ACCOUNTS = [
  { label: 'Driver 1', email: 'driver1@fleetpro.com.gh', password: 'driver123' },
  { label: 'Driver 2', email: 'driver2@fleetpro.com.gh', password: 'driver123' },
] as const

// ── Component ────────────────────────────────────────────────────────────────

export function DriverPortalLogin() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const { login, isLoading } = useAuthStore()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      toast.error('Please enter your email')
      return
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      toast.error('Please enter a valid email address')
      return
    }

    if (!password.trim()) {
      toast.error('Please enter your password')
      return
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    try {
      await login(email.trim(), password.trim())
      toast.success('Welcome to the Driver Portal!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.'
      setError(message)
      toast.error(message)
    }
  }

  async function handleDevQuickLogin(preset: (typeof DEV_ACCOUNTS)[number]) {
    setError(null)
    setEmail(preset.email)
    setPassword(preset.password)

    try {
      await login(preset.email, preset.password)
      toast.success('Welcome to the Driver Portal!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.'
      setError(message)
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 p-4 relative">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-orange-700/20 rounded-full blur-3xl" />
        <div className="absolute top-1/4 left-1/4 w-48 h-48 bg-amber-300/10 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white text-amber-600 shadow-lg shadow-amber-900/20 mb-4">
            <Truck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">{APP_NAME}</h1>
          <p className="text-sm text-amber-100/80 mt-1 font-medium">Driver Portal</p>
        </div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <Card className="shadow-2xl border-0 shadow-black/10">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl text-gray-900 dark:text-gray-50">
                Sign In
              </CardTitle>
              <CardDescription>
                Enter your credentials to access your dashboard
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Error banner */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400"
                  >
                    {error}
                  </motion.div>
                )}

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="driver-email" className="text-gray-700 dark:text-gray-300">
                    Email Address
                  </Label>
                  <Input
                    id="driver-email"
                    type="email"
                    placeholder="driver@fleetpro.com.gh"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError(null)
                    }}
                    disabled={isLoading}
                    autoComplete="email"
                    className="h-11"
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="driver-password" className="text-gray-700 dark:text-gray-300">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="driver-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (error) setError(null)
                      }}
                      disabled={isLoading}
                      autoComplete="current-password"
                      className="h-11 pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-11 w-11 px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-11 font-semibold bg-amber-500 hover:bg-amber-600 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              {/* Dev-mode quick login */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Dev Quick Login
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DEV_ACCOUNTS.map((preset) => (
                      <Button
                        key={preset.email}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs font-medium"
                        disabled={isLoading}
                        onClick={() => handleDevQuickLogin(preset)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="justify-center pb-6">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Admin
              </button>
            </CardFooter>
          </Card>
        </motion.div>

        {/* Copyright */}
        <p className="text-center text-xs text-amber-100/60 mt-6">
          &copy; {new Date().getFullYear()} {APP_NAME} &mdash; Fleet Management System
        </p>
      </div>
    </div>
  )
}
