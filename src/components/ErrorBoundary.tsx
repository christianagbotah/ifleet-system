'use client'

import { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
          <div className="size-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
            <AlertCircle className="size-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            An unexpected error occurred. This has been logged. Try refreshing the page.
          </p>
          <p className="text-xs text-muted-foreground font-mono bg-muted rounded-lg p-2 max-w-md overflow-auto">
            {this.state.error?.message}
          </p>
          <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}>
            <RefreshCw className="size-4" />
            Refresh Page
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
