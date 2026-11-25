export interface Arm {
  views: number;
  taps: number;
}

/** Two-proportion z-test on tap rate. Says whether a difference is real, or that more visitors are needed. */
export function abSignificance(a: Arm, b: Arm, minViews = 30) {
  const ra = a.views ? a.taps / a.views : 0;
  const rb = b.views ? b.taps / b.views : 0;
  if (a.views < minViews || b.views < minViews) return { state: 'not-enough-data' as const, rateA: ra, rateB: rb, confidence: 0, needed: Math.max(minViews - a.views, minViews - b.views, 0) };
  const pooled = (a.taps + b.taps) / (a.views + b.views);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.views + 1 / b.views));
  if (!se) return { state: 'no-difference' as const, rateA: ra, rateB: rb, confidence: 0, needed: 0 };
  const z = Math.abs(ra - rb) / se;
  // two-sided confidence from the normal CDF
  const confidence = 1 - 2 * (1 - normalCdf(z));
  const state = confidence >= 0.95 ? (ra > rb ? ('A-wins' as const) : ('B-wins' as const)) : ('no-difference' as const);
  return { state, rateA: ra, rateB: rb, confidence, needed: 0 };
}

function normalCdf(z: number) {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}
