export type VerificationStatus =
  | "AUTHENTIC"
  | "TAMPERED"
  | "INVALID_SIGNATURE"
  | "CLONE_APP"
  | "REVOKED"
  | "OFFLINE"
  | "NO_PROTECTION"
  | "INTEGRITY_VERIFIED"
  | "CORRUPT";

export interface SignedImagePayload {
  v: number;
  installID: string;
  deviceModel: string;
  appVersion: string;
  appBuildNumber: number;
  timestamp: string;
  sha256: string;
  phash: string;
  publicKey: string;
  masterCert: string;
  signature: string;
  cloudVerifyURL: string;
  watermarkId?: string;
}

export interface VerificationChecks {
  hashCheck: boolean;
  signatureCheck: boolean;
  masterCertCheck: boolean;
  cloudCheck: "passed" | "failed" | "offline" | "skipped";
}

export interface VerificationResult {
  status: VerificationStatus;
  summary: string;
  payload?: SignedImagePayload;
  watermarkId?: string;
  checks: VerificationChecks;
  details: string[];
  shaMatch?: boolean;
  pHashDistance?: number;
}

export interface ProtectResult {
  protectedUri: string;
  payload: SignedImagePayload;
}
