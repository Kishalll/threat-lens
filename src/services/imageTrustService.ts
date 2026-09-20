import "react-native-get-random-values";
import { Buffer } from "buffer";
globalThis.Buffer = globalThis.Buffer ?? Buffer;

import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { v4 as uuidv4 } from "uuid";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { fromByteArray, toByteArray } from "base64-js";
import jpeg from "jpeg-js";
import { embedDctWatermark, extractDctWatermark } from "../utils/dctWatermark";

import type {
  ProtectResult,
  SignedImagePayload,
  VerificationChecks,
  VerificationResult,
} from "../types/imageTrust";
import {
  getImageEndpointUrl,
  getMasterPublicKeyPem,
  getRegisterEndpointUrl,
  getTrustRegistryApiKey,
  getVerifyEndpointUrl,
} from "./secureKeyService";

// ---------------------------------------------------------------------------
// Debug instrumentation — safe, no secrets leaked.
// Set EXPO_PUBLIC_THREATLENS_DEBUG=true in .env to enable verbose logging.
// ---------------------------------------------------------------------------
const DEBUG_ENABLED = process.env.EXPO_PUBLIC_THREATLENS_DEBUG === "true";

function __debug(tag: string, data?: Record<string, unknown>): void {
  if (!DEBUG_ENABLED) return;
  const prefix = `[ThreatLens:${tag}]`;
  if (data) {
    console.log(prefix, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix);
  }
}

// ---------------------------------------------------------------------------
// Signature normalization — handles both @noble/curves versions:
//   older: p256.sign() returns a Signature object with .toCompactRawBytes()
//   newer: p256.sign() returns Uint8Array directly
// ---------------------------------------------------------------------------
function toCompactSignatureBytes(sig: unknown): Uint8Array {
  if (sig instanceof Uint8Array) {
    return sig;
  }
  if (
    sig !== null &&
    typeof sig === "object" &&
    "toCompactRawBytes" in sig &&
    typeof (sig as { toCompactRawBytes: unknown }).toCompactRawBytes === "function"
  ) {
    return (sig as { toCompactRawBytes: () => Uint8Array }).toCompactRawBytes();
  }
  throw new Error("p256.sign() returned an unrecognised type — update @noble/curves.");
}

const DEVICE_INSTALL_ID_KEY = "THREATLENS_INSTALL_ID";
const DEVICE_PRIVATE_KEY_KEY = "THREATLENS_DEVICE_PRIVATE_KEY_HEX";
const DEVICE_PUBLIC_KEY_KEY = "THREATLENS_DEVICE_PUBLIC_KEY_B64";
const DEVICE_MASTER_CERT_KEY = "THREATLENS_DEVICE_MASTER_CERT";
const DEVICE_VERIFY_URL_KEY = "THREATLENS_DEVICE_VERIFY_URL";

const PHASH_TAMPER_THRESHOLD = 8;

interface DeviceIdentity {
  installID: string;
  privateKeyHex: string;
  publicKeyBase64: string;
  masterCert: string | null;
  cloudVerifyURL: string | null;
}

interface CloudVerifyOutcome {
  cloudCheck: VerificationChecks["cloudCheck"];
  revoked: boolean;
  details: string[];
}

interface SignedMasterCert {
  cert: {
    v: number;
    issuer: string;
    issuedAt: string;
    installID: string;
    publicKey: string;
  };
  sig: string;
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );

    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortRecursively(entryValue);
    }
    return sorted;
  }

  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function bytesToBase64(value: Uint8Array): string {
  return fromByteArray(value);
}

