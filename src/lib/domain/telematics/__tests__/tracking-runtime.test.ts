import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const unitPath = path.join(process.cwd(), 'deploy/systemd/ifleetpro-tracking.service')
const unit = fs.existsSync(unitPath) ? fs.readFileSync(unitPath, 'utf8') : ''
const nginxPath = path.join(process.cwd(), 'nginx-ifleetpro.conf')
const nginx = fs.existsSync(nginxPath) ? fs.readFileSync(nginxPath, 'utf8') : ''
const liveTracking = fs.readFileSync(path.join(process.cwd(), 'src/components/tracking/LiveTrackingView.tsx'), 'utf8')
const driverSender = fs.readFileSync(path.join(process.cwd(), 'src/components/tracking/DriverLocationSender.tsx'), 'utf8')

describe('tracking runtime deployment contract', () => {
  it('ships a dedicated localhost-only systemd service on port 3033', () => {
    expect(unit).toContain('WorkingDirectory=/home/lightworld/webapps/ifleetpro/mini-services/tracking-service')
    expect(unit).not.toContain('EnvironmentFile=')
    expect(unit).toContain('Environment=PORT=3033')
    expect(unit).toContain('Environment=HOST=127.0.0.1')
    expect(unit).toContain('ExecStart=/root/.bun/bin/bun index.ts')
    expect(unit).toContain('Restart=always')
  })

  it('proxies only the dedicated same-origin tracking Socket.IO path', () => {
    expect(nginx).toContain('location ^~ /tracking-socket/socket.io/')
    expect(nginx).toContain('proxy_pass http://127.0.0.1:3033/socket.io/')
    expect(nginx).toContain('proxy_set_header Upgrade $http_upgrade')
    expect(nginx).not.toContain('location ^~ /socket.io/')
    expect(liveTracking).toContain('path: trackingSocketPath()')
    expect(driverSender).toContain('path: trackingSocketPath()')
  })
})
