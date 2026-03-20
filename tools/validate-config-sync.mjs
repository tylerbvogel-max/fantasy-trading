#!/usr/bin/env node
/**
 * Validates that tools/bounty-sim/config.mjs stays in sync with
 * backend/app/services/bounty_config.py (backend is source of truth).
 *
 * Usage: node tools/validate-config-sync.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pyFile = readFileSync(join(root, 'backend/app/services/bounty_config.py'), 'utf-8');
const mjsFile = readFileSync(join(root, 'tools/bounty-sim/config.mjs'), 'utf-8');

let errors = 0;

function extractNestedDict(src, varName, lang) {
  // Extract a nested dict like DIR_SCORING = { 1: {"win": 13, "lose": 11}, ... }
  // Works for both Python and JS syntax
  const pairs = {};
  // Find all entries like: 1: { win: 13, lose: 11 } or 1: {"win": 13, "lose": 11}
  const pattern = lang === 'py'
    ? new RegExp(`(?<=(?:^${varName}\\s*=\\s*\\{|,)\\s*\\n?\\s*)` +
        `(\\d+):\\s*\\{([^}]+)\\}`, 'gm')
    : new RegExp(`(\\d+):\\s*\\{([^}]+)\\}`, 'g');

  // Find the block for this variable
  let block;
  if (lang === 'py') {
    const startRe = new RegExp(`^${varName}\\s*=\\s*\\{`, 'm');
    const startM = startRe.exec(src);
    if (!startM) return null;
    // Find matching closing brace (count nesting)
    let depth = 1, i = startM.index + startM[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    block = src.slice(startM.index, i);
  } else {
    const startRe = new RegExp(`export\\s+const\\s+${varName}\\s*=\\s*\\{`);
    const startM = startRe.exec(src);
    if (!startM) return null;
    let depth = 1, i = startM.index + startM[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    block = src.slice(startM.index, i);
  }

  const entryRe = /(\d+):\s*\{([^}]+)\}/g;
  let m;
  while ((m = entryRe.exec(block)) !== null) {
    const key = m[1];
    const inner = {};
    const kvRe = /"?(\w+)"?\s*:\s*([\d.]+)/g;
    let kv;
    while ((kv = kvRe.exec(m[2])) !== null) {
      inner[kv[1]] = parseFloat(kv[2]);
    }
    pairs[key] = inner;
  }
  return Object.keys(pairs).length > 0 ? pairs : null;
}

function extractFlatDict(src, varName, lang) {
  let block;
  if (lang === 'py') {
    const startRe = new RegExp(`^${varName}\\s*=\\s*\\{`, 'm');
    const startM = startRe.exec(src);
    if (!startM) return null;
    let depth = 1, i = startM.index + startM[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    block = src.slice(startM.index, i);
  } else {
    const startRe = new RegExp(`export\\s+const\\s+${varName}\\s*=\\s*\\{`);
    const startM = startRe.exec(src);
    if (!startM) return null;
    let depth = 1, i = startM.index + startM[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    block = src.slice(startM.index, i);
  }

  const pairs = {};
  const kvRe = /(\d+):\s*([\d.]+)/g;
  let kv;
  while ((kv = kvRe.exec(block)) !== null) {
    pairs[kv[1]] = parseFloat(kv[2]);
  }
  return Object.keys(pairs).length > 0 ? pairs : null;
}

function extractPyScalar(src, varName) {
  const re = new RegExp(`^${varName}\\s*=\\s*(-?[\\d.]+)`, 'm');
  const m = src.match(re);
  return m ? parseFloat(m[1]) : null;
}

function extractJsScalar(src, varName) {
  const re = new RegExp(`export\\s+const\\s+${varName}\\s*=\\s*(-?[\\d.]+)`, 'm');
  const m = src.match(re);
  return m ? parseFloat(m[1]) : null;
}

function compareDict(name, pyDict, jsDict) {
  if (!pyDict || !jsDict) {
    console.error(`  ✗ ${name}: could not parse (py=${!!pyDict}, js=${!!jsDict})`);
    errors++;
    return;
  }
  const allKeys = new Set([...Object.keys(pyDict), ...Object.keys(jsDict)]);
  for (const key of [...allKeys].sort((a, b) => parseInt(a) - parseInt(b))) {
    const pyVal = pyDict[key];
    const jsVal = jsDict[key];
    if (pyVal === undefined) {
      console.error(`  ✗ ${name}[${key}]: missing in backend, sim=${JSON.stringify(jsVal)}`);
      errors++;
    } else if (jsVal === undefined) {
      console.error(`  ✗ ${name}[${key}]: backend=${JSON.stringify(pyVal)}, missing in sim`);
      errors++;
    } else if (typeof pyVal === 'object' && typeof jsVal === 'object') {
      const subKeys = new Set([...Object.keys(pyVal), ...Object.keys(jsVal)]);
      for (const sk of subKeys) {
        if (pyVal[sk] !== jsVal[sk]) {
          console.error(`  ✗ ${name}[${key}].${sk}: backend=${pyVal[sk]}, sim=${jsVal[sk]}`);
          errors++;
        }
      }
    } else if (pyVal !== jsVal) {
      console.error(`  ✗ ${name}[${key}]: backend=${pyVal}, sim=${jsVal}`);
      errors++;
    }
  }
}

function compareScalar(name, pyVal, jsVal) {
  if (pyVal === null || jsVal === null) {
    console.error(`  ✗ ${name}: could not parse (py=${pyVal}, js=${jsVal})`);
    errors++;
    return;
  }
  if (pyVal !== jsVal) {
    console.error(`  ✗ ${name}: backend=${pyVal}, sim=${jsVal}`);
    errors++;
  }
}

console.log('Validating config sync: backend ↔ sim\n');

// Nested scoring tables
compareDict('DIR_SCORING',
  extractNestedDict(pyFile, 'DIR_SCORING', 'py'),
  extractNestedDict(mjsFile, 'DIR_SCORING', 'js'));
compareDict('HOL_SCORING',
  extractNestedDict(pyFile, 'HOL_SCORING', 'py'),
  extractNestedDict(mjsFile, 'HOL_SCORING', 'js'));

// Flat dict
compareDict('WANTED_MULT',
  extractFlatDict(pyFile, 'WANTED_MULT', 'py'),
  extractFlatDict(mjsFile, 'WANTED_MULT', 'js'));

// Scalars
const scalars = [
  'NOTORIETY_UP_THRESHOLD', 'NOTORIETY_DOWN_THRESHOLD',
  'ANTE_BASE', 'STARTING_CHAMBERS', 'MAX_CHAMBERS',
  'WANTED_OVERFLOW_BASE',
];
for (const name of scalars) {
  compareScalar(name, extractPyScalar(pyFile, name), extractJsScalar(mjsFile, name));
}

if (errors === 0) {
  console.log('  ✓ All checked parameters are in sync');
} else {
  console.error(`\n${errors} desync(s) found! Backend is source of truth.`);
}

process.exit(errors > 0 ? 1 : 0);
