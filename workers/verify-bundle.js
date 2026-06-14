// ThreatLens Verify Worker - Single File Bundle
// Deploy this via Cloudflare Dashboard

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
    
    if (request.method !== 'POST' && request.method !== 'GET') {
      return jsonResponse({ error: 'Only GET or POST methods are supported.' }, 405);
    }
    
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    
    let installID;
    let providedPublicKey;
    
    if (request.method === 'GET') {
      const url = new URL(request.url);
      installID = url.searchParams.get('installID')?.trim();
      providedPublicKey = url.searchParams.get('publicKey')?.trim();
    } else {
      try {
        const body = await request.json();
        installID = body.installID?.trim();
        providedPublicKey = body.publicKey?.trim();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }
    }
    
    if (!installID) {
      return jsonResponse({ error: 'installID is required' }, 400);
    }
    
    if (DEBUG) {
      console.log('[verify] Request:', { installID, hasPublicKey: !!providedPublicKey });
    }
    
    const device = await env.DB.prepare('SELECT * FROM trust_registry WHERE installID = ?')
      .bind(installID).first();
    
    const nowIso = utcNowIso();
    
    if (!device) {
      if (DEBUG) console.log('[verify] Device not found:', installID);
      return jsonResponse({
        ok: true,
        status: 'NOT_FOUND',
        installID,
        registered: false,
        revoked: false,
        publicKeyMatch: null,
        verifiedAt: nowIso,
      }, 200);
    }
    
    let publicKeyMatch = null;
    if (providedPublicKey) {
      publicKeyMatch = timingSafeEqual(device.publicKey, providedPublicKey);
    }
    
    const isRevoked = device.revoked === 1;
    const response = {
      ok: true,
      status: isRevoked ? 'REVOKED' : 'ACTIVE',
      installID,
      registered: true,
      revoked: isRevoked,
      publicKey: device.publicKey,
      publicKeyMatch,
      masterCert: device.masterCert,
      updatedAt: device.updatedAt,
      verifiedAt: nowIso,
    };
    
    if (DEBUG) {
      console.log('[verify] Response:', { status: response.status, publicKeyMatch });
    }
    
    return jsonResponse(response, 200);
  },
};
