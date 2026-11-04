import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Explicitly reviewed fixture flows only: source hash, rule, file and exact line
// must all match. Changed test files or expired reviews fail closed.
const reviewed = JSON.parse(await readFile(new URL('./codeql-reviewed.json', import.meta.url)));
const approved = new Set();
for (const item of reviewed) {
  if (!/^tests\/[a-zA-Z0-9.-]+\.mjs$/.test(item.path) || !item.reason)
    throw new Error('Invalid CodeQL review record');
  const source = (await readFile(item.path, 'utf8')).replace(/\r\n/g, '\n');
  const expires = Date.parse(item.expires + 'T23:59:59Z');
  if (!Number.isFinite(expires)) throw new Error('CodeQL review must have a valid expiry');
  if (expires < Date.now()) continue;
  if (createHash('sha256').update(source).digest('hex') !== item.sha256) continue;
  for (const line of item.lines) approved.add(`${item.rule}:${item.path}:${line}`);
}

const directory = process.argv[2];
const files = (await readdir(directory)).filter((name) => name.endsWith('.sarif'));
if (!files.length) throw new Error('CodeQL did not produce a SARIF report.');
let findings = 0;
for (const file of files) {
  const report = JSON.parse(await readFile(join(directory, file), 'utf8'));
  for (const run of report.runs || []) {
    const rules = new Map(
      [run.tool.driver, ...(run.tool.extensions || [])]
        .flatMap((component) => component.rules || [])
        .map((rule) => [rule.id, rule]),
    );
    for (const result of run.results || []) {
      const location = result.locations?.[0]?.physicalLocation;
      const key = `${result.ruleId || result.rule?.id}:${location?.artifactLocation?.uri}:${location?.region?.startLine}`;
      if (approved.has(key)) {
        console.log('Reviewed local fixture flow: ' + key);
        continue;
      }
      const rule = rules.get(result.ruleId || result.rule?.id);
      if (!rule) throw new Error('CodeQL result has no rule metadata.');
      const severity = Number(rule.properties?.['security-severity']);
      if (
        severity >= 4 ||
        (!Number.isFinite(severity) && rule.properties?.tags?.includes('security'))
      ) {
        console.error(
          `${result.ruleId}: ${result.locations?.[0]?.physicalLocation?.artifactLocation?.uri || 'unknown file'}`,
        );
        findings++;
      }
    }
  }
}
if (findings) throw new Error(`${findings} CodeQL security findings require review.`);
console.log('No medium/high/critical CodeQL findings.');
