import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('scanner gates reject extension-pack SARIF findings, new ZAP warnings and image secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evala-security-gates-'));
  const run = (script, path) =>
    spawnSync(process.execPath, ['scripts/' + script, path], { encoding: 'utf8' });
  const sarif = {
    runs: [
      {
        tool: {
          driver: {},
          extensions: [{ rules: [{ id: 'fixture', properties: { 'security-severity': '8.1' } }] }],
        },
        results: [{ ruleId: 'fixture' }],
      },
    ],
  };
  await writeFile(join(root, 'fixture.sarif'), JSON.stringify(sarif));
  assert.notEqual(run('check-codeql.mjs', root).status, 0);
  sarif.runs[0].results = [];
  await writeFile(join(root, 'fixture.sarif'), JSON.stringify(sarif));
  assert.equal(run('check-codeql.mjs', root).status, 0);
  const zap = join(root, 'zap.json');
  await writeFile(
    zap,
    JSON.stringify({
      site: [{ alerts: [{ riskcode: '1', pluginid: '999', name: 'New warning' }] }],
    }),
  );
  assert.notEqual(run('check-zap.mjs', zap).status, 0);
  const image = join(root, 'image.json');
  await writeFile(
    image,
    JSON.stringify({
      Results: [
        { Vulnerabilities: [{ VulnerabilityID: 'fixture', Severity: 'HIGH', FixedVersion: '2' }] },
      ],
    }),
  );
  assert.notEqual(run('check-trivy.mjs', image).status, 0);
  await writeFile(
    image,
    JSON.stringify({ Results: [{ Secrets: [{ RuleID: 'fixture', Match: 'NEVER_ECHO_SECRET' }] }] }),
  );
  const secret = run('check-trivy.mjs', image);
  assert.notEqual(secret.status, 0);
  assert.ok(!(secret.stdout + secret.stderr).includes('NEVER_ECHO_SECRET'));
  await writeFile(image, JSON.stringify({ Results: [] }));
  assert.equal(run('check-trivy.mjs', image).status, 0);
});

test('reviewed CodeQL fixture flows require the exact rule, unchanged source, location and review date', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evala-codeql-reviewed-'));
  const file = join(root, 'reviewed.sarif');
  const result = {
    ruleId: 'js/file-access-to-http',
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'tests/accounts.test.mjs' },
          region: { startLine: 262 },
        },
      },
    ],
  };
  const report = {
    runs: [
      {
        tool: {
          driver: {
            rules: [{ id: 'js/file-access-to-http', properties: { 'security-severity': '6.5' } }],
          },
        },
        results: [result],
      },
    ],
  };
  await writeFile(file, JSON.stringify(report));
  const run = () =>
    spawnSync(process.execPath, ['scripts/check-codeql.mjs', root], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  result.locations[0].physicalLocation.region.startLine = 263;
  await writeFile(file, JSON.stringify(report));
  assert.notEqual(run().status, 0, 'a new flow at a different line still blocks CI');
  result.locations[0].physicalLocation.region.startLine = 262;
  result.locations[0].physicalLocation.artifactLocation.uri = 'server/accounts.mjs';
  await writeFile(file, JSON.stringify(report));
  assert.notEqual(run().status, 0, 'production code cannot use a test-only review');
  const isolated = await mkdtemp(join(tmpdir(), 'evala-codeql-source-'));
  await mkdir(join(isolated, 'tests'));
  for (const path of ['accounts.test.mjs', 'cloud-accounts.mjs'])
    await writeFile(join(isolated, 'tests', path), await readFile('tests/' + path));
  result.locations[0].physicalLocation.artifactLocation.uri = 'tests/accounts.test.mjs';
  await writeFile(file, JSON.stringify(report));
  const runIsolated = () =>
    spawnSync(process.execPath, [resolve('scripts/check-codeql.mjs'), root], {
      cwd: isolated,
      encoding: 'utf8',
    });
  assert.equal(runIsolated().status, 0);
  await writeFile(
    join(isolated, 'tests/accounts.test.mjs'),
    '// changed source requires a new review',
  );
  assert.notEqual(runIsolated().status, 0, 'changed source cannot inherit a prior exception');
});
