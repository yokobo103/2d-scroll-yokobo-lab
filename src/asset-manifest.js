export const dataPaths = [
  '/data/course-01-objects.json',
  '/data/course-01-hooks.json',
  '/data/course-02-objects.json',
  '/data/course-02-hooks.json',
  '/data/course-03-objects.json',
  '/data/course-03-hooks.json',
  '/data/crystal-lab-collision.json',
  '/data/course-layout.json',
  '/data/prefab-placement.json',
  '/data/prefab-registry.json',
  '/data/player-movement.json',
  '/assets/stage01_normal_lab/runtime/platforms/modular/module-spec.json',
  '/assets/sprites/dr_yokobo/runtime/contact-spec.json',
];

export const imagePaths = {
  capLeft: '/assets/stage01_normal_lab/runtime/platforms/modular/cap_left.webp',
  capRight: '/assets/stage01_normal_lab/runtime/platforms/modular/cap_right.webp',
  midA: '/assets/stage01_normal_lab/runtime/platforms/modular/mid_a.webp',
  midB: '/assets/stage01_normal_lab/runtime/platforms/modular/mid_b.webp',
  stripCapLeft: '/assets/stage01_normal_lab/runtime/platforms/strip/cap_left.webp',
  stripMiddle: '/assets/stage01_normal_lab/runtime/platforms/strip/middle.webp',
  stripCapRight: '/assets/stage01_normal_lab/runtime/platforms/strip/cap_right.webp',
  ...Object.fromEntries([1, 2, 3, 4].map(index => [`crystalHorizontal${index}`, `/assets/stage01_normal_lab/runtime/crystal/horizontal-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4].map(index => [`crystalVertical${index}`, `/assets/stage01_normal_lab/runtime/crystal/vertical-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4].map(index => [`crystalDecay${index}`, `/assets/stage01_normal_lab/runtime/crystal/decay-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4, 5].map(index => [`crystalHazard${index}`, `/assets/stage01_normal_lab/runtime/crystal/hazard-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4].map(index => [`crystalRemoteSwitch${index}`, `/assets/objects/crystal_remote_switch/redesign-v2/processed/crystal-remote-switch-v2-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4, 5].map(index => [`crystalClusterH${index}`, `/assets/stage01_normal_lab/runtime/crystal/cluster-h-${index}.webp`])),
  crystalInvertedCorePlatform: '/assets/stage01_normal_lab/runtime/crystal/inverted-core-platform-1.webp',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(index => [`crystalInvertedCoreGrowth${index}`, `/assets/stage01_normal_lab/runtime/crystal/inverted-core-growth-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(index => [`crystalInvertedCoreCollapse${index}`, `/assets/stage01_normal_lab/runtime/crystal/inverted-core-collapse-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4, 5].map(index => [`crystalClusterV${index}`, `/assets/stage01_normal_lab/runtime/crystal/cluster-v-${index}.webp`])),
  ...Object.fromEntries([1, 2, 3, 4, 5].map(index => [`crystalHazardMassive${index}`, `/assets/stage01_normal_lab/runtime/crystal/hazard-massive-${index}.webp`])),
  decor1: '/assets/stage01_normal_lab/runtime/props/warning-wall.webp',
  decor2: '/assets/stage01_normal_lab/runtime/props/decor-side-2.webp',
  decor3: '/assets/stage01_normal_lab/runtime/props/decor-side-3.webp',
  decor4: '/assets/stage01_normal_lab/runtime/props/decor-side-4.webp',
  nyabiClean1: '/assets/sprites/shared_enemies/nyabi_clean/side_patrol/processed/nyabi-clean-side-1.webp',
  nyabiClean2: '/assets/sprites/shared_enemies/nyabi_clean/side_patrol/processed/nyabi-clean-side-2.webp',
  nyabiClean3: '/assets/sprites/shared_enemies/nyabi_clean/side_patrol/processed/nyabi-clean-side-3.webp',
  nyabiClean4: '/assets/sprites/shared_enemies/nyabi_clean/side_patrol/processed/nyabi-clean-side-4.webp',
  nejiNyabi1: '/assets/sprites/shared_enemies/neji_nyabi/hop/processed/neji-nyabi-1.webp',
  nejiNyabi2: '/assets/sprites/shared_enemies/neji_nyabi/hop/processed/neji-nyabi-2.webp',
  nejiNyabi3: '/assets/sprites/shared_enemies/neji_nyabi/hop/processed/neji-nyabi-3.webp',
  nejiNyabi4: '/assets/sprites/shared_enemies/neji_nyabi/hop/processed/neji-nyabi-4.webp',
  nyabiDrone1: '/assets/sprites/shared_enemies/nyabi_drone/hover_charge/processed/nyabi-drone-1.webp',
  nyabiDrone2: '/assets/sprites/shared_enemies/nyabi_drone/hover_charge/processed/nyabi-drone-2.webp',
  nyabiDrone3: '/assets/sprites/shared_enemies/nyabi_drone/hover_charge/processed/nyabi-drone-3.webp',
  nyabiDrone4: '/assets/sprites/shared_enemies/nyabi_drone/hover_charge/processed/nyabi-drone-4.webp',
  droneLaser1: '/assets/sprites/fx/nyabi_drone_laser/pulse/processed/drone-laser-1.webp',
  droneLaser2: '/assets/sprites/fx/nyabi_drone_laser/pulse/processed/drone-laser-2.webp',
  droneLaser3: '/assets/sprites/fx/nyabi_drone_laser/pulse/processed/drone-laser-3.webp',
  droneLaser4: '/assets/sprites/fx/nyabi_drone_laser/pulse/processed/drone-laser-4.webp',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(index =>
    [`bossArmUp${index}`, `/assets/sprites/bosses/nyabi_drone_core/arm_up/processed/nyabi-drone-core-arm-up-${index}.webp`]
  )),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(index =>
    [`bossArmDown${index}`, `/assets/sprites/bosses/nyabi_drone_core/arm_down/processed/nyabi-drone-core-arm-down-${index}.webp`]
  )),
  labCoin: '/assets/items/korokoro/lab-coin.webp',
  catCan: '/assets/items/korokoro/cat-can.webp',
  fishDrink: '/assets/items/korokoro/fish-drink.webp',
  futureHeart: '/assets/items/korokoro/future-heart.webp',
  checkpoint: '/assets/stage01_normal_lab/runtime/props/checkpoint.webp',
  switchOff: '/assets/stage01_normal_lab/runtime/props/lab-switch-off.webp',
  switchOn: '/assets/stage01_normal_lab/runtime/props/lab-switch-on.webp',
  liftIdle: '/assets/stage01_normal_lab/runtime/props/lab-lift-idle.webp',
  liftActive: '/assets/stage01_normal_lab/runtime/props/lab-lift-active.webp',
  pickup1: '/assets/objects/data_crystal/processed/pickup-1.webp',
  pickup2: '/assets/objects/data_crystal/processed/pickup-2.webp',
  pickup3: '/assets/objects/data_crystal/processed/pickup-3.webp',
  pickup4: '/assets/objects/data_crystal/processed/pickup-4.webp',
  ...Object.fromEntries(['idle', 'run'].flatMap(action =>
    [1, 2, 3, 4].map(index => [`${action}${index}`, `/assets/sprites/dr_yokobo/runtime/${action}/${action}-${index}.webp`])
  )),
  ...Object.fromEntries([1, 2, 3, 4].map(index =>
    [`jump${index}`, `/assets/sprites/dr_yokobo/runtime/jump/jump-${index}.webp`]
  )),
};

const runtimeBase = typeof document === 'undefined'
  ? null
  : new URL(import.meta.env.BASE_URL, document.baseURI);

export const runtimeUrl = path => runtimeBase
  ? new URL(String(path).replace(/^\/+/, ''), runtimeBase).href
  : String(path);
