# ThreatLens Cloudflare Workers

Trust registry backend running on Cloudflare Workers + D1.

## Prerequisites

- Cloudflare account (free tier)
- Node.js 18+
- Wrangler CLI (installed via npx)

## Setup Instructions

### 1. Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser for OAuth authentication.

### 2. Create D1 Database

```bash
npx wrangler d1 create threatlens_trust_registry
```

This will output a database ID. Copy it and update `wrangler.toml`:

```toml
database_id = "YOUR_DATABASE_ID_HERE"
```

### 3. Run Database Migrations

```bash
npx wrangler d1 execute threatlens_trust_registry --file=schema.sql
```

Verify schema:

```bash
npx wrangler d1 execute threatlens_trust_registry --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### 4. Configure Secrets

Store master private key:

```bash
cat ../master_private.pem | npx wrangler secret put MASTER_PRIVATE_KEY_PEM --name threatlens-register
cat ../master_private.pem | npx wrangler secret put MASTER_PRIVATE_KEY_PEM --name threatlens-verify
```

Store API key:

```bash
echo "YOUR_API_KEY" | npx wrangler secret put TRUST_REGISTRY_API_KEY --name threatlens-register
echo "YOUR_API_KEY" | npx wrangler secret put TRUST_REGISTRY_API_KEY --name threatlens-verify
```

Enable debug mode (optional, for testing):

```bash
echo "true" | npx wrangler secret put DEBUG --name threatlens-register
echo "true" | npx wrangler secret put DEBUG --name threatlens-verify
```

### 5. Deploy Workers

Deploy register endpoint:

```bash
npx wrangler deploy src/register.ts --name threatlens-register
```

Deploy verify endpoint:

```bash
npx wrangler deploy src/verify.ts --name threatlens-verify
```

Wrangler will output URLs like:
```
✨ https://threatlens-register.YOUR_SUBDOMAIN.workers.dev
✨ https://threatlens-verify.YOUR_SUBDOMAIN.workers.dev
```

### 6. Update Client .env

Copy the URLs and update `../.env`:

```dotenv
EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL=https://threatlens-register.YOUR_SUBDOMAIN.workers.dev
```

Or use separate URLs (requires updating `secureKeyService.ts`):

```dotenv
EXPO_PUBLIC_TRUST_REGISTRY_REGISTER_URL=https://threatlens-register.YOUR_SUBDOMAIN.workers.dev
EXPO_PUBLIC_TRUST_REGISTRY_VERIFY_URL=https://threatlens-verify.YOUR_SUBDOMAIN.workers.dev
```

### 7. Test Endpoints

Test register:

```bash
curl -X POST https://threatlens-register.YOUR_SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"installID":"test123","publicKey":"testkey","deviceModel":"test"}'
```

Test verify:

```bash
curl https://threatlens-verify.YOUR_SUBDOMAIN.workers.dev?installID=test123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Development

### View Live Logs

```bash
npx wrangler tail threatlens-register
npx wrangler tail threatlens-verify
```

### Local Development

```bash
npx wrangler dev src/register.ts
```

### Query Database

```bash
npx wrangler d1 execute threatlens_trust_registry --command="SELECT * FROM trust_registry LIMIT 10"
```

## Troubleshooting

### "Database binding not found"

Make sure `database_id` in `wrangler.toml` is set after creating the D1 database.

### "Secret not found"

Secrets must be set for each Worker separately using `--name` flag.

### CORS errors

The Workers include `Access-Control-Allow-Origin: *` by default. Check browser console for specific errors.

## Cost

All operations are free within Cloudflare's generous limits:
- 100,000 requests/day
- Unlimited D1 storage (5GB total)
- No credit card required
