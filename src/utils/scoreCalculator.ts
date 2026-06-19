export interface ScoreInputs {
  activeBreachesCount: number;
  protectedImagesCount: number;
  scannedMessages: {
    id: string;
    riskType: "SAFE" | "PROMO" | "SCAM" | "PHISHING" | "SPAM";
    totalSuggestions: number;
    actedSuggestions: number;
  }[];
  breachActionProgress?: {
    totalSuggestions: number;
    actedSuggestions: number;
    resolvedBreachEquivalent?: number;
    pendingBreachCount?: number;
  };
}

export interface ScannedMessage {
  id: string;
  riskType: "SAFE" | "PROMO" | "SCAM" | "PHISHING" | "SPAM";
  totalSuggestions: number;
  actedSuggestions: number;
}

type RiskType = ScannedMessage["riskType"];

const BASE_SCORE = 100;

function getBreachPenalty(count: number): number {
  if (count <= 0) return 0;
  return 15 + Math.max(0, count - 1) * 6;
}

function getRiskPenalty(type: RiskType): number {
  switch (type) {
    case "SCAM":
      return 3;
    case "PHISHING":
      return 5;
    case "SPAM":
      return 2;
    case "PROMO":
    case "SAFE":
      return 0;
  }
}

const IMAGE_BONUS_PER_PROTECTION = 3;
const MAX_IMAGE_BONUS = 15;

function clampScore(value: number): number {
  if (value < 10) return 10;
  if (value > 100) return 100;
  return value;
}

function calculateMessageImpact(message: ScannedMessage): number {
  const penalty = getRiskPenalty(message.riskType);
  if (penalty === 0) {
    return 0;
  }

  const totalSuggestions = Math.max(1, Math.floor(message.totalSuggestions));
  const actedSuggestions = Math.min(
    Math.max(0, Math.floor(message.actedSuggestions)),
    totalSuggestions
  );

  const recovery = (actedSuggestions / totalSuggestions) * penalty;
  return penalty - recovery;
}

function calculateBreachImpact(inputs: ScoreInputs): number {
  const activeBreachesCount = Math.max(0, Math.floor(inputs.activeBreachesCount));
  const pendingBreachCount = Math.max(
    0,
    Math.floor(inputs.breachActionProgress?.pendingBreachCount ?? 0)
  );
  const effectiveActiveBreaches = Math.max(activeBreachesCount, pendingBreachCount);
  const basePenalty = getBreachPenalty(effectiveActiveBreaches);
  if (basePenalty === 0) {
    return 0;
  }

  const resolvedBreachEquivalent = Math.max(
    0,
    inputs.breachActionProgress?.resolvedBreachEquivalent ?? 0
  );

  const recoveryRatio = Math.min(
    1,
    resolvedBreachEquivalent / effectiveActiveBreaches
  );

  return basePenalty * (1 - recoveryRatio);
}

export function calculateSafetyScore(inputs: ScoreInputs): number {
  const activeBreachesCount = Math.max(0, Math.floor(inputs.activeBreachesCount));
  const protectedImagesCount = Math.max(0, Math.floor(inputs.protectedImagesCount));

  let score = BASE_SCORE;

  score -= calculateBreachImpact(inputs);

  for (const message of inputs.scannedMessages) {
    score -= calculateMessageImpact(message);
  }

  score += Math.min(
    protectedImagesCount * IMAGE_BONUS_PER_PROTECTION,
    MAX_IMAGE_BONUS
  );

  if (activeBreachesCount > 0) {
    score = Math.min(score, 99);
  }

  return Math.round(clampScore(score));
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "#83D0AE";
  if (score >= 50) return "#D7AE78";
  return "#DC8C8C";
}