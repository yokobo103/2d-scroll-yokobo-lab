const clone = value => JSON.parse(JSON.stringify(value));

export const allStageEntities = stage => [
  ...stage.platforms.map(entity => ({ entity, group: 'platforms', category: 'platform' })),
  ...stage.pickups.map(entity => ({ entity, group: 'pickups', category: 'pickup' })),
  ...stage.objects.map(entity => ({ entity, group: 'objects', category: 'object' })),
];

export const findStageEntity = (stage, id) => allStageEntities(stage).find(item => item.entity.id === id);

export const objectSensorRect = (object, prefab = {}) => {
  const collision = prefab.collision ?? {};
  const insetX = collision.insetX ?? 0;
  const insetTop = collision.insetTop ?? 0;
  const insetBottom = collision.insetBottom ?? 0;
  return {
    x: object.x + insetX,
    y: object.y + insetTop,
    w: Math.max(0, object.w - insetX * 2),
    h: Math.max(0, object.h - insetTop - insetBottom),
  };
};

export const platformLayout = (platform, moduleSpec, prefabRegistry) => (
  prefabRegistry?.prefabs?.[platform.prefab]?.layout ?? moduleSpec
);

export const platformWidth = (platform, moduleSpec, prefabRegistry) => {
  const layout = platformLayout(platform, moduleSpec, prefabRegistry);
  const activation = prefabRegistry?.prefabs?.[platform.prefab]?.activation;
  if (activation?.mode === 'growth') {
    const length = platform.length ?? activation.length ?? 6;
    const spacing = platform.segmentSpacing ?? activation.segmentSpacing ?? 60;
    const direction = platform.direction ?? activation.direction ?? 'right';
    return ['left', 'right'].includes(direction) ? length * spacing : layout.middleWidth;
  }
  return layout.capWidth * 2
    + layout.middleWidth * platform.modules
    - layout.jointOverlap * (platform.modules + 1);
};

const clamp01 = value => Math.max(0, Math.min(1, value));

export function growthPlatformState(platform, prefab, ageSeconds = -1) {
  const activation = prefab?.activation ?? {};
  const direction = platform.direction ?? activation.direction ?? (activation.axis === 'y' ? 'up' : 'right');
  const horizontal = direction === 'left' || direction === 'right';
  const segmentCount = platform.length ?? activation.length ?? 6;
  const interval = platform.growthSpeed ?? activation.growthSpeed ?? .11;
  const spacing = platform.segmentSpacing ?? activation.segmentSpacing ?? 60;
  const emergenceDuration = activation.emergenceDuration ?? .16;
  const delay = platform.activationDelay ?? 0;
  const hold = platform.activeDuration ?? activation.activeDuration ?? 6.5;
  const collapseDuration = platform.collapseDuration ?? activation.collapseDuration ?? 3.2;
  const dim = collapseDuration * .2;
  const cloud = collapseDuration * .2;
  const crack = collapseDuration * .25;
  const shake = collapseDuration * .15;
  const fragment = collapseDuration * .2;
  const localAge = ageSeconds - delay;
  const growthDuration = Math.max(0, segmentCount - 1) * interval + emergenceDuration;
  const stableEnd = growthDuration + hold;
  const dimEnd = stableEnd + dim;
  const cloudEnd = dimEnd + cloud;
  const crackEnd = cloudEnd + crack;
  const shakeEnd = crackEnd + shake;
  const collapseEnd = shakeEnd + fragment;
  let phase = 'idle';
  let visibleSegments = 0;
  let newestProgress = 0;
  if (localAge >= 0 && localAge < growthDuration) {
    phase = 'growing';
    visibleSegments = Math.min(segmentCount, Math.floor(localAge / interval) + 1);
    newestProgress = clamp01((localAge - (visibleSegments - 1) * interval) / emergenceDuration);
  } else if (localAge >= growthDuration && localAge < stableEnd) {
    phase = 'stable'; visibleSegments = segmentCount; newestProgress = 1;
  } else if (localAge >= stableEnd && localAge < dimEnd) {
    phase = 'dim'; visibleSegments = segmentCount; newestProgress = 1;
  } else if (localAge >= dimEnd && localAge < cloudEnd) {
    phase = 'cloudy'; visibleSegments = segmentCount; newestProgress = 1;
  } else if (localAge >= cloudEnd && localAge < crackEnd) {
    phase = 'cracked'; visibleSegments = segmentCount; newestProgress = 1;
  } else if (localAge >= crackEnd && localAge < shakeEnd) {
    phase = 'shaking'; visibleSegments = segmentCount; newestProgress = 1;
  } else if (localAge >= shakeEnd && localAge < collapseEnd) {
    phase = 'collapsing';
    const removed = Math.floor(((localAge - shakeEnd) / fragment) * segmentCount) + 1;
    visibleSegments = Math.max(0, segmentCount - removed);
    newestProgress = 1;
  } else if (localAge >= collapseEnd) {
    phase = 'complete';
  }

  const collisionSegments = phase === 'growing'
    ? Math.max(0, visibleSegments - 1 + newestProgress)
    : visibleSegments;
  const currentLength = collisionSegments * spacing;
  const originX = platform.growthOriginX ?? platform.x;
  const originY = platform.growthOriginY ?? platform.y;
  const emitterX = Number.isFinite(platform.emitterX) ? platform.emitterX : null;
  const runtimeX = horizontal && emitterX !== null
    ? emitterX - currentLength / 2
    : direction === 'left' ? originX - currentLength : originX;
  const runtimeY = direction === 'up' ? originY - currentLength
    : direction === 'down' ? originY + currentLength : originY;
  return {
    phase,
    direction,
    horizontal,
    segmentCount,
    visibleSegments,
    newestProgress,
    segmentSpacing: spacing,
    emergenceDuration,
    localAge,
    x: runtimeX,
    y: runtimeY,
    w: horizontal ? currentLength : (collisionSegments ? platform.w : 0),
    runtimeX,
    runtimeY,
    lifecycleDuration: delay + collapseEnd,
  };
}

