import assert from 'node:assert/strict';
import { canActivateSwitch, findNearbyActionSwitch } from '../src/action-interaction.js';

const registry = {
  prefabs: {
    'crystal-remote-switch-v1': {
      visualSet: 'crystal-remote-switch', interaction: { mode: 'action', rangeX: 190, rangeY: 180 },
    },
    'lab-switch-v1': { visualSet: 'lab-switch' },
  },
};
const player = { x: 100, y: 100, w: 92, h: 142 };
const crystalSwitch = { id: 'crystal', prefab: 'crystal-remote-switch-v1', x: 230, y: 110, w: 112, h: 140 };
const exitSwitch = { id: 'exit', prefab: 'lab-switch-v1', x: 150, y: 110, w: 140, h: 80 };

const nearby = findNearbyActionSwitch({ player, switches: [exitSwitch, crystalSwitch], prefabRegistry: registry });
assert.equal(nearby, crystalSwitch, 'only the crystal remote switch should become actionable');
assert.equal(canActivateSwitch({
  activationSwitch: crystalSwitch, nearbyActionSwitch: nearby, actionPressed: false, touches: true, prefabRegistry: registry,
}), false, 'touching a crystal switch must not auto-activate it');
assert.equal(canActivateSwitch({
  activationSwitch: crystalSwitch, nearbyActionSwitch: nearby, actionPressed: true, touches: false, prefabRegistry: registry,
}), true, 'ACTION must activate a nearby crystal switch');
assert.equal(canActivateSwitch({
  activationSwitch: exitSwitch, nearbyActionSwitch: nearby, actionPressed: false, touches: true, prefabRegistry: registry,
}), true, 'the exit lift switch must keep contact activation');

crystalSwitch.nextReadyAt = 10;
assert.equal(findNearbyActionSwitch({
  player, switches: [crystalSwitch], prefabRegistry: registry, elapsed: 5,
}), null, 'a cooling-down crystal switch must not advertise ACTION');

console.log('ACTION INTERACTION VALIDATION PASSED');
