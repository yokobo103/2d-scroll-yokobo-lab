const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const SPRITE_SIZE = 512;
const DRAW_SIZE = 760;
const WEAK_POINT = { x: 216, y: 135, w: 80, h: 52 };
const MUZZLES = {
  up: [
    { left: [55, 282], right: [459, 283] },
    { left: [55, 225], right: [459, 222] },
    { left: [60, 189], right: [450, 190] },
    { left: [73, 149], right: [436, 150] },
    { left: [84, 145], right: [428, 144] },
    { left: [87, 150], right: [423, 151] },
  ],
  down: [
    { left: [59, 298], right: [445, 302] },
    { left: [59, 349], right: [455, 352] },
    { left: [75, 367], right: [437, 368] },
    { left: [95, 375], right: [418, 380] },
    { left: [92, 382], right: [418, 380] },
    { left: [93, 378], right: [418, 379] },
  ],
};
const SHOULDERS = { left: [168, 260], right: [344, 260] };

export const bossSpritePose = boss => {
  const scale = DRAW_SIZE / SPRITE_SIZE;
  return {
    scale,
    size: DRAW_SIZE,
    originX: boss.x + boss.w / 2 - DRAW_SIZE / 2,
    originY: boss.y - 12 - WEAK_POINT.y * scale,
  };
};

const headRect = boss => {
  const pose = bossSpritePose(boss);
  return {
    x: pose.originX + WEAK_POINT.x * pose.scale,
    y: pose.originY + WEAK_POINT.y * pose.scale,
    w: WEAK_POINT.w * pose.scale,
    h: WEAK_POINT.h * pose.scale,
  };
};

const segmentHitsRect = (beam, rect, padding = 23) => {
  const expanded = { x: rect.x - padding, y: rect.y - padding, w: rect.w + padding * 2, h: rect.h + padding * 2 };
  let t0 = 0; let t1 = 1;
  const dx = beam.endX - beam.originX; const dy = beam.endY - beam.originY;
  for (const [p, q] of [
    [-dx, beam.originX - expanded.x], [dx, expanded.x + expanded.w - beam.originX],
    [-dy, beam.originY - expanded.y], [dy, expanded.y + expanded.h - beam.originY],
  ]) {
    if (p === 0 && q < 0) return false;
    if (p === 0) continue;
    const ratio = q / p;
    if (p < 0) { if (ratio > t1) return false; t0 = Math.max(t0, ratio); }
    else { if (ratio < t0) return false; t1 = Math.min(t1, ratio); }
  }
  return true;
};

const attackPlan = boss => {
  boss.attackSerial += 1;
  return { kind: boss.attackSerial % 2 ? 'arm-down' : 'arm-up', spriteDirection: boss.attackSerial % 2 ? 'down' : 'up' };
};

const attackFrame = attack => {
  if (attack.state === 'firing') return 5;
  if (attack.state === 'warning') return Math.min(4, Math.floor(clamp(attack.age / attack.warning, 0, .999) * 5));
  const recoveryAge = attack.age - attack.warning - attack.active;
  return Math.max(0, 4 - Math.floor(clamp(recoveryAge / attack.recovery, 0, .999) * 5));
};

const updateAttackGeometry = boss => {
  const attack = boss.laser;
  if (!attack) return;
  attack.state = attack.age < attack.warning ? 'warning'
    : attack.age < attack.warning + attack.active ? 'firing' : 'recovery';
  boss.spriteDirection = attack.spriteDirection;
  boss.spriteFrame = attackFrame(attack);
  if (attack.state === 'recovery') {
    attack.beams = [];
    return;
  }
  const pose = bossSpritePose(boss);
  const frameMuzzles = MUZZLES[boss.spriteDirection][boss.spriteFrame];
  attack.beams = ['left', 'right'].map(side => {
    const [mx, my] = frameMuzzles[side];
    const [sx, sy] = SHOULDERS[side];
    const angle = Math.atan2(my - sy, mx - sx);
    const originX = pose.originX + mx * pose.scale;
    const originY = pose.originY + my * pose.scale;
    return {
      side, angle, originX, originY,
      endX: originX + Math.cos(angle) * attack.length,
      endY: originY + Math.sin(angle) * attack.length,
    };
  });
};

