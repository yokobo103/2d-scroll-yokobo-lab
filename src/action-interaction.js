export const switchRequiresAction = (activationSwitch, prefabRegistry) => (
  prefabRegistry.prefabs[activationSwitch?.prefab]?.interaction?.mode === 'action'
);

export function findNearbyActionSwitch({
  player,
  switches,
  prefabRegistry,
  elapsed = 0,
  rangeX = 190,
  rangeY = 180,
}) {
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;
  return switches
    .filter(activationSwitch => (
      switchRequiresAction(activationSwitch, prefabRegistry)
      && !activationSwitch.active
      && (activationSwitch.nextReadyAt ?? 0) <= elapsed
    ))
    .map(activationSwitch => {
      const x = activationSwitch.runtimeX ?? activationSwitch.x;
      const y = activationSwitch.runtimeY ?? activationSwitch.y;
      const interaction = prefabRegistry.prefabs[activationSwitch.prefab].interaction;
      const dx = playerCenterX - (x + activationSwitch.w / 2);
      const dy = playerCenterY - (y + activationSwitch.h / 2);
      return {
        activationSwitch,
        dx,
        dy,
        rangeX: interaction.rangeX ?? rangeX,
        rangeY: interaction.rangeY ?? rangeY,
        distance: dx * dx + dy * dy,
      };
    })
    .filter(candidate => (
      Math.abs(candidate.dx) <= candidate.rangeX && Math.abs(candidate.dy) <= candidate.rangeY
    ))
    .sort((left, right) => left.distance - right.distance)[0]?.activationSwitch ?? null;
}

export function canActivateSwitch({
  activationSwitch,
  nearbyActionSwitch,
  actionPressed,
  touches,
  prefabRegistry,
}) {
  if (switchRequiresAction(activationSwitch, prefabRegistry)) {
    return activationSwitch === nearbyActionSwitch && actionPressed;
  }
  return touches;
}
