import { db } from '../src/lib/db'

const INTERNAL_ORGANIZATION_CODE = 'IFLEETPRO-INTERNAL'
const INTERNAL_TRANSPORTER_CODE = 'IFLEETPRO-INTERNAL-FLEET'
const INTERNAL_OWNER_CODE = 'IFLEETPRO-INTERNAL-OWNER'
const LEGACY_CONTRACT_NUMBER = 'LEGACY-ZONE-RATES'
const LEGACY_RATE_SOURCE = 'legacy_zone_rate'

async function main() {
  const settings = await db.systemSettings.findFirst({
    where: { isDefault: true },
    select: { companyName: true, companyEmail: true, companyPhone: true, companyAddress: true },
  })
  const organizationName = settings?.companyName?.trim() || 'iFleetPro Internal Fleet'

  const organization = await db.organization.upsert({
    where: { code: INTERNAL_ORGANIZATION_CODE },
    update: {
      name: organizationName,
      email: settings?.companyEmail || null,
      phone: settings?.companyPhone || null,
      address: settings?.companyAddress || null,
      isActive: true,
    },
    create: {
      code: INTERNAL_ORGANIZATION_CODE,
      name: organizationName,
      organizationType: 'operator',
      email: settings?.companyEmail || null,
      phone: settings?.companyPhone || null,
      address: settings?.companyAddress || null,
      isActive: true,
    },
  })

  const transporter = await db.transporter.upsert({
    where: { code: INTERNAL_TRANSPORTER_CODE },
    update: {
      organizationId: organization.id,
      name: `${organizationName} Transport Operations`,
      isInternal: true,
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      code: INTERNAL_TRANSPORTER_CODE,
      name: `${organizationName} Transport Operations`,
      isInternal: true,
      isActive: true,
    },
  })

  const vehicleOwner = await db.vehicleOwner.upsert({
    where: { code: INTERNAL_OWNER_CODE },
    update: {
      organizationId: organization.id,
      name: organizationName,
      isInternal: true,
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      code: INTERNAL_OWNER_CODE,
      name: organizationName,
      ownerType: 'company',
      isInternal: true,
      isActive: true,
    },
  })

  const [transporterBackfill, ownerBackfill] = await Promise.all([
    db.truck.updateMany({
      where: { transporterId: null },
      data: { transporterId: transporter.id },
    }),
    db.truck.updateMany({
      where: { vehicleOwnerId: null },
      data: { vehicleOwnerId: vehicleOwner.id },
    }),
  ])

  const zoneRates = await db.zoneRate.findMany({ orderBy: [{ effectiveDate: 'asc' }, { id: 'asc' }] })
  const earliestEffectiveDate = zoneRates[0]?.effectiveDate ?? new Date()

  const contract = await db.transportContract.upsert({
    where: { contractNumber: LEGACY_CONTRACT_NUMBER },
    update: {
      organizationId: organization.id,
      transporterId: transporter.id,
      name: 'Legacy Zone Rate Schedule',
      currency: 'GHS',
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      transporterId: transporter.id,
      contractNumber: LEGACY_CONTRACT_NUMBER,
      name: 'Legacy Zone Rate Schedule',
      currency: 'GHS',
      startDate: earliestEffectiveDate,
      isActive: true,
      notes: 'Automatically created from existing ZoneRate records. Historical trips and ZoneRate rows remain unchanged.',
    },
  })

  let createdRateCards = 0
  let updatedRateCards = 0

  for (const zoneRate of zoneRates) {
    const sourceKey = {
      sourceType: LEGACY_RATE_SOURCE,
      sourceId: zoneRate.id,
    }
    const existing = await db.transportRateCard.findUnique({
      where: { sourceType_sourceId: sourceKey },
      select: { id: true },
    })

    await db.transportRateCard.upsert({
      where: { sourceType_sourceId: sourceKey },
      update: {
        contractId: contract.id,
        transporterId: transporter.id,
        destinationZoneId: zoneRate.destinationZoneId,
        rateAmount: zoneRate.rateAmount,
        rateType: 'flat_trip',
        currency: 'GHS',
        effectiveFrom: zoneRate.effectiveDate,
        isActive: zoneRate.isActive,
      },
      create: {
        contractId: contract.id,
        transporterId: transporter.id,
        destinationZoneId: zoneRate.destinationZoneId,
        rateAmount: zoneRate.rateAmount,
        rateType: 'flat_trip',
        currency: 'GHS',
        effectiveFrom: zoneRate.effectiveDate,
        isActive: zoneRate.isActive,
        sourceType: LEGACY_RATE_SOURCE,
        sourceId: zoneRate.id,
      },
    })

    if (existing) updatedRateCards += 1
    else createdRateCards += 1
  }

  console.log(JSON.stringify({
    organizationId: organization.id,
    transporterId: transporter.id,
    vehicleOwnerId: vehicleOwner.id,
    contractId: contract.id,
    trucksAssignedTransporter: transporterBackfill.count,
    trucksAssignedOwner: ownerBackfill.count,
    zoneRatesRead: zoneRates.length,
    rateCardsCreated: createdRateCards,
    rateCardsUpdated: updatedRateCards,
  }))
}

main()
  .catch((error) => {
    console.error('Haulage foundation backfill failed')
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
