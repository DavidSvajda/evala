const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const PERFORMANCE_METHOD = 'evala-contextual-performance-v3';

// This is a rating-relative display heuristic, not an empirically calibrated
// Elo predictor. Accuracy is not a win probability. The log-odds transform
// provides a bounded, nonlinear response instead of a fixed points-per-percent
// correction. Preserve the existing expected-quality prior until calibration
// data collected with Evala's exact search/scoring protocol is available.
export function contextualPerformance(rating, quality) {
  const expectedQuality = clamp(55 + rating * 0.015, 60, 95);
  const odds = (percent) => {
    const q = clamp(percent, 0.5, 99.5) / 100;
    return Math.log(q) - Math.log1p(-q);
  };
  const delta = (400 / Math.log(10)) * (odds(quality) - odds(expectedQuality));
  return { value: Math.round(clamp(rating + delta, 100, 3500) / 50) * 50, expectedQuality };
}
