import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'mini-services/tracking-service/index.ts'), 'utf8')

describe('tracking service socket security integration', () => {
  it('validates the JWT before any socket room handlers are registered', () => {
    expect(source).toContain("import { validateTrackingSession } from './auth'")
    expect(source).toContain('io.use(async (socket, next) =>')
    expect(source).toContain('await validateTrackingSession(APP_BASE_URL, token)')
    expect(source.indexOf('io.use(async (socket, next) =>')).toBeLessThan(source.indexOf("io.on('connection'"))
  })

  it('uses only the connection-validated token inside room and tracking handlers', () => {
    expect(source).toContain('socket.data.authToken')
    expect(source).toContain("socket.on('join-truck'")
    expect(source).toContain("socket.on('join-all-trucks'")
  })
})
