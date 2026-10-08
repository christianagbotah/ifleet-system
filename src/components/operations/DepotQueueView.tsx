'use client'

import * as React from 'react'

import { FactoryOperationsView } from '@/components/factory-ops/FactoryOperationsView'
import { LegacyDepotQueueView } from '@/components/operations/LegacyDepotQueueView'
import { Button } from '@/components/ui/button'

export function DepotQueueView() {
  const [mode, setMode] = React.useState<'factory' | 'legacy'>('factory')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b px-4 pb-3 pt-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Factory Operations</h1>
          <p className="text-sm text-muted-foreground">Modern gate, queue, bay and detention control with the legacy queue preserved for continuity.</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === 'factory' ? 'default' : 'outline'}
            onClick={() => setMode('factory')}
            className="cursor-pointer"
          >
            Factory Operations
          </Button>
          <Button
            size="sm"
            variant={mode === 'legacy' ? 'default' : 'outline'}
            onClick={() => setMode('legacy')}
            className="cursor-pointer"
          >
            Legacy Queue
          </Button>
        </div>
      </div>

      {mode === 'factory' ? <FactoryOperationsView /> : <LegacyDepotQueueView />}
    </div>
  )
}
