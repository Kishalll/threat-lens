import { applyClassificationGuardrails } from "./classificationGuardrails";
import type { ScanResult } from "../types";

function aiResult(classification: ScanResult["classification"], confidence: number): ScanResult {
  return {
    id: "scan",
    timestamp: 1,
    classification,
    confidence,
    messagePreview: "",
    redFlags: ["flag"],
    suggestedActions: ["action"],
    explanation: "model",
  };
}

function classify(text: string, classification: ScanResult["classification"], confidence: number) {
  return applyClassificationGuardrails(text, aiResult(classification, confidence)).classification;
}

describe("classificationGuardrails", () => {
  it("keeps bank OTPs with a do-not-share warning safe", () => {
    const text =
      "123456 is your OTP for txn of Rs 2,000 at Amazon on HDFC Bank card ending 1234. Never share your OTP or PIN with anyone.";
    expect(classify(text, "PHISHING", 90)).toBe("SAFE");
  });

  it("keeps UPI debit alerts with a helpline safe", () => {
    const text =
      "Rs.500.00 debited from A/c XX1234 on 12-10-26 to VPA 9876543210@ybl. UPI Ref 4321. Not you? Call 18002586161 to block UPI. -SBI";
    expect(classify(text, "SCAM", 85)).toBe("SAFE");
  });

  it("keeps delivery OTPs safe", () => {
    const text =
      "Your Amazon order #408-123 is out for delivery. Delivery OTP 4821, share it with the agent only.";
    expect(classify(text, "PHISHING", 75)).toBe("SAFE");
  });

  it("does not treat brand domains as link shorteners", () => {
    const text = "Big Billion Days is live! Up to 80% off. Shop now at flipkart.com";
    expect(classify(text, "SCAM", 60)).toBe("SAFE");
  });

  it("does not flag plan expiry reminders from the operator", () => {
    const text = "Your Jio plan expires tonight. Recharge now at jio.com to continue enjoying benefits.";
    expect(classify(text, "SCAM", 65)).toBe("SAFE");
  });

  it("keeps a fake debit alert that pushes a personal number", () => {
    const text =
      "Rs 5000 debited from A/c XX1234. Not you? Call 9876543210 immediately or your account will be blocked.";
    expect(classify(text, "SCAM", 85)).toBe("SCAM");
  });

  it("keeps KYC phishing with a short link", () => {
    const text = "Dear customer your SBI account will be blocked today. Update KYC here: bit.ly/sbi-kyc";
    expect(classify(text, "PHISHING", 70)).toBe("PHISHING");
  });

  it("does not let a safety warning hide a real OTP request", () => {
    const text = "Do not share this with anyone. Send your OTP to 9876543210 to get your refund.";
    expect(classify(text, "PHISHING", 70)).toBe("PHISHING");
  });

  it("trusts a confident verdict without regex backing, but not a weak one", () => {
    const text = "Hello sir, I am calling from your bank about your card upgrade";
    expect(classify(text, "SCAM", 85)).toBe("SCAM");
    expect(classify(text, "SCAM", 60)).toBe("SAFE");
  });

  it("treats short greetings as safe and clears flags on promo", () => {
    expect(classify("hey", "PROMO", 60)).toBe("SAFE");
    const promo = applyClassificationGuardrails("Flat 50% off today", aiResult("PROMO", 80));
    expect(promo.redFlags).toEqual([]);
    expect(promo.suggestedActions).toEqual([]);
  });
});
