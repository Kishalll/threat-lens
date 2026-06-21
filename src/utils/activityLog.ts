const ICONS: Record<string, string> = {
  intercepted: "🔔",
  classified: "🧠",
  alert_sent: "🚨",
  paste_prompt: "📋",
  low_signal: "🔇",
  noise_filtered: "🚫",
  breach_found: "⚠️",
  breach_check: "🔍",
  img_protected: "🛡️",
  img_verified: "✅",
  img_verify_fail: "❌",
  nim_key_stored: "🔑",
  pending_scans_loaded: "📂",
  app_open: "🚀",
  dedup_skip: "♻️",
};

function ts(): string {
  return new Date().toLocaleTimeString("en-IN", { hour12: false });
}

export function log(event: keyof typeof ICONS | string, detail?: string): void {
  const icon = ICONS[event] ?? "📝";
  const msg = detail ? `${detail}` : "";
  console.log(`[${ts()}] ${icon} ${event}${msg ? `: ${msg}` : ""}`);
}
