import { readFile } from 'node:fs/promises';
import { buildCollisionShapes, resolveStage } from '../src/stage-resolver.js';
import { dataCrystalTotal } from '../src/run-evaluation.js';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

const [source, collision, moduleSpec, registry, hooks, movement, mainSource, indexSource] = await Promise.all([
  readJson('data/course-02-objects.json'),
  readJson('data/crystal-lab-collision.json'),
  readJson('assets/objects/platform_modular/module-spec.json'),
  readJson('data/prefab-registry.json'),
  readJson('data/course-02-hooks.json'),
  readJson('data/player-movement.json'),
  readFile(new URL('src/main.js', root), 'utf8'),
  readFile(new URL('index.html', root), 'utf8'),
]);

const stage = resolveStage(source, moduleSpec, registry);
const shapes = buildCollisionShapes(stage, registry);
const failures = [];
const warnings = [];
const playerHeight = 142;

const supportAt = (x, footY, xMargin = 10, yTolerance = 12) => shapes.platforms.find(platform => (
  x >= platform.x - xMargin
  && x <= platform.x + platform.w + xMargin
  && Math.abs(platform.y - footY) <= yTolerance
));

if (!supportAt(hooks.playerSpawn.x + 46, hooks.playerSpawn.y + playerHeight)) {
  failures.push('player spawn has no platform support');
}
if (!supportAt(hooks.checkpoint.respawn.x + 46, hooks.checkpoint.respawn.y + playerHeight)) {
  failures.push('checkpoint respawn has no platform support');
}
for (const checkpointObject of stage.objects.filter(object => object.type === 'checkpoint')) {
  const point = checkpointObject.respawn ?? hooks.checkpoint.respawn;
  if (!supportAt(point.x + 46, point.y + playerHeight)) failures.push(`${checkpointObject.id}: respawn has no platform support`);
}

const checkpoint = stage.objects.find(object => object.id === hooks.checkpoint.id && object.type === 'checkpoint');
if (!checkpoint) failures.push('checkpoint hook does not resolve to a checkpoint object');

const exitLift = stage.platforms.find(platform => platform.id === hooks.exitLink.id && platform.prefab === 'lab-lift-v1');
if (!exitLift) {
  failures.push('exit hook does not resolve to a lab lift');
} else {
  if (!supportAt(exitLift.x + exitLift.w / 2, exitLift.y, 20, 12)) failures.push('exit lift has no initial collision surface');
  const exitActivationSwitch = stage.objects.find(object => object.id === exitLift.activatedBy);
  const unsafe = shapes.hazards.find(hazard => hazard.x + hazard.w > exitActivationSwitch.x - 240 && hazard.x < exitLift.x + exitLift.w);
  if (unsafe) failures.push(`${unsafe.id}: hazard intrudes into the protected goal approach`);
}

const switches = stage.objects.filter(object => object.prefab === 'lab-switch-v1');
const lifts = stage.platforms.filter(platform => platform.prefab === 'lab-lift-v1');
const entityIds = new Set([...stage.objects, ...stage.platforms].map(entity => entity.id));
for (const activationSwitch of switches) {
  if (!activationSwitch.activateTargetId) failures.push(`${activationSwitch.id}: activateTargetId is required`);
  else if (!entityIds.has(activationSwitch.activateTargetId)) failures.push(`${activationSwitch.id}: activateTargetId is unresolved`);
}
for (const lift of lifts) {
  if (!lift.activatedBy) failures.push(`${lift.id}: activatedBy is required`);
  else if (!switches.some(activationSwitch => activationSwitch.id === lift.activatedBy)) failures.push(`${lift.id}: activatedBy does not reference a lab switch`);
  const pairedSwitch = switches.find(activationSwitch => activationSwitch.id === lift.activatedBy);
  if (pairedSwitch && pairedSwitch.activateTargetId !== lift.id) failures.push(`${lift.id}: switch/lift activation references are not reciprocal`);
}
if (!switches.some(activationSwitch => activationSwitch.requiredPath)) failures.push('at least one activation switch must be on the required path');

const crystalPickups = stage.pickups.filter(pickup => pickup.prefab === 'data-crystal-v1');
const totalCrystals = dataCrystalTotal(stage);
if (totalCrystals !== crystalPickups.length) failures.push('crystal total is not derived from resolved pickup data');
if ('requiresCrystals' in hooks.exitLink) failures.push('exitLink must not contain a crystal requirement');
const declaredCrystalTotal = source.pickups.filter(pickup => pickup.prefab === 'data-crystal-v1').length
  + (source.pickupPatterns ?? [])
    .filter(pattern => (pattern.itemPrefab ?? 'data-crystal-v1') === 'data-crystal-v1')
    .reduce((sum, pattern) => sum + Math.max(1, Math.round(pattern.count)), 0);
