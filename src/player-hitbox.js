export const playerHitbox = (player, sliding) => (sliding
  ? { x: player.x + 18, y: player.y + 84, w: player.w - 36, h: 58 }
  : { x: player.x + 18, y: player.y + 24, w: player.w - 36, h: 114 });
