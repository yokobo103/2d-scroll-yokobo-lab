export const exitTriggerInset = 24;

export function hasReachedExit(player, exit) {
  if (!exit) return false;
  return player.x + player.w >= exit.x + exitTriggerInset
    && player.x <= exit.x + exit.w - exitTriggerInset;
}