if (totalCrystals !== declaredCrystalTotal) failures.push(`resolved crystal count ${totalCrystals} does not match declared placement count ${declaredCrystalTotal}`);
if (/crystalTotal\s*=\s*12\b/.test(mainSource) || /DATA[^\n]*\/\s*12\b/.test(indexSource)) {
  failures.push('HUD or runtime contains a hardcoded data-crystal total');
}

const requiredUpperRewards = [
  { id: 'crystal-07', x: 3290, y: 580, sectionId: 'gate-approach' },
  { id: 'crystal-08', x: 4520, y: 805, sectionId: 'drone-gallery' },
  { id: 'crystal-09', x: 4930, y: 880, sectionId: 'final-descent' },
];
for (const expected of requiredUpperRewards) {
  const pickup = crystalPickups.find(candidate => candidate.id === expected.id);
  if (!pickup) {
    failures.push(`${expected.id}: required upper-route crystal is missing`);
    continue;
  }
  if (pickup.x !== expected.x || pickup.y !== expected.y || pickup.route !== 'upper' || pickup.reward !== true) {
    failures.push(`${expected.id}: upper-route position or metadata changed`);
  }
  const section = stage.sections.find(candidate => pickup.x >= candidate.xStart && pickup.x < candidate.xEnd);
  if (section?.id !== expected.sectionId) failures.push(`${expected.id}: expected in ${expected.sectionId}, found ${section?.id ?? 'none'}`);
}

for (const section of stage.sections) {
  const sectionCrystals = crystalPickups.filter(pickup => pickup.x >= section.xStart && pickup.x < section.xEnd);
  if (!sectionCrystals.length) failures.push(`${section.id}: section has no data crystal`);
}

const playerCenterOffsetY = playerHeight / 2;
const maxJumpHeight = movement.jumpVelocity ** 2 / (2 * movement.gravity);
const maxJumpTravelX = movement.maxRunSpeed * 2 * Math.abs(movement.jumpVelocity) / movement.gravity;
const crystalCollectRadius = registry.prefabs['data-crystal-v1'].collision.radius;
const groundSurfaces = shapes.platforms.filter(platform => platform.source.prefab === 'lab-platform-v1');
for (const pickup of crystalPickups.filter(candidate => candidate.route === 'upper')) {
  const reachableFromGround = groundSurfaces.some(platform => {
    const horizontalReach = pickup.x >= platform.x - crystalCollectRadius
      && pickup.x <= platform.x + platform.w + crystalCollectRadius;
    const apexCenterY = platform.y - playerHeight + playerCenterOffsetY - maxJumpHeight;
    return horizontalReach && Math.abs(pickup.y - apexCenterY) <= crystalCollectRadius;
  });
  if (reachableFromGround) failures.push(`${pickup.id}: upper reward is collectible from the ground floor`);
}

const platformMotionBounds = platform => ({
  minX: platform.x + (platform.motionAxis === 'x' ? Math.min(0, platform.motionDistance) : 0),
  maxX: platform.x + platform.w + (platform.motionAxis === 'x' ? Math.max(0, platform.motionDistance) : 0),
  minY: platform.y + (platform.motionAxis === 'y' ? Math.min(0, platform.motionDistance) : 0),
  maxY: platform.y + (platform.motionAxis === 'y' ? Math.max(0, platform.motionDistance) : 0),
});

const descentPoints = source.descentPoints ?? [];
const floorBands = source.floorBands ?? [];
if (descentPoints.length < 4) failures.push(`stage must declare at least four descent points, found ${descentPoints.length}`);
if (floorBands.length < 5) failures.push('floorBands must describe the playable descent levels');
for (const point of descentPoints) {
  const isCourseExit = point.id === 'entry-descent';
  if (!isCourseExit && !(point.drop > 0 && point.drop < maxJumpHeight)) {
    failures.push(`${point.id}: ${point.drop}px drop is not below ${maxJumpHeight.toFixed(1)}px jump apex`);
  }
  for (const platform of stage.platforms) {
    const bounds = platformMotionBounds(platform);
    if (bounds.minX < point.x && bounds.maxX > point.x) {
      failures.push(`${platform.id}: platform or its motion crosses ${point.id} at x=${point.x}`);
    }
  }
}
for (let index = 0; index < floorBands.length; index++) {
  const band = floorBands[index];
  if (index && band.xStart !== floorBands[index - 1].xEnd) failures.push(`${band.id}: floor band x range is not contiguous`);
  if (index) {
    const declaredDrop = descentPoints[index - 1]?.drop;
    if (band.y - floorBands[index - 1].y !== declaredDrop) failures.push(`${band.id}: floor y does not match declared drop`);
  }
  const surfaces = shapes.platforms
    .filter(platform => ['lab-platform-v1', 'lab-lift-v1'].includes(platform.source.prefab) && Math.abs(platform.y - band.y) <= 4)
    .map(platform => ({ start: Math.max(band.xStart, platform.x), end: Math.min(band.xEnd, platform.x + platform.w), id: platform.id }))
    .filter(surface => surface.end > surface.start)
    .sort((left, right) => left.start - right.start);
  let cursor = band.xStart;
  for (const surface of surfaces) {
    if (surface.start > cursor + 72) failures.push(`${band.id}: unsafe ${Math.round(surface.start - cursor)}px floor gap before ${surface.id}`);
    cursor = Math.max(cursor, surface.end);
  }
  if (cursor < band.xEnd - 72) failures.push(`${band.id}: floor ends ${Math.round(band.xEnd - cursor)}px before the descent boundary`);
}
const lowestFloorY = Math.max(...floorBands.map(band => band.y));
if (!(collision.killY > lowestFloorY)) failures.push(`killY ${collision.killY} must be below lowest floor ${lowestFloorY}`);