const expandPickupPatterns = stage => {
  for (const pattern of stage.pickupPatterns ?? []) {
    const count = Math.max(1, Math.round(pattern.count));
    for (let index = 0; index < count; index++) {
      const progress = count === 1 ? 0 : index / (count - 1);
      const arc = pattern.pattern === 'arc' ? -Math.sin(Math.PI * progress) * (pattern.arcHeight ?? 0) : 0;
      stage.pickups.push({
        id: `${pattern.idPrefix}-${String(index + 1).padStart(2, '0')}`,
        prefab: pattern.itemPrefab ?? 'data-crystal-v1',
        x: pattern.x + (pattern.dx ?? 0) * index,
        y: pattern.y + (pattern.dy ?? 0) * index + arc,
        sourcePattern: pattern.id,
      });
    }
  }
  return stage;
};

export function hydrateStage(stage, moduleSpec, prefabRegistry) {
  for (const platform of stage.platforms) {
    const layout = platformLayout(platform, moduleSpec, prefabRegistry);
    const activation = prefabRegistry?.prefabs?.[platform.prefab]?.activation;
    const growth = activation?.mode === 'growth';
    if (growth) {
      platform.direction ??= activation.direction ?? 'right';
      platform.growthOriginX = platform.x;
      platform.growthOriginY = platform.y;
    }
    platform.w = platformWidth(platform, moduleSpec, prefabRegistry);
    platform.h = growth && ['up', 'down'].includes(platform.direction)
      ? (platform.length ?? activation.length) * (platform.segmentSpacing ?? activation.segmentSpacing)
      : layout.displayHeight;
    platform.runtimeX = platform.x;
    platform.runtimeY = platform.y;
  }
  for (const object of stage.objects) {
    const moduleLayout = prefabRegistry?.prefabs?.[object.prefab]?.moduleLayout;
    if (!moduleLayout || !Array.isArray(object.modules) || !object.modules.length) continue;
    object.w = object.modules.length * moduleLayout.width
      - (object.modules.length - 1) * moduleLayout.overlap;
  }
  return stage;
}

export function sectionAtX(stage, x) {
  return stage.sections?.find(section => x >= section.xStart && x < section.xEnd)
    ?? stage.sections?.at(-1)
    ?? null;
}

const allowedChange = (entity, prefabRegistry, key) => {
  const prefab = prefabRegistry.prefabs[entity.prefab];
  return prefab?.editor?.allowed?.includes(key) ?? false;
};

export function applyStagePatch(stage, patch, prefabRegistry) {
  if (!patch?.changes) return stage;
  for (const [id, changes] of Object.entries(patch.changes)) {
    const item = findStageEntity(stage, id);
    if (!item) continue;
    for (const [key, value] of Object.entries(changes)) {
      if (allowedChange(item.entity, prefabRegistry, key)) item.entity[key] = value;
    }
  }
  return stage;
}

export function resolveStage(sourceStage, moduleSpec, prefabRegistry, patch = null) {
  const stage = clone(sourceStage);
  expandPickupPatterns(stage);
  applyStagePatch(stage, patch, prefabRegistry);
  return hydrateStage(stage, moduleSpec, prefabRegistry);
}

