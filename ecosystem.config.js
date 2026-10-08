// ══════════════════════════════════════════════════════════════
// PM2 Ecosystem Configuration — iFleetPro
// ══════════════════════════════════════════════════════════════
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 stop all
//   pm2 restart all
//   pm2 logs ifleetpro
//   pm2 monit
//
// Auto-restart on server reboot:
//   pm2 startup
//   pm2 save
// ══════════════════════════════════════════════════════════════

module.exports = {
  apps: [
    // ── Main Next.js Application (port 3000) ──
    {
      name: 'ifleetpro',
      script: '.next/standalone/server.js',
      cwd: '/home/lightworld/webapps/ifleetpro',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/log/ifleetpro/ifleetpro-error.log',
      out_file: '/var/log/ifleetpro/ifleetpro-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ── Tracking Service (port 3003) ──
    {
      name: 'ifleetpro-tracking',
      script: 'index.ts',
      cwd: '/home/lightworld/webapps/ifleetpro/mini-services/tracking-service',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/ifleetpro/tracking-error.log',
      out_file: '/var/log/ifleetpro/tracking-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ── Notification Service (port 3004) ──
    {
      name: 'ifleetpro-notifications',
      script: 'index.ts',
      cwd: '/home/lightworld/webapps/ifleetpro/mini-services/notification-service',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/ifleetpro/notification-error.log',
      out_file: '/var/log/ifleetpro/notification-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
