// ThreatLens Verify Endpoint
// Verifies device registration and revocation status

import { utcNowIso, timingSafeEqual } from './crypto';
import type { 
  Env, 
  VerifyRequest, 
  VerifyResponse, 
  ErrorResponse,
  DeviceRegistration
} from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const DEBUG = env.DEBUG === 'true';
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }
    
    // Accept POST or GET
    if (request.method !== 'POST' && request.method !== 'GET') {
      return jsonResponse({ error: 'Only GET or POST methods are supported.' }, 405);
    }
    
    // Check API key authentication
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    
    // Parse request parameters
    let installID: string | undefined;
    let providedPublicKey: string | undefined;
    
    if (request.method === 'GET') {
      const url = new URL(request.url);
      installID = url.searchParams.get('installID')?.trim();
      providedPublicKey = url.searchParams.get('publicKey')?.trim();
    } else {
      try {
        const body: VerifyRequest = await request.json();
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
    
    // Query database
    const device = await env.DB.prepare(
      'SELECT * FROM trust_registry WHERE installID = ?'
    ).bind(installID).first<DeviceRegistration>();
    
    const nowIso = utcNowIso();
    
    // Device not found
    if (!device) {
      if (DEBUG) {
        console.log('[verify] Device not found:', installID);
      }
      
      const response: VerifyResponse = {
        ok: true,
        status: 'NOT_FOUND',
        installID,
        registered: false,
        revoked: false,
        publicKeyMatch: null,
        verifiedAt: nowIso,
      };
      
      return jsonResponse(response, 200);
    }
    
    // Check public key match if provided
    let publicKeyMatch: boolean | null = null;
    if (providedPublicKey) {
      publicKeyMatch = timingSafeEqual(device.publicKey, providedPublicKey);
    }
    
    // Build response
    const isRevoked = device.revoked === 1;
    const response: VerifyResponse = {
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

/**
 * Check Authorization header
 */
function checkAuth(request: Request, env: Env): boolean {
  const apiKey = env.TRUST_REGISTRY_API_KEY?.trim();
  if (!apiKey) {
    return true; // No auth required
  }
  
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.slice('Bearer '.length).trim();
  return timingSafeEqual(token, apiKey);
}

/**
 * CORS headers
 */
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '3600',
  };
}

/**
 * JSON response helper
 */
function jsonResponse(data: VerifyResponse | ErrorResponse, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
