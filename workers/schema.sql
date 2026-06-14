-- ThreatLens Trust Registry Schema for D1 (SQLite)

CREATE TABLE IF NOT EXISTS trust_registry (
  installID TEXT PRIMARY KEY,
  publicKey TEXT NOT NULL,
  deviceModel TEXT NOT NULL,
  appVersion TEXT NOT NULL,
  appBuildNumber INTEGER NOT NULL,
  masterCert TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,  -- SQLite boolean: 0 = false, 1 = true
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_publicKey ON trust_registry(publicKey);
CREATE INDEX IF NOT EXISTS idx_revoked ON trust_registry(revoked);
CREATE INDEX IF NOT EXISTS idx_updatedAt ON trust_registry(updatedAt);
