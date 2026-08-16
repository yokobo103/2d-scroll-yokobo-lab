import { access, readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dataUrl = new URL('data/', root);
const catalogUrl = new URL('asset-catalog.json', dataUrl);
const imagePattern = /\.(?:png|webp|gif|jpe?g)$/i;
const normalize = value => String(value).replace(/\\/g, '/').replace(/^\/+/, '');
const sizeRanges = {
  L: { min: 250, max: 400 },
  M: { min: 140, max: 200 },
  S: { min: 70, max: 110 },
  XS: { min: 60, max: 90 },
  enemy: { min: 120, max: 180 },
  sign: { min: 0, max: 100 },
};

const collectImageReferences = (value, output) => {
  if (typeof value === 'string') {
    if (imagePattern.test(value)) output.add(normalize(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageReferences(item, output);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectImageReferences(item, output);
  }
};

const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));
const catalogFailures = [];
for (const entry of catalog.entries) {
  const range = sizeRanges[entry.sizeClass];
  if (!range) {
    catalogFailures.push(`${entry.id}: sizeClass must be one of ${Object.keys(sizeRanges).join('/')}`);
  }
  if (typeof entry.silhouette !== 'string' || !entry.silhouette.trim()) {
    catalogFailures.push(`${entry.id}: silhouette path is required`);
  } else {
    try {
      await access(new URL(normalize(entry.silhouette), root));
    } catch {
      catalogFailures.push(`${entry.id}: silhouette file is missing: ${entry.silhouette}`);
    }
  }
  if (range && entry.drawSize) {
    if (!Array.isArray(entry.drawSize) || entry.drawSize.length !== 2 || entry.drawSize.some(value => !Number.isFinite(value) || value <= 0)) {
      catalogFailures.push(`${entry.id}: drawSize must be [width, height]`);
    } else {
      const nominal = Math.max(...entry.drawSize);
      if (nominal < range.min || nominal > range.max) {
        catalogFailures.push(`${entry.id}: drawSize ${entry.drawSize.join('x')} is outside ${entry.sizeClass} (${range.min}-${range.max})`);
      }
    }
  }
}
const adoptedFiles = new Set(
  catalog.entries
    .filter(entry => entry.status === 'adopted')
    .map(entry => normalize(entry.file)),
);

const references = new Set();
const dataFiles = (await readdir(dataUrl, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'asset-catalog.json');
for (const file of dataFiles) {
  const json = JSON.parse(await readFile(new URL(file.name, dataUrl), 'utf8'));
  collectImageReferences(json, references);
}

const unadopted = [...references].filter(reference => !adoptedFiles.has(reference)).sort();
console.log(`Catalog production-reference audit: ${references.size} visible data references`);
console.log(`Catalog adopted files: ${adoptedFiles.size}`);
console.log(`Catalog sized entries: ${catalog.entries.filter(entry => entry.drawSize).length}`);
if (unadopted.length || catalogFailures.length) {
  console.error('\nCATALOG VALIDATION FAILED');
  for (const reference of unadopted) console.error(`- data/*.json references a visible asset that is not adopted: ${reference}`);
  for (const failure of catalogFailures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nCATALOG VALIDATION PASSED');
}
