import { describe, expect, it } from 'vitest'

import type { VideoSessionDescriptor, TelematicsProviderAdapter } from '../../telematics/provider'
import {
  authorizeVideoAccess,
  requestAuthorizedVideoSession,
  type VideoAccessActor,
  type VideoAccessAuditEvent,
  type VideoAccessResource,
} from '../access'

const manager: VideoAccessActor = {
  userId: 'manager-1',
  roleName: 'Manager',
  permissions: [],
  isDemo: false,
  clientId: null,
}

const roadCamera: VideoAccessResource = {
  deviceId: 'device-1',
  provider: 'test-video',
  credentialRef: 'vault:test-video/device-1',
  channelKey: 'front',
  privacyClass: 'road',
  clientId: null,
  supportsLive: true,
  supportsPlayback: true,
}

function fakeProvider(descriptor: VideoSessionDescriptor) {
  const calls: string[] = []
  const provider: TelematicsProviderAdapter = {
    providerId: 'test-video',
    normalizeLocation: () => { throw new Error('not used') },
    normalizeIgnition: () => { throw new Error('not used') },
    normalizeSensor: () => { throw new Error('not used') },
    normalizeAlarm: () => { throw new Error('not used') },
    healthCheck: async ({ checkedAt }) => ({ provider: 'test-video', healthy: true, checkedAt }),
    requestLiveVideo: async () => {
      calls.push('live')
      return descriptor
    },
    requestPlaybackClip: async () => {
      calls.push('playback')
      return descriptor
    },
  }
  return { provider, calls }
}

function auditCollector() {
  const events: VideoAccessAuditEvent[] = []
  return {
    events,
    audit: async (event: VideoAccessAuditEvent) => { events.push(event) },
  }
}

describe('video access policy', () => {
  it('allows a fleet manager to request road-facing live video', () => {
    expect(authorizeVideoAccess(manager, roadCamera, 'live')).toEqual({ allowed: true })
  })

  it('denies drivers and demo identities before any provider access', () => {
    expect(authorizeVideoAccess({ ...manager, roleName: 'Driver' }, roadCamera, 'live')).toMatchObject({
      allowed: false,
      reason: 'role_not_allowed',
    })
    expect(authorizeVideoAccess({ ...manager, roleName: 'Admin', isDemo: true }, roadCamera, 'live')).toMatchObject({
      allowed: false,
      reason: 'demo_not_allowed',
    })
  })

  it('requires an elevated privacy permission for driver-facing cabin video', () => {
    const cabin = { ...roadCamera, channelKey: 'cabin', privacyClass: 'driver' as const }
    expect(authorizeVideoAccess(manager, cabin, 'live')).toMatchObject({
      allowed: false,
      reason: 'privacy_restricted',
    })
    expect(authorizeVideoAccess({ ...manager, permissions: ['video.driver.view'] }, cabin, 'live')).toEqual({ allowed: true })
  })

  it('denies a client-scoped actor from an unrelated client resource', () => {
    expect(authorizeVideoAccess(
      { ...manager, clientId: 'client-a' },
      { ...roadCamera, clientId: 'client-b' },
      'playback',
    )).toMatchObject({ allowed: false, reason: 'resource_scope_mismatch' })
  })

  it('returns unavailable when the requested capability is disabled', () => {
    expect(authorizeVideoAccess(manager, { ...roadCamera, supportsLive: false }, 'live')).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    })
  })
})

describe('video access broker', () => {
  it('does not call the provider for a denied request and audits the denial without a URL', async () => {
    const descriptor = {
      provider: 'test-video',
      channelKey: 'front',
      url: 'https://video.example/live/secret',
      token: 'secret-token',
      expiresAt: new Date('2026-10-10T10:03:00Z'),
    }
    const { provider, calls } = fakeProvider(descriptor)
    const { events, audit } = auditCollector()

    const result = await requestAuthorizedVideoSession({
      actor: { ...manager, roleName: 'Driver' },
      resource: roadCamera,
      action: 'live',
      provider,
      audit,
      now: new Date('2026-10-10T10:00:00Z'),
    })

    expect(result).toMatchObject({ ok: false, reason: 'role_not_allowed' })
    expect(calls).toEqual([])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ outcome: 'denied', action: 'live', deviceId: 'device-1' })
    expect(JSON.stringify(events[0])).not.toContain('video.example')
    expect(JSON.stringify(events[0])).not.toContain('secret-token')
  })

  it('returns a valid short-lived provider session and audits only metadata', async () => {
    const descriptor = {
      provider: 'test-video',
      channelKey: 'front',
      url: 'https://video.example/live/session-1',
      token: 'ephemeral-token',
      expiresAt: new Date('2026-10-10T10:03:00Z'),
    }
    const { provider, calls } = fakeProvider(descriptor)
    const { events, audit } = auditCollector()

    const result = await requestAuthorizedVideoSession({
      actor: manager,
      resource: roadCamera,
      action: 'live',
      provider,
      audit,
      now: new Date('2026-10-10T10:00:00Z'),
    })

    expect(result).toEqual({ ok: true, session: descriptor })
    expect(calls).toEqual(['live'])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ outcome: 'allowed', action: 'live', channelKey: 'front' })
    expect(JSON.stringify(events[0])).not.toContain('video.example')
    expect(JSON.stringify(events[0])).not.toContain('ephemeral-token')
  })

  it('rejects expired provider sessions and records the failure', async () => {
    const descriptor = {
      provider: 'test-video',
      channelKey: 'front',
      url: 'https://video.example/live/expired',
      expiresAt: new Date('2026-10-10T09:59:59Z'),
    }
    const { provider } = fakeProvider(descriptor)
    const { events, audit } = auditCollector()

    const result = await requestAuthorizedVideoSession({
      actor: manager,
      resource: roadCamera,
      action: 'live',
      provider,
      audit,
      now: new Date('2026-10-10T10:00:00Z'),
    })

    expect(result).toMatchObject({ ok: false, reason: 'provider_session_invalid' })
    expect(events.at(-1)).toMatchObject({ outcome: 'failed', reason: 'provider_session_invalid' })
  })

  it('rejects provider sessions whose expiry exceeds the short-lived maximum', async () => {
    const descriptor = {
      provider: 'test-video',
      channelKey: 'front',
      url: 'https://video.example/live/too-long',
      expiresAt: new Date('2026-10-10T10:30:00Z'),
    }
    const { provider } = fakeProvider(descriptor)
    const { audit } = auditCollector()

    const result = await requestAuthorizedVideoSession({
      actor: manager,
      resource: roadCamera,
      action: 'live',
      provider,
      audit,
      now: new Date('2026-10-10T10:00:00Z'),
    })

    expect(result).toMatchObject({ ok: false, reason: 'provider_session_invalid' })
  })
})
