export function portableStudySettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result = {};
  for (const [key, choices] of Object.entries({
    engine: ['full', 'lite'],
    profile: ['quick', 'balanced', 'deep', 'custom'],
    lastPlatform: ['chesscom', 'lichess'],
    reportProfile: ['quick', 'balanced'],
  }))
    if (choices.includes(input[key])) result[key] = input[key];
  for (const [key, min, max] of [
    ['depth', 6, 30],
    ['time', 100, 10000],
    ['hash', 16, 256],
    ['multipv', 1, 5],
  ])
    if (Number.isInteger(input[key]) && input[key] >= min && input[key] <= max)
      result[key] = input[key];
  if (typeof input.arrows === 'boolean') result.arrows = input.arrows;
  for (const key of ['lastUsername', 'reportUser'])
    if (typeof input[key] === 'string' && /^[A-Za-z0-9_-]{0,40}$/.test(input[key]))
      result[key] = input[key];
  if ([10, 20, 30, 50, 100].includes(input.reportCount)) result.reportCount = input.reportCount;
  if (Array.isArray(input.reportIds) && input.reportIds.length <= 200)
    result.reportIds = [
      ...new Set(
        input.reportIds.filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)),
      ),
    ];
  return result;
}

export function mergeAccountPreferences(prior = {}, patch = {}) {
  const result = { ...prior, ...patch };
  if (patch.study) result.study = { ...prior.study, ...patch.study };
  if (
    prior.lesson &&
    patch.lesson &&
    prior.lesson.day === patch.lesson.day &&
    JSON.stringify(prior.lesson.ids) === JSON.stringify(patch.lesson.ids)
  )
    result.lesson = {
      ...patch.lesson,
      done: [...new Set([...(prior.lesson.done || []), ...(patch.lesson.done || [])])],
    };
  return result;
}

// Remove only acknowledged fields; edits made while a request is in flight remain pending.
export function remainingPreferencePatch(pending, sent) {
  const result = { ...pending };
  for (const key of Object.keys(sent)) {
    if (key === 'study' && result.study) {
      const study = { ...result.study };
      for (const field of Object.keys(sent.study))
        if (JSON.stringify(study[field]) === JSON.stringify(sent.study[field])) delete study[field];
      if (Object.keys(study).length) result.study = study;
      else delete result.study;
    } else if (JSON.stringify(result[key]) === JSON.stringify(sent[key])) delete result[key];
  }
  return result;
}
