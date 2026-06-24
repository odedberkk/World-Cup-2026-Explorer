#!/usr/bin/env node
/**
 * Generates src/gate.config.js and encrypted src/blaze.config.js.
 *
 * Usage:
 *   GATE_PASSWORD="..." BLAZE_API_KEY="..." node scripts/generate-secrets-config.js
 *   node scripts/generate-secrets-config.js "your-password" "your-blaze-api-key"
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const BLAZE_KEY_LABEL = '|blaze-key-v1';

const password = process.env.GATE_PASSWORD || process.argv[2];
const blazeApiKey = process.env.BLAZE_API_KEY || process.argv[3];

if (!password || !blazeApiKey) {
  console.error('Usage: node scripts/generate-secrets-config.js "password" "blaze-api-key"');
  console.error('   or: GATE_PASSWORD="..." BLAZE_API_KEY="..." node scripts/generate-secrets-config.js');
  process.exit(1);
}

function deriveVerifyHash(salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

function deriveBlazeAesKey(salt) {
  const material = Buffer.concat([
    Buffer.from(password, 'utf8'),
    Buffer.from(BLAZE_KEY_LABEL, 'utf8'),
  ]);
  return crypto.pbkdf2Sync(material, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

function encryptBlazeApiKey(apiKey, aesKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { iv, ciphertext };
}

const salt = crypto.randomBytes(16);
const verifyHash = deriveVerifyHash(salt);
const aesKey = deriveBlazeAesKey(salt);
const { iv, ciphertext } = encryptBlazeApiKey(blazeApiKey, aesKey);

const gateConfig = `export const GATE_PBKDF2_ITERATIONS = ${ITERATIONS};
export const GATE_PASSWORD_SALT_B64 = ${JSON.stringify(salt.toString('base64'))};
export const GATE_PASSWORD_HASH_B64 = ${JSON.stringify(verifyHash.toString('base64'))};
`;

const blazeConfig = `export const BLAZE_API_KEY_CIPHERTEXT_B64 = ${JSON.stringify(ciphertext.toString('base64'))};
export const BLAZE_API_KEY_IV_B64 = ${JSON.stringify(iv.toString('base64'))};
`;

const srcDir = path.join(__dirname, '..', 'src');
fs.writeFileSync(path.join(srcDir, 'gate.config.js'), gateConfig, 'utf8');
fs.writeFileSync(path.join(srcDir, 'blaze.config.js'), blazeConfig, 'utf8');
console.log('Wrote src/gate.config.js');
console.log('Wrote src/blaze.config.js (encrypted)');
