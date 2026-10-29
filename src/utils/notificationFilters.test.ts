import {
  isLikelyMessagingPackage,
  isLikelySystemOrServiceNotification,
  isLowSignalNotification,
  isNoiseText,
} from "./notificationFilters";

describe("notificationFilters", () => {
  it("accepts messaging apps and OEM SMS packages, rejects others", () => {
    expect(isLikelyMessagingPackage("com.whatsapp")).toBe(true);
    expect(isLikelyMessagingPackage("com.google.android.apps.messaging")).toBe(true);
    expect(isLikelyMessagingPackage("com.oem.sms")).toBe(true);
    expect(isLikelyMessagingPackage("com.flipkart.android")).toBe(false);
    expect(isLikelyMessagingPackage("com.android.systemui")).toBe(false);
  });

  it("skips chat of three words or fewer", () => {
    expect(isLowSignalNotification("com.whatsapp", "Rahul", "ok see you")).toBe(true);
    expect(isLowSignalNotification("com.whatsapp", "Rahul", "Veryy good app")).toBe(true);
    expect(isLowSignalNotification("com.whatsapp", "Rahul", "Hi")).toBe(true);
  });

  it("scans anything longer, with digits, or mentioning a lure", () => {
    expect(isLowSignalNotification("com.whatsapp", "Rahul", "how is cd going gusy")).toBe(false);
    expect(isLowSignalNotification("com.whatsapp", "Unknown", "Is this you in this video?")).toBe(false);
    expect(isLowSignalNotification("com.whatsapp", "Unknown", "Claim reward now")).toBe(false);
    expect(isLowSignalNotification("com.whatsapp", "Unknown", "verify kyc")).toBe(false);
    expect(isLowSignalNotification("com.whatsapp", "Bank", "Rs 500 debited")).toBe(false);
  });

  it("does not scan a contact name as a lure", () => {
    expect(isLowSignalNotification("com.whatsapp", "Pinky Bank", "see you")).toBe(true);
  });

  it("skips media labels but keeps captions", () => {
    expect(isLowSignalNotification("com.whatsapp", "Group", "💟 Sent a sticker")).toBe(true);
    expect(isLowSignalNotification("com.whatsapp", "Group", "📷 Photo")).toBe(true);
    expect(isLowSignalNotification("com.whatsapp", "Group", "🎤 Voice message (0:05)")).toBe(true);
    expect(isLowSignalNotification("com.whatsapp", "Group", "📷 check this link")).toBe(false);
  });

  it("does not apply the short-message filter to email", () => {
    expect(isLowSignalNotification("com.google.android.gm", "Billing", "Your invoice is ready")).toBe(false);
  });

  it("filters system noise and ongoing notifications", () => {
    expect(isNoiseText("WhatsApp", "Checking for new messages")).toBe(true);
    expect(isNoiseText("Mom", "dinner at 8")).toBe(false);
    expect(isLikelySystemOrServiceNotification("", true)).toBe(true);
    expect(isLikelySystemOrServiceNotification("progress", false)).toBe(true);
    expect(isLikelySystemOrServiceNotification("msg", false)).toBe(false);
  });
});