for (const pickup of crystalPickups) {
  const reachable = shapes.platforms.some(platform => {
    const bounds = platformMotionBounds(platform.source);
    const horizontal = pickup.x >= bounds.minX - maxJumpTravelX - crystalCollectRadius
      && pickup.x <= bounds.maxX + maxJumpTravelX + crystalCollectRadius;
    const highestReach = bounds.minY - playerHeight + playerCenterOffsetY - maxJumpHeight - crystalCollectRadius;
    const lowestReach = bounds.maxY - playerHeight + playerCenterOffsetY + crystalCollectRadius;
    return horizontal && pickup.y >= highestReach && pickup.y <= lowestReach;
  });
  if (!reachable) failures.push(`${pickup.id}: no reachable platform after vertical expansion`);
}

const slice = stage.verticalSlice;
if (!slice || !slice.sectionIds.includes('intro-runway') || !slice.sectionIds.includes('jump-tutorial')) {
  failures.push('vertical slice must explicitly cover intro-runway and jump-tutorial');
} else {
  const firstPickup = [...stage.pickups].sort((a, b) => a.x - b.x)[0];
  const secondsToFirstReward = Math.max(0, firstPickup.x - hooks.playerSpawn.x) / 430;
  if (secondsToFirstReward > slice.firstRewardMaxSeconds) {
    failures.push(`first reward takes ${secondsToFirstReward.toFixed(1)}s, over the ${slice.firstRewardMaxSeconds}s budget`);
  }
  for (let index = 2; index < slice.beats.length; index++) {
    if (slice.beats[index].action === slice.beats[index - 1].action
      && slice.beats[index].action === slice.beats[index - 2].action) {
      failures.push(`vertical slice repeats ${slice.beats[index].action} three times`);
    }
  }
}

const basicRoute = shapes.platforms
  .filter(platform => Math.abs(platform.y - 714) <= 4 && platform.x + platform.w >= 0 && platform.x <= 1550)
  .sort((a, b) => a.x - b.x);
let coveredUntil = 0;
for (const platform of basicRoute) {
  if (platform.x > coveredUntil + 24) failures.push(`basic route has a ${Math.round(platform.x - coveredUntil)}px gap before ${platform.id}`);
  coveredUntil = Math.max(coveredUntil, platform.x + platform.w);
}
if (coveredUntil < 1550) failures.push('basic route does not safely cover the complete vertical slice');

const upperReward = stage.pickups.find(pickup => pickup.reward && pickup.route === 'upper');
if (!upperReward || upperReward.x < 700 || upperReward.x >= 1550) failures.push('upper route reward crystal is missing from the vertical slice');

if (stage.objects.some(object => object.prefab === 'energy-vent-v1')) {
  failures.push('1F course must not use an unsupported standalone energy vent');
}

const sliceEnemies = hooks.actorSpawnMarkers.filter(actor => actor.x >= 700 && actor.x < 1550);
if (sliceEnemies.length !== 1) failures.push(`vertical slice needs exactly one introductory enemy, found ${sliceEnemies.length}`);
if (sliceEnemies[0]?.prefab !== 'nyabi-clean-v1') failures.push('the introductory enemy must be Nyabi Clean');
for (const enemy of sliceEnemies) {
  if (enemy.x < 700 || enemy.x >= 1550) failures.push(`${enemy.id}: enemy is outside the vertical slice`);
  if (!enemy.patrol || enemy.patrol.minX >= enemy.patrol.maxX || enemy.patrol.speed <= 0) failures.push(`${enemy.id}: patrol range is invalid`);
  if (registry.prefabs[enemy.prefab]?.category !== 'actor') failures.push(`${enemy.id}: actor prefab is not registered`);
}

