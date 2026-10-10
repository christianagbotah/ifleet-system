import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const deviceId = new URL(request.url).searchParams.get('deviceId')?.trim()
  if (!deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

  const policy = await db.videoRetentionPolicy.findUnique({ where: { deviceId } })
  if (!policy) return NextResponse.json({ acknowledged: false })
  const existing = await db.videoPrivacyAcknowledgement.findUnique({
    where: {
      policyId_subjectType_subjectId_policyVersion_noticeVersion: {
        policyId: policy.id,
        subjectType: 'user',
        subjectId: auth.userId,
        policyVersion: policy.policyVersion,
        noticeVersion: policy.privacyNoticeVersion,
      },
    },
  })
  return NextResponse.json({ acknowledged: !!existing, acknowledgement: existing })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const body = (await request.json().catch(() => null)) as { deviceId?: unknown; metadata?: unknown } | null
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  if (!deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

  const policy = await db.videoRetentionPolicy.findUnique({ where: { deviceId } })
  if (!policy) return NextResponse.json({ error: 'Video privacy policy not found' }, { status: 404 })

  const acknowledgement = await db.videoPrivacyAcknowledgement.upsert({
    where: {
      policyId_subjectType_subjectId_policyVersion_noticeVersion: {
        policyId: policy.id,
        subjectType: 'user',
        subjectId: auth.userId,
        policyVersion: policy.policyVersion,
        noticeVersion: policy.privacyNoticeVersion,
      },
    },
    update: { acknowledgedAt: new Date() },
    create: {
      policyId: policy.id,
      subjectType: 'user',
      subjectId: auth.userId,
      policyVersion: policy.policyVersion,
      noticeVersion: policy.privacyNoticeVersion,
      metadata: body?.metadata === undefined ? null : JSON.stringify(body.metadata),
    },
  })

  return NextResponse.json(acknowledgement, { status: 201 })
}
