import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEnemies, resetEnemies, stepEnemies } from '../src/enemy-controller.js';
import { playerHitbox } from '../src/player-hitbox.js';

const stageHooks = JSON.parse(await readFile(new URL('../data/course-02-hooks.json', import.meta.url), 'utf8'));
const stageSource = JSON.parse(await readFile(new URL('../data/course-02-objects.json', import.meta.url), 'utf8'));
const prefabRegistry = JSON.parse(await readFile(new URL('../data/prefab-registry.json', import.meta.url), 'utf8'));

const marker = {
  id: 'test-robot', x: 100, y: 100, w: 80, h: 60,
  patrol: { minX: 90, maxX: 130, speed: 40 },
};
const makePlayer = overrides => ({
  x: 0, y: 0, w: 40, h: 60, vx: 0, vy: 0, onGround: false, groundPlatformId: null,
  ...overrides,
});
const overlapDepth = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

{
  const marker = stageHooks.actorSpawnMarkers.find(actor => actor.id === 'nyabi-drone-01');
  const prefab = prefabRegistry.prefabs[marker.prefab];
  const bobHeight = prefab.behavior.bobHeight;
  const floorBand = stageSource.floorBands.find(band => marker.x >= band.xStart && marker.x < band.xEnd);
  const playerY = floorBand.y - 142;
  const standing = playerHitbox(makePlayer({ x: marker.x - 200, y: playerY, w: 92, h: 142 }), false);
  const sliding = playerHitbox(makePlayer({ x: marker.x - 200, y: playerY, w: 92, h: 142 }), true);
  for (const bobOffset of [-bobHeight, 0, bobHeight]) {
    const laser = {
      x: standing.x,
      y: marker.y + bobOffset + marker.laser.muzzleOffsetY - marker.laser.height / 2,
      w: marker.laser.length,
      h: marker.laser.height,
    };
    const standingOverlap = overlapDepth(standing, laser);
    const slideClearance = sliding.y - (laser.y + laser.h);
    assert.ok(standingOverlap >= 10, `standing laser overlap must be >= 10px, got ${standingOverlap}`);
    assert.ok(slideClearance >= 10, `slide laser clearance must be >= 10px, got ${slideClearance}`);
  }
  console.log('PASS actual drone laser clears slide and hits standing at every bob extreme');
}

{
  const [enemy] = createEnemies([marker]);
  const player = makePlayer();
  stepEnemies({ enemies: [enemy], player, dt: 1 });
  assert.equal(enemy.x, 130);
  assert.equal(enemy.direction, -1);
  stepEnemies({ enemies: [enemy], player, dt: 1 });
  assert.equal(enemy.x, 90);
  assert.equal(enemy.direction, 1);
  console.log('PASS patrol bounds');
}

{
  const enemies = createEnemies([marker]);
  const player = makePlayer({ x: 115, y: 70, vy: 300 });
  const event = stepEnemies({ enemies, player, dt: 0 });
  assert.equal(event.stomped?.id, marker.id);
  assert.equal(enemies[0].active, false);
  assert.equal(player.vy, -500);
  console.log('PASS enemy stomp');

  resetEnemies(enemies);
  assert.equal(enemies[0].active, true);
  assert.equal(enemies[0].x, marker.x);
  console.log('PASS enemy reset');
}

{
  const enemies = createEnemies([marker]);
  const player = makePlayer({ x: 115, y: 100, vy: 0 });
  const event = stepEnemies({ enemies, player, dt: 0 });
  assert.equal(event.hit?.id, marker.id);
  assert.equal(enemies[0].active, true);
  console.log('PASS enemy side hit');
}

{
  const enemies = createEnemies([marker]);
  const player = makePlayer({ x: 115, y: 100, vy: 0, invincible: 1, shieldTimer: 0 });
  const event = stepEnemies({ enemies, player, dt: 0 });
  assert.equal(event.hit, null);
  assert.equal(enemies[0].active, true);
  console.log('PASS invincibility suppresses enemy damage');
}

{
  const enemies = createEnemies([marker]);
  const player = makePlayer({ x: 115, y: 70, vy: 300, invincible: 1, shieldTimer: 0 });
  const event = stepEnemies({ enemies, player, dt: 0 });
  assert.equal(event.stomped?.id, marker.id);
  assert.equal(enemies[0].active, false);
  console.log('PASS invincible player can still stomp');
}

