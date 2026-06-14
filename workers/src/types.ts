// TypeScript types for ThreatLens Workers

export interface Env {
  DB: D1Database;
  MASTER_PRIVATE_KEY_PEM: string;
  TRUST_REGISTRY_API_KEY?: string;
  DEBUG?: string;
}

export interface DeviceRegistration {
  installID: string;
  publicKey: string;
  deviceModel: string;
  appVersion: string;
  appBuildNumber: number;
  masterCert: string;
  revoked: number; // 0 or 1
  createdAt: string;
  updatedAt: string;
}

export interface MasterCert {
  v: number;
  issuer: string;
  issuedAt: string;
  installID: string;
  publicKey: string;
}

export interface SignedMasterCert {
  cert: MasterCert;
  sig: string;
}

export interface RegisterRequest {
  installID: string;
  publicKey: string;
  deviceModel?: string;
  appVersion?: string;
  appBuildNumber?: number;
}

export interface RegisterResponse {
  ok: boolean;
  status: string;
  installID: string;
  masterCert: string;
  cloudVerifyURL: string;
  registeredAt: string;
}

export interface VerifyRequest {
  installID: string;
  publicKey?: string;
}

export interface VerifyResponse {
  ok: boolean;
  status: "ACTIVE" | "REVOKED" | "NOT_FOUND";
  installID: string;
  registered: boolean;
  revoked: boolean;
  publicKey?: string;
  publicKeyMatch?: boolean | null;
  masterCert?: string;
  updatedAt?: string;
  verifiedAt: string;
}

export interface ErrorResponse {
  error: string;
}
