import assert from 'node:assert/strict';
import { bossSpritePose, createNyabiDroneCore, stepNyabiDroneCore } from '../src/boss-controller.js';
import { applyBossArenaLayout } from '../src/course-layout.js';
import { platformWidth } from '../src/stage-resolver.js';
import { stepPlayerController } from '../src/player-controller.js';
import { readFile } from 'node:fs/promises';

const boss = createNyabiDroneCore({ x: 1000, y: 700 });
const player = { x: boss.x + 168, y: boss.y - 112, w: 92, h: 142, vy: 400 };
for (let hit = 1; hit <= 3; hit += 1) {
  const event = stepNyabiDroneCore({ boss, player, dt: .016 });
  assert(event.hitBoss, `head stomp ${hit} did not register`);
  assert.equal(boss.hp, 3 - hit);
  if (hit < 3) {
    player.x = 0; player.y = 0; player.vy = 0;
    stepNyabiDroneCore({ boss, player, dt: 1.2 });
    player.x = boss.x + 168; player.y = boss.y - 112; player.vy = 400;
  } else assert(event.defeated && boss.defeated);
}
const attackBoss = createNyabiDroneCore({ x: 1000, y: 700 });
const safePlayer = { x: 0, y: 0, w: 92, h: 142, vy: 0 };
stepNyabiDroneCore({ boss: attackBoss, player: safePlayer, dt: 1.79 });
stepNyabiDroneCore({ boss: attackBoss, player: safePlayer, dt: .02 });
assert(attackBoss.laser, 'boss did not start a telegraphed laser pattern');
assert(attackBoss.laser.warning >= .8 && attackBoss.laser.recovery >= 1, 'laser must have a long warning and a generous attack opening');
assert.equal(attackBoss.laser.state, 'warning', 'only one warning state may be active at once');
assert.equal(attackBoss.spriteDirection, 'down', 'first laser attack must use the downward arm sheet');
assert(attackBoss.spriteFrame >= 0 && attackBoss.spriteFrame <= 4, 'warning must advance through the five pre-fire frames');
assert(attackBoss.laser.beams.every(beam => {
  const dx = beam.endX - beam.originX; const dy = beam.endY - beam.originY;
  return Math.abs(dx / Math.hypot(dx, dy) - Math.cos(beam.angle)) < 1e-9
    && Math.abs(dy / Math.hypot(dx, dy) - Math.sin(beam.angle)) < 1e-9;
}), 'every beam must follow its forearm angle from its muzzle');
const warningPose = bossSpritePose(attackBoss);
assert(attackBoss.laser.beams.every(beam => (
  beam.originX >= warningPose.originX && beam.originX <= warningPose.originX + warningPose.size
  && beam.originY >= warningPose.originY && beam.originY <= warningPose.originY + warningPose.size
)), 'every warning beam must originate inside the current full-body sprite');
const summon = stepNyabiDroneCore({ boss: attackBoss, player: safePlayer, dt: 3.3 });
assert(summon.summon, 'boss did not summon a Nyabi Drone');
const course = JSON.parse(await readFile(new URL('../data/course-03-objects.json', import.meta.url), 'utf8'));
const layout = JSON.parse(await readFile(new URL('../data/course-layout.json', import.meta.url), 'utf8'));
applyBossArenaLayout(course, layout.bossArenaLayout);
const movement = JSON.parse(await readFile(new URL('../data/player-movement.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../data/prefab-registry.json', import.meta.url), 'utf8'));
const moduleSpec = JSON.parse(await readFile(new URL('../assets/objects/platform_modular/module-spec.json', import.meta.url), 'utf8'));
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert(!mainSource.includes('bossPartPose') && !mainSource.includes('boss.armAngles'), 'rejected part rotation plan must not remain in the boss renderer');
assert(!mainSource.includes('bossCoreForearm') && !mainSource.includes('bossCoreBody'), 'boss renderer must not load split body or forearm parts');
assert(mainSource.includes('bossSpriteFrames[boss.spriteDirection][boss.spriteFrame]'), 'boss renderer must use the selected full-body animation frame');
assert(mainSource.includes("const beaconActive = boss.laser && boss.laser.state !== 'recovery'"), 'beacon must remain off during ordinary idle');
assert(!course.platforms.some(platform => platform.id === 'yard-ledge'), 'legacy left-side yard ledge must not remain inside the boss arena');
assert(mainSource.includes('const deviceSourceFloorRatio = 61 / 64') && mainSource.includes('crystalRemoteSwitch'), 'crystal switches must use alpha-aware floor alignment');
assert(!mainSource.includes('ctx.drawImage(images[`crystalNozzle'), 'rejected standalone crystal nozzles must not render in the boss arena');
const highFloors = course.platforms.filter(platform => platform.id.startsWith('boss-') && platform.id.endsWith('high-floor'));
assert.equal(highFloors.length, 2, 'boss arena needs left and right high floors');
assert(highFloors.every(platform => 1274 - platform.y >= 300), 'high floors must remain roughly twice normal jump height');
const middleFloors = course.platforms.filter(platform => platform.id.startsWith('boss-') && platform.id.endsWith('middle-floor'));
assert.equal(middleFloors.length, 2, 'boss arena needs symmetric left and right middle floors');
const topFloors = course.platforms.filter(platform => platform.id.startsWith('boss-') && platform.id.endsWith('top-floor'));
assert.equal(topFloors.length, 2, 'boss arena needs symmetric left and right top floors');
const bossFloors = [...highFloors, ...middleFloors, ...topFloors];
assert(bossFloors.every(platform => platform.prefab === 'lab-bridge-short-v1' && platformWidth(platform, moduleSpec, registry) === 230), 'every boss floating floor must use the fixed half-width prefab');
assert.equal(highFloors[0].y - middleFloors[0].y, layout.bossArenaLayout.tierRise, 'first-to-second floor tier rise must use shared layout');
assert.equal(middleFloors[0].y - topFloors[0].y, layout.bossArenaLayout.tierRise, 'second-to-third floor tier rise must use shared layout');
assert.equal(course.platforms.filter(platform => platform.id.startsWith('boss-crystal-step-')).length, 6, 'both sides need three crystal-growth steps');
const jumpRise = movement.jumpVelocity ** 2 / (2 * movement.gravity);
const safeJumpRise = jumpRise - layout.bossArenaLayout.jumpSafetyMargin;
const canRuntimeJump = (fromY, toY) => {
  const player = { x: 100, y: fromY - 142, w: 92, h: 142, vx: 0, vy: 0, onGround: true, facing: 1, slideTimer: 0, coyoteTimer: 0, jumpBufferTimer: 0, landingTimer: 0, moveState: 'idle' };
  const target = { id: 'target', x: 0, y: toY, w: 500, h: 24 };
  for (let frame = 0; frame < 180; frame += 1) {
    stepPlayerController({
      player,
      input: { left: false, right: false, jump: true, slide: false, jumpPressed: frame === 0 },
      platforms: [target], worldWidth: 1000, dt: 1 / 60, tuning: movement,
    });
    if (player.groundPlatformId === target.id) return true;
  }
  return false;
};
const lowerSteps = course.platforms.filter(platform => ['boss-crystal-step-01', 'boss-crystal-step-03'].includes(platform.id));
assert(lowerSteps.every(step => layout.bossArenaLayout.groundY - step.y <= safeJumpRise), 'ground-to-lower-crystal jump must be reachable with safety margin');
assert(lowerSteps.every(step => step.y - highFloors[0].y <= safeJumpRise), 'lower-crystal-to-high-floor jump must be reachable with safety margin');
const middleSteps = course.platforms.filter(platform => ['boss-crystal-step-02', 'boss-crystal-step-04'].includes(platform.id));
assert(middleSteps.every(step => highFloors[0].y - step.y <= safeJumpRise), 'first-floor-to-middle-crystal jump must be reachable with safety margin');
assert(middleSteps.every(step => step.y - middleFloors[0].y <= safeJumpRise), 'middle-crystal-to-second-floor jump must be reachable with safety margin');
const topSteps = course.platforms.filter(platform => ['boss-crystal-step-05', 'boss-crystal-step-06'].includes(platform.id));
assert(topSteps.every(step => middleFloors[0].y - step.y <= safeJumpRise), 'second-floor-to-top-crystal jump must be reachable with safety margin');
assert(topSteps.every(step => step.y - topFloors[0].y <= safeJumpRise), 'top-crystal-to-third-floor jump must be reachable with safety margin');
for (const [fromY, toY, label] of [
  [layout.bossArenaLayout.groundY, lowerSteps[0].y, 'ground to lower crystal'],
  [lowerSteps[0].y, highFloors[0].y, 'lower crystal to first floor'],
  [highFloors[0].y, middleSteps[0].y, 'first floor to middle crystal'],
  [middleSteps[0].y, middleFloors[0].y, 'middle crystal to second floor'],
  [middleFloors[0].y, topSteps[0].y, 'second floor to top crystal'],
  [topSteps[0].y, topFloors[0].y, 'top crystal to third floor'],
]) assert(canRuntimeJump(fromY, toY), `${label} must succeed in the real player controller`);
assert.equal(canRuntimeJump(layout.bossArenaLayout.groundY, highFloors[0].y), false, 'ground must not jump directly to high floor');
assert.equal(canRuntimeJump(highFloors[0].y, middleFloors[0].y), false, 'first floor must not jump directly to second floor');
assert.equal(canRuntimeJump(middleFloors[0].y, topFloors[0].y), false, 'second floor must not jump directly to third floor');
for (const [ids, floorY] of [
  [['boss-switch-01', 'boss-switch-03'], layout.bossArenaLayout.groundY],
  [['boss-switch-02', 'boss-switch-04'], highFloors[0].y],
  [['boss-switch-05', 'boss-switch-06'], middleFloors[0].y],
]) {
  const switches = course.objects.filter(object => ids.includes(object.id));
  assert.equal(switches.length, 2);
  assert(switches.every(object => object.y + object.h === floorY), 'each switch pair must stay mounted to its shared floor tier');
}
const deviceVisibleRatios = {
  'crystal-remote-switch-v1': [27 / 128, 100 / 128],
  'crystal-growth-nozzle-v1': [10 / 192, 182 / 192],
};
for (const device of course.objects.filter(object => object.id.startsWith('boss-switch-') || object.id.startsWith('boss-nozzle-'))) {
  const [leftRatio, rightRatio] = deviceVisibleRatios[device.prefab];
  const visibleLeft = device.x + device.w * leftRatio;
  const visibleRight = device.x + device.w * rightRatio;
  const floorY = device.y + device.h;
  const support = course.platforms.find(platform => {
    if (platform.y !== floorY || platform.prefab.startsWith('crystal-growth-')) return false;
    const width = platformWidth(platform, moduleSpec, registry);
    return visibleLeft >= platform.x && visibleRight <= platform.x + width;
  });
  assert(support, `${device.id} visible base must be fully contained by a supporting floor`);
}
const phaseFloors = { 3: highFloors[0].y, 2: middleFloors[0].y, 1: topFloors[0].y };
const phaseBaseYByHp = Object.fromEntries(Object.entries(phaseFloors).map(([hp, floorY]) => [hp, floorY - layout.bossArenaLayout.bossHeadReachBelowFloor + 12]));
const climbingBoss = createNyabiDroneCore({ x: 1000, y: phaseBaseYByHp[3], phaseBaseYByHp, verticalAmplitude: layout.bossArenaLayout.bossVerticalAmplitude });
for (const hp of [3, 2, 1]) {
  climbingBoss.hp = hp;
  for (let frame = 0; frame < 240; frame += 1) stepNyabiDroneCore({ boss: climbingBoss, player: safePlayer, dt: 1 / 60 });
  assert(Math.abs(climbingBoss.baseY - phaseBaseYByHp[hp]) < 1, `boss phase ${hp} must settle at its assigned attack floor`);
  const assignedFloor = phaseFloors[hp];
  const closestHeadRise = assignedFloor - (climbingBoss.baseY - 12 + layout.bossArenaLayout.bossVerticalAmplitude);
  assert(closestHeadRise <= safeJumpRise, `boss phase ${hp} head must be attackable from its assigned floor`);
  if (hp < 3) {
    const lowerFloor = phaseFloors[hp + 1];
    const closestFromLower = lowerFloor - (climbingBoss.baseY - 12 + layout.bossArenaLayout.bossVerticalAmplitude);
    assert(closestFromLower > jumpRise, `boss phase ${hp} must not remain attackable from the previous floor`);
  }
}
assert(mainSource.includes('bossArena.entranceX + 26') && mainSource.includes('bossArena.exitX - player.w - 26'), 'boss arena must lock both directions');
assert(mainSource.includes('if (!bossIntroduced || boss.defeated) return;'), 'barriers must disappear after defeat');
console.log('BOSS CONTROLLER VALIDATION PASSED');
