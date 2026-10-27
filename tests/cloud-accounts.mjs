// Exercises the real private Azure store with disposable fixture identities.
// The Google signature is a local test key, never accepted by the deployed API.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { BlobServiceClient } from '@azure/storage-blob';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { createDocumentStore } from '../server/document-store.mjs';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';

const connectionString = (
  await readFile('.local-data/deployment/account-storage-connection.txt', 'utf8')
).trim();
const container = 'evala-qa-' + randomUUID(),
  client = 'azure-qa.apps.googleusercontent.com',
  keys = await generateKeyPair('RS256');
const service = BlobServiceClient.fromConnectionString(connectionString),
  bank = JSON.parse(await readFile('public/data/puzzles.json', 'utf8')).puzzles;
const options = { connectionString, container },
  store = createDocumentStore(options);
let server, base;
async function start() {
  server = createAnalysisServer({
    token: 'qa-owner',
    publicReports: true,
    accounts: {
      store: createDocumentStore(options),
      googleClientId: client,
      verifyGoogle: async (token) =>
        (
          await jwtVerify(token, keys.publicKey, {
            audience: client,
            issuer: 'https://accounts.google.com',
            algorithms: ['RS256'],
          })
        ).payload,
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function close() {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
}
async function login(sub) {
  const response = await fetch(base + '/api/account/config'),
    config = await response.json();
  assert.equal(config.persistent, true);
  const credential = await new SignJWT({
    sub,
    email: sub + '@example.test',
    email_verified: true,
    name: 'Cloud QA',
    nonce: config.challenge,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setAudience(client)
    .setIssuer('https://accounts.google.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey);
  const result = await fetch(base + '/api/account/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: response.headers.get('set-cookie').split(';')[0],
      'X-CSRF-Token': config.challenge,
    },
    body: JSON.stringify({ credential }),
  });
  assert.equal(result.status, 200);
  const data = await result.json();
  return {
    Cookie: result.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json',
    'X-CSRF-Token': data.csrf,
  };
}
async function api(headers, path, method = 'GET', body) {
  const r = await fetch(base + '/api/account/' + path, {
    headers,
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.ok, true, `${path}: ${r.status} ${data.error || ''}`);
  return data;
}
try {
  await store.put('transaction-fixture', { value: 0 });
  const secondStore = createDocumentStore(options);
  await Promise.all([
    store.transact('transaction-fixture', (a) => ({ value: a.value + 1 })),
    secondStore.transact('transaction-fixture', (a) => ({ value: a.value + 1 })),
  ]);
  assert.equal((await store.get('transaction-fixture')).value.value, 2);
  await start();
  const alice = await login('alice'),
    bob = await login('bob');
  const game = parsePgn(
    '[Event "Disposable cloud QA"]\n[White "Fixture"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
  );
  game.notes = 'Disposable cloud sync fixture';
  const saved = await api(alice, 'library/' + game.id, 'PUT', game);
  assert.ok(saved.version);
  assert.equal((await api(alice, 'library/' + game.id)).game.notes, game.notes);
  assert.equal(
    (await fetch(base + '/api/account/library/' + game.id, { headers: bob })).status,
    404,
  );
  await api(alice, 'profile', 'PATCH', {
    preferences: { boardTheme: 'blue', language: 'en', sidebarCollapsed: true },
  });
  const next = await api(alice, 'puzzle/next', 'POST', { mode: 'rated', theme: 'mateIn1' }),
    puzzle = bank.find((p) => p.id === next.puzzle.id);
  assert.ok(puzzle);
  let graded;
  for (let i = 1; i < puzzle.moves.length; i += 2)
    graded = await api(alice, 'puzzle/move', 'POST', {
      challengeId: next.puzzle.challengeId,
      move: puzzle.moves[i],
    });
  assert.equal(graded.state.complete, true);
  assert.equal(graded.training.solved, 1);
  await close();
  await start();
  const restored = await api(alice, 'me');
  assert.equal(restored.user.preferences.language, 'en');
  assert.equal(restored.training.solved, 1);
  assert.equal((await api(alice, 'library/' + game.id)).game.notes, game.notes);
  await api(alice, 'delete', 'POST', {});
  assert.equal((await api(alice, 'me')).user, null);
  const result = {
    passed: true,
    checks: [
      'real Azure Blob read/write',
      'optimistic concurrency across clients',
      'account isolation',
      'library and notes',
      'preferences',
      'server puzzle grading',
      'persistence across restart',
      'account deletion',
    ],
    realGoogleLogin: false,
  };
  await mkdir('.local-data/audit-2026-10-25', { recursive: true });
  await writeFile(
    '.local-data/audit-2026-10-25/cloud-accounts.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await close();
  await service.getContainerClient(container).deleteIfExists();
  console.log('Disposable QA container removed; production account data was not modified.');
}
