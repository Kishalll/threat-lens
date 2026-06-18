export interface Credential {
  id: string;
  type: "email" | "username";
  value: string;
  addedAt: number;
}

export interface BreachRecord {
  id: string;
  credentialId: string;
  breachName: string;
  date: string;
  dataTypes: string[];
  severity: "low" | "medium" | "high" | "critical";
  seen: boolean;
  aiGuidance?: string;
}

export interface BreachGuidance {
  summary: string;
  actionItems: string[];
  isFallback: boolean;
}

export interface ScanResult {
  id: string;
  timestamp: number;
  classification: "SAFE" | "SPAM" | "SCAM" | "PHISHING" | "UNAVAILABLE";
  confidence: number;
  messagePreview: string;
  redFlags: string[];
  suggestedActions: string[];
  explanation: string;
}

export interface WatermarkLog {
  id: string;
  originalFilename: string;
  uuid: string;
  timestamp: number;
}

export interface SafetyScoreSnapshot {
  score: number;
  breachScore: number;
  messageScore: number;
  imageScore: number;
  suggestionScore: number;
  computedAt: number;
}