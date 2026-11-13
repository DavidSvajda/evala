export const ADMIN_PAGE_SIZE = 25;
export const DAY_MS = 86_400_000;

export function accountUsage(account) {
  const games = Object.values(account.games || {});
  const training = account.training || {};
  const times = [
    ...games.map((g) => g.updatedAt),
    ...Object.values(training.history || {}).map((p) => p.lastAt),
  ];
  return {
    name: account.name,
    email: account.email,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt || null,
    lastUsedAt:
      times.reduce(
        (latest, value) => (Number.isFinite(value) && value > latest ? value : latest),
        0,
      ) || null,
    games: games.length,
    reviews: games.filter((g) => g.analyzed === true).length,
    attempts:
      Number.isSafeInteger(training.attempted) && training.attempted > 0 ? training.attempted : 0,
  };
}

export function summarizeAccounts(users, { page, now }) {
  const week = now - 7 * DAY_MS;
  const totals = {
    accounts: users.length,
    newThisWeek: 0,
    activeThisWeek: 0,
    reviews: 0,
    attempts: 0,
  };
  for (const user of users) {
    if (user.createdAt >= week) totals.newThisWeek++;
    if (user.lastUsedAt >= week) totals.activeThisWeek++;
    totals.reviews += user.reviews;
    totals.attempts += user.attempts;
  }
  const offset = (page - 1) * ADMIN_PAGE_SIZE;
  return { totals, users: users.slice(offset, offset + ADMIN_PAGE_SIZE) };
}
