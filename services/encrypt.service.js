const crypto = require('crypto');


const DEV_FALLBACK_KEY = 'a'.repeat(64); 
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

const KEY = Buffer.from(keyHex, 'hex'); 

const ALGORITHM = 'aes-256-cbc';

const encryptData = (text) => {
  const iv = crypto.randomBytes(16);
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
