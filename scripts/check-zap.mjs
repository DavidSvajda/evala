import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!report.site?.length) throw new Error('ZAP did not scan any sites.');
// Compatibility exceptions are exact findings, not whole scanner categories.
// Inline styles position the chessboard; COOP/COEP preserve Google login popups.
const accepted = new Set([
  '10055:CSP: style-src unsafe-inline',
  '90004:Cross-Origin-Embedder-Policy Header Missing or Invalid',
  '90004:Cross-Origin-Opener-Policy Header Missing or Invalid',
]);
let failures = 0;
for (const site of report.site) {
  for (const alert of site.alerts || []) {
    if (Number(alert.riskcode) === 0) continue;
    const key = `${alert.pluginid}:${alert.name}`;
    if (accepted.has(key)) console.log(`Documented compatibility exception: ${key}`);
    else {
      console.error(`Unreviewed ZAP finding: ${key}`);
      failures++;
    }
  }
}
if (failures) throw new Error(`${failures} ZAP findings need review.`);
