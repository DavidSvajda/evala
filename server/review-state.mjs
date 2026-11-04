import { searchSettings } from '../src/study/uci.js';

// Preserve bounded resume metadata, never arbitrary client properties or badges.
export function reviewState(input, positionCount) {
  const indices = (value, max, limit) =>
    Array.isArray(value)
      ? [...new Set(value.filter((n) => Number.isInteger(n) && n >= 0 && n < max))].slice(0, limit)
      : [];
  const metadata = {
    refined: indices(input.refined, positionCount - 1, 8),
    refinedPositions: indices(input.refinedPositions, positionCount, 16),
  };
  if (input.options && typeof input.options === 'object' && !Array.isArray(input.options)) {
    const s = searchSettings(input.options);
    metadata.options = { depth: s.depth, time: s.time, multipv: s.multipv };
  }
  if (['quick', 'balanced', 'deep', 'custom'].includes(input.profile))
    metadata.profile = input.profile;
  if (Number.isFinite(input.startedAt))
    metadata.startedAt = Math.max(0, Math.min(Date.now(), input.startedAt));
  return metadata;
}
