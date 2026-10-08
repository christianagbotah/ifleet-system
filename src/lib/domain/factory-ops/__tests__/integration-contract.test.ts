import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('factory operations integration contract', () => {
  it('configures Prisma to discover additive domain schema files', () => {
    const config = read('prisma.config.ts')
    const schema = read('prisma/models/factory-ops.prisma')

    expect(config).toContain("schema: path.join(__dirname, 'prisma')")
    expect(schema).toContain('model GateEvent')
    expect(schema).toContain('model FactoryQueueEntry')
    expect(schema).toContain('@@index([siteId, truckId, occurredAt])')
    expect(schema).toContain('legacyQueueId')
  })

  it('routes gate writes through the tested gate service with auth and audit', () => {
    const source = read('src/app/api/factory-ops/gate/route.ts')

    expect(source).toContain('requireWriteAccess')
    expect(source).toContain('createGateService')
    expect(source).toContain('createAuditLog')
    expect(source).toContain('gateEvent.findFirst')
    expect(source).toContain('gateEvent.create')
  })

  it('keeps queue writes compatible with legacy DepotQueue while using the queue service', () => {
    const source = read('src/app/api/factory-ops/queue/route.ts')

    expect(source).toContain('requireWriteAccess')
    expect(source).toContain('createQueueService')
    expect(source).toContain('db.$transaction')
    expect(source).toContain('depotQueue.create')
    expect(source).toContain('factoryQueueEntry.create')
    expect(source).toContain('legacyQueueId')
  })

  it('provides a factory operations view wired to gate and queue APIs', () => {
    const source = read('src/components/factory-ops/FactoryOperationsView.tsx')

    expect(source).toContain('/api/factory-ops/gate')
    expect(source).toContain('/api/factory-ops/queue')
    expect(source).toContain('Gate & Queue')
    expect(source).toContain('Detention')
  })

  it('upgrades the existing Depot Queue menu into a compatibility wrapper instead of orphaning the legacy UI', () => {
    const wrapper = read('src/components/operations/DepotQueueView.tsx')
    const legacy = read('src/components/operations/LegacyDepotQueueView.tsx')

    expect(wrapper).toContain("@/components/factory-ops/FactoryOperationsView")
    expect(wrapper).toContain("@/components/operations/LegacyDepotQueueView")
    expect(wrapper).toContain('Factory Operations')
    expect(wrapper).toContain('Legacy Queue')
    expect(legacy).toContain('/api/depot-queue')
  })
})
