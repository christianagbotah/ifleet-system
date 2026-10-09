import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
function source(file: string): string {
  const full = path.join(root, file)
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : ''
}

describe('Control Tower integration contract', () => {
  it('queries only the latest recent location per asset and source', () => {
    const repo = source('src/lib/domain/telematics/prisma-control-tower-repository.ts')
    expect(repo).toContain('ROW_NUMBER() OVER')
    expect(repo).toMatch(/PARTITION BY\s+assetType,\s*assetId,\s*source/i)
    expect(repo).toContain('listLatestSnapshots')
    expect(repo).toContain('listTripLocationHistory')
    expect(repo).toMatch(/receivedAt\s*>=/)
    expect(repo).toMatch(/ORDER BY\s+receivedAt DESC,\s*deviceTimestamp DESC/i)
  })

  it('exposes authenticated normalized live and bounded history APIs', () => {
    const live = source('src/app/api/telematics/live/route.ts')
    const history = source('src/app/api/telematics/history/route.ts')
    expect(live).toContain('requireAuth')
    expect(live).toContain('loadControlTowerLive')
    expect(history).toContain('requireAuth')
    expect(history).toContain('loadControlTowerHistory')
  })

  it('wires a reachable hash-routed Control Tower into the existing SPA shell', () => {
    const page = source('src/app/page.tsx')
    const constants = source('src/lib/constants.ts')
    expect(page).toContain('ControlTower')
    expect(page).toContain("case 'control-tower'")
    expect(constants).toContain('id: "control-tower"')
  })

  it('provides the planned Control Tower surfaces and map modes', () => {
    const view = source('src/components/tracking/ControlTower.tsx')
    const drawer = source('src/components/tracking/VehicleTelemetryDrawer.tsx')
    const alarms = source('src/components/tracking/AlarmFeed.tsx')
    const replay = source('src/components/tracking/RouteReplay.tsx')
    expect(view).toContain('/api/telematics/live')
    expect(view).toContain('Road')
    expect(view).toContain('Terrain')
    expect(view).toContain('Satellite')
    expect(drawer).toContain('source')
    expect(drawer).toContain('trust')
    expect(alarms).toContain('Alarm')
    expect(replay).toContain('/api/telematics/history')
  })

  it('links legacy Live Tracking into the Control Tower rather than duplicating it', () => {
    const legacy = source('src/components/tracking/LiveTrackingView.tsx')
    expect(legacy).toContain("detail: 'control-tower'")
  })
})
