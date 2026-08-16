import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const failures = [];

if (!/const reportStartupError = error =>/.test(source)) failures.push('startup error reporter is missing');
if (!/読み込みに失敗しました/.test(source)) failures.push('Japanese loading error heading is missing');
if (!/detail\.textContent = error/.test(source)) failures.push('loading error detail is not shown as text');
if (!/if \(!response\.ok\) throw new Error\(`\$\{path\}/.test(source)) failures.push('JSON fetch failures do not retain their source path');
if ((source.match(/catch \(error\) \{\s*reportStartupError\(error\);/g) ?? []).length < 2) {
  failures.push('both JSON and image startup loaders must report failures');
}

if (failures.length) {
  console.error('LOADING ERROR VALIDATION FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('LOADING ERROR VALIDATION PASSED');
}
