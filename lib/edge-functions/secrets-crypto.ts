/**
 * Secrets Encryption Utilities
 *
 * Provides AES-256-GCM encryption for storing secrets securely.
 * Uses environment variable SECRETS_ENCRYPTION_KEY for the master key.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits

export interface EncryptedSecret {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

/**
 * Get the encryption key from environment variable
 * @throws Error if SECRETS_ENCRYPTION_KEY is not set or invalid
 */
export function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.SECRETS_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('SECRETS_ENCRYPTION_KEY environment variable not set');
  }

  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Invalid SECRETS_ENCRYPTION_KEY: expected ${KEY_LENGTH} bytes, got ${key.length}`
    );
  }

  return key;
}

/**
 * Check if encryption key is configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a secret value
 * @param plaintext The secret value to encrypt
 * @returns Encrypted data with IV and auth tag
 */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return {
    encryptedValue: encrypted,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/**
 * Decrypt an encrypted secret
 * @param encryptedValue The encrypted value (base64)
 * @param iv The initialization vector (base64)
 * @param authTag The authentication tag (base64)
 * @returns The decrypted plaintext
 */
export function decryptSecret(
  encryptedValue: string,
  iv: string,
  authTag: string
): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  let decrypted = decipher.update(encryptedValue, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a new encryption key (for initial setup)
 * @returns Base64-encoded 256-bit key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}
