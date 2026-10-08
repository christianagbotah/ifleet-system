'use client'

import { useState } from 'react'
import { ShieldCheck, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ComplianceRulesView } from '@/components/compliance/ComplianceRulesView'
import LegacyComplianceDashboardView from '@/components/compliance/LegacyComplianceDashboardView'

export function ComplianceDashboardView() {
  const [workspace, setWorkspace] = useState<'dashboard' | 'rules'>('dashboard')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <Button
          type="button"
          variant={workspace === 'dashboard' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setWorkspace('dashboard')}
          className="cursor-pointer gap-2"
        >
          <ShieldCheck className="h-4 w-4" />
          Compliance Dashboard
        </Button>
        <Button
          type="button"
          variant={workspace === 'rules' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setWorkspace('rules')}
          className="cursor-pointer gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Rule Sets
        </Button>
      </div>

      {workspace === 'dashboard' ? <LegacyComplianceDashboardView /> : <ComplianceRulesView />}
    </div>
  )
}

export default ComplianceDashboardView
