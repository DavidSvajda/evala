import { cleanStudyKit, STUDY_LIMITS } from './study-kit.js';

export const STUDY_KIT_BYTES = 256000;
// Two bounded snapshots plus the rest of the portable settings and JSON envelope.
export const ACCOUNT_PROFILE_BYTES = 544000;
export const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const full = () =>
  Object.assign(new Error('Studijní prostor je plný. Exportuj a odeber starší obsah.'), {
    status: 413,
  });

export function assertStudyKitSize(kit) {
  if (jsonBytes(kit) > STUDY_KIT_BYTES) throw full();
  return kit;
}

function mergeEntries(current, next, base, limit, onCopy) {
  const remote = new Map(current.map((entry) => [entry.id, entry])),
    local = new Map(next.map((entry) => [entry.id, entry])),
    original = new Map(base.map((entry) => [entry.id, entry])),
    result = [];
  for (const id of new Set([...remote.keys(), ...local.keys(), ...original.keys()])) {
    const r = remote.get(id),
      l = local.get(id),
      b = original.get(id);
    if (same(l, b) || same(r, l)) {
      if (r) result.push(r);
    } else if (same(r, b)) {
      if (l) result.push(l);
    } else if (!l || !r) {
      // A deletion cannot erase an edit made since the deleted snapshot.
      result.push(l || r);
    } else {
      const merged = { ...r };
      let conflict = false;
      for (const field of Object.keys(l)) {
        if (same(l[field], b?.[field])) continue;
        if (!same(r[field], b?.[field]) && !same(r[field], l[field])) conflict = true;
        merged[field] = l[field];
      }
      if (!conflict) result.push(merged);
      else {
        result.push(r);
        // Stable across retries of the same offline patch, including a lost acknowledgement.
        let hash = 2166136261;
        for (const char of JSON.stringify(l)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        const stem = id.slice(0, 40) + '_copy_' + (hash >>> 0).toString(36);
        let copyId = stem,
          index = 2;
        while (
          (remote.has(copyId) || local.has(copyId)) &&
          !same(remote.get(copyId), { ...l, id: copyId, title: l.title.slice(0, 65) + ' · copy' })
        )
          copyId = stem + '_' + index++;
        if (!remote.has(copyId)) {
          result.push({ ...l, id: copyId, title: l.title.slice(0, 65) + ' · copy' });
          onCopy();
        }
      }
    }
  }
  if (result.length > limit) throw full();
  return result;
}

// The base is the snapshot this device edited, never the latest server snapshot.
// Legacy outboxes have no base: retain their additions without inferring deletions.
export function mergeStudyKits(current, next, base, onCopy = () => {}) {
  const r = cleanStudyKit(current),
    l = cleanStudyKit(next),
    b = cleanStudyKit(base);
  const kit = {
    ...r,
    lines: mergeEntries(r.lines, l.lines, b.lines, STUDY_LIMITS.lines, onCopy),
    tasks: mergeEntries(r.tasks, l.tasks, b.tasks, STUDY_LIMITS.tasks, onCopy),
    days: [...new Set([...r.days, ...l.days])].sort().slice(-30),
    weeklyGoal: l.weeklyGoal === b.weeklyGoal ? r.weeklyGoal : l.weeklyGoal,
    reviews: { ...r.reviews },
  };
  for (const [id, review] of Object.entries(l.reviews)) {
    const prior = r.reviews[id];
    if (!prior || same(prior, b.reviews[id])) kit.reviews[id] = review;
    else if (!same(review, b.reviews[id]))
      kit.reviews[id] = {
        due: Math.min(prior.due, review.due),
        level: Math.min(prior.level, review.level),
        correct: Math.max(prior.correct, review.correct),
        wrong: Math.max(prior.wrong, review.wrong),
      };
  }
  if (Object.keys(kit.reviews).length > STUDY_LIMITS.reviews) throw full();
  return assertStudyKitSize(cleanStudyKit(kit));
}
