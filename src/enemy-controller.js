import { playerHitbox } from './player-hitbox.js';

const overlap = (a, b) => a.x < b.x + b.w
  && a.x + a.w > b.x
  && a.y < b.y + b.h
  && a.y + a.h > b.y;

const prefabFor = (registry, marker) => registry?.prefabs?.[marker.prefab] ?? {};

export const createEnemies = (markers, registry = {}) => markers.map(marker => {
  const prefab = prefabFor(registry, marker);
  const behavior = { ...(prefab.behavior ?? {}), ...(marker.behavior ?? {}) };
  const jumpInterval = Math.max(.6, behavior.interval ?? 2.4);
  return {
    ...structuredClone(marker),
    visualSet: marker.visualSet ?? prefab.visualSet ?? 'nyabi-clean-side-patrol',
    displayName: marker.displayName ?? prefab.displayName ?? 'ENEMY',
    render: { ...(prefab.render ?? {}), ...(marker.render ?? {}) },
    collision: { ...(prefab.collision ?? {}), ...(marker.collision ?? {}) },
    laser: prefab.laser || marker.laser
      ? { ...(prefab.laser ?? {}), ...(marker.laser ?? {}) }
      : null,
    behavior,
    behaviorPreset: marker.behaviorPreset ?? behavior.preset ?? 'patrol',
    spawnX: marker.x,
    spawnY: marker.y,
    direction: marker.initialDirection === 'left' ? -1 : 1,
    spawnDirection: marker.initialDirection === 'left' ? -1 : 1,
    motionTime: ((behavior.phase ?? 0) % 1 + 1) % 1 * jumpInterval,
    age: 0,
    jumpPhase: 0,
    animationFrame: 0,
    laserState: 'idle',
    previousLaserState: 'idle',
    laserAimDirection: marker.initialDirection === 'right' ? 1 : -1,
    runtimeLaser: null,
    active: true,
  };
});

export function resetEnemies(enemies) {
  for (const enemy of enemies) {
    enemy.x = enemy.spawnX;
    enemy.y = enemy.spawnY;
    enemy.direction = enemy.spawnDirection ?? 1;
    const interval = Math.max(.6, enemy.behavior?.interval ?? 2.4);
    enemy.motionTime = (((enemy.behavior?.phase ?? 0) % 1 + 1) % 1) * interval;
    enemy.age = 0;
    enemy.jumpPhase = 0;
    enemy.animationFrame = 0;
    enemy.laserState = 'idle';
    enemy.previousLaserState = 'idle';
    enemy.laserAimDirection = enemy.spawnDirection ?? -1;
    enemy.runtimeLaser = null;
    enemy.active = true;
  }
}

function stepHorizontalPatrol(enemy, dt, movementScale = 1) {
  const patrol = enemy.patrol;
  if (!patrol || movementScale <= 0) return;
  enemy.x += enemy.direction * patrol.speed * dt * movementScale;
  if (enemy.x <= patrol.minX) {
    enemy.x = patrol.minX;
    enemy.direction = 1;
  } else if (enemy.x >= patrol.maxX) {
    enemy.x = patrol.maxX;
    enemy.direction = -1;
  }
}

function stepJumpEnemy(enemy, dt) {
  const interval = Math.max(.6, enemy.behavior.interval ?? 2.4);
  const duration = Math.min(interval, Math.max(.24, enemy.behavior.duration ?? .78));
  const height = Math.max(12, enemy.behavior.height ?? 70);
  const idleDuration = interval - duration;
  enemy.motionTime = (enemy.motionTime + dt) % interval;

  if (enemy.motionTime < idleDuration) {
    enemy.y = enemy.spawnY;
    enemy.jumpPhase = 0;
    enemy.animationFrame = 0;
    return;
  }

  const phase = Math.min(1, (enemy.motionTime - idleDuration) / duration);
  enemy.jumpPhase = phase;
  enemy.y = enemy.spawnY - Math.sin(Math.PI * phase) * height;
  enemy.animationFrame = Math.min(3, 1 + Math.floor(phase * 3));
  stepHorizontalPatrol(enemy, dt, .82);
}

function laserMuzzle(enemy, laser, direction) {
  const insetX = laser.muzzleOffsetX ?? 18;
  return {
    x: direction < 0 ? enemy.x + insetX : enemy.x + enemy.w - insetX,
    y: enemy.y + (laser.muzzleOffsetY ?? enemy.h * .58),
  };
}

function spawnLaserProjectile(enemy, laser) {
  const direction = enemy.laserAimDirection || -1;
  const length = Math.max(72, laser.length ?? 168);
  const height = Math.max(8, laser.height ?? 20);
  const muzzle = laserMuzzle(enemy, laser, direction);
  enemy.runtimeLaser = {
    x: direction < 0 ? muzzle.x - length : muzzle.x,
    y: muzzle.y - height / 2,
    w: length,
    h: height,
    renderHeight: laser.renderHeight ?? 86,
    direction,
    velocityX: direction * Math.max(120, laser.speed ?? 440),
    age: 0,
    ttl: Math.max(.25, laser.travelSeconds ?? 1.05),
    state: 'active',
    active: true,
  };
}

