#!/usr/bin/env node
// program_test_database.cjs
// Manages a disposable PostgreSQL 16 Docker container for program catalog tests.
//
// Usage:
//   node scripts/program_test_database.cjs start   → launches gymbro-programs-test
//   node scripts/program_test_database.cjs stop    → stops and removes it
//   node scripts/program_test_database.cjs test    → runs programs.postgres.test.cjs
//
// The random DB password is stored in /tmp/gymbro-test-db.secret (never committed).

'use strict';

const { execFileSync, execFile, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const CONTAINER_NAME = 'gymbro-programs-test';
const PORT           = 15440;
const DB_NAME        = 'gymbro_program_test';
const DB_USER        = 'gymbro_test';
const SECRET_FILE    = '/tmp/gymbro-test-db.secret';
const POSTGRES_IMAGE = 'postgres:16';

// ─── Docker presence guard ────────────────────────────────────────────────────

function requireDocker() {
  const result = spawnSync('docker', ['info'], { stdio: 'pipe' });
  if (result.status !== 0 || result.error) {
    console.error(
      'Docker is not available or not running.\n' +
      'Install Docker Desktop and ensure the daemon is started, then retry.',
    );
    process.exit(1);
  }
}

// ─── Password helpers ─────────────────────────────────────────────────────────

function generatePassword() {
  return crypto.randomBytes(16).toString('hex');
}

function loadOrCreatePassword() {
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  }
  const pw = generatePassword();
  fs.writeFileSync(SECRET_FILE, pw, { mode: 0o600 });
  return pw;
}

function loadPassword() {
  if (!fs.existsSync(SECRET_FILE)) {
    console.error(
      `Secret file ${SECRET_FILE} not found.\n` +
      'Run "node scripts/program_test_database.cjs start" first.',
    );
    process.exit(1);
  }
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

function buildDatabaseUrl(password) {
  return `postgresql://${DB_USER}:${password}@127.0.0.1:${PORT}/${DB_NAME}`;
}

// ─── Container lifecycle ──────────────────────────────────────────────────────

function containerExists() {
  const result = spawnSync(
    'docker', ['inspect', '--format', '{{.State.Status}}', CONTAINER_NAME],
    { stdio: 'pipe' },
  );
  return result.status === 0;
}

function containerRunning() {
  const result = spawnSync(
    'docker', ['inspect', '--format', '{{.State.Running}}', CONTAINER_NAME],
    { stdio: 'pipe' },
  );
  return result.status === 0 &&
    result.stdout.toString().trim() === 'true';
}

function waitForPostgres(password, maxRetries = 30, intervalMs = 1000) {
  const url = buildDatabaseUrl(password);
  console.log(`Waiting for PostgreSQL to accept connections on port ${PORT}…`);
  for (let i = 0; i < maxRetries; i++) {
    const result = spawnSync(
      'docker', [
        'exec', CONTAINER_NAME,
        'pg_isready', '-U', DB_USER, '-d', DB_NAME,
      ],
      { stdio: 'pipe' },
    );
    if (result.status === 0) {
      console.log('PostgreSQL is ready.');
      return;
    }
    // Simple synchronous sleep via Date loop (avoids external deps)
    const until = Date.now() + intervalMs;
    while (Date.now() < until) { /* spin */ }
  }
  console.error('Timed out waiting for PostgreSQL to become ready.');
  process.exit(1);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdStart() {
  requireDocker();

  if (containerRunning()) {
    console.log(`Container "${CONTAINER_NAME}" is already running.`);
    const pw = loadPassword();
    console.log(`DATABASE_URL: ${buildDatabaseUrl(pw)}`);
    return;
  }

  if (containerExists()) {
    console.log(`Removing stale container "${CONTAINER_NAME}"…`);
    execFileSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'inherit' });
  }

  const password = loadOrCreatePassword();

  console.log(`Starting ${POSTGRES_IMAGE} container "${CONTAINER_NAME}" on port ${PORT}…`);
  execFileSync('docker', [
    'run', '--detach',
    '--name',    CONTAINER_NAME,
    '--publish', `${PORT}:5432`,
    '--env',     `POSTGRES_DB=${DB_NAME}`,
    '--env',     `POSTGRES_USER=${DB_USER}`,
    '--env',     `POSTGRES_PASSWORD=${password}`,
    POSTGRES_IMAGE,
  ], { stdio: 'inherit' });

  waitForPostgres(password);

  const url = buildDatabaseUrl(password);
  console.log(`\nContainer started.`);
  console.log(`DATABASE_URL: ${url}`);
  console.log(`\nTo run tests:\n  node scripts/program_test_database.cjs test`);
}

function cmdStop() {
  requireDocker();

  if (!containerExists()) {
    console.log(`Container "${CONTAINER_NAME}" does not exist. Nothing to stop.`);
    return;
  }

  console.log(`Stopping and removing container "${CONTAINER_NAME}"…`);
  execFileSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'inherit' });

  if (fs.existsSync(SECRET_FILE)) {
    fs.unlinkSync(SECRET_FILE);
    console.log(`Removed secret file ${SECRET_FILE}.`);
  }

  console.log('Done.');
}

function cmdTest() {
  requireDocker();

  if (!containerRunning()) {
    console.error(
      `Container "${CONTAINER_NAME}" is not running.\n` +
      'Start it first with: node scripts/program_test_database.cjs start',
    );
    process.exit(1);
  }

  const password = loadPassword();
  const url = buildDatabaseUrl(password);

  const testFile = path.resolve(
    __dirname,
    '../src/gymbro/programs/programs.postgres.test.cjs',
  );

  if (!fs.existsSync(testFile)) {
    console.error(`Test file not found: ${testFile}`);
    process.exit(1);
  }

  console.log(`Running program catalog PostgreSQL tests against ${url}\n`);

  const result = spawnSync(
    process.execPath, // node
    ['--test', testFile],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        PROGRAMS_TEST_DATABASE_URL: url,
      },
    },
  );

  process.exit(result.status ?? 1);
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

const [, , cmd] = process.argv;

switch (cmd) {
  case 'start': cmdStart(); break;
  case 'stop':  cmdStop();  break;
  case 'test':  cmdTest();  break;
  default:
    console.error(
      'Usage: node scripts/program_test_database.cjs <start|stop|test>\n\n' +
      '  start  Launch the gymbro-programs-test Docker container\n' +
      '  stop   Stop and remove the container\n' +
      '  test   Run programs.postgres.test.cjs against the test DB',
    );
    process.exit(1);
}
