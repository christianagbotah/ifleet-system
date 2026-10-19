import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const listRoutePath = 'src/app/api/drivers/[id]/documents/route.ts'
const documentRoutePath = 'src/app/api/drivers/[id]/documents/[docId]/route.ts'
const downloadRoutePath = 'src/app/api/drivers/[id]/documents/[docId]/download/route.ts'
const profilePath = 'src/components/driver-portal/DriverPortalProfile.tsx'
const portalDocumentsPath = 'src/components/driver-portal/DriverPortalDocuments.tsx'

describe('driver portal document contract', () => {
  it('fails closed for unlinked or cross-driver Driver reads on the collection route', () => {
    const source = read(listRoutePath)
    expect(source).toContain('ROLES.DRIVER')
    expect(source).toContain('auth.driverId')
    expect(source).toContain('Driver profile is not linked')
    expect(source).toContain('You can only access your own documents')
  })

  it('fails closed for unlinked or cross-driver Driver reads on individual documents', () => {
    const source = read(documentRoutePath)
    expect(source).toContain('ROLES.DRIVER')
    expect(source).toContain('auth.driverId')
    expect(source).toContain('You can only access your own documents')
  })

  it('serves document bytes through a dedicated authenticated download route', () => {
    expect(existsSync(join(root, downloadRoutePath))).toBe(true)
    if (!existsSync(join(root, downloadRoutePath))) return
    const source = read(downloadRoutePath)
    expect(source).toContain('readFile')
    expect(source).toContain('Content-Disposition')
    expect(source).toContain('You can only access your own documents')
  })

  it('does not expose internal storage paths in the driver document list payload', () => {
    const source = read(listRoutePath)
    expect(source).not.toContain('filePath: true')
  })

  it('replaces the driver portal coming-soon placeholder with a real documents view', () => {
    const profile = read(profilePath)
    expect(profile).not.toContain('Documents page coming soon')
    expect(existsSync(join(root, portalDocumentsPath))).toBe(true)
    if (!existsSync(join(root, portalDocumentsPath))) return
    const documents = read(portalDocumentsPath)
    expect(documents).toContain('/documents')
    expect(documents).toContain('/download')
    expect(documents).toContain('My Documents')
  })

  it('keeps driver portal documents read-only', () => {
    expect(existsSync(join(root, portalDocumentsPath))).toBe(true)
    if (!existsSync(join(root, portalDocumentsPath))) return
    const source = read(portalDocumentsPath)
    expect(source).not.toContain("method: 'POST'")
    expect(source).not.toContain("method: 'DELETE'")
    expect(source).not.toContain('Upload Document')
  })
})
