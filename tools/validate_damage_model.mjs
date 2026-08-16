import assert from 'node:assert/strict';
import { applyDamage, applyFall, restoreAtCheckpoint } from '../src/damage-controller.js';

const makePlayer = overrides => ({
  x: 500, y: 572, w: 92, h: 142, vx: 0, vy: 0,
  facing: 1, lives: 3, maxLives: 3, missCount: 0,
  checkpointX: 150, checkpointY: 572,
  invincible: 0, shieldTimer: 0, onGround: true,
  coyoteTimer: .1, jumpBufferTimer: .1, landingTimer: .1, slideTimer: .1,
  moveState: 'idle', groundPlatformId: 'ground-a',
  ...overrides,
});

{
  const player = makePlayer();
  const result = applyDamage(player, { x: 600, w: 100 });
  assert.equal(result.applied, true);
  assert.equal(player.x, 500, 'damage must not teleport to the checkpoint');
  assert.equal(player.vx, -380);
  assert.equal(player.vy, -420);
  assert.equal(player.lives, 2);
  assert.equal(player.missCount, 1);
  console.log('PASS damage applies local knockback without checkpoint teleport');
}

{
  const player = makePlayer({ invincible: .5 });
  const result = applyDamage(player, { x: 600, w: 100 });
  assert.equal(result.applied, false);
  assert.equal(player.lives, 3);
  assert.equal(player.missCount, 0);
  console.log('PASS invincibility prevents repeated damage');
}

{
  const player = makePlayer({ shieldTimer: 2 });
  const result = applyDamage(player, { x: 600, w: 100 });
  assert.equal(result.applied, false);
  assert.equal(player.lives, 3);
  console.log('PASS shield prevents damage');
}

{
  const player = makePlayer({ lives: 1, maxLives: 4 });
  const result = applyDamage(player, { x: 600, w: 100 });
  assert.equal(result.depleted, true);
  restoreAtCheckpoint(player);
  assert.equal(player.x, player.checkpointX);
  assert.equal(player.lives, 4);
  console.log('PASS depleted life returns to checkpoint at full maxLives');
}

{
  const player = makePlayer({ lives: 0, maxLives: 5, x: 900, y: 900 });
  restoreAtCheckpoint(player);
  assert.equal(player.x, 150);
  assert.equal(player.y, 572);
  assert.equal(player.lives, 5);
  assert.equal(player.invincible, 1.8);
  console.log('PASS checkpoint restore uses maxLives');
}

{
  const player = makePlayer({ lives: 2, maxLives: 5, x: 900, y: 1000 });
  applyFall(player);
  assert.equal(player.missCount, 1);
  assert.equal(player.x, player.checkpointX);
  assert.equal(player.lives, 5);
  console.log('PASS fall increments miss count and restores at checkpoint');
}

console.log('\nDAMAGE MODEL VALIDATION PASSED');
