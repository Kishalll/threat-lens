export type RetentionMode = "30d" | "90d" | "custom" | "forever";
export type RetentionUnit = "days" | "weeks" | "months";
export type ThemePreference = "dark" | "light" | "system";
export type BreachInterval = 6 | 12 | 24;

export interface AppSettings {
  scanner: {
    interceptionEnabled: boolean;
    disabledApps: string[];
    promoAlerts: boolean;
    pastePrompts: boolean;
    retention: {
      mode: RetentionMode;
      customValue: number;
      customUnit: RetentionUnit;
    };
  };
  breach: {
    backgroundChecks: boolean;
    intervalHours: BreachInterval;
    alerts: boolean;
  };
  general: {
    theme: ThemePreference;
    appLock: boolean;
  };
}

// Defaults keep today's behaviour, except breach checks drop from hourly to every 6 hours.
export const DEFAULT_SETTINGS: AppSettings = {
  scanner: {
    interceptionEnabled: true,
    disabledApps: [],
    promoAlerts: true,
    pastePrompts: true,
    retention: { mode: "forever", customValue: 30, customUnit: "days" },
  },
  breach: {
    backgroundChecks: true,
    intervalHours: 6,
    alerts: true,
  },
  general: {
    theme: "dark",
    appLock: false,
  },
};

// Custom retention is capped at one year in each unit.
export const CUSTOM_RETENTION_LIMITS: Record<RetentionUnit, number> = {
  days: 365,
  weeks: 52,
  months: 12,
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

// Builds a full, valid settings object from whatever was stored: missing or
// broken values fall back to the defaults, so older saves keep working.
export function mergeSettings(stored: unknown): AppSettings {
  const root = record(stored);
  const scanner = record(root.scanner);
  const retention = record(scanner.retention);
  const breach = record(root.breach);
  const general = record(root.general);
  const d = DEFAULT_SETTINGS;

  const customUnit = oneOf<RetentionUnit>(retention.customUnit, ["days", "weeks", "months"], d.scanner.retention.customUnit);
  const limit = CUSTOM_RETENTION_LIMITS[customUnit];
  const rawValue = Number(retention.customValue);
  const customValue = Number.isInteger(rawValue) && rawValue >= 1 && rawValue <= limit
    ? rawValue
    : Math.min(d.scanner.retention.customValue, limit);

  return {
    scanner: {
      interceptionEnabled: bool(scanner.interceptionEnabled, d.scanner.interceptionEnabled),
      disabledApps: stringList(scanner.disabledApps),
      promoAlerts: bool(scanner.promoAlerts, d.scanner.promoAlerts),
      pastePrompts: bool(scanner.pastePrompts, d.scanner.pastePrompts),
      retention: {
        mode: oneOf<RetentionMode>(retention.mode, ["30d", "90d", "custom", "forever"], d.scanner.retention.mode),
        customValue,
        customUnit,
      },
    },
    breach: {
      backgroundChecks: bool(breach.backgroundChecks, d.breach.backgroundChecks),
      intervalHours: oneOf<BreachInterval>(breach.intervalHours, [6, 12, 24], d.breach.intervalHours),
      alerts: bool(breach.alerts, d.breach.alerts),
    },
    general: {
      theme: oneOf<ThemePreference>(general.theme, ["dark", "light", "system"], d.general.theme),
      appLock: bool(general.appLock, d.general.appLock),
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Oldest scan timestamp to keep, or null to keep everything. Custom months are
// calendar months, so 31 March minus one month lands on the last day of February.
export function retentionCutoff(retention: AppSettings["scanner"]["retention"], now: number): number | null {
  switch (retention.mode) {
    case "forever":
      return null;
    case "30d":
      return now - 30 * DAY_MS;
    case "90d":
      return now - 90 * DAY_MS;
    case "custom": {
      if (retention.customUnit === "months") {
        const date = new Date(now);
        const day = date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() - retention.customValue);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(day, lastDay));
        return date.getTime();
      }
      const days = retention.customUnit === "weeks" ? retention.customValue * 7 : retention.customValue;
      return now - days * DAY_MS;
    }
  }
}

export function retentionLabel(retention: AppSettings["scanner"]["retention"]): string {
  if (retention.mode === "30d") return "30 days";
  if (retention.mode === "90d") return "90 days";
  if (retention.mode === "forever") return "forever";
  const unit = retention.customValue === 1 ? retention.customUnit.slice(0, -1) : retention.customUnit;
  return `${retention.customValue} ${unit}`;
}
