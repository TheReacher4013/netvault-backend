const crypto = require('crypto');

// ✅ FIX (Bug #15): Explicit key format (64-char hex = 32 bytes for AES-256).
//
// Original code: Buffer.from(key) — treated the env var as a UTF-8 string.
// If the developer set ENCRYPTION_KEY to a hex string (e.g. via `openssl rand -hex 32`),
// Buffer.from(hexString) would read each character's ASCII byte, NOT decode the hex,
// resulting in a 64-byte key that gets sliced to 32 bytes of the wrong data.
//
// This version:
//  - Expects ENCRYPTION_KEY as a 64-character hex string (= 32 raw bytes)
//  - Generates one for you in dev if not set (with a loud warning)
//  - Throws at startup in production if the key is missing or wrong length
//
// Generate a valid key with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const DEV_FALLBACK_KEY = 'a'.repeat(64); // 32 bytes of 0xAA — dev only, never production

const rawKey = process.env.ENCRYPTION_KEY;

if (!rawKey) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[encrypt.service] ENCRYPTION_KEY environment variable is required in production.\n' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  console.warn(
    '[encrypt.service] WARNING: ENCRYPTION_KEY not set. Using insecure dev fallback. ' +
    'Set ENCRYPTION_KEY in your .env file before storing real credentials.'
  );
}

const keyHex = rawKey || DEV_FALLBACK_KEY;

if (keyHex.length !== 64) {
  throw new Error(
    `[encrypt.service] ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Got ${keyHex.length} characters.`
  );
}

const KEY = Buffer.from(keyHex, 'hex'); // correctly parses hex → 32-byte Buffer

const ALGORITHM = 'aes-256-cbc';

const encryptData = (text) => {
  const iv = crypto.randomBytes(16); // random IV per encryption = no pattern leakage
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

const decryptData = (encryptedText) => {
  if (!encryptedText || !encryptedText.includes(':')) {
    throw new Error('Invalid encrypted data format');
  }
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encryptData, decryptData };
