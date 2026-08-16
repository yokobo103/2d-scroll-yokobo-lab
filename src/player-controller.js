const approach = (value, target, amount) => {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return target;
};

const ensureRuntimeState = player => {
  player.coyoteTimer ??= 0;
  player.jumpBufferTimer ??= 0;
  player.landingTimer ??= 0;
  player.groundPlatformId ??= null;
  player.moveState ??= player.onGround ? 'idle' : 'fall';
};

const platformLanding = (player, platforms, previousBottom, tuning, allowCornerCorrection) => {
  const footInset = player.w * tuning.footInsetRatio;
  const footLeft = player.x + footInset;
  const footRight = player.x + player.w - footInset;
  const nextBottom = player.y + player.h;
  const candidates = [];

  for (const platform of platforms) {
    const crossedTop = previousBottom <= platform.y + tuning.landingTolerance && nextBottom >= platform.y;
    if (!crossedTop) continue;

    let correction = 0;
    if (footRight <= platform.x) {
      if (!allowCornerCorrection || player.vx < 0) continue;
      const gap = platform.x - footRight;
      if (gap > tuning.cornerCorrection) continue;
      correction = gap + 0.01;
    } else if (footLeft >= platform.x + platform.w) {
      if (!allowCornerCorrection || player.vx > 0) continue;
      const gap = footLeft - (platform.x + platform.w);
      if (gap > tuning.cornerCorrection) continue;
      correction = -(gap + 0.01);
    }

    candidates.push({ platform, correction });
  }

  return candidates.sort((a, b) => a.platform.y - b.platform.y)[0] ?? null;
};

const startJump = (player, tuning, events) => {
  player.vy = tuning.jumpVelocity;
  player.onGround = false;
  player.coyoteTimer = 0;
  player.jumpBufferTimer = 0;
  player.landingTimer = 0;
  player.moveState = 'jump';
  player.groundPlatformId = null;
  events.jumped = true;
};

export function stepPlayerController({ player, input, platforms, worldWidth, dt, tuning }) {
  ensureRuntimeState(player);
  const events = { jumped: false, landed: false };
  const wasOnGround = player.onGround;

  if (input.jumpPressed) player.jumpBufferTimer = tuning.jumpBufferTime;
  else player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);

  if (player.onGround) player.coyoteTimer = tuning.coyoteTime;
  else player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);

  const direction = Number(input.right) - Number(input.left);
  const wantsSlide = input.slide && player.onGround && Math.abs(player.vx) > tuning.slideMinSpeed;
  const maxSpeed = wantsSlide ? tuning.maxSlideSpeed : tuning.maxRunSpeed;
  const acceleration = player.onGround ? tuning.groundAcceleration : tuning.airAcceleration;
  player.vx = approach(player.vx, direction * maxSpeed, acceleration * dt);
  if (!direction && player.onGround) player.vx *= Math.pow(tuning.groundFrictionBase, dt);
  if (direction) player.facing = direction;

  player.slideTimer = wantsSlide
    ? Math.min(tuning.slideTimerMax, player.slideTimer + tuning.slideTimerRise * dt)
    : Math.max(0, player.slideTimer - tuning.slideTimerFall * dt);

  if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) startJump(player, tuning, events);

  const previousBottom = player.y + player.h;
  player.x = Math.max(0, Math.min(worldWidth - player.w, player.x + player.vx * dt));
  const gravityScale = player.vy < 0 && !input.jump ? tuning.jumpCutGravityMultiplier : 1;
  player.vy = Math.min(tuning.maxFallSpeed, player.vy + tuning.gravity * gravityScale * dt);
  player.y += player.vy * dt;
  player.onGround = false;
  player.groundPlatformId = null;

  if (player.vy >= 0) {
    const landing = platformLanding(player, platforms, previousBottom, tuning, !wasOnGround);
    if (landing) {
      player.x = Math.max(0, Math.min(worldWidth - player.w, player.x + landing.correction));
      player.y = landing.platform.y - player.h;
      player.vy = 0;
      player.onGround = true;
      player.groundPlatformId = landing.platform.id;
      player.coyoteTimer = tuning.coyoteTime;
      if (!wasOnGround) {
        player.landingTimer = tuning.landingStateTime;
        events.landed = true;
      }
    }
  }

  if (player.onGround && player.jumpBufferTimer > 0) startJump(player, tuning, events);

  player.landingTimer = Math.max(0, player.landingTimer - dt);
  if (!player.onGround) player.moveState = player.vy < 0 ? 'jump' : 'fall';
  else if (player.landingTimer > 0) player.moveState = 'land';
  else if (player.slideTimer > 0.08) player.moveState = 'slide';
  else if (Math.abs(player.vx) > 45) player.moveState = 'run';
  else player.moveState = 'idle';

  return { ...events, sliding: player.moveState === 'slide' };
}