{
  const registry = {
    prefabs: {
      'neji-nyabi-v1': {
        displayName: 'ネジニャビ',
        visualSet: 'neji-nyabi-hop',
        behavior: { preset: 'jump', interval: 1, duration: .5, height: 60, phase: .5 },
        collision: { stompBounce: -540 },
      },
    },
  };
  const [enemy] = createEnemies([{ ...marker, prefab: 'neji-nyabi-v1' }], registry);
  const player = makePlayer();
  stepEnemies({ enemies: [enemy], player, dt: .25 });
  assert.equal(enemy.behaviorPreset, 'jump');
  assert.equal(enemy.visualSet, 'neji-nyabi-hop');
  assert.equal(enemy.displayName, 'ネジニャビ');
  assert.ok(enemy.y < marker.y - 55, `jump apex should lift the enemy, got y=${enemy.y}`);
  assert.equal(enemy.animationFrame, 2);
  resetEnemies([enemy]);
  assert.equal(enemy.y, marker.y);
  assert.equal(enemy.active, true);
  console.log('PASS data-driven jump enemy');
}

{
  const registry = {
    prefabs: {
      'nyabi-drone-v1': {
        displayName: 'ニャビドローン',
        visualSet: 'nyabi-drone-hover-charge',
        behavior: { preset: 'hover_laser', bobHeight: 8, bobSpeed: 2 },
        laser: {
          mode: 'moving-projectile', length: 152, height: 20,
          speed: 380, travelSeconds: 1,
          muzzleOffsetX: 20, muzzleOffsetY: 84,
          period: 1, phase: .25, warningStart: .2, activeStart: .3, activeEnd: .4,
        },
      },
    },
  };
  const droneMarker = {
    ...marker, prefab: 'nyabi-drone-v1', x: 300, y: 500, w: 128, h: 112,
    patrol: { minX: 300, maxX: 380, speed: 20 },
  };
  const [enemy] = createEnemies([droneMarker], registry);
  const player = makePlayer({ x: 100, y: 520, w: 92, h: 142, vy: 0 });
  let event = stepEnemies({ enemies: [enemy], player, dt: 0 });
  assert.equal(enemy.laserState, 'warning');
  assert.equal(enemy.runtimeLaser, null);
  assert.equal(enemy.laserAimDirection, -1);

  event = stepEnemies({ enemies: [enemy], player, dt: .06 });
  assert.equal(enemy.laserState, 'active');
  assert.equal(enemy.runtimeLaser.active, true);
  assert.equal(enemy.runtimeLaser.direction, -1);
  assert.equal(enemy.runtimeLaser.w, 152);
  assert.ok(Math.abs(enemy.runtimeLaser.x + enemy.runtimeLaser.w - (enemy.x + 20)) < .01,
    'laser must originate at the drone muzzle');
  assert.equal(event.laserFired[0]?.id, droneMarker.id);
  assert.equal(event.hit?.id, droneMarker.id);

  const firstX = enemy.runtimeLaser.x;
  const jumpingPlayer = makePlayer({ x: 100, y: 360, w: 92, h: 142, vy: -300 });
  event = stepEnemies({ enemies: [enemy], player: jumpingPlayer, dt: .1 });
  assert.ok(enemy.runtimeLaser.x < firstX - 35, 'laser projectile must travel horizontally');
  assert.equal(event.hit, null, 'a normal jump must clear the low projectile');

  const [slidingEnemy] = createEnemies([droneMarker], registry);
  const slidingPlayer = makePlayer({ x: 100, y: 520, w: 92, h: 142, vy: 0 });
  stepEnemies({ enemies: [slidingEnemy], player: slidingPlayer, sliding: true, dt: 0 });
  event = stepEnemies({ enemies: [slidingEnemy], player: slidingPlayer, sliding: true, dt: .06 });
  assert.equal(event.hit, null, 'sliding must clear the laser projectile');

  resetEnemies([enemy]);
  assert.equal(enemy.laserState, 'idle');
  assert.equal(enemy.runtimeLaser, null);
  console.log('PASS Nyabi Drone short moving laser projectile');
}

console.log('\nENEMY CONTROLLER VALIDATION PASSED');
