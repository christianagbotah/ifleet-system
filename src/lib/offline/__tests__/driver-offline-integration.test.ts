import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

describe('driver offline integration', () => {
  it('provides a browser sync service backed by IndexedDB and authenticated sends', () => {
    const sync = source('src/lib/offline/driver-sync.ts')
    expect(sync).toContain('IndexedDbDriverOutboxStore')
    expect(sync).toContain('flushDriverOutbox')
    expect(sync).toContain('Authorization')
    expect(sync).toContain('clientMutationId')
  })

  it('routes POD through the offline submission service', () => {
    const form = source('src/components/delivery/ProofOfDeliveryForm.tsx')
    expect(form).toContain('submitDriverMutation')
    expect(form).toContain("kind: 'pod'")
  })

  it('routes driver status and expense writes through the offline submission service', () => {
    const controller = source('src/components/trips/DriverTripController.tsx')
    expect(controller).toContain('submitDriverMutation')
    expect(controller).toContain("kind: 'status'")
    expect(controller).toContain("kind: 'expense'")
    expect(controller).toContain('<OfflineSyncStatus')
  })

  it('routes driver fuel writes through the offline submission service', () => {
    const form = source('src/components/fuel/FuelLogFormDialog.tsx')
    expect(form).toContain('submitDriverMutation')
    expect(form).toContain("kind: 'fuel'")
  })

  it('routes driver-created inspections through an offline-safe trip dialog', () => {
    const dialog = source('src/components/maintenance/DriverInspectionDialog.tsx')
    const controller = source('src/components/trips/DriverTripController.tsx')
    expect(dialog).toContain('submitDriverMutation')
    expect(dialog).toContain("kind: 'inspection'")
    expect(dialog).toContain("url: '/api/inspections'")
    expect(dialog).not.toContain('fetchTrucks')
    expect(dialog).not.toContain('fetchDrivers')
    expect(controller).toContain('DriverInspectionDialog')
    expect(controller).toContain('tripId={trip.id}')
  })

  it('queues inspection photos as an upload dependency before inspection sync', () => {
    const dialog = source('src/components/maintenance/DriverInspectionDialog.tsx')
    const sync = source('src/lib/offline/driver-sync.ts')
    const uploadRoute = source('src/app/api/upload/route.ts')
    expect(dialog).toContain("kind: 'upload'")
    expect(dialog).toContain("bodyEncoding: 'multipart'")
    expect(dialog).toContain('dependencyIds: evidenceDependencyIds')
    expect(dialog).toContain('photos: evidenceUrls')
    expect(sync).toContain("bodyEncoding === 'multipart'")
    expect(sync).toContain('new FormData()')
    expect(sync).toContain('for (const dependencyId of item.dependencyIds)')
    expect(sync).toContain('await store.get(dependencyId)')
    expect(uploadRoute).toContain('clientMutationId')
    expect(uploadRoute).toContain('driver-evidence-upload:')
    expect(uploadRoute).toContain('replayed: true')
  })

  it('shows pending, offline and permanent-failure state with manual retry', () => {
    const status = source('src/components/offline/OfflineSyncStatus.tsx')
    expect(status).toContain('pending')
    expect(status).toContain('Offline')
    expect(status).toContain('failed_permanent')
    expect(status).toContain('Retry')
  })
})
