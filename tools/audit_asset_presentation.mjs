import { access, readFile } from 'node:fs/promises';
import { platformWidth } from '../src/stage-resolver.js';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

const [stage, hooks, registry, contract, acceptance, pipelineMeta, warningAcceptance, warningPipelineMeta, visualContract, switchPipelineMeta, liftPipelineMeta, moduleSpec] = await Promise.all([
  readJson('data/course-02-objects.json'),
  readJson('data/course-02-hooks.json'),
  readJson('data/prefab-registry.json'),
  readJson('data/asset-presentation-contract.json'),
  readJson('assets/stage01_normal_lab/props/decor-pack-side-v2/acceptance.json'),
  readJson('assets/stage01_normal_lab/props/decor-pack-side-v2/processed/pipeline-meta.json'),
  readJson('assets/stage01_normal_lab/props/warning-beacon-wall-v2/acceptance.json'),
  readJson('assets/stage01_normal_lab/props/warning-beacon-wall-v2/processed/pipeline-meta.json'),
  readJson('assets/stage01_normal_lab/visual-contract.json'),
  readJson('assets/objects/lab_switch/processed/pipeline-meta.json'),
  readJson('assets/objects/lab_lift/processed/pipeline-meta.json'),
  readJson('assets/objects/platform_modular/module-spec.json'),
]);

const failures = [];
const warnings = [];
const requiredFields = ['cameraView', 'mount', 'depthRole', 'semanticRole', 'gameplaySignal', 'anchor', 'opacity'];
const placements = [
  ...stage.platforms,
  ...stage.pickups,
  ...stage.objects,
  ...hooks.actorSpawnMarkers,
];

const usedPrefabIds = new Set(placements.map(item => item.prefab));
for (const prefabId of usedPrefabIds) {
  const prefab = registry.prefabs[prefabId];
  if (!prefab) {
    failures.push(`${prefabId}: prefab is not registered`);
    continue;
  }
  if (prefab.category === 'pattern') continue;
  const presentation = prefab.presentation;
  if (!presentation) {
    failures.push(`${prefabId}: presentation contract is missing`);
    continue;
  }
  for (const field of requiredFields) {
    if (presentation[field] === undefined) failures.push(`${prefabId}: presentation.${field} is missing`);
  }
  if (presentation.opacity !== 1) {
    failures.push(`${prefabId}: visible prefab opacity must be 1 (received ${presentation.opacity})`);
  }
  if (presentation.depthRole === 'gameplay') {
    if (!contract.camera.gameplayAllowed.includes(presentation.cameraView)) {
      failures.push(`${prefabId}: ${presentation.cameraView} is not allowed in the side-scroll gameplay layer`);
    }
    if (!contract.depthRoles.gameplay.allowedSignals.includes(presentation.gameplaySignal)) {
      failures.push(`${prefabId}: gameplay-layer asset has no gameplay meaning`);
    }
  }
  if (presentation.depthRole === 'background') {
    const maxOpacity = presentation.semanticRole === 'scenery'
      ? contract.depthRoles.background.maxSceneryOpacity
      : contract.depthRoles.background.maxSignalOpacity;
    if (presentation.opacity > maxOpacity) {
      failures.push(`${prefabId}: background opacity ${presentation.opacity} exceeds ${maxOpacity}`);
    }
    const invalidPlacement = placements.find(item => item.prefab === prefabId
      && !contract.depthRoles.background.allowedObjectTypes.includes(item.type));
    if (invalidPlacement) failures.push(`${invalidPlacement.id}: ${invalidPlacement.type} is not allowed in the background layer`);
  }
  if (presentation.depthRole === 'midground') {
    const factor = presentation.scrollFactor;
    if (!Number.isFinite(factor) || factor < 0 || factor >= 1) {
      failures.push(`${prefabId}: midground scrollFactor must be a number from 0 (inclusive) to 1 (exclusive)`);
    }
    const invalidPlacement = placements.find(item => item.prefab === prefabId
      && !contract.depthRoles.midground.allowedObjectTypes.includes(item.type));
    if (invalidPlacement) failures.push(`${invalidPlacement.id}: ${invalidPlacement.type} is not allowed in the midground layer`);
  }
  const mountRule = contract.mountRules[presentation.mount];
  if (!mountRule) failures.push(`${prefabId}: unknown mount ${presentation.mount}`);
  else {
    if (!mountRule.anchors.includes(presentation.anchor)) failures.push(`${prefabId}: anchor ${presentation.anchor} does not fit ${presentation.mount}`);
    if (mountRule.requiredDepthRole && presentation.depthRole !== mountRule.requiredDepthRole) {
      failures.push(`${prefabId}: ${presentation.mount} assets must be ${mountRule.requiredDepthRole}`);
    }
    if (mountRule.requiresVisibleSupportOrMotion && !presentation.visibleSupportOrMotion) {
      failures.push(`${prefabId}: air-mounted asset lacks visible support or motion`);
    }
  }
}

