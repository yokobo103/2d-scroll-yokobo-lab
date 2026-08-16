import { readFile } from 'node:fs/promises';
import {
  buildCollisionShapes,
  growthPlatformState,
  platformWidth,
  resolveStage,
  validateStage,
} from '../src/stage-resolver.js';
import { dataCrystalTotal, evaluateRank } from '../src/run-evaluation.js';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

const [source, moduleSpec, registry, placement] = await Promise.all([
  readJson('data/course-02-objects.json'),
  readJson('assets/objects/platform_modular/module-spec.json'),
  readJson('data/prefab-registry.json'),
  readJson('data/prefab-placement.json'),
]);

const stage = resolveStage(source, moduleSpec, registry);
const validation = validateStage(stage, registry);
const failures = [...validation.errors];
const prefabIds = Object.keys(registry.prefabs);
const shortBridge = registry.prefabs['lab-bridge-short-v1'];
const shortBridgeEntity = { prefab: 'lab-bridge-short-v1', modules: shortBridge.defaults.modules, pattern: shortBridge.defaults.pattern };
if (platformWidth(shortBridgeEntity, moduleSpec, registry) !== 230) failures.push('short bridge must stay at the natural 230px cap-only width');
if (shortBridge.defaults.modules !== 0 || shortBridge.defaults.pattern !== '') failures.push('short bridge must not stretch a middle module');
if (Object.keys(placement).length !== prefabIds.length) failures.push(`prefab-placement must cover all ${prefabIds.length} prefabs`);
for (const prefabId of prefabIds) {
  const rule = placement[prefabId];
  if (!rule || !['床・足場', '敵', 'アイテム', '仕掛け', '演出'].includes(rule.group)
    || !['platforms', 'pickups', 'objects', 'actorSpawnMarkers'].includes(rule.target)
    || !['shelf', 'ground', 'none'].includes(rule.snap) || !rule.label) {
    failures.push(`${prefabId}: prefab placement mapping is incomplete`);
  }
}

if (source.sections?.[0]?.xStart !== 0) failures.push('sections must start at world x=0');
if (source.sections?.at(-1)?.xEnd !== source.world.width) failures.push('sections must end at world width');

const shapes = buildCollisionShapes(stage, registry);
if (shapes.platforms.length !== stage.platforms.length) failures.push('every platform must create one collision surface');
for (const platform of stage.platforms) {
  const shape = shapes.platforms.find(candidate => candidate.id === platform.id);
  const prefab = registry.prefabs[platform.prefab];
  if (prefab.activation?.mode === 'growth') {
    const initial = growthPlatformState(platform, prefab, 0);
    if (!shape || shape.x !== initial.x || shape.y !== initial.y || shape.w !== initial.w) {
      failures.push(`${platform.id}: initial growth collision is not locked to its visible state`);
    }
  } else if (!shape || shape.y !== platform.y || shape.w !== platform.w) {
    failures.push(`${platform.id}: collision is not locked to resolved visual dimensions`);
  }
}
for (const hazard of stage.objects.filter(object => object.type === 'hazard')) {
  if (!shapes.hazards.some(shape => shape.id === hazard.id)) failures.push(`${hazard.id}: hazard prefab did not create damage collision`);
}

if (stage.objects.some(object => object.prefab === 'energy-vent-v1')) {
  failures.push('1F must not place energy-vent-v1 without a visible supply system');
}
if (stage.objects.some(object => object.prefab === 'energy-spill-v1')) {
  failures.push('1F hazard theme must use crystal-spikes-v1 instead of the retired energy spill placement');
}
if (!stage.objects.some(object => object.prefab === 'crystal-spikes-v1')) {
  failures.push('1F must contain a purple crystal spike hazard');
}