function stepLaserProjectile(enemy, dt) {
  const projectile = enemy.runtimeLaser;
  if (!projectile?.active) return;
  projectile.age += dt;
  projectile.x += projectile.velocityX * dt;
  if (projectile.age >= projectile.ttl) {
    projectile.active = false;
    projectile.state = 'idle';
  }
}

function stepHoverLaserEnemy(enemy, dt, player) {
  stepHorizontalPatrol(enemy, dt, .36);
  const bobHeight = enemy.behavior.bobHeight ?? 12;
  const bobSpeed = enemy.behavior.bobSpeed ?? 2.2;
  enemy.y = enemy.spawnY + Math.sin(enemy.age * bobSpeed) * bobHeight;

  const laser = enemy.laser;
  if (!laser) {
    enemy.animationFrame = Math.floor(enemy.age * 5) & 3;
    return;
  }

  stepLaserProjectile(enemy, dt);

  const period = Math.max(1, laser.period ?? 3.2);
  const cycle = ((enemy.age / period + (laser.phase ?? 0)) % 1 + 1) % 1;
  const warningStart = laser.warningStart ?? .48;
  const activeStart = laser.activeStart ?? .62;
  const activeEnd = laser.activeEnd ?? .86;
  enemy.previousLaserState = enemy.laserState;
  enemy.laserState = cycle >= activeStart && cycle < activeEnd
    ? 'active'
    : cycle >= warningStart && cycle < activeStart ? 'warning' : 'idle';
  enemy.animationFrame = enemy.laserState === 'active'
    ? 2 + (Math.floor(enemy.age * 12) & 1)
    : enemy.laserState === 'warning' ? 2 : Math.floor(enemy.age * 5) & 1;

  const enteredWarning = enemy.laserState === 'warning' && enemy.previousLaserState !== 'warning';
  const enteredActive = enemy.laserState === 'active' && enemy.previousLaserState !== 'active';
  if (enteredWarning || (enteredActive && enemy.previousLaserState === 'idle')) {
    const playerCenter = player ? player.x + player.w / 2 : enemy.x - 1;
    enemy.laserAimDirection = playerCenter < enemy.x + enemy.w / 2 ? -1 : 1;
  }
  if (enteredActive) spawnLaserProjectile(enemy, laser);
}

function stepEnemyMotion(enemy, dt, player) {
  enemy.age += dt;
  if (enemy.behaviorPreset === 'hover_laser') {
    stepHoverLaserEnemy(enemy, dt, player);
    return;
  }
  if (enemy.behaviorPreset === 'jump') {
    stepJumpEnemy(enemy, dt);
    return;
  }
  enemy.y = enemy.spawnY;
  enemy.jumpPhase = 0;
  stepHorizontalPatrol(enemy, dt);
}

export function stepEnemies({ enemies, player, sliding = false, dt }) {
  const events = { stomped: null, hit: null, hitSource: null, laserFired: [] };
  const protectedFromDamage = player.invincible > 0 || player.shieldTimer > 0;

  for (const enemy of enemies) {
    if (!enemy.active) continue;
    stepEnemyMotion(enemy, dt, player);

    if (enemy.laserState === 'active' && enemy.previousLaserState !== 'active') {
      events.laserFired.push(enemy);
    }

    const insetX = enemy.collision.insetX ?? 14;
    const insetY = enemy.collision.insetY ?? 16;
    const enemyHitbox = {
      x: enemy.x + insetX,
      y: enemy.y + insetY,
      w: enemy.w - insetX * 2,
      h: enemy.h - insetY,
    };
    const hitbox = playerHitbox(player, sliding);
    if (enemy.runtimeLaser?.active && overlap(hitbox, enemy.runtimeLaser)) {
      if (!protectedFromDamage) {
        events.hit = enemy;
        events.hitSource = enemy.runtimeLaser;
        break;
      }
    }
    if (!overlap(hitbox, enemyHitbox)) continue;

    const playerFeet = player.y + player.h;
    const stompedFromAbove = player.vy > 120 && playerFeet <= enemy.y + enemy.h * .62;
    if (stompedFromAbove) {
      enemy.active = false;
      player.vy = enemy.collision.stompBounce ?? -500;
      player.onGround = false;
      player.groundPlatformId = null;
      events.stomped = enemy;
    } else if (!protectedFromDamage) {
      events.hit = enemy;
      events.hitSource = enemy;
    }
    if (events.stomped || events.hit) break;
  }

  return events;
}

// Backward-compatible aliases keep existing tools and external experiments working.
export const createPatrolEnemies = createEnemies;
export const resetPatrolEnemies = resetEnemies;
export const stepPatrolEnemies = stepEnemies;