function base64ToBytes(value: string): Uint8Array {
  return toByteArray(value);
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function parseJsonSafe<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getUnsignedPayload(payload: SignedImagePayload): Omit<SignedImagePayload, "signature"> {
  return {
    v: payload.v,
    installID: payload.installID,
    deviceModel: payload.deviceModel,
    appVersion: payload.appVersion,
    appBuildNumber: payload.appBuildNumber,
    timestamp: payload.timestamp,
    sha256: payload.sha256,
    phash: payload.phash,
    publicKey: payload.publicKey,
    masterCert: payload.masterCert,
    cloudVerifyURL: payload.cloudVerifyURL,
    watermarkId: payload.watermarkId,
  };
}

function ensureP256PublicKeyBytes(input: string): Uint8Array {
  const normalized = input.trim();
  const base64Body = normalized
  .replace("-----BEGIN PUBLIC KEY-----", "")
  .replace("-----END PUBLIC KEY-----", "")
  .replace(/\s+/g, "")
  .replace(/\\/g, "");  // strip any stray backslashes

  const padded = base64Body + "==".slice((base64Body.length % 4) || 4);
  const decoded = base64ToBytes(padded);

  if (decoded.length === 65 && decoded[0] === 0x04) {
    return decoded;
  }

  for (let i = 0; i <= decoded.length - 68; i += 1) {
    if (
      decoded[i] === 0x03 &&
      decoded[i + 1] === 0x42 &&
      decoded[i + 2] === 0x00 &&
      decoded[i + 3] === 0x04
    ) {
      return decoded.slice(i + 3, i + 3 + 65);
    }
  }

  throw new Error("Master public key is not a supported P-256 key format.");
}

function extractPixelDigestAndPHash(imageBytes: Uint8Array): { sha256Hex: string; pHash: string } {
  try {
    const decoded = jpeg.decode(imageBytes, { useTArray: true, formatAsRGBA: true });
    const rgba = decoded.data;
    const sha256Hex = bytesToHex(sha256(rgba));
    const pHash = computeDHash(rgba, decoded.width, decoded.height);
    return { sha256Hex, pHash };
  } catch {
    const sha256Hex = bytesToHex(sha256(imageBytes));
    return { sha256Hex, pHash: sha256Hex.slice(0, 16) };
  }
}

function computeDHash(rgba: Uint8Array, width: number, height: number): string {
  const cols = 9;
  const rows = 8;
  const sampled: number[][] = [];

  for (let y = 0; y < rows; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < cols; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x / (cols - 1)) * (width - 1)));
      const srcY = Math.min(height - 1, Math.floor((y / (rows - 1)) * (height - 1)));
      const idx = (srcY * width + srcX) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      row.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
    sampled.push(row);
  }

  const bits: number[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols - 1; x += 1) {
      bits.push(sampled[y][x] > sampled[y][x + 1] ? 1 : 0);
    }
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }

  return hex;
}

function hammingDistanceHex(a: string, b: string): number {
  const minLength = Math.min(a.length, b.length);
  const lookup = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  let distance = 0;

  for (let i = 0; i < minLength; i += 1) {
    const xor = (parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 0x0f;
    distance += lookup[xor];
  }

  distance += Math.abs(a.length - b.length) * 4;
  return distance;
}

function derEcdsaToCompactSignature(der: Uint8Array): Uint8Array | null {
  try {
    if (der.length < 8 || der[0] !== 0x30) return null;

    let offset = 2;

    if (der[offset] !== 0x02) return null;
    const rLen = der[offset + 1];
    offset += 2;
    let r = der.slice(offset, offset + rLen);
    offset += rLen;

    if (der[offset] !== 0x02) return null;
    const sLen = der[offset + 1];
    offset += 2;
    let s = der.slice(offset, offset + sLen);

    while (r.length > 32 && r[0] === 0x00) r = r.slice(1);
    while (s.length > 32 && s[0] === 0x00) s = s.slice(1);
    if (r.length > 32 || s.length > 32) return null;

    // P-256 curve order n
    const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
    const halfN = n >> BigInt(1);

    // Convert s to BigInt
    let sBig = BigInt(0);
    for (const byte of s) {
      sBig = (sBig << BigInt(8)) | BigInt(byte);
    }

    // Normalize to low-S if needed (noble v2 enforces low-S)
    if (sBig > halfN) {
      sBig = n - sBig;
    }

    // Convert normalized s back to 32 bytes
    const sNorm = new Uint8Array(32);
    let tmp = sBig;
    for (let i = 31; i >= 0; i--) {
      sNorm[i] = Number(tmp & BigInt(0xff));
      tmp >>= BigInt(8);
    }

    const compact = new Uint8Array(64);
    compact.set(r, 32 - r.length);
    compact.set(sNorm, 32);
    return compact;
  } catch {
    return null;
  }
}

async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setSecureItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore cleanup failures.
  }
}

