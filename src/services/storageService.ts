import * as SQLite from "expo-sqlite";
import type { BreachApiItem } from "./breachApiService";
import type { ScanResult } from "../types";

const DATABASE_NAME = "threatlens_secure.db";

const DATABASE_SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seen_breach_ids (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watermark_log (
    uuid TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    original_filename TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_results (
    id TEXT PRIMARY KEY,
    classification TEXT,
    confidence INTEGER,
    messagePreview TEXT,
    timestamp INTEGER NOT NULL,
    redFlags TEXT NOT NULL DEFAULT '[]',
    suggestedActions TEXT NOT NULL DEFAULT '[]',
    explanation TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS breach_cache (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let credentialsWriteQueue: Promise<void> = Promise.resolve();
let breachCacheWriteQueue: Promise<void> = Promise.resolve();

function isInvalidDatabaseHandleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("nativedatabase.prepareasync") ||
    message.includes("nullpointerexception")
  );
}

async function openAndInitializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const openedDb = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await openedDb.execAsync(DATABASE_SCHEMA_SQL);
  await openedDb.execAsync(`
    ALTER TABLE scan_results ADD COLUMN redFlags TEXT NOT NULL DEFAULT '[]';
  `).catch(() => {
    // Column already exists on upgraded installs.
  });
  await openedDb.execAsync(`
    ALTER TABLE scan_results ADD COLUMN suggestedActions TEXT NOT NULL DEFAULT '[]';
  `).catch(() => {
    // Column already exists on upgraded installs.
  });
  await openedDb.execAsync(`
    ALTER TABLE scan_results ADD COLUMN explanation TEXT NOT NULL DEFAULT '';
  `).catch(() => {
    // Column already exists on upgraded installs.
  });
  return openedDb;
}

async function ensureDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) {
    return db;
  }

  if (!dbInitPromise) {
    dbInitPromise = openAndInitializeDatabase()
      .then((openedDb) => {
        db = openedDb;
        console.log("Database initialized successfully.");
        return openedDb;
      })
      .catch((error) => {
        db = null;
        console.error("Database initialization failed", error);
        throw error;
      })
      .finally(() => {
        dbInitPromise = null;
      });
  }

  return dbInitPromise;
}

async function withDatabase<T>(
  task: (database: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  const firstDb = await ensureDatabase();

  try {
    return await task(firstDb);
  } catch (error) {
    if (!isInvalidDatabaseHandleError(error)) {
      throw error;
    }

    // Re-open once when native DB handle becomes invalid after app/runtime transitions.
    db = null;
    const recoveredDb = await ensureDatabase();
    return task(recoveredDb);
  }
}

function enqueueCredentialsWrite(task: () => Promise<void>): Promise<void> {
  credentialsWriteQueue = credentialsWriteQueue
    .catch(() => {
      // Swallow previous write failures so future writes can proceed.
    })
    .then(task);

  return credentialsWriteQueue;
}

function enqueueBreachCacheWrite(task: () => Promise<void>): Promise<void> {
  breachCacheWriteQueue = breachCacheWriteQueue
    .catch(() => {
      // Swallow previous write failures so future writes can proceed.
    })
    .then(task);

  return breachCacheWriteQueue;
}

export type StoredCredential = {
  id: string;
  value: string;
  type: "email" | "username";
};

export async function initDatabase() {
  await ensureDatabase();
}

export async function insertCredential(id: string, value: string, type: string) {
  await enqueueCredentialsWrite(async () => {
    await withDatabase(async (database) => {
      await database.runAsync(
        "INSERT OR REPLACE INTO credentials (id, value, type) VALUES (?, ?, ?)",
        [id, value, type]
      );
    });
  });
}

export async function getCredentials(): Promise<StoredCredential[]> {
  const allRows = await withDatabase((database) =>
    database.getAllAsync("SELECT * FROM credentials")
  );
  return allRows
    .map((row) => {
      const typed = row as { id?: unknown; value?: unknown; type?: unknown };
      if (
        typeof typed.id !== "string" ||
        typeof typed.value !== "string" ||
        (typed.type !== "email" && typed.type !== "username")
      ) {
        return null;
      }

      return {
        id: typed.id,
        value: typed.value,
        type: typed.type,
      };
    })
    .filter((row): row is StoredCredential => row !== null);
}

export async function replaceCredentials(credentials: StoredCredential[]): Promise<void> {
  await enqueueCredentialsWrite(async () => {
    await withDatabase(async (database) => {
      await database.runAsync("DELETE FROM credentials");
      for (const credential of credentials) {
        await database.runAsync(
          "INSERT OR REPLACE INTO credentials (id, value, type) VALUES (?, ?, ?)",
          [credential.id, credential.value, credential.type]
        );
      }
    });
  });
}

export async function getCachedBreaches(): Promise<BreachApiItem[]> {
  const rows = await withDatabase((database) =>
    database.getAllAsync("SELECT payload FROM breach_cache")
  );
  return rows
    .map((row) => {
      const typed = row as { payload?: unknown };
      if (typeof typed.payload !== "string") {
        return null;
      }

      try {
        return JSON.parse(typed.payload) as BreachApiItem;
      } catch {
        return null;
      }
    })
    .filter((item): item is BreachApiItem => item !== null);
}

export async function replaceCachedBreaches(breaches: BreachApiItem[]): Promise<void> {
  await enqueueBreachCacheWrite(async () => {
    const now = Date.now();
    await withDatabase(async (database) => {
      await database.runAsync("DELETE FROM breach_cache");
      for (const breach of breaches) {
        await database.runAsync(
          "INSERT INTO breach_cache (id, payload, updated_at) VALUES (?, ?, ?)",
          [breach.id, JSON.stringify(breach), now]
        );
      }
    });
  });
}

export async function insertScanResult(result: ScanResult): Promise<void> {
  await withDatabase(async (database) => {
    await database.runAsync(
      "INSERT OR REPLACE INTO scan_results (id, classification, confidence, messagePreview, timestamp, redFlags, suggestedActions, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        result.id,
        result.classification,
        result.confidence,
        result.messagePreview,
        result.timestamp,
        JSON.stringify(result.redFlags),
        JSON.stringify(result.suggestedActions),
        result.explanation,
      ]
    );
  });
}

export async function getScanResult(id: string): Promise<ScanResult | null> {
  const row = await withDatabase((database) =>
    database.getFirstAsync("SELECT * FROM scan_results WHERE id = ?", [id])
  );
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    classification: r.classification as ScanResult["classification"],
    confidence: r.confidence as number,
    messagePreview: r.messagePreview as string,
    timestamp: r.timestamp as number,
    redFlags: JSON.parse(r.redFlags as string),
    suggestedActions: JSON.parse(r.suggestedActions as string),
    explanation: r.explanation as string,
  };
}
