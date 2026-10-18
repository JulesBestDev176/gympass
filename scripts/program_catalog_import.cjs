#!/usr/bin/env node
// ─────────────────────────── PROGRAM CATALOG IMPORT ──────────────────────────
// Import compiled program manifests into the database as DRAFT.
//
// Usage:
//   node scripts/program_catalog_import.cjs --dry-run --dir assets/program-catalog/generated
//   node scripts/program_catalog_import.cjs --apply-drafts --dir assets/program-catalog/generated
//
// Options:
//   --dry-run       Validate all manifests without writing to DB (default when --apply-drafts absent)
//   --apply-drafts  After dry-run validation, import valid manifests as DRAFT
//   --dir <path>    Directory containing compiled manifest .json files (default: assets/program-catalog/generated)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

require('ts-node/register/transpile-only');

const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRunFlag = args.includes('--dry-run');
const applyDraftsFlag = args.includes('--apply-drafts');
const dirIdx = args.indexOf('--dir');
const manifestDir = dirIdx >= 0 ? args[dirIdx + 1] : 'assets/program-catalog/generated';

if (!dryRunFlag && !applyDraftsFlag) {
  console.error('[ERROR] Specify --dry-run or --apply-drafts (or both).');
  process.exit(1);
}

// ── Print DB host (never credentials) ────────────────────────────────────────

function extractDbHost(url) {
  try {
    // Replace postgres:// with https:// so URL constructor can parse it
    const normalized = url.replace(/^[a-z+]+:\/\//, 'https://');
    const u = new URL(normalized);
    return u.hostname + (u.port ? ':' + u.port : '');
  } catch {
    return '(unknown)';
  }
}

const dbUrl = process.env.DATABASE_URL || '';
console.log(`[INFO] Target DB host: ${extractDbHost(dbUrl)}`);

// ── Load services ─────────────────────────────────────────────────────────────

const { ProgramImportService } = require('../src/gymbro/programs/program-import.service');
const { validateProgramManifest } = require('../src/gymbro/programs/contracts/program-manifest.schema');

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load manifest files
  const absDir = path.resolve(manifestDir);
  let fileNames;
  try {
    const entries = await fs.readdir(absDir);
    fileNames = entries.filter(
      (f) => f.endsWith('.json') && f !== 'build-report.json' && f !== 'families.json',
    );
  } catch (err) {
    console.error(`[ERROR] Cannot read directory "${absDir}": ${err.message}`);
    process.exit(1);
  }

  console.log(`[INFO] Found ${fileNames.length} manifest file(s) in ${absDir}`);

  if (fileNames.length === 0) {
    console.log('[INFO] Nothing to import.');
    return;
  }

  let prisma;
  let svc;

  if (applyDraftsFlag) {
    prisma = new PrismaClient();
    // ProgramImportService expects a PrismaService — PrismaClient is compatible enough
    svc = new ProgramImportService(prisma);
    await prisma.$connect();
  }

  // Counters
  let valid = 0;
  let blocked = 0;
  let created = 0;
  let updated = 0;

  for (const fileName of fileNames) {
    const filePath = path.join(absDir, fileName);
    let manifest;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      manifest = JSON.parse(raw);
    } catch (err) {
      console.error(`[SKIP] ${fileName}: failed to parse JSON — ${err.message}`);
      blocked++;
      continue;
    }

    // Always run dryRun first
    const report = validateProgramManifest(manifest);

    if (report.valid) {
      valid++;
      const issueCount = report.issues.length;
      console.log(
        `[OK]   ${fileName} — checksum=${report.checksum.slice(0, 12)}…` +
          (issueCount > 0 ? ` (${issueCount} warning(s))` : ''),
      );
    } else {
      blocked++;
      const errors = report.issues.filter((i) => i.severity === 'error');
      console.error(`[FAIL] ${fileName} — ${errors.length} error(s):`);
      for (const issue of errors) {
        console.error(`         ${issue.path ? issue.path + ': ' : ''}${issue.message}`);
      }
    }

    // Apply draft import if requested
    if (applyDraftsFlag && report.valid) {
      try {
        const result = await svc.importDraft(manifest);
        if (result.created) {
          created++;
          console.log(`[DB]   ${fileName} → created (id=${result.id})`);
        } else {
          updated++;
          console.log(`[DB]   ${fileName} → already up-to-date (id=${result.id})`);
        }
      } catch (err) {
        console.error(`[DB-ERR] ${fileName}: ${err.message}`);
        blocked++;
        valid--; // remove from valid count since it ultimately failed
      }
    }
  }

  if (prisma) {
    await prisma.$disconnect();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('');
  console.log('────────────────────────────────────────────');
  console.log(`  Valid     : ${valid}`);
  console.log(`  Blocked   : ${blocked}`);
  if (applyDraftsFlag) {
    console.log(`  Created   : ${created}`);
    console.log(`  Updated   : ${updated}`);
  }
  console.log('────────────────────────────────────────────');

  if (blocked > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
