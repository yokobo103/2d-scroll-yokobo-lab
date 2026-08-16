import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeThreeCourseStage } from '../src/course-layout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, value) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sourceStage = read('data/crystal-lab-objects.json');
const sourceHooks = read('data/crystal-lab-scene-hooks.json');
const sourceCollision = read('data/crystal-lab-collision.json');
const layout = read('data/course-layout.json');
const { stage, hooks } = composeThreeCourseStage(sourceStage, sourceHooks, sourceCollision, layout);

const stripPrefix = (value, prefix) => typeof value === 'string' && prefix && value.startsWith(prefix)
  ? value.slice(prefix.length) : value;
const localEntity = (entity, course, prefix) => {
  const result = structuredClone(entity);
  result.id = stripPrefix(result.id, prefix);
  result.x -= course.xStart;
  result.y -= course.yOffset;
  if (result.emitterX != null) result.emitterX -= course.xStart;
  for (const key of ['activatedBy', 'nozzleId', 'attachedToTargetId', 'activateTargetId', 'linkedTargetId']) {
    if (result[key]) result[key] = stripPrefix(result[key], prefix);
  }
  if (result.activateTargetIds) result.activateTargetIds = result.activateTargetIds.map(id => stripPrefix(id, prefix));
  if (result.respawn) {
    result.respawn.x -= course.xStart;
    result.respawn.y -= course.yOffset;
  }
  delete result.runtimeX;
  delete result.runtimeY;
  delete result.runtimeProgress;
  delete result.runtimeFrame;
  delete result.growthState;
  return result;
};

const courses = layout.courses.map((meta, index) => ({
  ...meta,
  xStart: index * layout.courseLength,
  xEnd: (index + 1) * layout.courseLength,
  yOffset: index * layout.courseVerticalOffset,
  prefix: index === 0 ? 'c1-' : index === 2 ? 'c3-' : '',
}));

for (const [index, course] of courses.entries()) {
  const inCourse = entity => index === 0
    ? entity.id.startsWith('c1-')
    : index === 2
      ? entity.id.startsWith('c3-')
      : !entity.id.startsWith('c1-') && !entity.id.startsWith('c3-')
        && entity.x >= course.xStart - 500 && entity.x < course.xEnd;
  const platforms = stage.platforms.filter(inCourse).map(entity => localEntity(entity, course, course.prefix));
  const pickups = stage.pickups.filter(inCourse).map(entity => localEntity(entity, course, course.prefix));
  const objects = stage.objects.filter(inCourse).map(entity => localEntity(entity, course, course.prefix));
  const entityIds = new Set([...platforms, ...pickups, ...objects].map(entity => entity.id));
  const sections = stage.sections.filter(section => section.xStart >= course.xStart && section.xStart < course.xEnd).map(section => ({
    ...section,
    id: section.id.replace(/^course-\d+-/, ''),
    xStart: section.xStart - course.xStart,
    xEnd: section.xEnd - course.xStart,
  }));
  const floorBands = stage.floorBands.filter(band => band.xStart >= course.xStart && band.xStart < course.xEnd).map(band => ({
    ...band,
    id: band.id.replace(/^course-\d+-/, ''),
    xStart: band.xStart - course.xStart,
    xEnd: band.xEnd - course.xStart,
    y: band.y - course.yOffset,
  }));
  const descentPoints = stage.descentPoints.filter(point => point.x >= course.xStart && point.x < course.xEnd).map(point => ({
    ...point,
    id: point.id.replace(/^course-\d+-/, ''),
    x: point.x - course.xStart,
  }));
  const actorSpawnMarkers = hooks.actorSpawnMarkers.filter(inCourse).map(actor => {
    const local = localEntity(actor, course, course.prefix);
    if (actor.patrol) local.patrol = {
      ...actor.patrol,
      minX: actor.patrol.minX - course.xStart,
      maxX: actor.patrol.maxX - course.xStart,
    };
    return local;
  });
  const actorIds = new Set(actorSpawnMarkers.map(actor => actor.id));
  const encounterTriggers = hooks.encounterTriggers.filter(trigger => {
    if (trigger.nearEntityId) return entityIds.has(stripPrefix(trigger.nearEntityId, course.prefix)) || actorIds.has(stripPrefix(trigger.nearEntityId, course.prefix));
    return trigger.x >= course.xStart && trigger.x < course.xEnd;
  }).map(trigger => {
    const local = structuredClone(trigger);
    local.id = stripPrefix(local.id, course.prefix);
    if (local.nearEntityId) local.nearEntityId = stripPrefix(local.nearEntityId, course.prefix);
    if (local.x != null) local.x -= course.xStart;
    if (local.y != null) local.y -= course.yOffset;
    return local;
  });
  const checkpointObject = objects.find(object => object.type === 'checkpoint');
  const number = String(index + 1).padStart(2, '0');
  write(`data/course-${number}-objects.json`, {
    schemaVersion: 3,
    stageId: `crystal-lab-course-${number}`,
    prefabRegistry: sourceStage.prefabRegistry,
    stageCanvas: sourceStage.stageCanvas,
    world: { width: layout.courseLength, height: sourceStage.world.height },
    descentPoints,
    floorBands,
    midgroundSupports: sourceStage.midgroundSupports,
    verticalSlice: { ...sourceStage.verticalSlice, sectionIds: sections.map(section => section.id) },
    responsiveCamera: sourceStage.responsiveCamera,
    sections,
    platformModuleSpec: sourceStage.platformModuleSpec,
    parallax: sourceStage.parallax,
    platforms,
    pickups,
    pickupPatterns: [],
    objects,
  });
  write(`data/course-${number}-hooks.json`, {
    playerSpawn: index === 0
      ? { x: hooks.playerSpawn.x, y: hooks.playerSpawn.y, facing: hooks.playerSpawn.facing }
      : { x: sourceHooks.playerSpawn.x, y: sourceHooks.playerSpawn.y, facing: sourceHooks.playerSpawn.facing },
    actorSpawnMarkers,
    encounterTriggers,
    checkpoint: checkpointObject
      ? { id: checkpointObject.id, respawn: checkpointObject.respawn ?? sourceHooks.checkpoint.respawn }
      : sourceHooks.checkpoint,
    cameraBounds: { x: 0, y: 0, w: layout.courseLength, h: sourceStage.world.height },
    exitLink: { id: 'exit-lift-01', next: index < 2 ? `course-${number}-next` : 'crystal-area-boss-placeholder' },
  });
}

console.log('Split 3 courses into local-coordinate object/hook files.');
