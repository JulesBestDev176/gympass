#!/usr/bin/env node
/**
 * GymBro Program Catalog Build Script
 * Usage: node scripts/program_catalog_build.cjs --out assets/program-catalog/generated --status DRAFT
 *
 * Compiles all 74 program manifests from family definitions + exercise bindings.
 * Exits 0 even if some manifests have blockers (documented in build-report.json).
 * Exits 1 only on fatal error.
 */
'use strict';

const path = require('path');
const fs = require('fs');

// Parse CLI args
const args = process.argv.slice(2);
let outDir = 'assets/program-catalog/generated';
let status = 'DRAFT';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outDir = args[i + 1];
    i++;
  } else if (args[i] === '--status' && args[i + 1]) {
    status = args[i + 1];
    i++;
  }
}

// Resolve paths relative to project root (where script is run from)
const projectRoot = path.resolve(__dirname, '..');
const resolvedOut = path.resolve(projectRoot, outDir);

console.log(`[build] Output directory: ${resolvedOut}`);
console.log(`[build] Status: ${status}`);

// Load ts-node for TypeScript imports
require('ts-node/register/transpile-only');

// Load data files
const familiesPath = path.join(projectRoot, 'assets/program-catalog/families.json');
const bindingsPath = path.join(projectRoot, 'assets/program-catalog/exercise-bindings.json');

let families, bindings;
try {
  ({ families } = require(familiesPath));
  bindings = require(bindingsPath);
} catch (err) {
  console.error('[build] FATAL: Failed to load data files:', err.message);
  process.exit(1);
}

// Load compiler and validator
let compileProgram, validateProgramManifest;
try {
  ({ compileProgram } = require(path.join(projectRoot, 'src/gymbro/programs/program-compiler.ts')));
  ({ validateProgramManifest } = require(path.join(projectRoot, 'src/gymbro/programs/contracts/program-manifest.schema.ts')));
} catch (err) {
  console.error('[build] FATAL: Failed to load compiler/validator:', err.message);
  process.exit(1);
}

// Ensure output directory exists
try {
  fs.mkdirSync(resolvedOut, { recursive: true });
} catch (err) {
  console.error('[build] FATAL: Failed to create output directory:', err.message);
  process.exit(1);
}

// Build all manifests
const report = {
  builtAt: new Date().toISOString(),
  status,
  totalFamilies: families.length,
  totalManifests: 0,
  validCount: 0,
  blockedCount: 0,
  manifests: [],
};

let totalManifests = 0;

for (const family of families) {
  for (const versionCode of family.variantCodes) {
    totalManifests++;
    let manifest;
    let compileError = null;

    try {
      manifest = compileProgram(family, versionCode, bindings);
      // Override status if different from DRAFT
      if (status !== 'DRAFT') {
        manifest.status = status;
      }
    } catch (err) {
      compileError = err.message;
      console.error(`[build] ERROR compiling ${versionCode}: ${err.message}`);
      report.manifests.push({
        versionCode,
        familyCode: family.familyCode,
        valid: false,
        blocked: true,
        issues: [{ code: 'COMPILE_ERROR', path: '', message: err.message }],
        checksum: null,
      });
      report.blockedCount++;
      continue;
    }

    // Validate
    let validation;
    try {
      validation = validateProgramManifest(manifest);
    } catch (err) {
      validation = {
        valid: false,
        issues: [{ code: 'VALIDATE_ERROR', path: '', message: err.message }],
        checksum: null,
      };
    }

    const isBlocked = !validation.valid;
    if (isBlocked) {
      report.blockedCount++;
      console.warn(`[build] BLOCKED ${versionCode}: ${validation.issues.length} issue(s)`);
      validation.issues.forEach(i => console.warn(`  - [${i.code}] ${i.path}: ${i.message}`));
    } else {
      report.validCount++;
      console.log(`[build] OK ${versionCode} (checksum: ${validation.checksum?.slice(0, 8)}...)`);
    }

    report.manifests.push({
      versionCode,
      familyCode: family.familyCode,
      valid: validation.valid,
      blocked: isBlocked,
      issues: validation.issues,
      checksum: validation.checksum,
    });

    // Write manifest file
    const outFile = path.join(resolvedOut, `${versionCode}.json`);
    try {
      fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[build] ERROR writing ${outFile}: ${err.message}`);
    }
  }
}

report.totalManifests = totalManifests;

// Write build report
const reportPath = path.join(resolvedOut, 'build-report.json');
try {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
} catch (err) {
  console.error(`[build] ERROR writing build report: ${err.message}`);
}

console.log('\n[build] ─────────────────────────────────');
console.log(`[build] Families:  ${report.totalFamilies}`);
console.log(`[build] Manifests: ${report.totalManifests}`);
console.log(`[build] Valid:     ${report.validCount}`);
console.log(`[build] Blocked:   ${report.blockedCount}`);
console.log(`[build] Report:    ${reportPath}`);
console.log('[build] Done.');
