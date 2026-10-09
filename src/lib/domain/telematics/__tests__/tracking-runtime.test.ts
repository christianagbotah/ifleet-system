import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const unitPath = path.join(process.cwd(), 'deploy/systemd/ifleetpro-tracking.service')
const unit = fs.existsSync(unitPath) ? fs.readFileSync(unitPath, 'utf8') : ''

describe('tracking runtime deployment contract', () => {
  it('ships a dedicated localhost-only systemd service on port 3033', () => {
    expect(unit).toContain('WorkingDirectory=/home/lightworld/webapps/ifleetpro/mini-services/tracking-service')
    expect(unit).not.toContain('EnvironmentFile=')
    expect(unit).toContain('Environment=PORT=3033')
    expect(unit).toContain('Environment=HOST=127.0.0.1')
    expect(unit).toContain('ExecStart=/root/.bun/bin/bun index.ts')
    expect(unit).toContain('Restart=always')
  })

  it('ships an nginx websocket route to the localhost tracking service', () => {
    const nginx = fs.readFileSync(path.join(process.cwd(), 'nginx-ifleetpro.conf'), 'utf8')
    expect(nginx).toContain('location ^~ /socket.io/')
    expect(nginx).toContain('proxy_pass http://127.0.0.1:3033')
    expect(nginx).toContain('proxy_set_header Upgrade $http_upgrade')
    expect(nginx).toContain('proxy_set_header Connection "upgrade"')
  })

})
