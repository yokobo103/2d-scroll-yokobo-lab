import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { growthPlatformState, resolveStage } from '../src/stage-resolver.js';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [source, moduleSpec, registry, movement] = await Promise.all([
  readJson('data/course-02-objects.json'),
  readJson('assets/objects/platform_modular/module-spec.json'),
  readJson('data/prefab-registry.json'),
  readJson('data/player-movement.json'),
]);
const stage = resolveStage(source, moduleSpec, registry);
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert(!mainSource.includes('integratedIntoHorizontalPlatform'), 'nozzle rendering must never be replaced by the baked platform nozzle');
assert(!mainSource.includes('ctx.drawImage(images[`crystalNozzle'), 'rejected thin nozzle artwork must never be rendered');
const assetManifestSource = await readFile(new URL('../src/asset-manifest.js', import.meta.url), 'utf8');
assert(!assetManifestSource.includes('crystalNozzle'), 'rejected thin nozzle assets must not be loaded into the runtime manifest');
assert(mainSource.includes("['idle', 'complete'].includes(state.phase)"), 'approved integrated nozzle must remain visible before activation and after collapse');
assert(mainSource.includes('? growthFrames[0]'), 'idle integrated nozzle must use the first dedicated growth frame');

const directions = ['right', 'left', 'up', 'down'];
for (const prefabId of ['crystal-growth-horizontal-v1']) {
  const platform = stage.platforms.find(item => item.prefab === prefabId);
  const prefab = registry.prefabs[prefabId];
  const count = platform.length;
  const interval = platform.growthSpeed;
  const delay = platform.activationDelay;
  assert(interval >= .08 && interval <= .15);
  assert(directions.includes(platform.direction));

  const idle = growthPlatformState(platform, prefab, 0);
  const first = growthPlatformState(platform, prefab, delay + .04);
  const second = growthPlatformState(platform, prefab, delay + interval + .04);
  const stableAt = delay + (count - 1) * interval + prefab.activation.emergenceDuration + .01;
  const stable = growthPlatformState(platform, prefab, stableAt);
  assert.equal(idle.visibleSegments, 0);
  assert.equal(first.visibleSegments, 1);
  assert(first.newestProgress > 0 && first.newestProgress < 1, 'new crystal must emerge from its root');
  assert.equal(second.visibleSegments, 2, 'growth must propagate one node at a time');
  assert.equal(stable.visibleSegments, count);

  const dimAt = stableAt + platform.activeDuration;
  const cloudyAt = dimAt + platform.collapseDuration * .2;
  const crackedAt = cloudyAt + platform.collapseDuration * .2;
  const shakingAt = crackedAt + platform.collapseDuration * .25;
  const collapsingAt = shakingAt + platform.collapseDuration * .15;
  assert.equal(growthPlatformState(platform, prefab, dimAt).phase, 'dim');
  assert.equal(growthPlatformState(platform, prefab, cloudyAt).phase, 'cloudy');
  assert.equal(growthPlatformState(platform, prefab, crackedAt).phase, 'cracked');
  assert.equal(growthPlatformState(platform, prefab, shakingAt).phase, 'shaking');
  assert.equal(growthPlatformState(platform, prefab, collapsingAt).phase, 'collapsing');
  const complete = growthPlatformState(platform, prefab, collapsingAt + platform.collapseDuration * .2 + .02);
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.w, 0);

  const activationSwitch = stage.objects.find(object => object.id === platform.activatedBy);
  assert.equal(activationSwitch?.prefab, 'crystal-remote-switch-v1');
  assert(activationSwitch?.activateTargetIds.includes(platform.id));
  const nozzle = stage.objects.find(object => object.id === platform.nozzleId);
  assert.equal(nozzle?.prefab, 'crystal-growth-nozzle-v1');
  assert.equal(nozzle?.linkedTargetId, platform.id);
}

const sharedRemote = stage.objects.find(object => object.id === 'crystal-remote-switch-01');
assert.equal(sharedRemote.activateTargetIds.length, 1, 'placed switch must control only the remaining horizontal nozzle');
assert(sharedRemote.activateTargetIds.every(id => stage.platforms.some(platform => platform.id === id && platform.activatedBy === sharedRemote.id)));
assert(!stage.platforms.some(platform => platform.prefab === 'crystal-growth-vertical-v1'));
assert(!stage.objects.some(object => object.id.includes('nozzle-vertical')));

const basePlatform = stage.platforms.find(item => item.prefab === 'crystal-growth-horizontal-v1');
const basePrefab = registry.prefabs[basePlatform.prefab];
const baseNozzle = stage.objects.find(object => object.id === basePlatform.nozzleId);
const jumpRise = movement.jumpVelocity ** 2 / (2 * movement.gravity);
const floorToPlatform = baseNozzle.y + baseNozzle.h - basePlatform.y;
assert(floorToPlatform <= jumpRise + movement.landingTolerance, 'horizontal crystal must be reachable by a full jump');
assert(floorToPlatform >= jumpRise - 16, 'horizontal crystal should remain a near-limit jump, not a trivial step');
for (const direction of directions) {
  const test = { ...basePlatform, direction, length: 5, segmentSpacing: 48 };
  const fullAt = test.activationDelay + 5 * test.growthSpeed + .2;
  const state = growthPlatformState(test, basePrefab, fullAt);
  assert.equal(state.direction, direction);
  assert.equal(state.visibleSegments, 5);
  if (['left', 'right'].includes(direction) && Number.isFinite(test.emitterX)) {
    assert.equal(state.runtimeX + state.w / 2, test.emitterX, 'horizontal growth collision must expand from the nozzle center');
  } else {
    assert(direction === 'left' ? state.runtimeX < test.growthOriginX : state.runtimeX === test.growthOriginX);
  }
  assert(direction === 'up' ? state.runtimeY < test.growthOriginY : true);
  assert(direction === 'down' ? state.runtimeY > test.growthOriginY : true);
}

const hazard = stage.objects.find(object => object.prefab === 'crystal-spikes-v1');
assert.deepEqual(hazard.modules.slice(0, 1), ['LEFT']);
assert.deepEqual(hazard.modules.slice(-1), ['RIGHT']);
assert(hazard.modules.slice(1, -1).every(module => ['MID_A', 'MID_B', 'MID_C'].includes(module)));
assert.equal(basePrefab.visualSet, 'crystal-inverted-core-platform');
assert.equal(basePrefab.presentation.sourcePngs.length, 12);
assert(basePrefab.presentation.sourcePngs.slice(0, 6).every(source => source.includes('inverted-core-growth')));
assert(basePrefab.presentation.sourcePngs.slice(6).every(source => source.includes('inverted-core-collapse')));
console.log('PASS horizontal crystal propagation, body-only remote sensor, staged blue-white decay, and modular massive hazard');
console.log('\nCRYSTAL GROWTH VALIDATION PASSED');
