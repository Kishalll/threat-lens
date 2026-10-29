export type NimKeySource = "yours" | "built-in" | "none";

function clean(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// Your own key wins over the one built into the app. An older key stored on the
// device by earlier versions counts as built-in and is only a last resort.
export function pickNimKey(
  user: string | null | undefined,
  builtIn: string | null | undefined,
  legacy: string | null | undefined
): { key: string | null; source: NimKeySource } {
  const own = clean(user);
  if (own) return { key: own, source: "yours" };
  const bundled = clean(builtIn) ?? clean(legacy);
  if (bundled) return { key: bundled, source: "built-in" };
  return { key: null, source: "none" };
}

export function maskNimKey(key: string): string {
  return `nvapi-••••${key.slice(-4)}`;
}
