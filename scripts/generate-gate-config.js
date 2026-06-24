#!/usr/bin/env node
/**
 * Generates src/gate.config.js from a password using PBKDF2-SHA256 + random salt.
 *
 * Usage:
 *   node scripts/generate-gate-config.js "your-password"
 *   GATE_PASSWORD="your-password" node scripts/generate-gate-config.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const password = process.env.GATE_PASSWORD || process.argv[2];

if (!password) {
  console.error('Usage: node scripts/generate-gate-config.js "your-password"');
  console.error('   or: GATE_PASSWORD="your-password" node scripts/generate-gate-config.js');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');

const output = `export const GATE_PBKDF2_ITERATIONS = ${ITERATIONS};
export const GATE_PASSWORD_SALT_B64 = ${JSON.stringify(salt.toString('base64'))};
export const GATE_PASSWORD_HASH_B64 = ${JSON.stringify(hash.toString('base64'))};
`;

const target = path.join(__dirname, '..', 'src', 'gate.config.js');
fs.writeFileSync(target, output, 'utf8');
console.log(`Wrote ${target}`);