async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  let installID = await getSecureItem(DEVICE_INSTALL_ID_KEY);
  let privateKeyHex = await getSecureItem(DEVICE_PRIVATE_KEY_KEY);
  let publicKeyBase64 = await getSecureItem(DEVICE_PUBLIC_KEY_KEY);

  if (!installID) {
    installID = uuidv4();
    await setSecureItem(DEVICE_INSTALL_ID_KEY, installID);
  }

  if (!privateKeyHex || !publicKeyBase64) {
    const privateKeyBytes = p256.utils.randomSecretKey();
    const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false);

    privateKeyHex = bytesToHex(privateKeyBytes);
    publicKeyBase64 = bytesToBase64(publicKeyBytes);

    await setSecureItem(DEVICE_PRIVATE_KEY_KEY, privateKeyHex);
    await setSecureItem(DEVICE_PUBLIC_KEY_KEY, publicKeyBase64);
  }

  if (!privateKeyHex || !publicKeyBase64) {
    throw new Error("Failed to initialize device key material.");
  }

  const masterCert = await getSecureItem(DEVICE_MASTER_CERT_KEY);
  const cloudVerifyURL = await getSecureItem(DEVICE_VERIFY_URL_KEY);

  return {
    installID,
    privateKeyHex,
    publicKeyBase64,
    masterCert,
    cloudVerifyURL,
  };
}

async function isMasterCertValidForIdentity(
  masterCert: string,
  installID: string,
  publicKey: string
): Promise<boolean> {
  try {
    const masterPublicKeyPemOrB64 = await getMasterPublicKeyPem();
    if (!masterPublicKeyPemOrB64) {
      __debug("masterCert:fail", { reason: "Master public key not configured in env/store" });
      return false;
    }

    let masterPublicKeyBytes: Uint8Array;
    try {
      masterPublicKeyBytes = ensureP256PublicKeyBytes(masterPublicKeyPemOrB64);
      __debug("masterCert:pubkey", { byteLength: masterPublicKeyBytes.length, firstByte: masterPublicKeyBytes[0] });
    } catch (e) {
      __debug("masterCert:fail", { reason: "ensureP256PublicKeyBytes threw", error: String(e) });
      return false;
    }

    const certBlobRaw = decodeUtf8(base64ToBytes(masterCert));
    __debug("masterCert:raw", { certBlobLength: certBlobRaw.length, preview: certBlobRaw.slice(0, 80) });

    const certBlob = parseJsonSafe<SignedMasterCert>(certBlobRaw);
    if (!certBlob) {
      __debug("masterCert:fail", { reason: "certBlob JSON parse failed", raw: certBlobRaw.slice(0, 120) });
      return false;
    }

    if (certBlob.cert.installID !== installID) {
      __debug("masterCert:fail", { reason: "installID mismatch", cert: certBlob.cert.installID, identity: installID });
      return false;
    }

    if (certBlob.cert.publicKey !== publicKey) {
      __debug("masterCert:fail", {
        reason: "publicKey mismatch",
        certKeyPrefix: certBlob.cert.publicKey.slice(0, 20),
        identityKeyPrefix: publicKey.slice(0, 20),
      });
      return false;
    }

    const certJson = canonicalJson(certBlob.cert);
    const certMessage = utf8ToBytes(certJson);
    const certHash = sha256(certMessage);
    __debug("masterCert:certHash", { certHashHex: bytesToHex(certHash), certJson });

    const certSigBytes = base64ToBytes(certBlob.sig);
    __debug("masterCert:sig", { sigByteLength: certSigBytes.length, firstByte: certSigBytes[0] });

    // Noble v2.2.0 only accepts 64-byte compact signatures, not DER.
    // Backend now produces low-S so compact conversion works directly.
    const compactSig = derEcdsaToCompactSignature(certSigBytes);
    if (!compactSig) {
      __debug("masterCert:fail", { reason: "DER→compact conversion failed" });
      return false;
    }

    __debug("masterCert:compactSig", {
      compactLength: compactSig.length,
      compactHex: bytesToHex(compactSig),
      certHashHex: bytesToHex(certHash),
    });

    const result = p256.verify(compactSig, certHash, masterPublicKeyBytes, { prehash: false });
    __debug("masterCert:ok", { path: "compact", result });
    return result;
  } catch (e) {
    __debug("masterCert:exception", { error: String(e) });
    return false;
  }
}

