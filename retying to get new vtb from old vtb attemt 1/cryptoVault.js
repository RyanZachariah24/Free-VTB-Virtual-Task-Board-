// src/cryptoVault.js - Zero-Knowledge AES-256-GCM + RSA-OAEP Encryption Vault

const toBase64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const fromBase64 = (str) =>
  Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

// 1. Generate a unique AES-256-GCM key for each board
export async function generateBoardKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// 2. Encrypt a task object BEFORE saving to Firestore
export async function encryptTask(boardKey, taskObj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(taskObj));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    boardKey,
    encoded
  );

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(cipherBuffer),
  };
}

// 3. Decrypt a task object AFTER reading from Firestore
export async function decryptTask(boardKey, encryptedData) {
  const iv = fromBase64(encryptedData.iv);
  const cipherBytes = fromBase64(encryptedData.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    boardKey,
    cipherBytes
  );

  return JSON.parse(new TextDecoder().decode(decryptedBuffer));
}

// 4. Generate User RSA-OAEP Keypair (for sharing board keys securely)
export async function generateUserKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["wrapKey", "unwrapKey"]
  );
}

export async function exportPublicKey(publicKey) {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return toBase64(spki);
}

export async function importPublicKey(base64Spki) {
  return crypto.subtle.importKey(
    "spki",
    fromBase64(base64Spki),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["wrapKey"]
  );
}

// Derive key from user's Vault Passphrase to protect their Private Key across devices
async function derivePassphraseKey(passphrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPrivateKey(privateKey, passphrase) {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await derivePassphraseKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    pkcs8
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(encrypted),
  };
}

export async function decryptPrivateKey(encryptedPrivateKey, passphrase) {
  const salt = fromBase64(encryptedPrivateKey.salt);
  const iv = fromBase64(encryptedPrivateKey.iv);
  const cipher = fromBase64(encryptedPrivateKey.ciphertext);
  const aesKey = await derivePassphraseKey(passphrase, salt);

  const pkcs8 = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    cipher
  );

  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["unwrapKey"]
  );
}

// 5. Wrap/Unwrap a Board Key for a specific board member
export async function wrapBoardKeyForUser(boardKey, memberPublicKeyBase64) {
  const pubKey = await importPublicKey(memberPublicKeyBase64);
  const wrapped = await crypto.subtle.wrapKey(
    "raw",
    boardKey,
    pubKey,
    { name: "RSA-OAEP" }
  );
  return toBase64(wrapped);
}

export async function unwrapBoardKey(wrappedBase64, userPrivateKey) {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrappedBase64),
    userPrivateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
