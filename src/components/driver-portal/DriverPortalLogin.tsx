'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Loader2, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { APP_NAME } from '@/lib/constants'
import { useAuthStore } from '@/lib/store/auth'

export function DriverPortalLogin() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { login, isLoading } = useAuthStore()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!email.trim()) {
      toast.error('Please enter your email')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      toast.error('Please enter a valid email address')
      return
    }

    if (!password) {
      toast.error('Please enter your password')
      return
    }

    try {
      await login(email.trim(), password)
      toast.success('Welcome to the Driver Portal!')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Login failed. Please try again.'
      setError(message)
      toast.error(message)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-orange-700/20 blur-3xl" />
        <div className="absolute left-1/4 top-1/4 h-48 w-48 rounded-full bg-amber-300/10 blur-2xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-lg shadow-amber-900/20">
            <Truck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">{APP_NAME}</h1>
          <p className="mt-1 text-sm font-medium text-amber-100/80">Driver Portal</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <Card className="border-0 shadow-2xl shadow-black/10">
            <CardHeader className="pb-2 text-center">
              <CardTitle className="text-xl text-gray-900 dark:text-gray-50">Sign In</CardTitle>
              <CardDescription>Enter your authorized driver credentials</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
                  >
                    {error}
                  </motion.div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="driver-email" className="text-gray-700 dark:text-gray-300">
                    Email Address
                  </Label>
                  <Input
                    id="driver-email"
                    type="email"
                    placeholder="driver@company.com"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (error) setError(null)
                    }}
                    disabled={isLoading}
                    autoComplete="email"
                    className="h-11"
                  />
                </div>

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
                      onChange={(event) => {
                        setPassword(event.target.value)
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

                <Button
                  type="submit"
                  className="h-11 w-full bg-amber-500 font-semibold text-white hover:bg-amber-600"
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
            </CardContent>

            <CardFooter className="justify-center pb-6">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            </CardFooter>
          </Card>
        </motion.div>

        <p className="mt-6 text-center text-xs text-amber-100/60">
          &copy; {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>
    </div>
  )
}
