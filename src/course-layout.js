const clone = value => JSON.parse(JSON.stringify(value));
const prefixId = (id, prefix) => id && prefix ? `${prefix}${id}` : id;

const worldEntity = (entity, transform) => {
  const result = clone(entity);
  result.id = prefixId(result.id, transform.prefix);
  result.x += transform.xOffset;
  result.y += transform.yOffset;
  if (result.emitterX != null) result.emitterX += transform.xOffset;
  for (const key of ['activatedBy', 'nozzleId', 'attachedToTargetId', 'activateTargetId', 'linkedTargetId']) {
    if (result[key]) result[key] = prefixId(result[key], transform.prefix);
  }
  if (result.activateTargetIds) result.activateTargetIds = result.activateTargetIds.map(id => prefixId(id, transform.prefix));
  if (result.respawn) {
    result.respawn.x += transform.xOffset;
    result.respawn.y += transform.yOffset;
  }
  return result;
};

const worldActor = (actor, transform) => {
  const result = worldEntity(actor, transform);
  if (result.patrol) {
    result.patrol.minX += transform.xOffset;
    result.patrol.maxX += transform.xOffset;
  }
  return result;
};

const worldTrigger = (trigger, transform) => {
  const result = clone(trigger);
  result.id = prefixId(result.id, transform.prefix);
  if (result.nearEntityId) result.nearEntityId = prefixId(result.nearEntityId, transform.prefix);
  if (result.x != null) result.x += transform.xOffset;
  if (result.y != null) result.y += transform.yOffset;
  return result;
};

export const courseAtX = (stage, x) => (
  stage.courses?.find(course => x >= course.xStart && x < course.xEnd)
  ?? stage.courses?.at(-1)
  ?? null
);

export function applyBossArenaLayout(course, layout) {
  if (!layout) return course;
  const firstY = layout.groundY - layout.firstFloorRise;
  const secondY = firstY - layout.tierRise;
  const thirdY = secondY - layout.tierRise;
  const yById = new Map([
    ['boss-left-high-floor', firstY], ['boss-right-high-floor', firstY],
    ['boss-left-middle-floor', secondY], ['boss-right-middle-floor', secondY],
    ['boss-left-top-floor', thirdY], ['boss-right-top-floor', thirdY],
    ['boss-crystal-step-01', layout.groundY - layout.lowerStepRise],
    ['boss-crystal-step-03', layout.groundY - layout.lowerStepRise],
    ['boss-crystal-step-02', firstY - layout.interTierStepRise],
    ['boss-crystal-step-04', firstY - layout.interTierStepRise],
    ['boss-crystal-step-05', secondY - layout.interTierStepRise],
    ['boss-crystal-step-06', secondY - layout.interTierStepRise],
    ['boss-switch-01', layout.groundY - layout.switchHeight],
    ['boss-switch-03', layout.groundY - layout.switchHeight],
    ['boss-switch-02', firstY - layout.switchHeight],
    ['boss-switch-04', firstY - layout.switchHeight],
    ['boss-switch-05', secondY - layout.switchHeight],
    ['boss-switch-06', secondY - layout.switchHeight],
    ['boss-nozzle-01', layout.groundY - layout.nozzleHeight],
    ['boss-nozzle-03', layout.groundY - layout.nozzleHeight],
    ['boss-nozzle-02', firstY - layout.nozzleHeight],
    ['boss-nozzle-04', firstY - layout.nozzleHeight],
    ['boss-nozzle-05', secondY - layout.nozzleHeight],
    ['boss-nozzle-06', secondY - layout.nozzleHeight],
  ]);
  const xById = new Map([
    ['boss-left-high-floor', layout.floorX.left[0]], ['boss-right-high-floor', layout.floorX.right[0]],
    ['boss-left-middle-floor', layout.floorX.left[1]], ['boss-right-middle-floor', layout.floorX.right[1]],
    ['boss-left-top-floor', layout.floorX.left[2]], ['boss-right-top-floor', layout.floorX.right[2]],
    ['boss-nozzle-01', layout.floorX.left[0] + layout.deviceOffsets.leftNozzle],
    ['boss-switch-01', layout.floorX.left[0] + layout.deviceOffsets.leftSwitch],
    ['boss-switch-03', layout.floorX.right[0] + layout.deviceOffsets.rightSwitch],
    ['boss-nozzle-03', layout.floorX.right[0] + layout.deviceOffsets.rightNozzle],
    ['boss-nozzle-02', layout.floorX.left[0] + layout.deviceOffsets.leftNozzle],
    ['boss-switch-02', layout.floorX.left[0] + layout.deviceOffsets.leftSwitch],
    ['boss-switch-04', layout.floorX.right[0] + layout.deviceOffsets.rightSwitch],
    ['boss-nozzle-04', layout.floorX.right[0] + layout.deviceOffsets.rightNozzle],
    ['boss-nozzle-05', layout.floorX.left[1] + layout.deviceOffsets.leftNozzle],
    ['boss-switch-05', layout.floorX.left[1] + layout.deviceOffsets.leftSwitch],
    ['boss-switch-06', layout.floorX.right[1] + layout.deviceOffsets.rightSwitch],
    ['boss-nozzle-06', layout.floorX.right[1] + layout.deviceOffsets.rightNozzle],
  ]);
  for (const entity of [...course.platforms, ...course.objects]) {
    if (yById.has(entity.id)) entity.y = yById.get(entity.id);
    if (xById.has(entity.id)) entity.x = xById.get(entity.id);
  }
  for (const platform of course.platforms.filter(entity => entity.id.startsWith('boss-crystal-step-'))) {
    const nozzle = course.objects.find(object => object.id === platform.nozzleId);
    if (!nozzle) continue;
    platform.emitterX = nozzle.x + nozzle.w / 2;
    platform.x = platform.emitterX - platform.length * platform.segmentSpacing / 2;
  }
  return course;
}

