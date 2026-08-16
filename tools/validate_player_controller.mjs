import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stepPlayerController } from '../src/player-controller.js';

const tuning = JSON.parse(await readFile(new URL('../data/player-movement.json', import.meta.url), 'utf8'));
const floor = [{ x: 0, y: 100, w: 300, h: 24 }];
const blankInput = () => ({ left: false, right: false, jump: false, slide: false, jumpPressed: false });
const makePlayer = overrides => ({
  x: 50, y: 58, w: 40, h: 42, vx: 0, vy: 0, onGround: true, facing: 1,
  slideTimer: 0, coyoteTimer: 0, jumpBufferTimer: 0, landingTimer: 0, moveState: 'idle',
  ...overrides,
});
const step = (player, input, dt = 1 / 60, platforms = floor) => stepPlayerController({
  player, input, platforms, worldWidth: 500, dt, tuning,
});

{
  const player = makePlayer();
  step(player, blankInput());
  assert.equal(player.onGround, true);
  assert.equal(player.y + player.h, 100);
  assert.equal(player.moveState, 'idle');
  console.log('PASS stable contact');
}

{
  const player = makePlayer({ x: 60, w: 30 });
  step(player, blankInput(), 1 / 60, [{ x: 0, y: 100, w: 100, h: 24 }]);
  player.x = 120;
  step(player, blankInput(), 1 / 60, [{ x: 0, y: 100, w: 100, h: 24 }]);
  const event = step(player, { ...blankInput(), jump: true, jumpPressed: true }, 1 / 60, []);
  assert.equal(event.jumped, true);
  assert.equal(player.moveState, 'jump');
  console.log('PASS coyote jump');
}

{
  const player = makePlayer({ y: 30, onGround: false, coyoteTimer: 0.01, moveState: 'fall' });
  const event = step(player, { ...blankInput(), jump: true, jumpPressed: true }, 0.02, []);
  assert.equal(event.jumped, false);
  console.log('PASS coyote expiry');
}

{
  const player = makePlayer({ y: 45, vy: 300, onGround: false, moveState: 'fall' });
  const event = step(player, { ...blankInput(), jump: true, jumpPressed: true }, 0.05);
  assert.equal(event.landed, true);
  assert.equal(event.jumped, true);
  assert.equal(player.vy, tuning.jumpVelocity);
  console.log('PASS buffered jump on landing');
}

{
  const held = makePlayer();
  const tapped = makePlayer();
  step(held, { ...blankInput(), jump: true, jumpPressed: true });
  step(tapped, { ...blankInput(), jump: true, jumpPressed: true });
  for (let frame = 0; frame < 12; frame++) {
    step(held, { ...blankInput(), jump: true }, 1 / 60, []);
    step(tapped, blankInput(), 1 / 60, []);
  }
  assert.ok(held.y < tapped.y - 20, `held=${held.y}, tapped=${tapped.y}`);
  console.log('PASS variable jump height');
}

{
  const player = makePlayer({ x: 67, y: 50, vy: 100, onGround: false, moveState: 'fall' });
  const event = step(player, blankInput(), 0.05, [{ x: 100, y: 100, w: 100, h: 24 }]);
  assert.equal(event.landed, true);
  assert.equal(player.onGround, true);
  assert.equal(player.y + player.h, 100);
  assert.ok(player.x > 67);
  console.log('PASS platform-edge correction');
}

{
  const ledge = [{ id: 'ledge', x: 0, y: 100, w: 160, h: 24 }];
  const player = makePlayer({ x: 90 });
  let leftGround = false;
  for (let frame = 0; frame < 90; frame++) {
    step(player, { ...blankInput(), right: true }, 1 / 60, ledge);
    if (!player.onGround) {
      leftGround = true;
      break;
    }
  }
  assert.equal(leftGround, true, 'walking past a platform edge must start a fall');
  assert.ok(player.x + player.w * tuning.footInsetRatio >= ledge[0].x + ledge[0].w);
  assert.ok(player.vy > 0);
  const dropStartY = player.y;
  for (let frame = 0; frame < 12; frame++) {
    step(player, { ...blankInput(), right: true }, 1 / 60, ledge);
    assert.equal(player.onGround, false, 'edge correction must not pull a departing player back onto the platform');
  }
  assert.ok(player.y > dropStartY + 20, 'player must continue descending after leaving an edge');
  console.log('PASS walk off platform edge');
}

{
  const runner = makePlayer();
  step(runner, { ...blankInput(), right: true });
  step(runner, { ...blankInput(), right: true });
  assert.equal(runner.moveState, 'run');

  const slider = makePlayer({ vx: 150 });
  step(slider, { ...blankInput(), right: true, slide: true }, 0.1);
  assert.equal(slider.moveState, 'slide');

  const faller = makePlayer({ y: 10, vy: 100, onGround: false, moveState: 'jump' });
  step(faller, blankInput(), 1 / 60, []);
  assert.equal(faller.moveState, 'fall');

  const lander = makePlayer({ y: 45, vy: 300, onGround: false, moveState: 'fall' });
  step(lander, blankInput(), 0.05);
  assert.equal(lander.moveState, 'land');
  console.log('PASS movement state transitions');
}

console.log('\nPLAYER CONTROLLER VALIDATION PASSED');
