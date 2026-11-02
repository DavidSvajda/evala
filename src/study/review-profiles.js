export const REVIEW_PROFILES = Object.freeze({
  quick: Object.freeze({
    time: 150,
    depth: 16,
    multipv: 2,
    hash: 64,
    refineLimit: 2,
    greatLimit: 2,
    specialLimit: 2,
    verifySacrifices: true,
  }),
  balanced: Object.freeze({
    time: 500,
    depth: 20,
    multipv: 3,
    hash: 64,
    refineLimit: 4,
    greatLimit: 4,
    specialLimit: 6,
    verifySacrifices: true,
  }),
});