export function composeThreeCourseStage(courseStages, courseHooks, sourceCollision, layoutSource) {
  if (courseStages.length !== 3 || courseHooks.length !== 3) throw new Error('3コース分のデータが必要です');
  const layout = clone(layoutSource);
  const resolvedCourses = courseStages.map(clone);
  applyBossArenaLayout(resolvedCourses[2], layout.bossArenaLayout);
  const collision = clone(sourceCollision);
  const transforms = courseStages.map((_, index) => ({
    prefix: index === 0 ? 'c1-' : index === 2 ? 'c3-' : '',
    xOffset: index * layout.courseLength,
    yOffset: index * layout.courseVerticalOffset,
  }));
  const stage = clone(resolvedCourses[0]);
  stage.stageId = 'crystal-lab-three-course-stage';
  stage.world = clone(layout.world);
  stage.courses = clone(layout.courses);
  stage.platforms = resolvedCourses.flatMap((course, index) => course.platforms.map(entity => worldEntity(entity, transforms[index])));
  stage.pickups = resolvedCourses.flatMap((course, index) => course.pickups.map(entity => worldEntity(entity, transforms[index])));
  stage.objects = resolvedCourses.flatMap((course, index) => course.objects.map(entity => worldEntity(entity, transforms[index])));
  stage.sections = resolvedCourses.flatMap((course, index) => course.sections.map(section => ({
    ...clone(section),
    id: `course-${index + 1}-${section.id}`,
    xStart: section.xStart + transforms[index].xOffset,
    xEnd: section.xEnd + transforms[index].xOffset,
  })));
  stage.floorBands = resolvedCourses.flatMap((course, index) => course.floorBands.map(band => ({
    ...clone(band),
    id: `course-${index + 1}-${band.id}`,
    xStart: band.xStart + transforms[index].xOffset,
    xEnd: band.xEnd + transforms[index].xOffset,
    y: band.y + transforms[index].yOffset,
  })));
  stage.descentPoints = resolvedCourses.flatMap((course, index) => course.descentPoints.map(point => ({
    ...clone(point),
    id: `course-${index + 1}-${point.id}`,
    x: point.x + transforms[index].xOffset,
  })));
  stage.midgroundSupports = [{
    ...clone(courseStages[0].midgroundSupports[0]),
    id: 'three-course-lab-wall-plane',
    xStart: 0,
    xEnd: layout.world.width,
    yEnd: layout.world.height - 160,
  }];
  stage.verticalSlice = { ...clone(courseStages[0].verticalSlice), sectionIds: stage.sections.map(section => section.id) };

  const hooks = {
    playerSpawn: clone(courseHooks[0].playerSpawn),
    actorSpawnMarkers: courseHooks.flatMap((course, index) => course.actorSpawnMarkers.map(actor => worldActor(actor, transforms[index]))),
    encounterTriggers: courseHooks.flatMap((course, index) => course.encounterTriggers.map(trigger => worldTrigger(trigger, transforms[index]))),
    checkpoint: {
      id: prefixId(courseHooks[0].checkpoint.id, transforms[0].prefix),
      respawn: clone(courseHooks[0].checkpoint.respawn),
    },
    cameraBounds: { x: 0, y: 0, w: layout.world.width, h: layout.world.height },
    exitLink: { id: 'c3-exit-lift-01', next: 'crystal-area-boss-placeholder' },
    courses: clone(layout.courses),
  };
  collision.killY = layout.killY;
  return { stage, hooks, collision };
}
