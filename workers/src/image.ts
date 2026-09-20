// ThreatLens Image Registry Endpoint
// Stores and looks up signed payloads for DCT-watermarked images

import { utcNowIso, timingSafeEqual } from './crypto';
import type {
  Env,
  ImageStoreRequest,
  ImageStoreResponse,
  ImageLookupResponse,
  ErrorResponse,
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

    // Check API key authentication
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    // Lookup route: GET /lookup?watermarkId=... or GET ?watermarkId=...
    if (request.method === 'GET' || path.endsWith('/lookup')) {
      const watermarkId = url.searchParams.get('watermarkId')?.trim().toLowerCase();
      if (!watermarkId) {
        return jsonResponse({ error: 'watermarkId is required' }, 400);
      }

      if (DEBUG) {
        console.log('[image:lookup] Request:', watermarkId);
      }

      const row = await env.DB.prepare(
        'SELECT * FROM image_registry WHERE watermarkId = ?'
      ).bind(watermarkId).first<{
        watermarkId: string;
        installID: string;
        payloadJson: string;
        createdAt: string;
      }>();

      if (!row) {
        if (DEBUG) {
          console.log('[image:lookup] Not found:', watermarkId);
        }
        const notFound: ImageLookupResponse = {
          ok: false,
          watermarkId,
          error: 'Image record not found',
        };
        return jsonResponse(notFound, 404);
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(row.payloadJson);
      } catch {
        // Return raw if JSON parsing fails
      }

      const response: ImageLookupResponse = {
        ok: true,
        watermarkId,
        payload,
        createdAt: row.createdAt,
      };

      return jsonResponse(response, 200);
    }

    // Store route: POST /store or POST /
    if (request.method === 'POST') {
      let body: ImageStoreRequest;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const watermarkId = body.watermarkId?.trim().toLowerCase();
      const payload = body.payload;

      if (!watermarkId) {
        return jsonResponse({ error: 'watermarkId is required' }, 400);
      }
      if (!payload || typeof payload !== 'object') {
        return jsonResponse({ error: 'payload is required' }, 400);
      }

      const installID = typeof payload.installID === 'string' ? payload.installID : 'unknown';
      const nowIso = utcNowIso();
      const payloadJson = JSON.stringify(payload);

      try {
        await env.DB.prepare(`
          INSERT INTO image_registry (watermarkId, installID, payloadJson, createdAt)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(watermarkId) DO UPDATE SET
            payloadJson = excluded.payloadJson
        `).bind(watermarkId, installID, payloadJson, nowIso).run();

        if (DEBUG) {
          console.log('[image:store] Stored watermark payload:', watermarkId);
        }

        const response: ImageStoreResponse = {
          ok: true,
          watermarkId,
          storedAt: nowIso,
        };

        return jsonResponse(response, 200);
      } catch (error) {
        console.error('[image:store] Database error:', error);
        return jsonResponse({ error: 'Failed to store image record' }, 500);
      }
    }

    return jsonResponse({ error: 'Method not supported' }, 405);
  },
};

function checkAuth(request: Request, env: Env): boolean {
  const apiKey = env.TRUST_REGISTRY_API_KEY?.trim();
  if (!apiKey) {
    return true;
  }

  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return timingSafeEqual(token, apiKey);
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '3600',
  };
}

function jsonResponse(
  data: ImageStoreResponse | ImageLookupResponse | ErrorResponse | Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