async function ensureDeviceRegistration(identity: DeviceIdentity): Promise<DeviceIdentity> {
  if (identity.masterCert && identity.cloudVerifyURL) {
    const cachedCertIsValid = await isMasterCertValidForIdentity(
      identity.masterCert,
      identity.installID,
      identity.publicKeyBase64
    );

    if (cachedCertIsValid) {
      return identity;
    }

    await deleteSecureItem(DEVICE_MASTER_CERT_KEY);
    await deleteSecureItem(DEVICE_VERIFY_URL_KEY);
  }

  const registerUrl = await getRegisterEndpointUrl();
  if (!registerUrl) {
    throw new Error("Trust registry register URL is not configured.");
  }

  const apiKey = await getTrustRegistryApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const appBuildNumber = Number(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? 0);
  const deviceModel =
    (Platform.constants && (Platform.constants as { Model?: string }).Model) ||
    `${Platform.OS}-${String(Platform.Version)}`;

  const response = await fetch(registerUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      installID: identity.installID,
      publicKey: identity.publicKeyBase64,
      deviceModel,
      appVersion,
      appBuildNumber,
    }),
  });

  const parsed = (await response.json().catch(() => ({}))) as {
    masterCert?: unknown;
    cloudVerifyURL?: unknown;
    error?: unknown;
    ok?: unknown;
    status?: unknown;
  };

  __debug("register:response", {
    httpStatus: response.status,
    ok: parsed.ok,
    status: parsed.status,
    hasMasterCert: typeof parsed.masterCert === "string" && parsed.masterCert.length > 0,
    masterCertLength: typeof parsed.masterCert === "string" ? parsed.masterCert.length : 0,
    cloudVerifyURL: typeof parsed.cloudVerifyURL === "string" ? parsed.cloudVerifyURL : null,
    error: parsed.error ?? null,
  });

  if (!response.ok) {
    const message =
      typeof parsed.error === "string" && parsed.error.trim().length > 0
        ? parsed.error
        : `Register failed (${response.status})`;
    throw new Error(message);
  }

  const masterCert = typeof parsed.masterCert === "string" ? parsed.masterCert : "";
  const cloudVerifyURL =
    typeof parsed.cloudVerifyURL === "string" && parsed.cloudVerifyURL.trim().length > 0
      ? parsed.cloudVerifyURL.trim()
      : await getVerifyEndpointUrl();

  if (!masterCert) {
    throw new Error("Registration succeeded but master certificate is missing.");
  }

  await setSecureItem(DEVICE_MASTER_CERT_KEY, masterCert);
  if (cloudVerifyURL) {
    await setSecureItem(DEVICE_VERIFY_URL_KEY, cloudVerifyURL);
  }

  return {
    ...identity,
    masterCert,
    cloudVerifyURL: cloudVerifyURL ?? null,
  };
}

