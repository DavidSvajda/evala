import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