const platformBounds = stage.platforms.map(platform => ({
  id: platform.id,
  xStart: platform.x,
  xEnd: platform.x + platformWidth(platform, moduleSpec, registry),
  y: platform.y,
}));
const wallSupports = new Map((stage.midgroundSupports ?? []).map(support => [support.id, support]));
const floorTolerance = 16;
for (const object of stage.objects) {
  const presentation = registry.prefabs[object.prefab]?.presentation;
  if (!presentation) continue;
  if (presentation.mount === 'floor') {
    const contactX = object.x + object.w / 2;
    const contactY = object.y + object.h;
    const attachedPlatform = object.attachedToTarget
      ? platformBounds.find(platform => platform.id === (object.attachedToTargetId ?? object.activateTargetId))
      : null;
    const support = attachedPlatform ?? platformBounds.find(platform => {
      const overlap = Math.max(0, Math.min(object.x + object.w, platform.xEnd) - Math.max(object.x, platform.xStart));
      return overlap >= Math.min(24, object.w * 0.25)
        && Math.abs(contactY - platform.y) <= floorTolerance;
    });
    if (!support || Math.abs(contactY - support.y) > floorTolerance) {
      failures.push(`${object.id}: floor-mounted object has no platform surface at (${Math.round(contactX)}, ${Math.round(contactY)})`);
    }
  }
  if (presentation.mount === 'wall') {
    const support = wallSupports.get(object.mountSupportId);
    const insideSupport = support
      && object.x >= support.xStart
      && object.x + object.w <= support.xEnd
      && object.y >= support.yStart
      && object.y + object.h <= support.yEnd;
    if (!insideSupport) {
      failures.push(`${object.id}: wall-mounted object lacks a valid mountSupportId or extends beyond its support`);
    }
  }
}

const targetById = new Map([...stage.objects, ...stage.platforms, ...hooks.actorSpawnMarkers].map(item => [item.id, item]));
for (const signal of stage.objects.filter(item => registry.prefabs[item.prefab]?.presentation?.semanticRole === 'hazard-warning')) {
  if (signal.type !== 'signal') failures.push(`${signal.id}: hazard warning must use type signal`);
  if (!signal.signalTargetId) {
    failures.push(`${signal.id}: warning signal has no target`);
    continue;
  }
  const target = targetById.get(signal.signalTargetId);
  if (!target) {
    failures.push(`${signal.id}: signal target ${signal.signalTargetId} does not exist`);
    continue;
  }
  const distance = Math.abs((target.x ?? 0) - signal.x);
  if (distance > contract.signalRules['hazard-warning'].maxTargetDistance) {
    failures.push(`${signal.id}: target is ${distance}px away, beyond the readable warning range`);
  }
}

for (const object of stage.objects) {
  if (object.type === 'decor') failures.push(`${object.id}: ambiguous decor type is forbidden; use backgroundDecor or a semantic gameplay type`);
  const presentation = registry.prefabs[object.prefab]?.presentation;
  if (presentation?.depthRole === 'background' && object.renderOrder > 3) {
    failures.push(`${object.id}: background decoration renderOrder must be 3 or lower`);
  }
}