export function buildCollisionShapes(stage, prefabRegistry) {
  const platforms = [];
  const hazards = [];
  const sensors = [];
  for (const { entity, category } of allStageEntities(stage)) {
    const collision = prefabRegistry.prefabs[entity.prefab]?.collision;
    if (!collision) continue;
    if (collision.factory === 'oneWayRect') {
      const growth = prefabRegistry.prefabs[entity.prefab]?.activation?.mode === 'growth'
        ? growthPlatformState(entity, prefabRegistry.prefabs[entity.prefab], 0)
        : null;
      platforms.push({
        id: entity.id, kind: 'oneWayRect', x: growth?.x ?? entity.x, y: growth?.y ?? entity.y,
        w: growth?.w ?? entity.w, h: collision.depth, source: entity,
      });
    } else if (collision.factory === 'hazardRect' || collision.factory === 'timedHazardRect') {
      hazards.push({
        id: entity.id, kind: collision.factory,
        x: entity.x + collision.offsetX, y: entity.y + collision.offsetY,
        w: collision.widthFromEntity
          ? Math.max(0, entity.w - collision.offsetX - (collision.insetRight ?? 0))
          : collision.width,
        h: collision.height, damage: collision.damage,
        active: collision.factory === 'hazardRect',
        timing: collision.factory === 'timedHazardRect' ? collision : null,
        source: entity,
      });
    } else if (collision.factory === 'sensorCircle') {
      sensors.push({ id: entity.id, kind: 'sensorCircle', x: entity.x, y: entity.y, radius: collision.radius, source: entity });
    } else if (collision.factory === 'sensorRect' && category === 'object') {
      sensors.push({ id: entity.id, kind: 'sensorRect', ...objectSensorRect(entity, { collision }), source: entity });
    }
  }
  return { platforms, hazards, sensors };
}

export function validateStage(stage, prefabRegistry) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const { entity, category } of allStageEntities(stage)) {
    if (!entity.id || ids.has(entity.id)) errors.push(`IDが重複または空です: ${entity.id || '(empty)'}`);
    ids.add(entity.id);
    const prefab = prefabRegistry.prefabs[entity.prefab];
    if (!prefab) {
      errors.push(`${entity.id}: 未登録プレハブ ${entity.prefab}`);
      continue;
    }
    if (prefab.category !== category) errors.push(`${entity.id}: カテゴリがプレハブ仕様と一致しません`);
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) errors.push(`${entity.id}: x/yは有限数である必要があります`);
    if (category === 'platform') {
      const rules = prefab.constraints;
      if (!Number.isInteger(entity.modules) || entity.modules < rules.modules.min || entity.modules > rules.modules.max) {
        errors.push(`${entity.id}: modulesは${rules.modules.min}〜${rules.modules.max}の整数です`);
      }
      if (!new RegExp(rules.pattern).test(entity.pattern)) errors.push(`${entity.id}: patternはA/Bのみ使用できます`);
      if (rules.patternLengthMustEqualModules && entity.pattern.length !== entity.modules) {
        errors.push(`${entity.id}: pattern長とmodulesを一致させてください`);
      }
      if (rules.motionAxis) {
        if (!rules.motionAxis.includes(entity.motionAxis)) errors.push(`${entity.id}: motionAxisはx/yのみです`);
        if (!Number.isFinite(entity.motionDistance) || entity.motionDistance < rules.motionDistance.min || entity.motionDistance > rules.motionDistance.max) {
          errors.push(`${entity.id}: motionDistanceがPrefab範囲外です`);
        }
        if (rules.motionDuration) {
          if (!Number.isFinite(entity.motionDuration) || entity.motionDuration < rules.motionDuration.min || entity.motionDuration > rules.motionDuration.max) {
            errors.push(`${entity.id}: motionDurationがPrefab範囲外です`);
          }
          if (!Number.isFinite(entity.activationDelay) || entity.activationDelay < rules.activationDelay.min || entity.activationDelay > rules.activationDelay.max) {
            errors.push(`${entity.id}: activationDelayがPrefab範囲外です`);
          }
        } else {
          if (!Number.isFinite(entity.motionPeriod) || entity.motionPeriod < rules.motionPeriod.min || entity.motionPeriod > rules.motionPeriod.max) {
            errors.push(`${entity.id}: motionPeriodがPrefab範囲外です`);
          }
          if (!Number.isFinite(entity.motionPhase) || entity.motionPhase < rules.motionPhase.min || entity.motionPhase > rules.motionPhase.max) {
            errors.push(`${entity.id}: motionPhaseがPrefab範囲外です`);
          }
        }
      }
      if (prefab.activation?.mode === 'growth') {
        if (!entity.activatedBy) errors.push(`${entity.id}: growth platform requires activatedBy`);
        if (!['right', 'left', 'up', 'down'].includes(entity.direction)) errors.push(`${entity.id}: direction must be right/left/up/down`);
        if (!Number.isInteger(entity.length) || entity.length < 2 || entity.length > 16) errors.push(`${entity.id}: length must be an integer from 2 to 16`);
        if (!Number.isFinite(entity.growthSpeed) || entity.growthSpeed < .08 || entity.growthSpeed > .15) errors.push(`${entity.id}: growthSpeed must be 0.08-0.15 seconds`);
        if (!Number.isFinite(entity.activeDuration) || entity.activeDuration < 1) errors.push(`${entity.id}: activeDuration must be at least 1 second`);
        if (!Number.isFinite(entity.collapseDuration) || entity.collapseDuration < 1) errors.push(`${entity.id}: collapseDuration must be at least 1 second`);
        if (!Number.isFinite(entity.segmentSpacing) || entity.segmentSpacing < 24 || entity.segmentSpacing > 96) errors.push(`${entity.id}: segmentSpacing must be 24-96`);
        if (!Number.isFinite(entity.activationDelay)
          || entity.activationDelay < rules.activationDelay.min
          || entity.activationDelay > rules.activationDelay.max) {
          errors.push(`${entity.id}: activationDelayがPrefab範囲外です`);
        }
      }
    }
    if (entity.x < -500 || entity.x > stage.world.width + 500) warnings.push(`${entity.id}: ワールド横範囲から大きく外れています`);
    if (entity.y < -500 || entity.y > stage.world.height + 500) warnings.push(`${entity.id}: ワールド縦範囲から大きく外れています`);
  }
  for (const pattern of stage.pickupPatterns ?? []) {
    if (pattern.prefab !== 'data-crystal-pattern-v1') errors.push(`${pattern.id}: 未登録の配置パターンです`);
    if (!Number.isInteger(pattern.count) || pattern.count < 1 || pattern.count > 12) errors.push(`${pattern.id}: countは1〜12です`);
    if (!['line', 'stair', 'arc'].includes(pattern.pattern)) errors.push(`${pattern.id}: 未対応の配置形状です`);
  }
  for (let index = 0; index < (stage.sections?.length ?? 0); index++) {
    const section = stage.sections[index];
    if (section.xStart >= section.xEnd) errors.push(`${section.id}: 区間幅が不正です`);
    if (index && stage.sections[index - 1].xEnd !== section.xStart) warnings.push(`${section.id}: 前区間との間に隙間または重複があります`);
  }
  return { errors, warnings, valid: errors.length === 0 };
}

