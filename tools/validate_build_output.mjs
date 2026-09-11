import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPaths, imagePaths } from '../src/asset-manifest.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const indexPath = resolve(distRoot, 'index.html');
const relativePath = path => String(path).replace(/^\/+/, '');

const exists = async path => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

if (!await exists(indexPath)) {
  throw new Error('dist/ がありません。先に npm run build を実行してください。');
}

const failures = [];
const indexHtml = await readFile(indexPath, 'utf8');
for (const match of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
  // GoatCounter is an external script, not a root-relative Pages asset.
  if (match[1] === '//gc.zgo.at/count.js') continue;
  if (match[1].startsWith('/')) failures.push(`index.html に絶対参照が残っています: ${match[1]}`);
}

const stagePath = dataPaths.find(path => path.endsWith('/course-01-objects.json'));
if (!stagePath) failures.push('dataPaths に course-01-objects.json がありません');
const stage = stagePath
  ? JSON.parse(await readFile(resolve(projectRoot, relativePath(stagePath)), 'utf8'))
  : { parallax: [] };
const parallaxPaths = stage.parallax.map(layer => layer.src);
if (parallaxPaths.length !== 4) failures.push(`パララックスは4枚必要です: ${parallaxPaths.length}枚`);

const runtimePaths = new Set([...Object.values(imagePaths), ...dataPaths, ...parallaxPaths]);
for (const path of runtimePaths) {
  if (!await exists(resolve(distRoot, relativePath(path)))) failures.push(`dist に実行時ファイルがありません: ${path}`);
}

const directorySize = async directory => {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    total += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size;
  }
  return total;
};

const totalBytes = await directorySize(distRoot);
const limitBytes = 20 * 1024 * 1024;
if (totalBytes >= limitBytes) failures.push(`dist が20MB以上です: ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);

console.log(`Build output: ${runtimePaths.size} runtime files / ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('BUILD OUTPUT VALIDATION PASSED');
