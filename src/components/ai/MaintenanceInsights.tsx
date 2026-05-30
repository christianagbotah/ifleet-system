'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Wrench, RefreshCw, Calendar, AlertTriangle, CheckCircle, Loader2, Brain } from 'lucide-react'
import { useAuthStore } from '@/lib/store/auth'

interface PredictedIssue {
  issue: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
}

interface MaintenancePrediction {
  predictedNextMaintenance?: string | null
  daysUntilMaintenance?: number | null
  predictedIssues?: PredictedIssue[]
  urgency?: 'low' | 'medium' | 'high' | 'critical'
  recommendedActions?: string[]
  confidence?: number | null
  summary?: string | null
}

interface MaintenanceInsightsProps {
  truckId: string
  truckName?: string
  mileage?: number
  lastMaintenanceDate?: string
  maintenanceHistory?: Array<{
    date: string
    type: string
    description: string
    mileage?: number
  }>
}

function getUrgencyColor(urgency?: string) {
  switch (urgency) {
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800'
    case 'medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    case 'low': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
    default: return 'bg-muted text-muted-foreground'
  }
}

function getUrgencyIcon(urgency?: string) {
  switch (urgency) {
    case 'critical':
    case 'high':
      return <AlertTriangle className="h-3.5 w-3.5" />
    default:
      return <CheckCircle className="h-3.5 w-3.5" />
  }
}

function getSeverityColor(severity?: string) {
  switch (severity) {
    case 'critical': return 'text-red-600 dark:text-red-400'
    case 'high': return 'text-orange-600 dark:text-orange-400'
    case 'medium': return 'text-amber-600 dark:text-amber-400'
    default: return 'text-green-600 dark:text-green-400'
  }
}

export function MaintenanceInsights({
  truckId,
  truckName,
  mileage,
  lastMaintenanceDate,
  maintenanceHistory,
}: MaintenanceInsightsProps) {
  const [prediction, setPrediction] = useState<MaintenancePrediction | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPrediction = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = useAuthStore.getState().getToken()
      const response = await fetch('/api/ai/maintenance-predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          truckId,
          mileage: mileage || null,
          lastMaintenanceDate: lastMaintenanceDate || null,
          maintenanceHistory: maintenanceHistory || [],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get maintenance prediction')
      }

      setPrediction(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }, [truckId, mileage, lastMaintenanceDate, maintenanceHistory])

  // Auto-fetch on mount
  useEffect(() => {
    fetchPrediction()
  }, [fetchPrediction])

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-amber-500" />
            AI Maintenance Insights
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchPrediction}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 inline mr-1" />
            {error}
          </div>
        )}

        {prediction && !isLoading && (
          <div className="space-y-3">
            {/* Urgency badge + confidence */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`text-xs font-medium ${getUrgencyColor(prediction.urgency)}`}
              >
                {getUrgencyIcon(prediction.urgency)}
                <span className="ml-1 capitalize">
                  {prediction.urgency || 'unknown'} urgency
                </span>
              </Badge>
              {prediction.confidence != null && (
                <span className="text-xs text-muted-foreground">
                  {prediction.confidence}% confidence
                </span>
              )}
            </div>

            {/* Next maintenance date */}
            {prediction.predictedNextMaintenance && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-muted-foreground">Next service: </span>
                  <span className="font-medium">
                    {new Date(prediction.predictedNextMaintenance).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  {prediction.daysUntilMaintenance != null && (
                    <span className="text-muted-foreground ml-1">
                      ({prediction.daysUntilMaintenance} days)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Summary */}
            {prediction.summary && (
              <p className="text-sm text-muted-foreground">{prediction.summary}</p>
            )}

            {/* Predicted issues */}
            {prediction.predictedIssues && prediction.predictedIssues.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  Predicted Issues
                </p>
                <div className="space-y-1">
                  {prediction.predictedIssues.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-sm"
                    >
                      <span className={`mt-0.5 shrink-0 ${getSeverityColor(item.severity)}`}>
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                      <div>
                        <span className="font-medium">{item.issue}</span>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended actions */}
            {prediction.recommendedActions && prediction.recommendedActions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Recommended Actions</p>
                <ul className="text-sm space-y-0.5">
                  {prediction.recommendedActions.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-1 shrink-0">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
