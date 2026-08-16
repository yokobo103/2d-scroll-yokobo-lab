import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPaths, imagePaths } from '../src/asset-manifest.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const relativePath = path => String(path).replace(/^\/+/, '');
const isWithin = (root, target) => {
  const path = relative(root, target);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
};

const stagePath = dataPaths.find(path => path.endsWith('/course-01-objects.json'));
if (!stagePath) throw new Error('dataPaths に course-01-objects.json がありません');

const stage = JSON.parse(await readFile(resolve(projectRoot, relativePath(stagePath)), 'utf8'));
const runtimePaths = new Set([
  ...dataPaths,
  ...stage.parallax.map(layer => layer.src),
  ...Object.values(imagePaths),
]);

for (const path of runtimePaths) {
  const relative = relativePath(path);
  const source = resolve(projectRoot, relative);
  const destination = resolve(distRoot, relative);
  if (!isWithin(projectRoot, source) || !isWithin(distRoot, destination)) {
    throw new Error(`実行時パスがプロジェクト外を指しています: ${path}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  try {
    await copyFile(source, destination);
  } catch (error) {
    throw new Error(`実行時ファイルをコピーできません: ${path}\n${error.message}`);
  }
}

console.log(`Copied ${runtimePaths.size} runtime files to dist/`);