async function normalizeToJpegBase64(imageUri: string): Promise<{ base64: string; uri: string }> {
  const manipulated = await manipulateAsync(
    imageUri,
    [],
    {
      compress: 1,
      format: SaveFormat.JPEG,
      base64: true,
    }
  );

  if (typeof manipulated.base64 !== "string" || manipulated.base64.length === 0) {
    throw new Error("Could not convert image to JPEG for signing.");
  }

  return {
    base64: manipulated.base64,
    uri: manipulated.uri,
  };
}

async function embedDctAndSaveImage(base64Jpeg: string, watermarkId: string): Promise<string> {
  const imageBytes = base64ToBytes(base64Jpeg);
  const decoded = jpeg.decode(imageBytes, { useTArray: true, formatAsRGBA: true });
  const embedResult = embedDctWatermark(decoded.data, decoded.width, decoded.height, watermarkId);

  if (!embedResult.success) {
    throw new Error(embedResult.error || "Failed to embed DCT watermark into image");
  }

  const encoded = jpeg.encode(
    { data: embedResult.modifiedRgba, width: decoded.width, height: decoded.height },
    95
  );

  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) {
    throw new Error("No writable cache directory for protected image.");
  }

  const outputUri = `${cacheDir}protected_${Date.now()}.jpg`;
  const base64Out = bytesToBase64(encoded.data);
  await FileSystem.writeAsStringAsync(outputUri, base64Out, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return outputUri;
}

