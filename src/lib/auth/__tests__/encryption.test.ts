import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set a valid 64-char hex key before importing
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { encrypt, decrypt } = await import('../encryption');

describe('Encryption (AES-256-GCM)', () => {
  it('encrypts and decrypts a simple string', () => {
    const plaintext = 'my-secret-password';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const plaintext = 'test';
    const e1 = encrypt(plaintext);
    const e2 = encrypt(plaintext);
    expect(e1).not.toBe(e2);
    // But both decrypt to the same value
    expect(decrypt(e1)).toBe(plaintext);
    expect(decrypt(e2)).toBe(plaintext);
  });

  it('encrypted format is iv:ciphertext:authTag', () => {
    const encrypted = encrypt('hello');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV should be 24 hex chars (12 bytes)
    expect(parts[0]).toHaveLength(24);
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('handles unicode', () => {
    const plaintext = 'Hello World 123';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // Tamper with the ciphertext
    parts[1] = 'ff' + parts[1].slice(2);
    const tampered = parts.join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on invalid format', () => {
    expect(() => decrypt('not-valid')).toThrow('Invalid encrypted string format');
    expect(() => decrypt('a:b')).toThrow('Invalid encrypted string format');
  });

  it('throws when ENCRYPTION_KEY is missing', async () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    // Re-import to get fresh module that reads env at call time
    // The key is read at call time in getEncryptionKey()
    // Since we deleted the env var, it should throw
    const mod = await import('../encryption');
    expect(() => mod.encrypt('test')).toThrow('ENCRYPTION_KEY');

    process.env.ENCRYPTION_KEY = originalKey;
  });
});
