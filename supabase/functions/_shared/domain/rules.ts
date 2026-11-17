// Default rule values from the product plan. Each is a starting value to tune, not a final answer.
export const RULES = {
  maxActiveTasks: 3,
  minExplanationChars: 20,
  strikesPerCycle: 3,
  statementWindowHours: 24,
  voteWindowHours: 24,
  minGroupSize: 3,
  maxGroupSize: 8,
  defaultWindowStart: '06:00',
  defaultWindowEnd: '22:00',
} as const;
