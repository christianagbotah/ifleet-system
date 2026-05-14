'use client'

import { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-6">
          <div className="flex size-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30">
            <AlertCircle className="size-6 text-red-500" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-sm font-semibold">Something went wrong</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              An unexpected error occurred. Please try again.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRetry} className="gap-2">
            <RefreshCw className="size-3.5" />
            Try Again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