if (!hooks.actorSpawnMarkers.some(actor => actor.prefab === 'nyabi-clean-v1')) failures.push('stage needs Nyabi Clean');
if (!hooks.actorSpawnMarkers.some(actor => actor.prefab === 'neji-nyabi-v1')) failures.push('stage needs Neji Nyabi');
const drones = hooks.actorSpawnMarkers.filter(actor => actor.prefab === 'nyabi-drone-v1');
if (drones.length !== 1) failures.push(`stage needs exactly one Nyabi Drone, found ${drones.length}`);
for (const drone of drones) {
  if (drone.x < 4000 || drone.x >= 4800) failures.push(`${drone.id}: drone must stay inside drone-gallery`);
  if (drone.laser?.mode !== 'moving-projectile') failures.push(`${drone.id}: laser must be a moving projectile`);
  if (drone.laser?.length < 120 || drone.laser?.length > 200) failures.push(`${drone.id}: laser projectile length must stay short and readable`);
  if (drone.laser?.speed < 320 || drone.laser?.speed > 560) failures.push(`${drone.id}: laser projectile speed is not jump-readable`);
  if (drone.laser?.travelSeconds < .6 || drone.laser?.travelSeconds > 1.3) failures.push(`${drone.id}: laser projectile lifetime is invalid`);
  const muzzleY = drone.y + (drone.laser?.muzzleOffsetY ?? 0);
  const droneBand = floorBands.find(band => drone.x >= band.xStart && drone.x < band.xEnd);
  if (!droneBand || muzzleY < droneBand.y - 104 || muzzleY > droneBand.y - 64) {
    failures.push(`${drone.id}: laser muzzle is not aligned to a jump-readable low beam`);
  }
  if (drone.laser?.muzzleOffsetX < 12 || drone.laser?.muzzleOffsetX > 36) failures.push(`${drone.id}: laser muzzle is detached from the drone body`);
  if (drone.laser?.warningStart >= drone.laser?.activeStart || drone.laser?.activeStart >= drone.laser?.activeEnd) {
    failures.push(`${drone.id}: laser warning/active timing is invalid`);
  }
}

if (stage.world.width < 5400) failures.push('expanded stage must be at least 5400px wide');
if (stage.sections.at(-1)?.xEnd !== stage.world.width) failures.push('final section must end at world width');
if (stage.objects.filter(object => object.type === 'checkpoint').length < 2) failures.push('expanded stage needs a second checkpoint');
if (exitLift && exitLift.x < stage.world.width - 500) failures.push('exit lift must finish the one-way course at the far-right side');
for (const prefab of ['lab-coin-v1', 'cat-can-v1', 'fish-drink-v1', 'future-heart-v1']) {
  if (!stage.pickups.some(pickup => pickup.prefab === prefab)) failures.push(`shared item ${prefab} is missing`);
}

for (const pickup of stage.pickups) {
  const nearbySurface = shapes.platforms.find(platform => (
    pickup.x >= platform.x - 120
    && pickup.x <= platform.x + platform.w + 120
    && platform.y - pickup.y >= 35
    && platform.y - pickup.y <= 390
  ));
  if (!nearbySurface) warnings.push(`${pickup.id}: no plausible collection surface nearby`);
}

for (const platform of stage.platforms.filter(item => item.prefab === 'lab-moving-platform-v1')) {
  const { minX, maxX, minY, maxY } = platformMotionBounds(platform);
  if (minX < 0 || maxX > stage.world.width) failures.push(`${platform.id}: horizontal travel leaves the world`);
  if (minY < 80 || maxY > stage.world.height - 40) warnings.push(`${platform.id}: vertical travel approaches a camera/world edge`);
}

for (const section of stage.sections) {
  const entityCount = [...stage.platforms, ...stage.pickups, ...stage.objects]
    .filter(entity => entity.x >= section.xStart && entity.x < section.xEnd).length;
  if (entityCount === 0) failures.push(`${section.id}: section is empty`);
  else if (entityCount < 2) warnings.push(`${section.id}: section has very little editable content`);
}

console.log(`Course audit: ${stage.stageId}`);
console.log(`Data crystals: ${totalCrystals} (derived from resolved stage data)`);
console.log(`Shared items: ${stage.pickups.length - crystalPickups.length}`);
console.log(`Moving platforms: ${stage.platforms.filter(item => item.prefab === 'lab-moving-platform-v1').length}`);
for (const warning of warnings) console.warn(`WARN ${warning}`);

if (failures.length) {
  console.error('\nCOURSE AUDIT FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nCOURSE AUDIT PASSED');
}