if (pipelineMeta.edge_touch_frames?.length) failures.push('decor side-v2 sheet has edge-touching frames');
if (warningPipelineMeta.edge_touch_frames?.length) failures.push('wall warning beacon has an edge-touching frame');
if (switchPipelineMeta.edge_touch_frames?.length) failures.push('lab switch has an edge-touching frame');
if (liftPipelineMeta.edge_touch_frames?.length) failures.push('lab lift has an edge-touching frame');
for (const assetPath of [
  '/assets/stage01_normal_lab/runtime/props/lab-switch-off.webp',
  '/assets/stage01_normal_lab/runtime/props/lab-switch-on.webp',
  '/assets/stage01_normal_lab/runtime/props/lab-lift-idle.webp',
  '/assets/stage01_normal_lab/runtime/props/lab-lift-active.webp',
  ...[1, 2, 3, 4].map(index => `/assets/stage01_normal_lab/runtime/crystal/culture-${index}.webp`),
  ...[1, 2, 3, 4, 5].map(index => `/assets/stage01_normal_lab/runtime/crystal/cluster-h-${index}.webp`),
  ...[1, 2, 3, 4, 5].map(index => `/assets/stage01_normal_lab/runtime/crystal/cluster-v-${index}.webp`),
  ...[1, 2, 3, 4].map(index => `/assets/stage01_normal_lab/runtime/crystal/decay-${index}.webp`),
  ...[1, 2, 3, 4, 5].map(index => `/assets/stage01_normal_lab/runtime/crystal/hazard-massive-${index}.webp`),
]) {
  try {
    await access(new URL(`.${assetPath}`, root));
  } catch {
    failures.push(`runtime interaction asset does not exist: ${assetPath}`);
  }
}
for (const qaPath of [
  'screenshots/crystal-hazard-pc.png',
  'screenshots/crystal-hazard-mobile.png',
  'screenshots/crystal-growth-pc.png',
  'screenshots/crystal-growth-mobile.png',
]) {
  try {
    await access(new URL(qaPath, root));
  } catch {
    failures.push(`crystal gameplay composite is missing: ${qaPath}`);
  }
}
if (!warningAcceptance.visualReview.cameraAngleVerified
  || !warningAcceptance.visualReview.mountReadabilityVerified
  || !warningAcceptance.visualReview.noBakedFloorOrShadow) {
  failures.push('wall warning beacon has not passed visual acceptance');
}
if (!acceptance.visualReview.cameraAngleVerified) failures.push('decor side-v2 camera angle has not been visually approved');
if (!acceptance.visualReview.mountReadabilityVerified) failures.push('decor side-v2 mount readability has not been visually approved');
if (!acceptance.visualReview.noBakedFloorOrShadow) failures.push('decor side-v2 contains a baked floor or cast shadow');
if (!acceptance.visualReview.runtimeCompositeVerified) failures.push('decor side-v2 has not been approved in a runtime composite');
if (!acceptance.visualReview.pcScreenshot || !acceptance.visualReview.mobileScreenshot) failures.push('PC/mobile presentation screenshots are missing');

for (const assetPath of visualContract.props.decor) {
  if (!assetPath.includes('/decor-side-') && !assetPath.endsWith('/warning-wall.webp')) {
    failures.push(`legacy ambiguous decor is still registered: ${assetPath}`);
  }
  try {
    await access(new URL(`.${assetPath}`, root));
  } catch {
    failures.push(`runtime asset does not exist: ${assetPath}`);
  }
}

console.log(`Presentation audit: ${stage.stageId}`);
console.log(`Used visual prefabs: ${usedPrefabIds.size}`);
console.log(`Semantic signals: ${stage.objects.filter(item => item.type === 'signal').length}`);
console.log(`Background decorations: ${stage.objects.filter(item => item.type === 'backgroundDecor').length}`);
console.log(`Midground decorations: ${stage.objects.filter(item => item.type === 'midgroundDecor').length}`);
for (const warning of warnings) console.warn(`WARN ${warning}`);

if (failures.length) {
  console.error('\nASSET PRESENTATION AUDIT FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nASSET PRESENTATION AUDIT PASSED');
}
