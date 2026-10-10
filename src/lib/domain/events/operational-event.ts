export interface OperationalEventInput {
  idempotencyKey: string
  eventKey: string
  type: string
  entityType: string
  entityId: string
  tripId?: string | null
  actorType?: string | null
  actorId?: string | null
  occurredAt: Date | string
  latitude?: number | null
  longitude?: number | null
  evidenceRefs?: string[]
  metadata?: Record<string, unknown>
  source: string
  supersedesEventId?: string | null
}

export interface OperationalEventInsert {
  idempotencyKey: string
  eventKey: string
  type: string
  entityType: string
  entityId: string
  tripId: string | null
  actorType: string | null
  actorId: string | null
  occurredAt: Date
  receivedAt: Date
  latitude: number | null
  longitude: number | null
  evidenceRefs: string[]
  metadata: Record<string, unknown>
  source: string
  supersedesEventId: string | null
}

export interface OperationalEventRecord extends OperationalEventInsert {
  id: string
  createdAt: Date
}

export interface OperationalEventRepository {
  findByIdempotencyKey(key: string): Promise<OperationalEventRecord | null>
  findById(id: string): Promise<OperationalEventRecord | null>
  insert(input: OperationalEventInsert): Promise<OperationalEventRecord>
}

function required(value: string, label: string): string {
  const cleaned = value.trim()
  if (!cleaned) throw new Error(`${label} is required`)
  return cleaned
}

function eventDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('occurredAt must be a valid date')
  return date
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

async function defaultRepository(): Promise<OperationalEventRepository> {
  const { db } = await import('@/lib/db')
  const toRecord = (row: {
    id: string; idempotencyKey: string; eventKey: string; type: string; entityType: string; entityId: string; tripId: string | null
    actorType: string | null; actorId: string | null; occurredAt: Date; receivedAt: Date; latitude: number | null; longitude: number | null
    evidenceRefs: string | null; metadata: string | null; source: string; supersedesEventId: string | null; createdAt: Date
  }): OperationalEventRecord => ({ ...row, evidenceRefs: parseJsonArray(row.evidenceRefs), metadata: parseJsonObject(row.metadata) })

  return {
    async findByIdempotencyKey(key) {
      const row = await db.operationalEvent.findUnique({ where: { idempotencyKey: key } })
      return row ? toRecord(row) : null
    },
    async findById(id) {
      const row = await db.operationalEvent.findUnique({ where: { id } })
      return row ? toRecord(row) : null
    },
    async insert(input) {
      const row = await db.operationalEvent.create({
        data: {
          ...input,
          evidenceRefs: input.evidenceRefs.length ? JSON.stringify(input.evidenceRefs) : null,
          metadata: Object.keys(input.metadata).length ? JSON.stringify(input.metadata) : null,
        },
      })
      return toRecord(row)
    },
  }
}

export async function appendOperationalEvent(
  input: OperationalEventInput,
  options: { repo?: OperationalEventRepository; now?: () => Date } = {},
): Promise<{ created: boolean; event: OperationalEventRecord }> {
  const repo = options.repo ?? await defaultRepository()
  const idempotencyKey = required(input.idempotencyKey, 'idempotencyKey')
  const existing = await repo.findByIdempotencyKey(idempotencyKey)
  if (existing) return { created: false, event: existing }

  const supersedesEventId = input.supersedesEventId?.trim() || null
  if (supersedesEventId && !(await repo.findById(supersedesEventId))) {
    throw new Error('Superseded event does not exist')
  }

  const event = await repo.insert({
    idempotencyKey,
    eventKey: required(input.eventKey, 'eventKey'),
    type: required(input.type, 'type'),
    entityType: required(input.entityType, 'entityType'),
    entityId: required(input.entityId, 'entityId'),
    tripId: input.tripId?.trim() || null,
    actorType: input.actorType?.trim() || null,
    actorId: input.actorId?.trim() || null,
    occurredAt: eventDate(input.occurredAt),
    receivedAt: options.now?.() ?? new Date(),
    latitude: Number.isFinite(input.latitude) ? input.latitude! : null,
    longitude: Number.isFinite(input.longitude) ? input.longitude! : null,
    evidenceRefs: input.evidenceRefs?.map((value) => value.trim()).filter(Boolean) ?? [],
    metadata: input.metadata ?? {},
    source: required(input.source, 'source'),
    supersedesEventId,
  })
  return { created: true, event }
}
