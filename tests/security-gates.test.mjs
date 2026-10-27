import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
