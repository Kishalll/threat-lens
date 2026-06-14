// ThreatLens Register Endpoint
// Registers devices and issues master-signed certificates

import { canonicalJson, importPrivateKey, signMessage, utcNowIso, timingSafeEqual } from './crypto';
import type { 
  Env, 
  RegisterRequest, 
  RegisterResponse, 
  ErrorResponse,
  MasterCert,
  SignedMasterCert
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
    
    // Only accept POST
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Only POST method is supported.' }, 405);
    }
    
    // Check API key authentication
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    
    // Parse request body
    let body: RegisterRequest;
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
    
    // Validate required fields
    if (!installID) {
      return jsonResponse({ error: 'installID is required' }, 400);
    }
    if (!publicKey) {
      return jsonResponse({ error: 'publicKey is required' }, 400);
    }
    
    if (DEBUG) {
      console.log('[register] Request:', { installID, deviceModel, appVersion });
    }
    
    const nowIso = utcNowIso();
    
    // Check if device already exists
    const existing = await env.DB.prepare(
      'SELECT * FROM trust_registry WHERE installID = ?'
    ).bind(installID).first();
    
    if (existing && existing.revoked === 1) {
      if (DEBUG) {
        console.log('[register] Device is revoked:', installID);
      }
      return jsonResponse({
        ok: false,
        status: 'REVOKED',
        installID,
        message: 'This installID is revoked and cannot be re-registered.',
      }, 403);
    }
    
    // Build master certificate
    const certPayload: MasterCert = {
      v: 1,
      issuer: 'ThreatLens Master CA',
      issuedAt: nowIso,
      installID,
      publicKey,
    };
    
    // Sign certificate
    let masterCertBlob: string;
    try {
      const privateKey = await importPrivateKey(env.MASTER_PRIVATE_KEY_PEM);
      const certJson = canonicalJson(certPayload);
      const signature = await signMessage(certJson, privateKey);
      
      const signedCert: SignedMasterCert = {
        cert: certPayload,
        sig: signature,
      };
      
      const encoder = new TextEncoder();
      const certBlobBytes = encoder.encode(canonicalJson(signedCert));
      masterCertBlob = btoa(String.fromCharCode(...certBlobBytes));
      
      if (DEBUG) {
        console.log('[register] Signed cert:', { certBlobLength: masterCertBlob.length });
      }
    } catch (error) {
      console.error('[register] Failed to sign certificate:', error);
      return jsonResponse({ error: `Failed to sign certificate: ${error}` }, 500);
    }
    
    // Insert or update database
    try {
      if (existing) {
        await env.DB.prepare(`
          UPDATE trust_registry 
          SET publicKey = ?, deviceModel = ?, appVersion = ?, appBuildNumber = ?,
              masterCert = ?, updatedAt = ?
          WHERE installID = ?
        `).bind(
          publicKey, deviceModel, appVersion, appBuildNumber,
          masterCertBlob, nowIso, installID
        ).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO trust_registry 
          (installID, publicKey, deviceModel, appVersion, appBuildNumber, masterCert, revoked, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).bind(
          installID, publicKey, deviceModel, appVersion, appBuildNumber,
          masterCertBlob, nowIso, nowIso
        ).run();
      }
      
      if (DEBUG) {
        console.log('[register] Database updated:', installID);
      }
    } catch (error) {
      console.error('[register] Database error:', error);
      return jsonResponse({ error: 'Failed to store registration' }, 500);
    }
    
    // Build verify URL from current request
    const url = new URL(request.url);
    const verifyURL = `${url.protocol}//${url.host.replace('register', 'verify')}`;
    
    const response: RegisterResponse = {
      ok: true,
      status: 'ACTIVE',
      installID,
      masterCert: masterCertBlob,
      cloudVerifyURL: verifyURL,
      registeredAt: nowIso,
    };
    
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
function jsonResponse(data: RegisterResponse | ErrorResponse | Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
