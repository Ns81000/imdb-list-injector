// src/lib/crypto.js
//
// Passphrase-based encryption for the user's TMDB API key. The key is never
// stored in plaintext: we derive an AES-GCM key from the user's passphrase with
// PBKDF2 (per-record random salt) and persist only the ciphertext + salt + iv.
//
// Exposes globalThis.ImmersiveCrypto — a plain global so the same file loads in
// both the popup (classic script) and the immersive page under a strict
// `script-src 'self'` CSP. No bundler, no modules.

(function () {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const PBKDF2_ITERATIONS = 250000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const VERSION = 1;

  const toB64 = (bytes) => {
    let bin = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  };

  const fromB64 = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  async function deriveKey(passphrase, salt, iterations) {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt `plaintext` under `passphrase`. Returns a serializable record.
  async function encrypt(plaintext, passphrase) {
    if (!plaintext) throw new Error('Nothing to encrypt');
    if (!passphrase) throw new Error('Passphrase required');
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    );
    return {
      v: VERSION,
      iterations: PBKDF2_ITERATIONS,
      salt: toB64(salt),
      iv: toB64(iv),
      ct: toB64(ct)
    };
  }

  // Decrypt a record produced by encrypt(). Throws on a wrong passphrase (the
  // AES-GCM auth tag fails to verify), which callers surface as "wrong
  // passphrase".
  async function decrypt(record, passphrase) {
    if (!record || typeof record !== 'object') throw new Error('No encrypted key stored');
    if (!passphrase) throw new Error('Passphrase required');
    const salt = fromB64(record.salt);
    const iv = fromB64(record.iv);
    const ct = fromB64(record.ct);
    const iterations = Number(record.iterations) || PBKDF2_ITERATIONS;
    const key = await deriveKey(passphrase, salt, iterations);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return dec.decode(pt);
    } catch {
      throw new Error('Wrong passphrase');
    }
  }

  function isEncryptedRecord(v) {
    return !!v && typeof v === 'object' && v.ct && v.salt && v.iv;
  }

  globalThis.ImmersiveCrypto = { encrypt, decrypt, isEncryptedRecord };
})();