for (const prefabId of ['crystal-growth-horizontal-v1']) {
  const platform = stage.platforms.find(item => item.prefab === prefabId);
  const activationSwitch = stage.objects.find(object => object.id === platform?.activatedBy && object.prefab === 'crystal-remote-switch-v1');
  const nozzle = stage.objects.find(object => object.id === platform?.nozzleId && object.prefab === 'crystal-growth-nozzle-v1');
  if (!platform || !activationSwitch?.activateTargetIds?.includes(platform.id) || nozzle?.linkedTargetId !== platform.id) {
    failures.push(`${prefabId}: growth platform, remote switch, and floor nozzle references must be reciprocal`);
  }
}
for (const remote of stage.objects.filter(object => object.prefab === 'crystal-remote-switch-v1')) {
  const interaction = registry.prefabs[remote.prefab].interaction;
  if (interaction?.mode !== 'action' || interaction.readySignal !== 'white-glow') {
    failures.push(`${remote.id}: crystal switch must advertise ACTION with a white ready glow`);
  }
  if (!Array.isArray(remote.activateTargetIds) || remote.activateTargetIds.length < 1) failures.push(`${remote.id}: remote switch requires one or more targets`);
  if (remote.activateTargetIds.length !== 1) failures.push(`${remote.id}: placed remote switch must target only its horizontal platform`);
  const sensor = shapes.sensors.find(shape => shape.id === remote.id);
  if (!sensor || sensor.x !== remote.x + 24 || sensor.y !== remote.y + 72
    || sensor.w !== remote.w - 48 || sensor.h !== remote.h - 72) {
    failures.push(`${remote.id}: sensor must cover the device body only, excluding the wireless indicator`);
  }
}
if (stage.platforms.some(platform => platform.prefab === 'crystal-growth-vertical-v1')) failures.push('thin vertical crystal growth is retired from the stage');
if (stage.objects.some(object => object.id.includes('nozzle-vertical'))) failures.push('vertical crystal nozzle must not be placed');
if (stage.objects.some(object => object.prefab === 'crystal-culture-switch-v1')) failures.push('retired culture device must not be placed');

for (const platform of stage.platforms.filter(item => item.prefab === 'lab-moving-platform-v1')) {
  const shape = shapes.platforms.find(candidate => candidate.id === platform.id);
  if (!shape || !registry.prefabs[platform.prefab].collision.moving) {
    failures.push(`${platform.id}: moving platform collision contract is missing`);
  }
}

const exit = stage.platforms.find(platform => platform.id === 'exit-lift-01' && platform.prefab === 'lab-lift-v1');
const exitSwitch = stage.objects.find(object => object.id === exit.activatedBy && object.prefab === 'lab-switch-v1');
const unsafeGateHazard = shapes.hazards.find(hazard => (
  hazard.x + hazard.w > exitSwitch.x - 240 && hazard.x < exit.x + exit.w
));
if (unsafeGateHazard) failures.push(`${unsafeGateHazard.id}: hazard overlaps the protected goal approach`);
if (!exitSwitch || exitSwitch.activateTargetId !== exit.id) failures.push('exit lift and switch activation references must be reciprocal');
if (exit.motionDistance < 200) failures.push('exit lift must descend a visibly long distance');
if (exit.x < stage.world.width - 500) failures.push('exit lift must remain at the far-right end of the one-way course');
const totalCrystals = dataCrystalTotal(stage);
if (totalCrystals !== stage.pickups.filter(pickup => pickup.prefab === 'data-crystal-v1').length) failures.push('data total must derive from resolved stage pickups');
if (evaluateRank({ crystals: totalCrystals, totalCrystals, missCount: 0 }) !== 'S') failures.push('full collection with zero misses must rank S');
if (evaluateRank({ crystals: 0, totalCrystals, missCount: 0 }) !== 'C') failures.push('zero collection must rank C');

const safetyPatch = {
  changes: {
    'crystal-01': { x: 432, y: 600, scale: 4, rotation: 90 },
    'ground-a': { modules: 5, pattern: 'ABABA', scale: 2 },
  },
};
const safetyStage = resolveStage(source, moduleSpec, registry, safetyPatch);
const safetyCrystal = safetyStage.pickups.find(item => item.id === 'crystal-01');
const safetyGround = safetyStage.platforms.find(item => item.id === 'ground-a');
if (safetyCrystal.x !== 432 || safetyCrystal.y !== 600) failures.push('allowed item position patch was not applied');
if ('scale' in safetyCrystal || 'rotation' in safetyCrystal || 'scale' in safetyGround) failures.push('forbidden free transform escaped the prefab policy');
if (safetyGround.modules !== 5 || safetyGround.pattern !== 'ABABA') failures.push('allowed platform module patch was not applied');

console.log(`Stage: ${stage.stageId}`);
console.log(`Sections: ${stage.sections.length}`);
console.log(`Entities: ${stage.platforms.length + stage.pickups.length + stage.objects.length}`);
console.log(`Collision shapes: ${shapes.platforms.length} platforms / ${shapes.hazards.length} hazards / ${shapes.sensors.length} sensors`);
for (const warning of validation.warnings) console.warn(`WARN ${warning}`);

if (failures.length) {
  console.error('\nSTAGE VALIDATION FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nSTAGE VALIDATION PASSED');
}
