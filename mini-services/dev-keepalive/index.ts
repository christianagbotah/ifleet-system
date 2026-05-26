/**
 * Dev Server Keep-Alive Service
 *
 * Monitors port 3000 and restarts the Next.js dev server when it dies.
 */

import { execSync, spawn } from 'child_process';
import * as http from 'http';

const PROJECT_DIR = '/home/z/my-project';
const PORT = 3000;
const CHECK_INTERVAL = 4000;

// Ignore termination signals
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});

function checkServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: '/', method: 'GET', timeout: 3000 },
      (res) => {
        resolve(true);
        res.destroy();
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function restartDevServer(): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] RESTARTING dev server...`);

  try {
    // Kill old processes
    try {
      execSync('pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f "next dev" 2>/dev/null; true', { timeout: 5000 });
    } catch { /* ignore */ }

    // Brief pause
    execSync('sleep 1', { timeout: 3000 });

    // Start fresh
    const child = spawn('/usr/local/bin/bun', ['run', 'dev'], {
      cwd: PROJECT_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });

    child.on('error', (err) => {
      console.log(`[${ts}] Spawn error: ${err.message}`);
    });

    child.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[nextjs] ${msg}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[nextjs:err] ${msg}`);
    });

    child.unref();
    console.log(`[${ts}] Spawned PID ${child.pid}`);
  } catch (err) {
    console.error(`[${ts}] Restart failed:`, err);
  }
}

async function main(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Keep-alive monitoring port ${PORT} every ${CHECK_INTERVAL}ms`);

  while (true) {
    try {
      const alive = await checkServer();
      if (!alive) {
        console.log(`[${new Date().toISOString()}] Server DOWN, restarting...`);
        restartDevServer();
        // Wait for server to come up
        await new Promise((r) => setTimeout(r, 10000));
      } else {
        // Periodic heartbeat
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Check error:`, err);
    }
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL));
  }
}

main();
