import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  DRIVER_EVIDENCE_ALLOWED_MIME_TYPES,
  driverEvidenceFilename,
  driverEvidenceUrl,
  isValidDriverEvidenceMutationId,
} from '@/lib/offline/driver-evidence'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_DRIVER_EVIDENCE_FILES = 5
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'images')
const ALLOWED_MIME_TYPES = new Set<string>(DRIVER_EVIDENCE_ALLOWED_MIME_TYPES)

type DriverUploadMetadata = {
  urls?: string[]
  tripId?: string | null
  driverId?: string | null
  mimeTypes?: string[]
}

function parseMetadata(value: string | null): DriverUploadMetadata {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as DriverUploadMetadata
      : {}
  } catch {
    return {}
  }
}

function uploadFilesFrom(formData: FormData): File[] {
  const entries = [...formData.getAll('files'), ...formData.getAll('file')]
  return entries.filter((entry): entry is File => entry instanceof File)
}

function validateFiles(files: File[]): string | null {
  if (files.length === 0) return 'No files provided'
  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) return `Unsupported file type: ${file.type || 'unknown'}`
    if (file.size > MAX_FILE_SIZE) return `File too large: ${file.name} (max 5MB)`
  }
  return null
}

async function writeEvidenceFile(filePath: string, buffer: Buffer): Promise<'written' | 'existing' | 'conflict'> {
  try {
    await writeFile(filePath, buffer, { flag: 'wx' })
    return 'written'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existing = await readFile(filePath)
    return existing.equals(buffer) ? 'existing' : 'conflict'
  }
}

function sameStrings(left: string[] | undefined, right: string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index])
}

async function findDriverUploadReplay(
  mutationId: string,
  actor: { userId: string; driverId: string | null },
  expected: { tripId: string | null; mimeTypes: string[] },
) {
  const event = await db.operationalEvent.findUnique({
    where: { idempotencyKey: `driver-evidence-upload:${mutationId}` },
  })
  if (!event) return null

  const metadata = parseMetadata(event.metadata)
  if (
    event.actorId !== actor.userId
    || metadata.driverId !== actor.driverId
    || (metadata.tripId ?? null) !== expected.tripId
    || !sameStrings(metadata.mimeTypes, expected.mimeTypes)
    || !Array.isArray(metadata.urls)
  ) {
    return NextResponse.json(
      { error: 'clientMutationId has already been used for different evidence' },
      { status: 409 },
    )
  }

  return NextResponse.json({ urls: metadata.urls, replayed: true })
}

async function handleDriverEvidenceUpload(
  formData: FormData,
  files: File[],
  auth: { userId: string; roleName: string; driverId: string | null; isDemo: boolean },
) {
  if (auth.isDemo) {
    return NextResponse.json({ error: 'Demo mode is read-only. Sign in with a standard account to make changes.' }, { status: 403 })
  }
  if (!auth.driverId) {
    return NextResponse.json({ error: 'Driver profile is not linked' }, { status: 403 })
  }

  const mutationEntry = formData.get('clientMutationId')
  const mutationId = typeof mutationEntry === 'string' ? mutationEntry.trim() : ''
  if (!isValidDriverEvidenceMutationId(mutationId)) {
    return NextResponse.json({ error: 'A valid clientMutationId is required for driver evidence' }, { status: 400 })
  }
  if (files.length > MAX_DRIVER_EVIDENCE_FILES) {
    return NextResponse.json({ error: `A maximum of ${MAX_DRIVER_EVIDENCE_FILES} evidence photos is allowed` }, { status: 400 })
  }

  const validationError = validateFiles(files)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const tripEntry = formData.get('tripId')
  const tripId = typeof tripEntry === 'string' && tripEntry.trim() ? tripEntry.trim() : null
  if (tripId) {
    const trip = await db.trip.findUnique({ where: { id: tripId }, select: { id: true, driverId: true } })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    if (trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'You can only upload evidence for trips assigned to you' }, { status: 403 })
    }
  }

  const replayIdentity = { tripId, mimeTypes: files.map((file) => file.type) }
  const existing = await findDriverUploadReplay(mutationId, auth, replayIdentity)
  if (existing) return existing

  await mkdir(UPLOAD_DIR, { recursive: true })
  const urls: string[] = []
  for (const [index, file] of files.entries()) {
    const filename = driverEvidenceFilename(mutationId, index, file.type)
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await writeEvidenceFile(path.join(UPLOAD_DIR, filename), buffer)
    if (result === 'conflict') {
      return NextResponse.json({ error: 'Evidence mutation id conflicts with an existing file' }, { status: 409 })
    }
    urls.push(driverEvidenceUrl(mutationId, index, file.type))
  }

  try {
    await db.operationalEvent.create({
      data: {
        idempotencyKey: `driver-evidence-upload:${mutationId}`,
        eventKey: 'driver.evidence.uploaded',
        type: 'driver.evidence.uploaded',
        entityType: 'driver_evidence_upload',
        entityId: mutationId,
        tripId,
        actorType: auth.roleName,
        actorId: auth.userId,
        occurredAt: new Date(),
        evidenceRefs: JSON.stringify(urls),
        metadata: JSON.stringify({
          urls,
          tripId,
          driverId: auth.driverId,
          mimeTypes: files.map((file) => file.type),
        }),
        source: 'api.upload',
      },
    })
  } catch (error) {
    const replay = await findDriverUploadReplay(mutationId, auth, replayIdentity)
    if (replay) return replay
    throw error
  }

  return NextResponse.json({ urls, replayed: false }, { status: 201 })
}

async function handleStandardUpload(files: File[]) {
  const validationError = validateFiles(files)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  await mkdir(UPLOAD_DIR, { recursive: true })
  const urls: string[] = []
  for (const file of files) {
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
    const filename = `${Date.now()}-${randomUUID()}.${extension}`
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()))
    urls.push(`/uploads/images/${filename}`)
  }
  return NextResponse.json({ urls }, { status: 201 })
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const formData = await request.formData()
    const files = uploadFilesFrom(formData)

    if (auth.roleName === ROLES.DRIVER) {
      return handleDriverEvidenceUpload(formData, files, {
        userId: auth.userId,
        roleName: auth.roleName,
        driverId: auth.driverId,
        isDemo: auth.isDemo,
      })
    }

    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard
    return handleStandardUpload(files)
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 })
  }
}
