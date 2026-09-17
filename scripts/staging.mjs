// Local staging environment: a Postgres-compatible database saved in .staging-db/ and the built app on
// http://localhost:3100. Nothing here touches the Railway (production) database.
//
//   npm run build      (after pulling or changing code)
//   npm run staging
//
// Settings come from .env.staging.local (not committed): ADMIN_USERNAME, ADMIN_PASSWORD, ANTHROPIC_API_KEY, ...

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && match[2] !== '') values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = { ...loadEnvFile(path.join(root, '.env.staging.local')), ...process.env };
const dbPort = Number(env.STAGING_DB_PORT ?? 54330);
const appPort = Number(env.STAGING_PORT ?? 3100);

if (!existsSync(path.join(root, 'server/dist/main.js')) || !existsSync(path.join(root, 'web/out/index.html'))) {
  console.error('The app is not built yet. Run "npm run build" first.');
  process.exit(1);
}

const children = [];
function stopAll(code = 0) {
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

function waitForPort(port, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`Nothing listening on port ${port} after ${timeoutMs / 1000}s.`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

// 1. Database
// The package doesn't export its package.json, so read the bin entry from disk.
const socketDir = path.join(root, 'node_modules', '@electric-sql', 'pglite-socket');
const socketBin = JSON.parse(readFileSync(path.join(socketDir, 'package.json'), 'utf8')).bin;
const serverScript = path.join(socketDir, typeof socketBin === 'string' ? socketBin : socketBin['pglite-server']);
const db = spawn(process.execPath, [serverScript, `--db=${path.join(root, '.staging-db')}`, `--port=${dbPort}`, '--max-connections=4'], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
});
children.push(db);
db.on('exit', (code) => {
  console.error(`Staging database stopped (exit ${code}).`);
  stopAll(code ?? 1);
});

await waitForPort(dbPort);
console.log(`Staging database ready on port ${dbPort} (data in .staging-db/).`);

// 2. App
const app = spawn(process.execPath, [path.join(root, 'server/dist/main.js')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...env,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${dbPort}/postgres?sslmode=disable`,
    DATABASE_POOL_MAX: '4',
    PORT: String(appPort),
    NODE_ENV: 'staging',
  },
});
children.push(app);
app.on('exit', (code) => {
  console.error(`Staging app stopped (exit ${code}).`);
  stopAll(code ?? 1);
});

await waitForPort(appPort, 60_000);
console.log(`Staging app running at http://localhost:${appPort}`);
