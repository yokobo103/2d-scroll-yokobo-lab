import { readFile } from 'node:fs/promises';
import { stepVerticalCamera } from '../src/camera-controller.js';

const root = new URL('../', import.meta.url);
const stage = JSON.parse(await readFile(new URL('data/course-02-objects.json', root), 'utf8'));
const tuning = stage.responsiveCamera;
const failures = [];
const step = overrides => stepVerticalCamera({
  currentTop: 300,
  playerY: 760,
  playerHeight: 120,
  playerVy: 0,
  viewHeight: 864,
  worldHeight: 1560,
  tuning,
  dt: 1 / 60,
  ...overrides,
});

for (const key of ['verticalDeadzoneTop', 'verticalDeadzoneBottom', 'fallLookAheadSpeed', 'fallLookAheadAmount']) {
  if (!Number.isFinite(tuning[key])) failures.push(`responsiveCamera.${key} must be numeric`);
}
if ('portraitTop' in tuning) failures.push('responsiveCamera.portraitTop must be removed');
if (!(tuning.verticalDeadzoneTop < tuning.verticalDeadzoneBottom)) failures.push('vertical deadzone bounds are reversed');
for (const layer of stage.parallax) {
  if (!Number.isFinite(layer.scrollFactorY)) failures.push(`${layer.id}: scrollFactorY is missing`);
}

const stable = step({ playerY: 610 });
if (Math.abs(stable - 300) > .001) failures.push('camera moved while player was inside the deadzone');
const followsDown = step({ playerY: 960 });
if (followsDown <= 300) failures.push('camera did not follow below the deadzone');
const followsUp = step({ playerY: 420 });
if (followsUp >= 300) failures.push('camera did not follow above the deadzone');
const normalFall = step({ playerY: 760, playerVy: tuning.fallLookAheadSpeed - 1 });
const lookedAheadFall = step({ playerY: 760, playerVy: tuning.fallLookAheadSpeed });
if (lookedAheadFall <= normalFall) failures.push('fall look-ahead did not reveal more space below');
const topClamp = step({ currentTop: 0, playerY: -400 });
if (topClamp !== 0) failures.push('camera escaped the world top');
const bottomClamp = step({ currentTop: 696, playerY: 1800 });
if (bottomClamp !== 696) failures.push('camera escaped the world bottom');
const shortWorld = step({ currentTop: 100, worldHeight: 800, viewHeight: 864 });
if (shortWorld !== 0) failures.push('short world camera must clamp to zero');

if (failures.length) {
  console.error('VERTICAL CAMERA VALIDATION FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('PASS vertical deadzone stability');
  console.log('PASS upward/downward follow and world clamps');
  console.log('PASS fall look-ahead');
  console.log('PASS vertical parallax metadata');
  console.log('\nVERTICAL CAMERA VALIDATION PASSED');
}