async function storeImagePayloadInCloud(payload: SignedImagePayload): Promise<boolean> {
  const imageUrl = await getImageEndpointUrl();
  if (!imageUrl) return false;

  const apiKey = await getTrustRegistryApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(`${imageUrl}/store`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        watermarkId: payload.watermarkId,
        payload,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function lookupImagePayloadFromCloud(watermarkId: string): Promise<{
  status: "found" | "not_found" | "offline";
  payload?: SignedImagePayload;
  error?: string;
}> {
  const imageUrl = await getImageEndpointUrl();
  if (!imageUrl) return { status: "offline", error: "Image endpoint not configured" };

  const apiKey = await getTrustRegistryApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(`${imageUrl}/lookup?watermarkId=${encodeURIComponent(watermarkId)}`, {
      method: "GET",
      headers,
    });

    if (res.status === 404) {
      return { status: "not_found" };
    }
    if (!res.ok) {
      return { status: "offline", error: `HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      payload?: SignedImagePayload;
    };
    if (data.ok && data.payload) {
      return { status: "found", payload: data.payload };
    }
    return { status: "not_found" };
  } catch (e) {
    return { status: "offline", error: e instanceof Error ? e.message : "network error" };
  }
}

function verifyPayloadSignature(payload: SignedImagePayload): boolean {
  try {
    const unsignedPayload = getUnsignedPayload(payload);
    const messageBytes = utf8ToBytes(canonicalJson(unsignedPayload));
    const messageHash = sha256(messageBytes);
    const signatureBytes = base64ToBytes(payload.signature);
    const publicKeyBytes = base64ToBytes(payload.publicKey);
    return p256.verify(signatureBytes, messageHash, publicKeyBytes, { prehash: false });
  } catch {
    return false;
  }
}

async function verifyMasterCertificate(payload: SignedImagePayload): Promise<boolean> {
  return isMasterCertValidForIdentity(payload.masterCert, payload.installID, payload.publicKey);
}

async function cloudVerify(payload: SignedImagePayload, shouldCheckCloud: boolean): Promise<CloudVerifyOutcome> {
  if (!shouldCheckCloud) {
    return {
      cloudCheck: "skipped",
      revoked: false,
      details: ["Cloud check skipped by user setting."],
    };
  }

  const verifyUrlRaw = payload.cloudVerifyURL?.trim();
  if (!verifyUrlRaw) {
    return {
      cloudCheck: "failed",
      revoked: false,
      details: ["Cloud verify URL is missing in payload."],
    };
  }

  const verifyUrl = verifyUrlRaw.startsWith("http://")
    ? `https://${verifyUrlRaw.slice("http://".length)}`
    : verifyUrlRaw;

  const apiKey = await getTrustRegistryApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    __debug("cloud:verify:request", {
      url: verifyUrl,
      installID: payload.installID,
      publicKeyPrefix: payload.publicKey.slice(0, 16),
    });

    const response = await fetch(verifyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        installID: payload.installID,
        publicKey: payload.publicKey,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      status?: unknown;
      publicKeyMatch?: unknown;
      error?: unknown;
    };

    __debug("cloud:verify:response", {
      httpStatus: response.status,
      status: body.status,
      publicKeyMatch: body.publicKeyMatch,
      error: body.error ?? null,
    });

    if (!response.ok) {
      const serverError = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      return {
        cloudCheck: "failed",
        revoked: false,
        details: [`Cloud verify request failed: ${serverError}`],
      };
    }

    const status = typeof body.status === "string" ? body.status.toUpperCase() : "UNKNOWN";
    const publicKeyMatch = body.publicKeyMatch;

    if (status === "REVOKED") {
      return {
        cloudCheck: "failed",
        revoked: true,
        details: ["Cloud registry reports this installID as revoked."],
      };
    }

    if (status === "ACTIVE") {
      if (publicKeyMatch === false) {
        return {
          cloudCheck: "failed",
          revoked: false,
          details: ["Cloud registry public key mismatch detected."],
        };
      }

      return {
        cloudCheck: "passed",
        revoked: false,
        details: ["Cloud registry confirms active trusted device registration."],
      };
    }

    return {
      cloudCheck: "failed",
      revoked: false,
      details: [`Cloud registry status is ${status}.`],
    };
  } catch (e) {
    __debug("cloud:verify:offline", { error: String(e) });
    return {
      cloudCheck: "offline",
      revoked: false,
      details: [`Cloud verification unavailable: ${e instanceof Error ? e.message : "network error"}`],
    };
  }
}

export async function getImageTrustSettingsSnapshot(): Promise<{
  installID: string | null;
  hasDeviceKey: boolean;
  hasMasterCert: boolean;
  registerUrl: string | null;
  verifyUrl: string | null;
  hasApiKey: boolean;
  hasMasterPublicKey: boolean;
}> {
  const installID = await getSecureItem(DEVICE_INSTALL_ID_KEY);
  const hasDeviceKey = Boolean(await getSecureItem(DEVICE_PRIVATE_KEY_KEY));
  const hasMasterCert = Boolean(await getSecureItem(DEVICE_MASTER_CERT_KEY));
  const registerUrl = await getRegisterEndpointUrl();
  const verifyUrl = await getVerifyEndpointUrl();
  const apiKey = await getTrustRegistryApiKey();
  const masterPem = await getMasterPublicKeyPem();

  return {
    installID,
    hasDeviceKey,
    hasMasterCert,
    registerUrl,
    verifyUrl,
    hasApiKey: typeof apiKey === "string" && apiKey.length > 0,
    hasMasterPublicKey: typeof masterPem === "string" && masterPem.length > 0,
  };
}

export async function protectImageWithSignature(imageUri: string): Promise<ProtectResult> {
  const identity = await ensureDeviceRegistration(await getOrCreateIdentity());
  const jpegNormalized = await normalizeToJpegBase64(imageUri);
  const imageBytes = base64ToBytes(jpegNormalized.base64);
  const hashes = extractPixelDigestAndPHash(imageBytes);

  const sha64 = hashes.sha256Hex.slice(0, 16);
  const watermarkId = `${sha64}${hashes.pHash}`;

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const appBuildNumber = Number(
    Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? 0
  );
  const deviceModel =
    (Platform.constants && (Platform.constants as { Model?: string }).Model) ||
    `${Platform.OS}-${String(Platform.Version)}`;

  const unsignedPayload: Omit<SignedImagePayload, "signature"> = {
    v: 1,
    installID: identity.installID,
    deviceModel,
    appVersion,
    appBuildNumber,
    timestamp: new Date().toISOString(),
    sha256: hashes.sha256Hex,
    phash: hashes.pHash,
    publicKey: identity.publicKeyBase64,
    masterCert: identity.masterCert ?? "",
    cloudVerifyURL: identity.cloudVerifyURL ?? (await getVerifyEndpointUrl()) ?? "",
    watermarkId,
  };

  if (!unsignedPayload.masterCert) {
    throw new Error("Master certificate is missing after registration.");
  }

  const messageBytes = utf8ToBytes(canonicalJson(unsignedPayload));
  const messageHash = sha256(messageBytes);
  const privateKeyBytes = hexToBytes(identity.privateKeyHex);
  const signatureRaw = p256.sign(messageHash, privateKeyBytes, { prehash: false });
  const signatureBytes = toCompactSignatureBytes(signatureRaw as unknown);

  __debug("protect:sign", {
    signatureLengthBytes: signatureBytes.length,
    publicKeyB64Prefix: identity.publicKeyBase64.slice(0, 16),
    watermarkId,
  });

  const payload: SignedImagePayload = {
    ...unsignedPayload,
    signature: bytesToBase64(signatureBytes),
  };

  const protectedUri = await embedDctAndSaveImage(jpegNormalized.base64, watermarkId);

  storeImagePayloadInCloud(payload).catch((e) => {
    __debug("protect:storeInCloud:error", { error: String(e) });
  });

  return { protectedUri, payload };
}

export async function verifySignedImage(
  imageUri: string,
  options?: { cloudCheck?: boolean }
): Promise<VerificationResult> {
  const checks: VerificationChecks = {
    hashCheck: false,
    signatureCheck: false,
    masterCertCheck: false,
    cloudCheck: options?.cloudCheck === false ? "skipped" : "skipped",
  };

  let imageBytes: Uint8Array;
  try {
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    imageBytes = base64ToBytes(base64Image);
  } catch (e) {
    return {
      status: "CORRUPT",
      summary: "Could not read image file for verification.",
      checks,
      details: [e instanceof Error ? e.message : "File read failed"],
    };
  }

  let decoded: { data: Uint8Array; width: number; height: number };
  try {
    decoded = jpeg.decode(imageBytes, { useTArray: true, formatAsRGBA: true });
  } catch {
    return {
      status: "NO_PROTECTION",
      summary: "Image could not be parsed as JPEG.",
      checks,
      details: ["JPEG decode failed."],
    };
  }

  const extracted = extractDctWatermark(decoded.data, decoded.width, decoded.height);
  if (!extracted.watermarkHex) {
    return {
      status: "NO_PROTECTION",
      summary: "No ThreatLens watermark was detected in this image.",
      checks,
      details: [
        "No valid DCT watermark found in image frequencies.",
        `Confidence score: ${(extracted.confidence * 100).toFixed(1)}%`,
      ],
    };
  }

  const watermarkId = extracted.watermarkHex;
  // First 64 bits are a lookup nonce (derived from original pixel SHA before DCT embedding).
  // They will NOT match a recomputed SHA because DCT embedding changes the pixels.
  // Only used as part of the cloud lookup key.
  const embeddedPhash = watermarkId.slice(16, 32);

  const recomputed = extractPixelDigestAndPHash(imageBytes);
  const pHashDistance = hammingDistanceHex(recomputed.pHash, embeddedPhash);

  // dHash comparison is the offline tamper check. It operates at a coarse 9x8 grid
  // so it's stable across DCT embedding and JPEG re-compression, but catches
  // meaningful visual edits (AI manipulation, cropping, overlays, etc.)
  const hashCheck = pHashDistance <= PHASH_TAMPER_THRESHOLD;
  checks.hashCheck = hashCheck;

  if (!hashCheck) {
    return {
      status: "TAMPERED",
      summary: "Image content was visually modified after watermarking.",
      checks,
      watermarkId,
      shaMatch: false,
      pHashDistance,
      details: [
        "Perceptual hash distance exceeds tamper threshold.",
        `Hamming distance: ${pHashDistance} (threshold: ${PHASH_TAMPER_THRESHOLD}).`,
        "This indicates visual tampering or significant content modifications.",
      ],
    };
  }

  if (options?.cloudCheck === false) {
    return {
      status: "INTEGRITY_VERIFIED",
      summary: "Image pixel integrity is verified, but cloud verification was skipped.",
      checks: { ...checks, cloudCheck: "skipped" },
      watermarkId,
      shaMatch: hashCheck,
      pHashDistance,
      details: [
        "DCT watermark verified.",
        "Pixel hash matched.",
        "Cloud verification skipped by user setting.",
      ],
    };
  }

  const cloudLookup = await lookupImagePayloadFromCloud(watermarkId);

  if (cloudLookup.status === "offline") {
    return {
      status: "INTEGRITY_VERIFIED",
      summary: "Image pixels are intact and unaltered, but signing source cannot be confirmed while offline.",
      checks: { ...checks, cloudCheck: "offline" },
      watermarkId,
      shaMatch: hashCheck,
      pHashDistance,
      details: [
        "DCT watermark verified.",
        "Pixel hash matched.",
        "Cloud source registry unreachable.",
      ],
    };
  }

  if (cloudLookup.status === "not_found" || !cloudLookup.payload) {
    return {
      status: "INTEGRITY_VERIFIED",
      summary: "Image pixels are intact, but no device record was found in the cloud registry.",
      checks: { ...checks, cloudCheck: "failed" },
      watermarkId,
      shaMatch: hashCheck,
      pHashDistance,
      details: [
        "DCT watermark verified.",
        "Pixel hash matched.",
        "No cloud registry record found for this watermark ID.",
      ],
    };
  }

  const payload = cloudLookup.payload;
  const signatureCheck = verifyPayloadSignature(payload);
  checks.signatureCheck = signatureCheck;

  const masterCertCheck = await verifyMasterCertificate(payload);
  checks.masterCertCheck = masterCertCheck;

  if (!masterCertCheck) {
    return {
      status: "CLONE_APP",
      summary: "Master certificate check failed. Image was not signed by an official app trust chain.",
      checks,
      payload,
      watermarkId,
      shaMatch: hashCheck,
      pHashDistance,
      details: ["Master certificate does not validate against embedded master public key."],
    };
  }

  if (!signatureCheck) {
    return {
      status: "INVALID_SIGNATURE",
      summary: "Signature validation failed for the cloud registry payload.",
      checks,
      payload,
      watermarkId,
      shaMatch: hashCheck,
      pHashDistance,
      details: ["ECDSA signature check failed for payload."],
    };
  }

  const cloud = await cloudVerify(payload, true);
  checks.cloudCheck = cloud.cloudCheck;

  if (cloud.revoked) {
    return {
      status: "REVOKED",
      summary: "Cloud registry reports this signing device as revoked.",
      checks,
      payload,
      watermarkId,
      shaMatch: hashCheck,
      pHashDistance,
      details: cloud.details,
    };
  }

  if (cloud.cloudCheck === "failed") {
    return {
      status: "CORRUPT",
      summary: "Image pixels are valid, but cloud registry device validation failed.",
      checks,
      payload,
      watermarkId,
      shaMatch: hashCheck,
      pHashDistance,
      details: cloud.details,
    };
  }

  return {
    status: "AUTHENTIC",
    summary: "All DCT integrity and cloud device verification checks passed. Image is authentic.",
    checks,
    payload,
    watermarkId,
    shaMatch: hashCheck,
    pHashDistance,
    details: [
      "DCT watermark verified.",
      "Perceptual hash check passed.",
      "ECDSA signature check passed.",
      "Master certificate check passed.",
      ...cloud.details,
    ],
  };
}
