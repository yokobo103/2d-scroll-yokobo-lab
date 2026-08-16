export function applyItemEffect(player, effect) {
  if (!effect?.type) return { applied: false, type: null };
  if (effect.type === 'score') {
    const value = effect.value ?? 100;
    player.itemScore += value;
    return { applied: true, type: effect.type, value };
  }
  if (effect.type === 'heal') {
    const before = player.lives;
    player.lives = Math.min(player.maxLives, player.lives + (effect.value ?? 1));
    return { applied: true, type: effect.type, value: player.lives - before };
  }
  if (effect.type === 'fullHeal') {
    player.lives = player.maxLives;
    player.shieldTimer = Math.max(player.shieldTimer, effect.shieldSeconds ?? 5);
    return { applied: true, type: effect.type, shieldSeconds: effect.shieldSeconds ?? 5 };
  }
  if (effect.type === 'extraLife') {
    const before = player.maxLives;
    player.maxLives = Math.min(effect.maxLivesCap ?? 5, player.maxLives + (effect.value ?? 1));
    player.lives = Math.min(player.maxLives, player.lives + (effect.value ?? 1));
    return { applied: true, type: effect.type, value: player.maxLives - before };
  }
  return { applied: false, type: effect.type };
}
