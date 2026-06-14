// Cryptographic utilities for ThreatLens Workers
// Ports Python cryptography functions to Web Crypto API

const P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;

/**
 * Canonical JSON serialization (sorted keys, compact)
 */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(sortObject(obj), null, 0);
}

function sortObject(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Parse PEM private key to CryptoKey
 */
export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemNormalized = pem.replace(/\\n/g, '\n').trim();
  const pemBody = pemNormalized
    .replace('-----BEGIN EC PRIVATE KEY-----', '')
    .replace('-----END EC PRIVATE KEY-----', '')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );
}

/**
 * Sign message with P-256 private key and normalize to low-S
 */
export async function signMessage(message: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  
  // Sign with ECDSA SHA-256
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );
  
  // Web Crypto API returns raw signature (r || s, 64 bytes)
  // Convert to DER and normalize to low-S
  const rawSig = new Uint8Array(signature);
  const derSig = rawToDer(rawSig);
  const normalizedDer = normalizeLowS(derSig);
  
  return btoa(String.fromCharCode(...normalizedDer));
}

/**
 * Convert raw P-256 signature (64 bytes) to DER format
 */
function rawToDer(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) {
    throw new Error('Invalid raw signature length');
  }
  
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);
  
  const rDer = encodeInteger(r);
  const sDer = encodeInteger(s);
  
  const sequence = new Uint8Array(rDer.length + sDer.length);
  sequence.set(rDer, 0);
  sequence.set(sDer, rDer.length);
  
  const result = new Uint8Array(2 + sequence.length);
  result[0] = 0x30; // SEQUENCE tag
  result[1] = sequence.length;
  result.set(sequence, 2);
  
  return result;
}

/**
 * Encode integer for DER
 */
function encodeInteger(value: Uint8Array): Uint8Array {
  // Remove leading zeros
  let start = 0;
  while (start < value.length && value[start] === 0) {
    start++;
  }
  
  if (start === value.length) {
    start = value.length - 1;
  }
  
  const trimmed = value.slice(start);
  
  // Add leading zero if high bit is set (negative in two's complement)
  const needsPadding = trimmed[0] >= 0x80;
  const length = trimmed.length + (needsPadding ? 1 : 0);
  
  const result = new Uint8Array(2 + length);
  result[0] = 0x02; // INTEGER tag
  result[1] = length;
  
  if (needsPadding) {
    result[2] = 0x00;
    result.set(trimmed, 3);
  } else {
    result.set(trimmed, 2);
  }
  
  return result;
}

/**
 * Normalize DER signature to low-S form
 * Required for compatibility with @noble/curves v2 which enforces low-S
 */
function normalizeLowS(der: Uint8Array): Uint8Array {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Invalid DER signature');
  }
  
  let offset = 2;
  
  // Parse r
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER');
  }
  const rLen = der[offset + 1];
  offset += 2;
  let r = der.slice(offset, offset + rLen);
  offset += rLen;
  
  // Parse s
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER');
  }
  const sLen = der[offset + 1];
  offset += 2;
  let s = der.slice(offset, offset + sLen);
  
  // Remove leading zeros from s
  while (s.length > 1 && s[0] === 0x00) {
    s = s.slice(1);
  }
  
  // Convert s to BigInt
  let sBig = 0n;
  for (const byte of s) {
    sBig = (sBig << 8n) | BigInt(byte);
  }
  
  // Normalize to low-S if needed
  const halfOrder = P256_ORDER >> 1n;
  if (sBig > halfOrder) {
    sBig = P256_ORDER - sBig;
  }
  
  // Convert back to bytes
  const sNormalized = bigIntToBytes(sBig, 32);
  
  // Re-encode DER
  const rDer = encodeInteger(r);
  const sDer = encodeInteger(sNormalized);
  
  const sequence = new Uint8Array(rDer.length + sDer.length);
  sequence.set(rDer, 0);
  sequence.set(sDer, rDer.length);
  
  const result = new Uint8Array(2 + sequence.length);
  result[0] = 0x30;
  result[1] = sequence.length;
  result.set(sequence, 2);
  
  return result;
}

/**
 * Convert BigInt to Uint8Array (big-endian)
 */
function bigIntToBytes(value: BigInt, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return bytes;
}

/**
 * Get current UTC timestamp in ISO 8601 format
 */
export function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Constant-time string comparison (prevents timing attacks)
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
