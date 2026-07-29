import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const forbiddenNames = /\b(?:ORACLE_CV_API_TOKEN|CLIENT_KEY_SECRET|CV_RELAY_TOKEN)\b/;
const bearerLiteral = /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i;
const marker = process.env.FORBIDDEN_SECRET_MARKER;

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}

const findings = [];
for (const file of await files(root)) {
  const content = await readFile(file);
  if (content.includes(0)) continue;
  const text = content.toString('utf8');
  if (forbiddenNames.test(text)) findings.push(`${relative(root, file)}: server-only variable name`);
  if (bearerLiteral.test(text)) findings.push(`${relative(root, file)}: bearer-token literal`);
  if (marker && text.includes(marker)) findings.push(`${relative(root, file)}: forbidden marker`);
}

if (findings.length) {
  console.error(`Browser secret scan failed:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Browser secret scan passed (${root}).`);
}
