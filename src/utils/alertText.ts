// Notification wording shared by the foreground, headless and breach paths.
// NotificationWorker in withThreatLensConfig.js posts the same text natively, so change both.

export function threatAlertText(classification: string, appName: string) {
  const isPhishing = classification === "PHISHING";
  return {
    title: isPhishing ? "Possible phishing message" : "Possible scam message",
    body: `A message in ${appName} looks like ${isPhishing ? "phishing" : "a scam"}. Tap to see why.`,
  };
}

export function promoAlertText(appName: string) {
  return {
    title: "Looks like a promo",
    body: `A message in ${appName} looks like an ad or offer.`,
  };
}

export function pastePromptText(sender: string) {
  return {
    title: "Message was cut off",
    body: `We only saw part of a message from ${sender}. Tap to paste all of it.`,
  };
}

export function scanUnavailableText(reason: string) {
  return {
    title: "Couldn't check a message",
    body: `${reason} Tap to try again in Scanner.`,
  };
}

export function breachAlertText(count: number, who: string) {
  return {
    title: count === 1 ? "New data breach" : "New data breaches",
    body: `Found ${count} new ${count === 1 ? "breach" : "breaches"} for ${who}. Tap to see what leaked.`,
  };
}
