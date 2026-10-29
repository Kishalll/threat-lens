import * as LocalAuthentication from "expo-local-authentication";

// App lock needs at least a phone PIN, pattern or password; biometrics are optional.
export async function canUseAppLock(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

// Shows the system prompt: fingerprint or face, with the phone PIN as fallback.
export async function unlock(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
