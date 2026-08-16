export function stepVerticalCamera({
  currentTop,
  playerY,
  playerHeight,
  playerVy,
  viewHeight,
  worldHeight,
  tuning,
  dt,
}) {
  const maxTop = Math.max(0, worldHeight - viewHeight);
  const deadzoneTop = viewHeight * tuning.verticalDeadzoneTop;
  const deadzoneBottom = viewHeight * tuning.verticalDeadzoneBottom;
  const fallingFast = playerVy >= tuning.fallLookAheadSpeed;
  const focusY = playerY + playerHeight * .5
    + (fallingFast ? tuning.fallLookAheadAmount : 0);
  const screenFocusY = focusY - currentTop;
  let targetTop = currentTop;
  if (screenFocusY < deadzoneTop) targetTop = focusY - deadzoneTop;
  if (screenFocusY > deadzoneBottom) targetTop = focusY - deadzoneBottom;
  targetTop = Math.max(0, Math.min(maxTop, targetTop));
  const ease = 1 - Math.pow(.00005, dt);
  return Math.max(0, Math.min(maxTop, currentTop + (targetTop - currentTop) * ease));
}
