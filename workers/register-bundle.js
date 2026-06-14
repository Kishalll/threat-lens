// ThreatLens Register Worker - Single File Bundle
// Deploy this via Cloudflare Dashboard

const P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;

function canonicalJson(obj) {
  return JSON.stringify(sortObject(obj), null, 0);
}

function sortObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = sortObject(obj[key]);
    }
    return sorted;
  }
  return obj;
}

async function importPrivateKey(pem) {
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
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function signMessage(message, privateKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    data
  );
  
  const rawSig = new Uint8Array(signature);
  const derSig = rawToDer(rawSig);
  const normalizedDer = normalizeLowS(derSig);
  
  return btoa(String.fromCharCode(...normalizedDer));
}

function rawToDer(raw) {
  if (raw.length !== 64) throw new Error('Invalid raw signature length');
  
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);
  const rDer = encodeInteger(r);
  const sDer = encodeInteger(s);
  const sequence = new Uint8Array(rDer.length + sDer.length);
  sequence.set(rDer, 0);
  sequence.set(sDer, rDer.length);
  const result = new Uint8Array(2 + sequence.length);
  result[0] = 0x30;
  result[1] = sequence.length;
  result.set(sequence, 2);
  return result;
}

function encodeInteger(value) {
  let start = 0;
  while (start < value.length && value[start] === 0) start++;
  if (start === value.length) start = value.length - 1;
  const trimmed = value.slice(start);
  const needsPadding = trimmed[0] >= 0x80;
  const length = trimmed.length + (needsPadding ? 1 : 0);
  const result = new Uint8Array(2 + length);
  result[0] = 0x02;
  result[1] = length;
  if (needsPadding) {
    result[2] = 0x00;
    result.set(trimmed, 3);
  } else {
    result.set(trimmed, 2);
  }
  return result;
}

function normalizeLowS(der) {
  if (der.length < 8 || der[0] !== 0x30) throw new Error('Invalid DER signature');
  let offset = 2;
  if (der[offset] !== 0x02) throw new Error('Invalid DER signature: expected INTEGER');
  const rLen = der[offset + 1];
  offset += 2;
  let r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset] !== 0x02) throw new Error('Invalid DER signature: expected INTEGER');
  const sLen = der[offset + 1];
  offset += 2;
  let s = der.slice(offset, offset + sLen);
  while (s.length > 1 && s[0] === 0x00) s = s.slice(1);
  let sBig = 0n;
  for (const byte of s) sBig = (sBig << 8n) | BigInt(byte);
  const halfOrder = P256_ORDER >> 1n;
  if (sBig > halfOrder) sBig = P256_ORDER - sBig;
  const sNormalized = bigIntToBytes(sBig, 32);
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

function bigIntToBytes(value, length) {
  const bytes = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return bytes;
}

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '3600',
  };
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function checkAuth(request, env) {
  const apiKey = env.TRUST_REGISTRY_API_KEY?.trim();
  if (!apiKey) return true;
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length).trim();
  return timingSafeEqual(token, apiKey);
}

export default {
  async fetch(request, env) {
    const DEBUG = env.DEBUG === 'true';
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Only POST method is supported.' }, 405);
    }
    
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
    
    const installID = body.installID?.trim();
    const publicKey = body.publicKey?.trim();
    const deviceModel = body.deviceModel?.trim() || 'unknown-device';
    const appVersion = body.appVersion?.trim() || '0.0.0';
    const appBuildNumber = body.appBuildNumber || 0;
    
    if (!installID) return jsonResponse({ error: 'installID is required' }, 400);
    if (!publicKey) return jsonResponse({ error: 'publicKey is required' }, 400);
    
    if (DEBUG) console.log('[register] Request:', { installID, deviceModel, appVersion });
    
    const nowIso = utcNowIso();
    
    const existing = await env.DB.prepare('SELECT * FROM trust_registry WHERE installID = ?')
      .bind(installID).first();
    
    if (existing && existing.revoked === 1) {
      if (DEBUG) console.log('[register] Device is revoked:', installID);
      return jsonResponse({
        ok: false,
        status: 'REVOKED',
        installID,
        message: 'This installID is revoked and cannot be re-registered.',
      }, 403);
    }
    
    const certPayload = {
      v: 1,
      issuer: 'ThreatLens Master CA',
      issuedAt: nowIso,
      installID,
      publicKey,
    };
    
    let masterCertBlob;
    try {
      const privateKey = await importPrivateKey(env.MASTER_PRIVATE_KEY_PEM);
      const certJson = canonicalJson(certPayload);
      const signature = await signMessage(certJson, privateKey);
      const signedCert = { cert: certPayload, sig: signature };
      const encoder = new TextEncoder();
      const certBlobBytes = encoder.encode(canonicalJson(signedCert));
      masterCertBlob = btoa(String.fromCharCode(...certBlobBytes));
      if (DEBUG) console.log('[register] Signed cert:', { certBlobLength: masterCertBlob.length });
    } catch (error) {
      console.error('[register] Failed to sign certificate:', error);
      return jsonResponse({ error: `Failed to sign certificate: ${error}` }, 500);
    }
    
    try {
      if (existing) {
        await env.DB.prepare(`
          UPDATE trust_registry 
          SET publicKey = ?, deviceModel = ?, appVersion = ?, appBuildNumber = ?,
              masterCert = ?, updatedAt = ?
          WHERE installID = ?
        `).bind(publicKey, deviceModel, appVersion, appBuildNumber, masterCertBlob, nowIso, installID).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO trust_registry 
          (installID, publicKey, deviceModel, appVersion, appBuildNumber, masterCert, revoked, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).bind(installID, publicKey, deviceModel, appVersion, appBuildNumber, masterCertBlob, nowIso, nowIso).run();
      }
      if (DEBUG) console.log('[register] Database updated:', installID);
    } catch (error) {
      console.error('[register] Database error:', error);
      return jsonResponse({ error: 'Failed to store registration' }, 500);
    }
    
    const url = new URL(request.url);
    const verifyURL = `${url.protocol}//${url.host.replace('register', 'verify')}`;
    
    return jsonResponse({
      ok: true,
      status: 'ACTIVE',
      installID,
      masterCert: masterCertBlob,
      cloudVerifyURL: verifyURL,
      registeredAt: nowIso,
    }, 200);
  },
};