export function makeStagePatch(baseStage, editedStage, prefabRegistry, note = '') {
  const changes = {};
  for (const { entity: edited } of allStageEntities(editedStage)) {
    const base = findStageEntity(baseStage, edited.id)?.entity;
    if (!base) continue;
    const allowed = prefabRegistry.prefabs[edited.prefab]?.editor?.allowed ?? [];
    for (const key of allowed) {
      if (edited[key] !== base[key]) {
        changes[edited.id] ??= {};
        changes[edited.id][key] = edited[key];
      }
    }
  }
  const changedEntities = Object.keys(changes);
  const centers = changedEntities
    .map(id => findStageEntity(editedStage, id)?.entity.x)
    .filter(Number.isFinite);
  const centerYs = changedEntities
    .map(id => findStageEntity(editedStage, id)?.entity.y)
    .filter(Number.isFinite);
  const focusX = centers.length ? centers.reduce((sum, value) => sum + value, 0) / centers.length : 0;
  const focusY = centerYs.length ? centerYs.reduce((sum, value) => sum + value, 0) / centerYs.length : null;
  const section = sectionAtX(editedStage, focusX, focusY);
  return {
    patchVersion: 1,
    stageId: editedStage.stageId,
    baseSchemaVersion: editedStage.schemaVersion,
    sectionId: section?.id ?? null,
    note,
    changes,
  };
}

export function loadLocalStagePatch(stageId) {
  try {
    return JSON.parse(localStorage.getItem(`nyabbit-stage-patch:${stageId}`) || 'null');
  } catch {
    return null;
  }
}

export function saveLocalStagePatch(patch) {
  localStorage.setItem(`nyabbit-stage-patch:${patch.stageId}`, JSON.stringify(patch));
}

export function clearLocalStagePatch(stageId) {
  localStorage.removeItem(`nyabbit-stage-patch:${stageId}`);
}
