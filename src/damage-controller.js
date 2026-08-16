const centerX = body => body.x + (body.w ?? 0) / 2;

export function applyDamage(player, source) {
  if (player.invincible > 0 || player.shieldTimer > 0) return { applied: false, depleted: false };

  const delta = centerX(player) - centerX(source);
  const knockDirection = Math.sign(delta) || -(player.facing || 1);
  player.lives = Math.max(0, player.lives - 1);
  player.missCount = (player.missCount ?? 0) + 1;
  player.vx = knockDirection * 380;
  player.vy = -420;
  player.onGround = false;
  player.groundPlatformId = null;
  player.invincible = 1.2;

  return { applied: true, depleted: player.lives === 0, knockDirection };
}

export function restoreAtCheckpoint(player) {
  player.x = player.checkpointX;
  player.y = player.checkpointY;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.coyoteTimer = 0;
  player.jumpBufferTimer = 0;
  player.landingTimer = 0;
  player.slideTimer = 0;
  player.moveState = 'fall';
  player.groundPlatformId = null;
  player.lives = player.maxLives;
  player.invincible = 1.8;
  player.shieldTimer = 0;
}

export function applyFall(player) {
  player.lives = Math.max(0, player.lives - 1);
  player.missCount = (player.missCount ?? 0) + 1;
  restoreAtCheckpoint(player);
}
