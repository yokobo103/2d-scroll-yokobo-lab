import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { imagePaths } from '../src/asset-manifest.js';

const stage = JSON.parse(readFileSync(new URL('../data/course-01-objects.json', import.meta.url), 'utf8'));
const runtimeImages = [...Object.values(imagePaths), ...stage.parallax.map(layer => layer.src)];

for (const path of runtimeImages) {
  assert.equal(path.toLowerCase().endsWith('.webp'), true, `runtime image must be WebP: ${path}`);
  assert.equal(existsSync(new URL(`..${path}`, import.meta.url)), true, `runtime image is missing: ${path}`);
}

assert.equal(new Set(runtimeImages).size, runtimeImages.length, 'runtime image manifest contains duplicate paths');
console.log(`RUNTIME IMAGE FORMAT VALIDATION PASSED (${runtimeImages.length} WebP files)`);