export function createNyabiDroneCore({ x, y, arenaMinX = x - 600, arenaMaxX = x + 600, phaseBaseYByHp = null, verticalAmplitude = 115 }) {
  return {
    id: 'nyabi-drone-core', x, y, baseX: x, baseY: y, phaseBaseYByHp, verticalAmplitude,
    arenaMinX, arenaMaxX, w: 430, h: 390, hp: 3, active: true, defeated: false, age: 0,
    hurt: 0, summonClock: 5, summoned: 0, laserClock: 1.8, laser: null, attackSerial: 0,
    spriteDirection: 'down', spriteFrame: 0,
  };
}

export function stepNyabiDroneCore({ boss, player, dt }) {
  const events = { hitBoss: false, hitPlayer: false, summon: null, defeated: false };
  if (!boss.active) return events;
  boss.age += dt; boss.hurt = Math.max(0, boss.hurt - dt);
  const phaseTargetY = boss.phaseBaseYByHp?.[boss.hp] ?? boss.baseY;
  boss.baseY += (phaseTargetY - boss.baseY) * Math.min(1, dt * 1.8);
  const amplitude = Math.max(0, Math.min(boss.baseX - boss.arenaMinX, boss.arenaMaxX - boss.w - boss.baseX));
  boss.x = boss.baseX + Math.sin(boss.age * .42) * amplitude;
  boss.y = boss.baseY + Math.sin(boss.age * .83) * boss.verticalAmplitude;
  const head = headRect(boss);
  const playerFeet = { x: player.x + 18, y: player.y + player.h - 28, w: player.w - 36, h: 34 };
  if (!boss.hurt && player.vy > 150 && overlap(playerFeet, head)) {
    boss.hp -= 1; boss.hurt = 1.15; player.vy = -650; events.hitBoss = true;
    if (boss.hp <= 0) { boss.defeated = true; boss.active = false; events.defeated = true; }
  } else if (!boss.hurt && overlap({ x: player.x + 12, y: player.y + 12, w: player.w - 24, h: player.h - 18 }, { x: boss.x + 40, y: boss.y + 62, w: boss.w - 80, h: boss.h - 70 })) events.hitPlayer = true;

  boss.summonClock -= dt;
  if (boss.summonClock <= 0 && boss.summoned < 4) {
    boss.summonClock = 7.5; boss.summoned += 1;
    events.summon = { x: boss.x - 260 - boss.summoned * 34, y: boss.y + 210 };
  }
  boss.laserClock -= dt;
  if (!boss.laser && boss.laserClock <= 0) {
    boss.laser = { ...attackPlan(boss), age: 0, warning: 1, active: .72, recovery: 1.15, length: 900, state: 'warning', beams: [] };
    boss.laserClock = 3.4;
  }
  if (boss.laser) {
    boss.laser.age += dt;
    updateAttackGeometry(boss);
    if (boss.laser.state === 'firing') {
      const sliding = player.moveState === 'slide' || player.slideTimer > 0;
      const playerRect = sliding
        ? { x: player.x + 10, y: player.y + player.h - 72, w: player.w - 20, h: 64 }
        : { x: player.x + 10, y: player.y + 10, w: player.w - 20, h: player.h - 18 };
      if (boss.laser.beams.some(beam => segmentHitsRect(beam, playerRect))) events.hitPlayer = true;
    }
    if (boss.laser.age >= boss.laser.warning + boss.laser.active + boss.laser.recovery) {
      boss.laser = null;
      boss.spriteDirection = 'down';
      boss.spriteFrame = 0;
    }
  }
  return events;
}
