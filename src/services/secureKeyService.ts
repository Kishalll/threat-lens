import * as SecureStore from 'expo-secure-store';

export const NIM_KEY_NAME = "NIM_API_KEY";
export const TRUST_REGISTRY_BASE_URL_KEY_NAME = "THREATLENS_TRUST_REGISTRY_BASE_URL";
export const TRUST_REGISTRY_API_KEY_NAME = "THREATLENS_TRUST_REGISTRY_API_KEY";
export const MASTER_PUBLIC_KEY_PEM_KEY_NAME = "THREATLENS_MASTER_PUBLIC_KEY_PEM";

function normalizeTrustBaseUrl(value: string): string {
  let normalized = value.trim().replace(/\/+$/, "");

  if (normalized.endsWith("/register")) {
    normalized = normalized.slice(0, -"/register".length);
  }

  if (normalized.endsWith("/verify")) {
    normalized = normalized.slice(0, -"/verify".length);
  }

  if (normalized.endsWith("/image")) {
    normalized = normalized.slice(0, -"/image".length);
  }

  return normalized;
}

export async function setKey(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`Failed to set key ${key}`, error);
  }
}

export async function getKey(key: string): Promise<string | null> {
  if (key === NIM_KEY_NAME) {
    const envNim = process.env.EXPO_PUBLIC_NIM_API_KEY;
    if (typeof envNim === "string" && envNim.trim().length > 0) {
      return envNim.trim();
    }
  }

  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`Failed to get key ${key}`, error);
    return null;
  }
}

export async function getTrustRegistryBaseUrl(): Promise<string | null> {
  const envUrl = process.env.EXPO_PUBLIC_TRUST_REGISTRY_BASE_URL;
  if (typeof envUrl === "string" && envUrl.trim().length > 0) {
    return normalizeTrustBaseUrl(envUrl);
  }

  try {
    const stored = await SecureStore.getItemAsync(TRUST_REGISTRY_BASE_URL_KEY_NAME);
    if (stored) return normalizeTrustBaseUrl(stored);
  } catch {
    // Ignore SecureStore errors
  }

  return null;
}

export async function getTrustRegistryApiKey(): Promise<string | null> {
  const envKey = process.env.EXPO_PUBLIC_TRUST_REGISTRY_API_KEY;
  if (typeof envKey === "string" && envKey.trim().length > 0) {
    return envKey.trim();
  }

  try {
    const stored = await SecureStore.getItemAsync(TRUST_REGISTRY_API_KEY_NAME);
    if (typeof stored === "string" && stored.trim().length > 0) {
      return stored.trim();
    }
  } catch {
    // Ignore SecureStore errors
  }

  return null;
}

export async function getMasterPublicKeyPem(): Promise<string | null> {
  const envPem = process.env.EXPO_PUBLIC_MASTER_PUBLIC_KEY_PEM;
  if (typeof envPem === "string" && envPem.trim().length > 0) {
    return envPem.trim().replace(/\\n/g, "\n");
  }

  try {
    const stored = await SecureStore.getItemAsync(MASTER_PUBLIC_KEY_PEM_KEY_NAME);
    if (typeof stored === "string" && stored.trim().length > 0) {
      return stored.trim().replace(/\\n/g, "\n");
    }
  } catch {
    // Ignore SecureStore errors
  }

  return null;
}

function resolveWorkerUrl(base: string, target: "register" | "verify" | "image"): string {
  // Handles individual workers.dev subdomains (e.g. threatlens-register.xxx.workers.dev)
  if (
    base.includes("threatlens-register") ||
    base.includes("threatlens-verify") ||
    base.includes("threatlens-image")
  ) {
    return base
      .replace("threatlens-register", `threatlens-${target}`)
      .replace("threatlens-verify", `threatlens-${target}`)
      .replace("threatlens-image", `threatlens-${target}`);
  }

  // Handles path-based base URLs (e.g. https://domain.com/trust)
  const clean = base.replace(/\/+(register|verify|image)$/, "");
  return `${clean}/${target}`;
}

export async function getRegisterEndpointUrl(): Promise<string | null> {
  const envUrl = process.env.EXPO_PUBLIC_TRUST_REGISTRY_REGISTER_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  const base = await getTrustRegistryBaseUrl();
  if (!base) return null;
  return resolveWorkerUrl(base, "register");
}

export async function getVerifyEndpointUrl(): Promise<string | null> {
  const envUrl = process.env.EXPO_PUBLIC_TRUST_REGISTRY_VERIFY_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  const base = await getTrustRegistryBaseUrl();
  if (!base) return null;
  return resolveWorkerUrl(base, "verify");
}

export async function getImageEndpointUrl(): Promise<string | null> {
  const envUrl =
    process.env.EXPO_PUBLIC_TRUST_REGISTRY_IMAGE_URL ||
    process.env.EXPO_PUBLIC_IMAGE_REGISTRY_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  const base = await getTrustRegistryBaseUrl();
  if (!base) return null;
  return resolveWorkerUrl(base, "image");
}

// Ensure defaults for mock environment
export async function initializeMockKeys() {
  // Intentionally no mocked NIM key. Set EXPO_PUBLIC_NIM_API_KEY
  // or store NIM_API_KEY securely via setKey.
}