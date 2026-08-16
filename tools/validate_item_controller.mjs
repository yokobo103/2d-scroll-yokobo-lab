import assert from 'node:assert/strict';
import { applyItemEffect } from '../src/item-controller.js';

const makePlayer = overrides => ({ lives: 2, maxLives: 3, shieldTimer: 0, itemScore: 0, ...overrides });

{
  const player = makePlayer();
  applyItemEffect(player, { type: 'score', value: 100 });
  assert.equal(player.itemScore, 100);
  console.log('PASS lab coin score');
}

{
  const player = makePlayer();
  applyItemEffect(player, { type: 'heal', value: 1 });
  assert.equal(player.lives, 3);
  applyItemEffect(player, { type: 'heal', value: 1 });
  assert.equal(player.lives, 3);
  console.log('PASS cat can capped heal');
}

{
  const player = makePlayer({ lives: 1 });
  applyItemEffect(player, { type: 'fullHeal', shieldSeconds: 5 });
  assert.equal(player.lives, 3);
  assert.equal(player.shieldTimer, 5);
  console.log('PASS fish drink full heal and shield');
}

{
  const player = makePlayer({ lives: 3 });
  applyItemEffect(player, { type: 'extraLife', value: 1, maxLivesCap: 5 });
  assert.equal(player.maxLives, 4);
  assert.equal(player.lives, 4);
  console.log('PASS future heart max life');
}

console.log('\nITEM CONTROLLER VALIDATION PASSED');
