import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!Array.isArray(report.Results)) throw new Error('Missing Trivy results.');
let blocked = 0,
  unfixed = 0;
for (const result of report.Results) {
  for (const issue of result.Vulnerabilities || []) {
    if (!['HIGH', 'CRITICAL'].includes(issue.Severity)) continue;
    if (issue.FixedVersion) {
      console.error(`${issue.VulnerabilityID}: ${issue.PkgName} has fix ${issue.FixedVersion}`);
      blocked++;
    } else {
      console.log(`Upstream fix unavailable: ${issue.VulnerabilityID} / ${issue.PkgName}`);
      unfixed++;
    }
  }
  // Never echo matched secret contents, even when reporting a failed image.
  for (const secret of result.Secrets || []) {
    console.error(`Secret rule ${secret.RuleID} in ${result.Target}`);
    blocked++;
  }
}
console.log(`Image findings: ${blocked} blockers, ${unfixed} unfixed high/critical advisories.`);
if (blocked) throw new Error('Runtime image failed security policy.');
