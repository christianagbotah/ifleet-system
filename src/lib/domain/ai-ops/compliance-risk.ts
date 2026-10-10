import type { DataQualityAssessment } from './types'

export interface ComplianceDocumentFact {
  type: string
  expiresAt: Date
}

export interface ComplianceRiskInput {
  asOf: Date
  documents: ComplianceDocumentFact[]
  activeHold: boolean
  blockingRuleCount: number
  warningRuleCount: number
  dataQuality: DataQualityAssessment
}

export type ComplianceRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ComplianceRisk {
  score: number
  level: ComplianceRiskLevel
  blocking: boolean
  confidence: number
  reasons: string[]
}

function daysUntil(asOf: Date, date: Date): number {
  return (date.getTime() - asOf.getTime()) / 86_400_000
}

function levelFor(score: number, blocking: boolean): ComplianceRiskLevel {
  if (blocking || score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}

export function scoreComplianceRisk(input: ComplianceRiskInput): ComplianceRisk {
  const reasons: string[] = []
  let score = 0
  let blocking = false

  for (const document of input.documents) {
    const remainingDays = daysUntil(input.asOf, document.expiresAt)
    if (remainingDays < 0) {
      score += 60
      blocking = true
      reasons.push(`document_expired:${document.type}`)
      continue
    }
    if (remainingDays <= 14) {
      score += 30
      reasons.push(`document_expiring_soon:${document.type}`)
      continue
    }
    if (remainingDays <= 30) {
      score += 20
      reasons.push(`document_expiring:${document.type}`)
    }
  }

  if (input.warningRuleCount > 0) {
    score += Math.min(30, input.warningRuleCount * 10)
    reasons.push(`compliance_warnings:${input.warningRuleCount}`)
  }

  if (input.blockingRuleCount > 0) {
    blocking = true
    score = Math.max(score, Math.min(95, 85 + input.blockingRuleCount * 5))
    reasons.push(`blocking_compliance_rules:${input.blockingRuleCount}`)
  }

  if (input.activeHold) {
    blocking = true
    score = Math.max(score, 95)
    reasons.push('active_compliance_hold')
  }

  score = Math.max(0, Math.min(100, score))
  const evidenceConfidence = input.documents.length > 0 ? 0.9 : 0.7

  return {
    score,
    level: levelFor(score, blocking),
    blocking,
    confidence: Math.min(evidenceConfidence, input.dataQuality.confidenceCeiling),
    reasons,
  }
}
