import './style.css';
import { canActivateSwitch, findNearbyActionSwitch } from './action-interaction.js';
import { createStageEditor } from './stage-editor.js';
import { createEnemies, resetEnemies, stepEnemies } from './enemy-controller.js';
import { bossSpritePose, createNyabiDroneCore, stepNyabiDroneCore } from './boss-controller.js';
import { applyItemEffect } from './item-controller.js';
import { stepPlayerController } from './player-controller.js';
import { dataPaths, imagePaths, runtimeUrl } from './asset-manifest.js';
import { applyDamage, applyFall, restoreAtCheckpoint } from './damage-controller.js';
import { playerHitbox } from './player-hitbox.js';
import { dataCrystalTotal, evaluateRank, formatRunTime } from './run-evaluation.js';
import { stepVerticalCamera } from './camera-controller.js';
import { composeThreeCourseStage, courseAtX } from './course-layout.js';
import {
  buildCollisionShapes,
  clearLocalStagePatch,
  growthPlatformState,
  loadLocalStagePatch,
  objectSensorRect,
  resolveStage,
} from './stage-resolver.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const ui = {
  loading: document.querySelector('#loading'),
  cinematic: document.querySelector('#cinematic'),
  toast: document.querySelector('#toast'),
  toastSpeaker: document.querySelector('#toastSpeaker'),
  toastMessage: document.querySelector('#toastMessage'),
  life: document.querySelector('#life'),
  scoreCount: document.querySelector('#scoreCount'),
  coinCount: document.querySelector('#coinCount'),
  crystalCount: document.querySelector('#crystalCount'),
  crystalTotal: document.querySelector('#crystalTotal'),
  timeCount: document.querySelector('#timeCount'),
  missionTitle: document.querySelector('#missionTitle'),
  clear: document.querySelector('#clearPanel'),
  clearRank: document.querySelector('#clearRank'),
  clearCrystals: document.querySelector('#clearCrystals'),
  clearCrystalTotal: document.querySelector('#clearCrystalTotal'),
  clearCoins: document.querySelector('#clearCoins'),
  clearScore: document.querySelector('#clearScore'),
  clearTime: document.querySelector('#clearTime'),
  clearMisses: document.querySelector('#clearMisses'),
  sound: document.querySelector('#soundButton'),
  restart: document.querySelector('#restartButton'),
  action: document.querySelector('#actionButton'),
};

const reportStartupError = error => {
  const heading = document.createElement('strong');
  const detail = document.createElement('code');
  heading.textContent = '読み込みに失敗しました';
  detail.textContent = error instanceof Error ? error.message : String(error);
  ui.loading.classList.add('is-error');
  ui.loading.replaceChildren(heading, detail);
  throw error;
};

const loadJson = async path => {
  const url = runtimeUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${path} // HTTP ${response.status}`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${path} // ${error instanceof Error ? error.message : String(error)}`);
  }
};

let stageSource;
let collision;
let hooks;
let courseLayout;
let courseStages;
let courseHooks;
let prefabPlacement;
let prefabRegistry;
let movementTuning;
let moduleSpec;
let playerContactSpec;
try {
  const loadedData = await Promise.all(dataPaths.map(loadJson));
  courseStages = [loadedData[0], loadedData[2], loadedData[4]];
  courseHooks = [loadedData[1], loadedData[3], loadedData[5]];
  [collision, courseLayout, prefabPlacement, prefabRegistry, movementTuning, moduleSpec, playerContactSpec] = loadedData.slice(6);
} catch (error) {
  reportStartupError(error);
}

({ stage: stageSource, hooks, collision } = composeThreeCourseStage(courseStages, courseHooks, collision, courseLayout));
const baseStage = resolveStage(stageSource, moduleSpec, prefabRegistry);
const startupUrlParams = new URLSearchParams(window.location.search);
const editorEnabled = import.meta.env.DEV || startupUrlParams.get('editor') === '1';
document.documentElement.classList.toggle('debug-mobile-qa', startupUrlParams.has('debug-mobile-qa'));
if (startupUrlParams.has('debug-reset-draft')) clearLocalStagePatch(stageSource.stageId);
const stage = resolveStage(stageSource, moduleSpec, prefabRegistry, loadLocalStagePatch(stageSource.stageId));
const crystalTotal = dataCrystalTotal(stage);
let collisionShapes = buildCollisionShapes(stage, prefabRegistry);

const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`画像を読み込めません: ${src}`));
  image.src = runtimeUrl(src);
});

const images = {};
try {
  await Promise.all([
    ...Object.entries(imagePaths).map(async ([key, src]) => { images[key] = await loadImage(src); }),
    ...stage.parallax.map(async layer => { images[`parallax-${layer.id}`] = await loadImage(layer.src); }),
  ]);
} catch (error) {
  reportStartupError(error);
}
const pickupFrames = [images.pickup1, images.pickup2, images.pickup3, images.pickup4];
const enemyFrameSets = {
  'nyabi-clean-side-patrol': [images.nyabiClean1, images.nyabiClean2, images.nyabiClean3, images.nyabiClean4],
  'neji-nyabi-hop': [images.nejiNyabi1, images.nejiNyabi2, images.nejiNyabi3, images.nejiNyabi4],
  'nyabi-drone-hover-charge': [images.nyabiDrone1, images.nyabiDrone2, images.nyabiDrone3, images.nyabiDrone4],
};
const droneLaserFrames = [images.droneLaser1, images.droneLaser2, images.droneLaser3, images.droneLaser4];
const bossSpriteFrames = {
  up: [images.bossArmUp1, images.bossArmUp2, images.bossArmUp3, images.bossArmUp4, images.bossArmUp5, images.bossArmUp6],
  down: [images.bossArmDown1, images.bossArmDown2, images.bossArmDown3, images.bossArmDown4, images.bossArmDown5, images.bossArmDown6],
};
const itemImages = {
  'korokoro-lab-coin': images.labCoin,
  'korokoro-cat-can': images.catCan,
  'korokoro-fish-drink': images.fishDrink,
  'korokoro-future-heart': images.futureHeart,
};

const view = { width: 1536, height: 864, top: 0, portrait: false, dpr: 1 };
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  view.portrait = height > width;
  view.height = view.portrait
    ? stage.responsiveCamera.portraitViewHeight
    : stage.responsiveCamera.landscapeViewHeight;
  view.width = view.height * width / height;
  view.top = Math.max(0, Math.min(stage.world.height - view.height, view.top));
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * view.dpr);
  canvas.height = Math.round(height * view.dpr);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas, { passive: true });

const input = {
  left: false, right: false, jump: false, slide: false, action: false,
  jumpPressed: false, actionPressed: false,
};
const urlParams = startupUrlParams;
let debugContact = urlParams.has('debug-contact');
const debugGoal = urlParams.has('debug-goal');
const debugSlice = urlParams.has('debug-slice');
const debugEnemies = urlParams.has('debug-enemies');
const debugExpansion = urlParams.has('debug-expansion');
const debugPresentation = urlParams.has('debug-presentation');
const debugInfo = urlParams.has('debug-info');
const debugDamage = urlParams.has('debug-damage');
const debugSlide = urlParams.has('debug-slide');
const debugObjective = urlParams.has('debug-objective');
const debugClear = urlParams.has('debug-clear');
const debugCrystalId = urlParams.get('debug-crystal');
const debugDescentId = urlParams.get('debug-descent');
const debugAutoplay = urlParams.has('debug-autoplay');
const debugGrowth = urlParams.get('debug-growth');
const debugCrystalSwitch = urlParams.has('debug-crystal-switch');
const debugCrystalHazard = urlParams.has('debug-crystal-hazard');
const debugCourse = Number(urlParams.get('debug-course') ?? 0);
const debugTransition = Number(urlParams.get('debug-transition') ?? 0);
const debugBoss = urlParams.has('debug-boss');
const debugBossHp = Math.max(1, Math.min(3, Number(urlParams.get('debug-boss-hp') ?? 3)));
let stageEditor = null;
const keyMap = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', ShiftLeft: 'slide', ShiftRight: 'slide', ArrowDown: 'slide',
  KeyE: 'action', Enter: 'action',
};

let audioEnabled = true;
let audioContext;
const ensureAudio = () => {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ||= new AudioContextClass();
  if (audioContext.state === 'suspended') void audioContext.resume();
};
const playTone = (frequency, duration = .08, gain = .04, type = 'sine') => {
  if (!audioEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  volume.gain.setValueAtTime(gain, audioContext.currentTime);
  volume.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
  oscillator.connect(volume).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
};

const setKey = (name, down) => {
  if (!name) return;
  if (name === 'jump' && down && !input.jump) input.jumpPressed = true;
  if (name === 'action' && down && !input.action) input.actionPressed = true;
  input[name] = down;
};

const keyboardInputs = new Set();
const pointerInputs = new Map();
const syncInput = name => setKey(name,
  keyboardInputs.has(name) || [...pointerInputs.values()].some(pointer => pointer.name === name));
const resetInputs = () => {
  keyboardInputs.clear();
  pointerInputs.clear();
  document.querySelectorAll('[data-key].is-active').forEach(button => button.classList.remove('is-active'));
  Object.assign(input, {
    left: false, right: false, jump: false, slide: false, action: false,
    jumpPressed: false, actionPressed: false,
  });
};
const releasePointerInput = pointerId => {
  const pointer = pointerInputs.get(pointerId);
  if (!pointer) return;
  pointerInputs.delete(pointerId);
  if (![...pointerInputs.values()].some(active => active.button === pointer.button)) {
    pointer.button.classList.remove('is-active');
  }
  syncInput(pointer.name);
};

window.addEventListener('keydown', event => {
  ensureAudio();
  if (event.code === 'F2') {
    event.preventDefault();
    debugContact = !debugContact;
    toast(`接地デバッグ ${debugContact ? 'ON' : 'OFF'}`, 1.4);
    return;
  }
  if (event.code === 'F3' && editorEnabled) {
    event.preventDefault();
    stageEditor?.toggle();
    return;
  }
  const name = keyMap[event.code];
  if (!name) return;
  event.preventDefault();
  keyboardInputs.add(name);
  syncInput(name);
});
window.addEventListener('keyup', event => {
  const name = keyMap[event.code];
  if (!name) return;
  keyboardInputs.delete(name);
  syncInput(name);
});
window.addEventListener('pointerup', event => releasePointerInput(event.pointerId), true);
window.addEventListener('pointercancel', event => releasePointerInput(event.pointerId), true);
window.addEventListener('blur', resetInputs);
window.addEventListener('pagehide', resetInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetInputs();
});

document.querySelectorAll('[data-key]').forEach(button => {
  const name = button.dataset.key;
  const press = event => {
    event.preventDefault();
    ensureAudio();
    pointerInputs.set(event.pointerId, { name, button });
    try { button.setPointerCapture(event.pointerId); } catch { /* Safari may cancel before capture. */ }
    button.classList.add('is-active');
    syncInput(name);
  };
  const release = event => { event.preventDefault(); releasePointerInput(event.pointerId); };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});

ui.sound.addEventListener('click', () => {
  ensureAudio();
  audioEnabled = !audioEnabled;
  ui.sound.textContent = audioEnabled ? 'SOUND ON' : 'SOUND OFF';
  ui.sound.setAttribute('aria-pressed', String(!audioEnabled));
  if (audioEnabled) playTone(720, .1, .035, 'triangle');
});

const player = {
  x: hooks.playerSpawn.x, y: hooks.playerSpawn.y, w: 92, h: 142,
  vx: 0, vy: 0, onGround: false, facing: 1, lives: 3, maxLives: 3,
  crystals: 0, checkpointX: hooks.playerSpawn.x, checkpointY: hooks.playerSpawn.y,
  invincible: 0, shieldTimer: 0, itemScore: 0, coinCount: 0, missCount: 0,
  slideTimer: 0, coyoteTimer: 0, jumpBufferTimer: 0,
  landingTimer: 0, moveState: 'fall',
  groundPlatformId: null,
};

let cameraX = 0;
let elapsed = 0;
let introTime = 0;
let runTime = 0;
let gameWon = false;
let shake = 0;
let flash = 0;
let nearbyActionSwitch = null;
let activeCourseId = null;
let courseTransitionFade = 0;
let transitionPresentationCourseId = null;
let toastTimer = 0;
let activeCheckpointId = null;
const collected = new Set();
const firedTriggers = new Set();
const particles = [];
let enemies = createEnemies(hooks.actorSpawnMarkers ?? [], prefabRegistry);
const bossCourse = stage.courses[2];
const bossArena = {
  entranceX: bossCourse.xStart + 9180,
  exitX: bossCourse.xStart + 10820,
  floorY: courseLayout.courseVerticalOffset * 2 + 1274,
};
const bossLayout = courseLayout.bossArenaLayout;
const bossFirstFloorY = bossLayout.groundY - bossLayout.firstFloorRise;
const bossSecondFloorY = bossFirstFloorY - bossLayout.tierRise;
const bossThirdFloorY = bossSecondFloorY - bossLayout.tierRise;
const bossCourseYOffset = courseLayout.courseVerticalOffset * 2;
const bossBaseYForFloor = floorY => bossCourseYOffset + floorY - bossLayout.bossHeadReachBelowFloor + 12;
const boss = createNyabiDroneCore({
  x: bossCourse.xStart + 9830,
  y: bossBaseYForFloor(bossFirstFloorY),
  arenaMinX: bossArena.entranceX + 170,
  arenaMaxX: bossArena.exitX - 80,
  phaseBaseYByHp: {
    3: bossBaseYForFloor(bossFirstFloorY),
    2: bossBaseYForFloor(bossSecondFloorY),
    1: bossBaseYForFloor(bossThirdFloorY),
  },
  verticalAmplitude: bossLayout.bossVerticalAmplitude,
});
let bossIntroduced = false;
const stageEntityById = id => (
  stage.platforms.find(entity => entity.id === id)
  ?? stage.objects.find(entity => entity.id === id)
  ?? enemies.find(entity => entity.id === id)
);
const activationTargetIds = object => object.activateTargetIds ?? (object.activateTargetId ? [object.activateTargetId] : []);
const activationTargets = object => activationTargetIds(object).map(stageEntityById).filter(Boolean);
const objectRuntimePosition = object => ({
  x: object.runtimeX ?? object.x,
  y: object.runtimeY ?? object.y,
});
const completeOneShotPlatform = platform => {
  if (!platform) return;
  platform.active = true;
  platform.activationStartedAt = -((platform.activationDelay ?? 0) + (platform.motionDuration ?? 0));
  platform.runtimeProgress = 1;
};
if (debugBoss) {
  player.x = courseLayout.courseLength * 2 + 9700;
  const debugFloorY = ({ 3: bossFirstFloorY, 2: bossSecondFloorY, 1: bossThirdFloorY })[debugBossHp];
  player.y = bossCourseYOffset + debugFloorY - player.h;
  boss.hp = debugBossHp;
  boss.baseY = boss.phaseBaseYByHp[debugBossHp];
  boss.y = boss.baseY;
  player.shieldTimer = 999;
  introTime = 2;
  for (const platform of stage.platforms.filter(candidate => candidate.id.startsWith('c3-boss-crystal-step-'))) {
    platform.active = true; platform.activationStartedAt = -3;
  }
} else if (debugTransition === 2 || debugTransition === 3) {
  const liftId = debugTransition === 2 ? 'c1-exit-lift-01' : 'exit-lift-01';
  const lift = stage.platforms.find(platform => platform.id === liftId);
  const activationSwitch = stage.objects.find(object => object.id === lift?.activatedBy);
  lift.active = true;
  lift.activationStartedAt = 0;
  if (activationSwitch) activationSwitch.active = true;
  player.x = lift.x + lift.w * .48 - player.w / 2;
  player.y = lift.y - player.h;
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugCourse === 2) {
  const lift = stage.platforms.find(platform => platform.id === 'c1-exit-lift-01');
  const activationSwitch = stage.objects.find(object => object.id === lift?.activatedBy);
  completeOneShotPlatform(lift);
  if (activationSwitch) activationSwitch.active = true;
  player.x = courseLayout.courseLength + 150;
  player.y = 714 + courseLayout.courseVerticalOffset - player.h;
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugCourse === 3) {
  const lift = stage.platforms.find(platform => platform.id === 'exit-lift-01');
  const activationSwitch = stage.objects.find(object => object.id === lift?.activatedBy);
  completeOneShotPlatform(lift);
  if (activationSwitch) activationSwitch.active = true;
  player.x = courseLayout.courseLength * 2 + 150;
  player.y = 714 + courseLayout.courseVerticalOffset * 2 - player.h;
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugCrystalId) {
  const pickup = stage.pickups.find(candidate => candidate.id === debugCrystalId);
  if (pickup) {
    player.x = pickup.x - player.w / 2;
    player.y = pickup.y - player.h / 2;
    player.shieldTimer = 999;
    introTime = 2;
  }
} else if (debugGoal) {
  const lift = stage.platforms.find(platform => platform.id === hooks.exitLink.id);
  player.x = lift.x + 110;
  player.y = lift.y - player.h;
  introTime = 2;
} else if (debugClear) {
  const lift = stage.platforms.find(platform => platform.id === hooks.exitLink.id);
  const activationSwitch = stage.objects.find(object => object.id === lift.activatedBy);
  completeOneShotPlatform(lift);
  activationSwitch.active = true;
  player.x = lift.x + 110;
  player.y = lift.y + lift.motionDistance - player.h;
  player.crystals = crystalTotal;
  player.coinCount = 3;
  player.itemScore = 1200;
  runTime = 78.4;
  introTime = 2;
} else if (debugObjective) {
  player.x = 4380;
  player.y = 992;
  player.crystals = Math.ceil(crystalTotal * .67);
  player.coinCount = 2;
  player.itemScore = 600;
  player.shieldTimer = 999;
  runTime = 42.3;
  introTime = 2;
} else if (debugEnemies) {
  player.x = 2380;
  player.y = 712;
  player.crystals = 5;
  player.invincible = 999;
  introTime = 2;
} else if (debugExpansion) {
  player.x = 4480;
  player.y = 992;
  player.crystals = Math.ceil(crystalTotal * .58);
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugPresentation) {
  player.x = 3040;
  player.y = 852;
  player.crystals = Math.ceil(crystalTotal * .58);
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugCrystalSwitch) {
  player.x = 3500;
  player.y = 852;
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugGrowth) {
  player.x = 3700;
  player.y = 852;
  player.shieldTimer = 999;
  introTime = 2;
  if (['active', 'growing', 'collapse'].includes(debugGrowth)) {
    for (const platform of stage.platforms.filter(entity => prefabRegistry.prefabs[entity.prefab]?.activation?.mode === 'growth')) {
      platform.active = true;
      const activation = prefabRegistry.prefabs[platform.prefab].activation;
      if (debugGrowth === 'growing') platform.growthSpeed = .8;
      if (debugGrowth === 'collapse') platform.collapseDuration = 30;
      const segmentCount = platform.length ?? activation.length;
      const interval = platform.growthSpeed ?? activation.growthSpeed;
      const growthDuration = Math.max(0, segmentCount - 1) * interval + activation.emergenceDuration;
      platform.activationStartedAt = debugGrowth === 'growing' ? 0
        : debugGrowth === 'collapse'
          ? -((platform.activationDelay ?? 0) + growthDuration
            + (platform.activeDuration ?? activation.activeDuration)
            + (platform.collapseDuration ?? activation.collapseDuration) * .82)
          : -((platform.activationDelay ?? 0) + segmentCount * interval + .5);
      const activationSwitch = stage.objects.find(object => object.id === platform.activatedBy);
      if (activationSwitch) activationSwitch.active = true;
    }
  }
} else if (debugInfo) {
  player.x = 1050;
  player.y = 572;
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugDamage) {
  player.x = 910;
  player.y = 572;
  introTime = 2;
} else if (debugSlide) {
  player.x = 4480;
  player.y = 992;
  introTime = 2;
} else if (debugCrystalHazard) {
  player.x = 1370;
  player.y = 572;
  player.shieldTimer = 999;
  introTime = 2;
} else if (debugSlice) {
  player.x = 1120;
  player.y = 308;
  player.crystals = 2;
  collected.add('crystal-01');
  collected.add('crystal-02');
  introTime = 2;
} else if (debugDescentId) {
  const pointIndex = stage.descentPoints.findIndex(point => point.id === `descent-${debugDescentId}`);
  const point = stage.descentPoints[pointIndex];
  const upperBand = stage.floorBands[pointIndex];
  if (point && upperBand) {
    player.x = point.x - 230;
    player.y = upperBand.y - player.h;
    player.shieldTimer = 999;
    introTime = 2;
  }
} else if (debugAutoplay) {
  player.shieldTimer = 999;
  input.right = true;
  introTime = 2;
}

const toast = (message, seconds = 2.2, speaker = null) => {
  ui.toastSpeaker.hidden = !speaker;
  ui.toastSpeaker.textContent = speaker ?? '';
  ui.toastMessage.textContent = message;
  ui.toast.classList.toggle('is-dialogue', Boolean(speaker));
  ui.toast.classList.add('is-visible');
  toastTimer = seconds;
};

stageEditor = createStageEditor({
  canvas,
  shell: document.querySelector('.game-shell'),
  baseStage,
  stage,
  moduleSpec,
  prefabRegistry,
  prefabPlacement,
  movementTuning,
  courseLayout,
  courseSources: courseStages,
  courseHookSources: courseHooks,
  hooks,
  view,
  getCameraX: () => cameraX,
  setCameraX: value => { cameraX = Math.max(0, Math.min(stage.world.width - view.width, value)); },
  onChange: shapes => { collisionShapes = shapes; },
  onActorsChange: () => { enemies = createEnemies(hooks.actorSpawnMarkers ?? [], prefabRegistry); },
  onPlaytest: ({ active, x, y, snapshot }) => {
    if (!active) {
      if (snapshot) { cameraX = snapshot.cameraX; view.top = snapshot.top; }
      return;
    }
    Object.assign(player, { x, y, vx: 0, vy: 0, onGround: false, invincible: 0, shieldTimer: 0 });
    resetEnemies(enemies);
    introTime = 2;
  },
  onToast: toast,
});

const emit = (x, y, color, count = 10, force = 160) => {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = force * (.35 + Math.random() * .65);
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 50,
      life: .45 + Math.random() * .45, color, size: 3 + Math.random() * 7,
    });
  }
};

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const refreshActionAvailability = () => {
  nearbyActionSwitch = findNearbyActionSwitch({
    player,
    switches: stage.objects.filter(object => object.type === 'switch'),
    prefabRegistry,
    elapsed,
  });
  const ready = Boolean(nearbyActionSwitch) && !gameWon && introTime > 1.25 && !stageEditor.active;
  ui.action.disabled = !ready;
  ui.action.classList.toggle('is-ready', ready);
  ui.action.setAttribute('aria-disabled', String(!ready));
  document.documentElement.dataset.actionReady = ready ? nearbyActionSwitch.id : 'none';
};

const collectSharedItem = (pickup, prefab) => {
  const effect = prefab.itemEffect;
  if (!effect) return false;
  const result = applyItemEffect(player, effect);
  if (!result.applied) return false;
  if (effect.type === 'score') {
    if (pickup.prefab === 'lab-coin-v1') player.coinCount += 1;
    toast(`${prefab.displayName} // 研究ポイント +${result.value}`, 1.8);
  } else if (effect.type === 'heal') {
    toast(`${prefab.displayName} // ライフ回復`, 1.8);
  } else if (effect.type === 'fullHeal') {
    toast(`${prefab.displayName} // 全回復＋保護シールド`, 2.2);
  } else if (effect.type === 'extraLife') {
    toast(`${prefab.displayName} // 最大ライフ +1`, 2.2);
  }
  return true;
};

const scoreText = () => String(player.itemScore).padStart(6, '0');

const updateClearSummary = () => {
  ui.clearRank.textContent = evaluateRank({
    crystals: player.crystals,
    totalCrystals: crystalTotal,
    missCount: player.missCount,
  });
  ui.clearCrystals.textContent = String(player.crystals);
  ui.clearCrystalTotal.textContent = String(crystalTotal);
  ui.clearCoins.textContent = String(player.coinCount);
  ui.clearScore.textContent = scoreText();
  ui.clearTime.textContent = formatRunTime(runTime);
  ui.clearMisses.textContent = String(player.missCount);
};

const updateRuntimePrefabs = () => {
  for (const platform of stage.platforms) {
    const prefab = prefabRegistry.prefabs[platform.prefab];
    const previousX = platform.runtimeX ?? platform.x;
    const previousY = platform.runtimeY ?? platform.y;
    let nextX = platform.x;
    let nextY = platform.y;
    let growthState = null;
    if (prefab?.activation?.mode === 'growth') {
      const age = platform.active ? elapsed - platform.activationStartedAt : -1;
      growthState = growthPlatformState(platform, prefab, age);
      nextX = growthState.runtimeX;
      nextY = growthState.runtimeY;
      platform.growthState = growthState;
      platform.runtimeProgress = growthState.visibleSegments / growthState.segmentCount;
      platform.runtimeFrame = growthState.phase === 'idle' ? 0 : 1;
      if (growthState.visibleSegments > (platform.lastParticleSegment ?? 0)) {
        const index = growthState.visibleSegments - 1;
        const spacing = growthState.segmentSpacing;
        const direction = growthState.direction;
        const particleX = platform.growthOriginX
          + (direction === 'right' ? index * spacing : direction === 'left' ? -index * spacing : 0)
          + (growthState.horizontal ? 0 : platform.w / 2);
        const particleY = platform.growthOriginY + (direction === 'down' ? index * spacing : direction === 'up' ? -index * spacing : 0);
        emit(particleX, particleY, '#b8fbff', 7, 75);
        platform.lastParticleSegment = growthState.visibleSegments;
      }
      if (platform.active && growthState.phase === 'complete') {
        platform.active = false;
        platform.lastParticleSegment = 0;
        const activationSwitch = stage.objects.find(object => object.id === platform.activatedBy);
        const otherTargetsActive = activationSwitch
          ? activationTargets(activationSwitch).some(target => target.id !== platform.id && target.active)
          : false;
        if (activationSwitch && !otherTargetsActive) {
          activationSwitch.active = false;
          activationSwitch.nextReadyAt = elapsed + .8;
        }
      }
    } else if (prefab?.activation?.mode === 'one-shot') {
      const age = platform.active ? elapsed - platform.activationStartedAt : 0;
      const rawProgress = platform.active
        ? Math.max(0, Math.min(1, (age - platform.activationDelay) / platform.motionDuration))
        : 0;
      const travel = rawProgress * rawProgress * (3 - 2 * rawProgress);
      nextY += platform.motionDistance * travel;
      platform.runtimeProgress = rawProgress;
      platform.runtimeFrame = platform.active ? 1 : 0;
    } else if (prefab?.collision?.moving) {
      const travel = (1 - Math.cos(Math.PI * 2 * (elapsed / platform.motionPeriod + platform.motionPhase))) * 0.5;
      if (platform.motionAxis === 'x') nextX += platform.motionDistance * travel;
      else nextY += platform.motionDistance * travel;
    }
    const deltaX = nextX - previousX;
    const deltaY = nextY - previousY;
    platform.runtimeX = nextX;
    platform.runtimeY = nextY;
    const shape = collisionShapes.platforms.find(item => item.id === platform.id);
    if (shape) {
      shape.x = growthState?.x ?? nextX;
      shape.y = growthState?.y ?? nextY;
      shape.w = growthState?.w ?? platform.w;
    }
    if (player.onGround && player.groundPlatformId === platform.id) {
      player.x += deltaX;
      player.y += deltaY;
    }
  }

  for (const object of stage.objects.filter(entity => entity.attachedToTarget && (entity.attachedToTargetId || entity.activateTargetId))) {
    const target = stageEntityById(object.attachedToTargetId ?? object.activateTargetId);
    object.runtimeX = object.x + ((target?.runtimeX ?? target?.x ?? object.x) - (target?.x ?? object.x));
    object.runtimeY = object.y + ((target?.runtimeY ?? target?.y ?? object.y) - (target?.y ?? object.y));
  }

  for (const hazard of collisionShapes.hazards) {
    if (hazard.kind !== 'timedHazardRect') continue;
    const source = hazard.source;
    const cycle = ((elapsed / source.period + source.phase) % 1 + 1) % 1;
    source.runtimeCycle = cycle;
    source.runtimeFrame = cycle < hazard.timing.warningStart ? 0
      : cycle < hazard.timing.activeStart ? 1
        : cycle < hazard.timing.activeEnd ? 2 : 3;
    hazard.active = cycle >= hazard.timing.activeStart && cycle < hazard.timing.activeEnd;
  }
};

const returnToCheckpoint = () => {
  restoreAtCheckpoint(player);
  resetEnemies(enemies);
  shake = 18;
  flash = .7;
  playTone(120, .32, .08, 'sawtooth');
  toast('チェックポイントから再開', 2.2);
  document.documentElement.dataset.damageState = 'checkpoint';
};

const takeDamage = source => {
  const result = applyDamage(player, source);
  if (!result.applied) return;
  document.documentElement.dataset.damageState = 'knockback';
  document.documentElement.dataset.missCount = String(player.missCount);
  if (result.depleted) {
    returnToCheckpoint();
    return;
  }
  shake = 10;
  flash = .35;
  playTone(170, .18, .06, 'sawtooth');
  toast(`ダメージ！ のこり ${'●'.repeat(player.lives)}`, 1.5);
};

const fallToCheckpoint = () => {
  applyFall(player);
  resetEnemies(enemies);
  shake = 18;
  flash = .7;
  playTone(120, .32, .08, 'sawtooth');
  toast('落下！ チェックポイントから再開', 2.2);
  document.documentElement.dataset.damageState = 'fall';
  document.documentElement.dataset.missCount = String(player.missCount);
};

const restart = () => {
  collected.clear();
  firedTriggers.clear();
  Object.assign(player, {
    x: hooks.playerSpawn.x, y: hooks.playerSpawn.y, vx: 0, vy: 0,
    crystals: 0, lives: 3, maxLives: 3, itemScore: 0, coinCount: 0, missCount: 0,
    checkpointX: hooks.playerSpawn.x,
    checkpointY: hooks.playerSpawn.y, invincible: 0, shieldTimer: 0, onGround: false,
    coyoteTimer: 0, jumpBufferTimer: 0, landingTimer: 0,
    slideTimer: 0, moveState: 'fall',
    groundPlatformId: null,
  });
  activeCheckpointId = null;
  for (const platform of stage.platforms.filter(entity => entity.activatedBy)) {
    platform.active = false;
    platform.activationStartedAt = 0;
    platform.runtimeProgress = 0;
    platform.runtimeFrame = 0;
  }
  for (const object of stage.objects.filter(entity => entity.type === 'switch')) object.active = false;
  resetEnemies(enemies);
  gameWon = false;
  activeCourseId = null;
  courseTransitionFade = 0;
  transitionPresentationCourseId = null;
  cameraX = 0;
  introTime = 0;
  runTime = 0;
  ui.clear.classList.remove('is-visible');
  ui.cinematic.classList.remove('is-playing');
  void ui.cinematic.offsetWidth;
  ui.cinematic.classList.add('is-playing');
};
ui.restart.addEventListener('click', restart);

function update(dt) {
  elapsed += dt;
  introTime += dt;
  toastTimer -= dt;
  if (toastTimer <= 0) ui.toast.classList.remove('is-visible');
  player.invincible = Math.max(0, player.invincible - dt);
  player.shieldTimer = Math.max(0, player.shieldTimer - dt);
  shake = Math.max(0, shake - 48 * dt);
  flash = Math.max(0, flash - 2.4 * dt);
  if (!stageEditor.active) updateRuntimePrefabs();
  const transitionLift = stage.platforms
    .find(platform => platform.purpose === 'course-entry' && platform.active && platform.runtimeProgress < 1);
  if (transitionLift) {
    const progress = transitionLift.runtimeProgress;
    const smooth = value => value * value * (3 - 2 * value);
    if (progress <= .08) courseTransitionFade = 0;
    else if (progress < .28) courseTransitionFade = smooth((progress - .08) / .20);
    else if (progress <= .68) courseTransitionFade = 1;
    else if (progress < .96) courseTransitionFade = 1 - smooth((progress - .68) / .28);
    else courseTransitionFade = 0;
    document.documentElement.dataset.courseTransitionLiftProgress = progress.toFixed(2);
  } else {
    courseTransitionFade = 0;
    document.documentElement.dataset.courseTransitionLiftProgress = 'none';
  }
  const arrivingLift = stage.platforms.find(platform => (
    platform.purpose === 'course-entry'
    && platform.active
    && platform.runtimeProgress >= .68
    && platform.courseId !== activeCourseId
  ));
  transitionPresentationCourseId = arrivingLift?.courseId ?? null;

  if (!gameWon && introTime > 1.25 && !stageEditor.active) {
    runTime += dt;
    const controller = stepPlayerController({
      player,
      input,
      platforms: collisionShapes.platforms,
      worldWidth: stage.world.width,
      dt,
      tuning: movementTuning,
    });
    if (bossIntroduced && !boss.defeated) {
      player.x = Math.max(bossArena.entranceX + 26, Math.min(bossArena.exitX - player.w - 26, player.x));
    }
    if (debugSlide) {
      player.moveState = 'slide';
      controller.sliding = true;
    }
    if (controller.jumped) {
      playTone(410, .13, .045, 'triangle');
      emit(player.x + player.w / 2, player.y + player.h, '#86eaff', 7, 90);
    }

    const enemyEvents = stepEnemies({ enemies, player, sliding: controller.sliding, dt });
    if (debugDamage) {
      document.documentElement.dataset.playerLives = String(player.lives);
      document.documentElement.dataset.playerInvincible = player.invincible.toFixed(2);
      document.documentElement.dataset.playerX = player.x.toFixed(1);
    }
    if (debugContact || debugExpansion || debugEnemies || debugSlide) {
      const drone = enemies.find(enemy => enemy.id === 'nyabi-drone-01');
      document.documentElement.dataset.droneLaserState = drone?.laserState ?? 'missing';
      document.documentElement.dataset.droneAge = drone?.age.toFixed(2) ?? '0';
      document.documentElement.dataset.droneProjectileState = drone?.runtimeLaser?.active ? 'active' : 'idle';
      document.documentElement.dataset.droneProjectileX = drone?.runtimeLaser?.x.toFixed(1) ?? 'none';
    }
    if (enemyEvents.laserFired.length) {
      playTone(980, .09, .04, 'sawtooth');
      setTimeout(() => playTone(510, .14, .035, 'square'), 65);
    }
    if (enemyEvents.stomped) {
      emit(enemyEvents.stomped.x + enemyEvents.stomped.w / 2, enemyEvents.stomped.y + 35, '#80f6ff', 20, 220);
      playTone(250, .12, .05, 'square');
      setTimeout(() => playTone(520, .16, .04, 'triangle'), 55);
      toast(`${enemyEvents.stomped.displayName} // STOP`, 1.5);
    } else if (enemyEvents.hit) {
      takeDamage(enemyEvents.hitSource ?? enemyEvents.hit);
    }

    if (boss.active && player.x > bossArena.entranceX) {
      if (!bossIntroduced) { bossIntroduced = true; toast('BOSS // ニャビドローン・コア　頭頂コアを3回踏め！', 3.2); }
      const bossEvents = stepNyabiDroneCore({ boss, player, dt });
      if (bossEvents.hitBoss) {
        shake = 18; flash = .45; emit(boss.x + boss.w / 2, boss.y + 20, '#ff6655', 32, 310);
        toast(`WEAK POINT HIT // 残り ${boss.hp}`, 1.8);
      }
      if (bossEvents.hitPlayer) takeDamage(boss);
      if (bossEvents.summon) {
        const marker = { id: `boss-drone-${boss.summoned}`, prefab: 'nyabi-drone-v1', type: 'enemy', x: bossEvents.summon.x, y: bossEvents.summon.y, w: 128, h: 112, patrol: { minX: boss.x - 760, maxX: boss.x - 160, speed: 42 }, laser: { mode: 'moving-projectile', length: 140, height: 20, renderHeight: 76, speed: 390, travelSeconds: 1, muzzleOffsetX: 20, muzzleOffsetY: 80, period: 3.4, phase: .1, warningStart: .43, activeStart: .62, activeEnd: .72 }, renderOrder: 8 };
        enemies.push(...createEnemies([marker], prefabRegistry));
        toast('ニャビドローンを召喚！', 1.3);
      }
      if (bossEvents.defeated) { shake = 30; flash = 1; emit(boss.x + boss.w / 2, boss.y + boss.h / 2, '#8ffcff', 70, 430); toast('NYABI DRONE CORE // SHUTDOWN', 4); }
    }

    const hitbox = playerHitbox(player, controller.sliding);
    const hazardHit = player.invincible <= 0 && player.shieldTimer <= 0
      ? collisionShapes.hazards.find(hazard => (
        hazard.active !== false && overlap(hitbox, hazard)
      ))
      : null;
    if (hazardHit) takeDamage(hazardHit);
    if (player.y > collision.killY) fallToCheckpoint();

    for (const pickup of stage.pickups) {
      if (collected.has(pickup.id)) continue;
      const dx = player.x + player.w / 2 - pickup.x;
      const dy = player.y + player.h / 2 - pickup.y;
      if (dx * dx + dy * dy < 78 * 78) {
        collected.add(pickup.id);
        const prefab = prefabRegistry.prefabs[pickup.prefab];
        if (collectSharedItem(pickup, prefab)) {
          emit(pickup.x, pickup.y, '#ffd56a', 18, 210);
          playTone(880, .16, .045, 'triangle');
        } else {
          player.crystals += 1;
          emit(pickup.x, pickup.y, '#87fbff', 16, 210);
          playTone(720 + player.crystals * 35, .18, .04, 'sine');
          if (player.crystals === crystalTotal) toast('全データ回収！ 研究評価Sの条件達成', 2.6);
        }
      }
    }

    for (const checkpoint of stage.objects.filter(object => object.type === 'checkpoint')) {
      const checkpointPosition = objectRuntimePosition(checkpoint);
      const horizontalDistance = Math.abs(player.x + player.w / 2 - (checkpointPosition.x + checkpoint.w / 2));
      const verticalDistance = Math.abs(player.y + player.h - (checkpointPosition.y + checkpoint.h));
      if (activeCheckpointId !== checkpoint.id && horizontalDistance < 100 && verticalDistance < 96) {
      activeCheckpointId = checkpoint.id;
      const respawnPoint = checkpoint.respawn ?? hooks.checkpoint.respawn;
      player.checkpointX = respawnPoint.x;
      player.checkpointY = respawnPoint.y;
      emit(checkpoint.x + checkpoint.w / 2, checkpoint.y + 45, '#ffbd58', 22, 190);
      playTone(880, .3, .045, 'triangle');
      toast('CHECKPOINT // 実験記録を保存', 2.3);
      }
    }

    refreshActionAvailability();
    for (const activationSwitch of stage.objects.filter(object => object.type === 'switch')) {
      if (activationSwitch.active) continue;
      if ((activationSwitch.nextReadyAt ?? 0) > elapsed) continue;
      const position = objectRuntimePosition(activationSwitch);
      const switchHitbox = objectSensorRect(
        { ...activationSwitch, x: position.x, y: position.y },
        prefabRegistry.prefabs[activationSwitch.prefab],
      );
      const touches = overlap(player, switchHitbox);
      if (!canActivateSwitch({
        activationSwitch,
        nearbyActionSwitch,
        actionPressed: input.actionPressed,
        touches,
        prefabRegistry,
      })) continue;
      const targets = activationTargets(activationSwitch);
      if (!targets.length) continue;
      activationSwitch.active = true;
      for (const target of targets) {
        target.active = true;
        target.activationStartedAt = elapsed;
        target.lastParticleSegment = 0;
      }
      emit(position.x + activationSwitch.w / 2, position.y + 20, '#69f7ff', 24, 190);
      playTone(620, .22, .05, 'triangle');
      setTimeout(() => playTone(880, .18, .04, 'sine'), 110);
      toast(targets[0].activationMessage ?? 'DEVICE ONLINE', 2.6);
    }

    for (const trigger of hooks.encounterTriggers) {
      const target = trigger.nearEntityId ? stageEntityById(trigger.nearEntityId) : null;
      const targetX = target ? (target.runtimeX ?? target.x) + (target.w ?? 0) / 2 : null;
      const targetY = target ? (target.runtimeY ?? target.y) + (target.h ?? 0) / 2 : null;
      const inRange = target
        ? Math.abs(player.x + player.w / 2 - targetX) <= (trigger.radius ?? 200)
          && Math.abs(player.y + player.h / 2 - targetY) <= Math.max(trigger.radius ?? 200, 220)
        : player.x > trigger.x && player.x < trigger.x + trigger.w;
      if (!firedTriggers.has(trigger.id) && inRange) {
        firedTriggers.add(trigger.id);
        if (trigger.messageType === 'exit-status') {
          toast(player.crystals >= crystalTotal
            ? '全データ回収済み // 出口へ'
            : `結晶データ ${player.crystals} / ${crystalTotal}。手動ならリフトは動くはずだ`, 2.8, trigger.speaker);
        } else if (trigger.message) toast(trigger.message, trigger.duration ?? 2.8, trigger.speaker ?? 'Dr.よこぼ');
      }
    }

    const exitLift = stage.platforms.find(platform => platform.id === hooks.exitLink.id);
    const playerOnExitLift = exitLift
      && player.x + player.w > exitLift.runtimeX
      && player.x < exitLift.runtimeX + exitLift.w;
    if (exitLift?.runtimeProgress >= 1 && playerOnExitLift) {
      gameWon = true;
      player.vx = 0;
      updateClearSummary();
      emit(exitLift.runtimeX + exitLift.w / 2, exitLift.runtimeY, '#a6ffff', 70, 340);
      playTone(560, .5, .05, 'sine');
      setTimeout(() => ui.clear.classList.add('is-visible'), 520);
    }
  }
  if (gameWon || introTime <= 1.25 || stageEditor.active) refreshActionAvailability();
  input.jumpPressed = false;
  input.actionPressed = false;

  for (let index = particles.length - 1; index >= 0; index--) {
    const particle = particles[index];
    particle.life -= dt;
    if (particle.life <= 0) { particles.splice(index, 1); continue; }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 220 * dt;
  }

  if (!stageEditor.active) {
    const anchor = view.portrait
      ? stage.responsiveCamera.playerScreenAnchorPortrait
      : stage.responsiveCamera.playerScreenAnchorLandscape;
    const maxCamera = Math.max(0, stage.world.width - view.width);
    const cameraTarget = Math.max(0, Math.min(maxCamera, player.x - view.width * anchor));
    const cameraEase = 1 - Math.pow(.00005, dt);
    cameraX += (cameraTarget - cameraX) * cameraEase;

    view.top = stepVerticalCamera({
      currentTop: view.top,
      playerY: player.y,
      playerHeight: player.h,
      playerVy: player.vy,
      viewHeight: view.height,
      worldHeight: stage.world.height,
      tuning: stage.responsiveCamera,
      dt,
    });
  }
  ui.life.textContent = '● '.repeat(player.lives).trim();
  const currentCourse = courseAtX(stage, player.x + player.w / 2);
  if (currentCourse?.id !== activeCourseId) {
    activeCourseId = currentCourse?.id ?? null;
    document.documentElement.dataset.course = activeCourseId ?? 'none';
    document.documentElement.dataset.depthMeters = String(currentCourse?.depthMeters ?? 0);
  }
  const presentedCourse = stage.courses.find(course => course.id === transitionPresentationCourseId) ?? currentCourse;
  ui.scoreCount.textContent = scoreText();
  ui.coinCount.textContent = String(player.coinCount);
  ui.crystalCount.textContent = String(player.crystals);
  ui.crystalTotal.textContent = String(crystalTotal);
  ui.timeCount.textContent = formatRunTime(runTime);
  document.documentElement.dataset.courseTransitionFade = courseTransitionFade.toFixed(2);
  ui.missionTitle.textContent = presentedCourse
    ? `COURSE ${presentedCourse.number} / 3　${presentedCourse.mission}`
    : '結晶データを集めて出口へ';
}

function drawParallax(layer) {
  const image = images[`parallax-${layer.id}`];
  const scrollFactorY = layer.scrollFactorY ?? layer.scrollFactor;
  const maxCameraY = Math.max(0, stage.world.height - view.height);
  const plateHeight = view.height + maxCameraY * scrollFactorY;
  const plateWidth = plateHeight * image.width / image.height;
  const offset = -((cameraX * layer.scrollFactor) % plateWidth);
  const worldY = view.top * (1 - scrollFactorY);
  for (let x = offset - plateWidth; x < view.width + plateWidth; x += plateWidth) {
    ctx.drawImage(image, x, worldY, plateWidth, plateHeight);
  }
}

const crystalVariation = index => ({
  scale: [0.88, 1.06, .96, 1.1, .92][index % 5],
  angle: [-.075, .05, -.025, .065, -.04][index % 5],
  offset: [-6, 3, 0, -2, 5][index % 5],
});

function drawCrystalGrowth(platform, layout) {
  const state = platform.growthState;
  if (!state) return;
  if (state.horizontal && Number.isFinite(platform.emitterX)) {
    const fullWidth = state.segmentCount * state.segmentSpacing;
    const centerX = platform.emitterX - cameraX;
    const nozzle = stage.objects.find(object => object.id === platform.nozzleId);
    const floorY = nozzle ? (nozzle.runtimeY ?? nozzle.y) + nozzle.h : platform.growthOriginY + 160;
    // Processed 512px frames share a final alpha box of x=20..491, y=295..492.
    // Map that visible box to collision width and the real nozzle-floor contact line.
    const artScaleX = fullWidth / 471;
    const artScaleY = (floorY - platform.growthOriginY) / 197;
    const artCanvasWidth = 512 * artScaleX;
    const artCanvasHeight = 512 * artScaleY;
    const artX = centerX - artCanvasWidth / 2;
    const artY = floorY - 492 * artScaleY;
    const growthFrames = [
      images.crystalInvertedCoreGrowth1, images.crystalInvertedCoreGrowth2,
      images.crystalInvertedCoreGrowth3, images.crystalInvertedCoreGrowth4,
      images.crystalInvertedCoreGrowth5, images.crystalInvertedCoreGrowth6,
    ];
    const collapseFrames = [
      images.crystalInvertedCoreCollapse1, images.crystalInvertedCoreCollapse2,
      images.crystalInvertedCoreCollapse3, images.crystalInvertedCoreCollapse4,
      images.crystalInvertedCoreCollapse5, images.crystalInvertedCoreCollapse6,
    ];
    const growthProgress = Math.min(1, Math.max(0,
      (state.visibleSegments - 1 + state.newestProgress) / state.segmentCount,
    ));
    const collapseProgress = state.phase === 'collapsing'
      ? 1 - state.visibleSegments / state.segmentCount : 0;
    const growthFrameIndex = state.phase === 'growing'
      ? Math.min(5, Math.floor(growthProgress * 6)) : 5;
    const collapseFrameIndex = state.phase === 'dim' ? 1
      : state.phase === 'cloudy' ? 2
        : state.phase === 'cracked' ? 2
          : state.phase === 'shaking' ? 3
            : state.phase === 'collapsing' ? Math.min(5, 4 + Math.floor(collapseProgress * 2)) : -1;
    // The approved large floor nozzle is part of every inverted-core frame.
    // Keep frame 1 visible while idle/complete so the device never materializes
    // only after activation. The former thin standalone nozzle is intentionally
    // not used by this renderer.
    const frame = ['idle', 'complete'].includes(state.phase)
      ? growthFrames[0]
      : collapseFrameIndex >= 0 ? collapseFrames[collapseFrameIndex] : growthFrames[growthFrameIndex];
    ctx.save();
    if (!['dim', 'cloudy', 'cracked', 'shaking', 'collapsing'].includes(state.phase)) {
      ctx.shadowColor = '#69efff';
      ctx.shadowBlur = 22 + Math.sin(elapsed * 8) * 5;
    }
    const shakeX = state.phase === 'shaking' ? Math.sin(elapsed * 48) * 3 : 0;
    ctx.drawImage(frame, artX + shakeX, artY, artCanvasWidth, artCanvasHeight);
    ctx.restore();
    return;
  }
  if (!state.visibleSegments && state.phase !== 'collapsing') return;
  const horizontalFrames = [images.crystalClusterH1, images.crystalClusterH2, images.crystalClusterH3, images.crystalClusterH4, images.crystalClusterH5];
  const verticalFrames = [images.crystalClusterV1, images.crystalClusterV2, images.crystalClusterV3, images.crystalClusterV4, images.crystalClusterV5];
  const frames = state.horizontal ? horizontalFrames : verticalFrames;
  const decayFrames = [images.crystalDecay1, images.crystalDecay2, images.crystalDecay3, images.crystalDecay4];
  const directionSign = ['left', 'up'].includes(state.direction) ? -1 : 1;
  const spacing = state.segmentSpacing;
  const originX = platform.growthOriginX - cameraX;
  const originY = platform.growthOriginY;
  const baseWidth = state.horizontal ? spacing * 1.22 : platform.w;
  const baseHeight = state.horizontal ? layout.displayHeight * 1.08 : spacing * 1.82;
  ctx.save();
  if (!['dim', 'cloudy', 'cracked', 'shaking', 'collapsing'].includes(state.phase)) {
    ctx.shadowColor = '#69efff';
    ctx.shadowBlur = 18 + Math.sin(elapsed * 8) * 5;
  }
  for (let index = 0; index < state.visibleSegments; index++) {
    const isNewest = state.phase === 'growing' && index === state.visibleSegments - 1;
    const reveal = isNewest ? Math.max(.04, state.newestProgress) : 1;
    const variant = crystalVariation(index);
    const frame = index === 0 ? frames[0] : index === state.segmentCount - 1 ? frames[4] : frames[1 + ((index - 1) % 3)];
    let x = originX + (state.horizontal ? directionSign * index * spacing : variant.offset);
    let y = originY + (state.horizontal ? 0 : directionSign * index * spacing);
    const shake = state.phase === 'shaking' ? Math.sin(elapsed * 46 + index * 2.1) * 3 : 0;
    x += state.horizontal ? shake : 0;
    y += state.horizontal ? 0 : shake;
    ctx.save();
    const centerX = state.direction === 'left' ? x - baseWidth / 2 : x + baseWidth / 2;
    const rootY = state.horizontal ? y + baseHeight * .58 : y;
    ctx.translate(centerX, rootY);
    if (state.direction === 'left') ctx.scale(-1, 1);
    else if (state.direction === 'down') ctx.scale(1, -1);
    ctx.rotate(state.horizontal ? 0 : variant.angle);
    ctx.scale(state.horizontal ? 1 : variant.scale, reveal);
    ctx.drawImage(frame, -baseWidth / 2, -baseHeight, baseWidth, baseHeight);
    ctx.restore();
    const decayIndex = state.phase === 'dim' ? 0 : state.phase === 'cloudy' ? 1 : state.phase === 'cracked' ? 2 : -1;
    if (decayIndex >= 0) {
      const overlayX = state.direction === 'left' ? x - baseWidth * 1.05 : x - baseWidth * .05;
      const overlayY = state.horizontal ? rootY - baseHeight * .78 : y - baseHeight * .78;
      ctx.drawImage(decayFrames[decayIndex], overlayX, overlayY, baseWidth * 1.1, baseHeight * .72);
    }
  }
  if (state.phase === 'collapsing') {
    const index = state.visibleSegments;
    const x = originX + (state.horizontal ? directionSign * index * spacing : 0);
    const y = originY + (state.horizontal ? 0 : directionSign * index * spacing);
    ctx.drawImage(decayFrames[3], x - baseWidth * .55, y - baseHeight, baseWidth * 1.2, baseHeight * 1.25);
  }
  ctx.restore();
}

function drawPlatform(platform) {
  const prefab = prefabRegistry.prefabs[platform.prefab];
  const layout = prefab?.layout ?? moduleSpec;
  const worldX = platform.runtimeX ?? platform.x;
  const worldY = platform.runtimeY ?? platform.y;
  const screenX = worldX - cameraX;
  if (screenX > view.width + 100 || screenX + platform.w < -100) return;
  const { capWidth, middleWidth, jointOverlap } = layout;
  const assetY = worldY - layout.surfaceY;
  if (prefab?.activation?.mode === 'growth') {
    drawCrystalGrowth(platform, layout);
    return;
  }
  if (prefab?.visualSet === 'lab-lift') {
    ctx.save();
    if (platform.active) {
      ctx.shadowColor = '#62efff';
      ctx.shadowBlur = 24 + Math.sin(elapsed * 7) * 6;
    }
    ctx.drawImage(platform.active ? images.liftActive : images.liftIdle, screenX, assetY, platform.w, layout.displayHeight);
    ctx.restore();
    return;
  }
  const strip = prefab?.visualSet === 'lab-strip';
  const capLeft = strip ? images.stripCapLeft : images.capLeft;
  const capRight = strip ? images.stripCapRight : images.capRight;
  let cursor = screenX;
  ctx.drawImage(capLeft, cursor, assetY);
  cursor += capWidth - jointOverlap;
  for (let index = 0; index < platform.modules; index++) {
    const key = strip ? 'stripMiddle' : platform.pattern[index % platform.pattern.length] === 'B' ? 'midB' : 'midA';
    ctx.drawImage(images[key], cursor, assetY);
    cursor += middleWidth - jointOverlap;
  }
  ctx.drawImage(capRight, cursor, assetY);

}

function drawPickup(pickup, index) {
  if (collected.has(pickup.id)) return;
  const x = pickup.x - cameraX;
  if (x < -80 || x > view.width + 80) return;
  const bob = Math.sin(elapsed * 3.2 + index * .7) * 9;
  const prefab = prefabRegistry.prefabs[pickup.prefab];
  const itemImage = itemImages[prefab?.visualSet];
  if (itemImage) {
    const rare = prefab.itemEffect?.type === 'extraLife';
    const size = rare ? 82 : prefab.itemEffect?.type === 'fullHeal' ? 76 : 68;
    ctx.save();
    ctx.shadowColor = rare ? '#c879ff' : '#ffd45f';
    ctx.shadowBlur = rare ? 28 + Math.sin(elapsed * 4) * 7 : 16;
    if (rare) {
      ctx.strokeStyle = `rgba(185,119,255,${.55 + Math.sin(elapsed * 4) * .2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, pickup.y + bob, 52 + Math.sin(elapsed * 3) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.drawImage(itemImage, x - size / 2, pickup.y + bob - size / 2, size, size);
    ctx.restore();
    return;
  }
  const frameIndex = (Math.floor(elapsed * 7) + index) & 3;
  const pickupImage = pickupFrames[frameIndex];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glowRadius = pickup.reward ? 82 : 64;
  const glow = ctx.createRadialGradient(x, pickup.y + bob, 4, x, pickup.y + bob, glowRadius);
  glow.addColorStop(0, pickup.reward ? 'rgba(255,232,125,.65)' : 'rgba(167,255,255,.45)');
  glow.addColorStop(1, 'rgba(47,216,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, pickup.y + bob, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (pickup.reward) {
    ctx.strokeStyle = `rgba(255,222,111,${0.58 + Math.sin(elapsed * 4) * 0.18})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, pickup.y + bob, 57 + Math.sin(elapsed * 3) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  const size = pickup.reward ? 94 : 84;
  ctx.drawImage(pickupImage, x - size / 2, pickup.y + bob - size / 2, size, size);
  ctx.restore();
}

function signalVisualState(object) {
  if (!object.signalTargetId) return 'idle';
  const targetObject = [...stage.objects, ...stage.platforms]
    .find(candidate => candidate.id === object.signalTargetId);
  if (targetObject) {
    if (targetObject.active) return 'active';
    if (targetObject.runtimeFrame === 1) return 'warning';
    if (targetObject.runtimeFrame === 2) return 'active';
    return 'idle';
  }
  const targetEnemy = enemies.find(candidate => candidate.id === object.signalTargetId);
  return targetEnemy?.laserState ?? 'idle';
}

function drawObjects(depthRole = 'gameplay') {
  for (const object of stage.objects) {
    const position = objectRuntimePosition(object);
    const prefab = prefabRegistry.prefabs[object.prefab];
    const presentation = prefab?.presentation ?? { depthRole: 'gameplay', opacity: 1 };
    if (presentation.depthRole !== depthRole) continue;
    const scrollFactor = depthRole === 'midground' ? presentation.scrollFactor : 1;
    const x = (position.x - cameraX) * scrollFactor;
    const drawY = depthRole === 'midground'
      ? position.y + view.top * (1 - scrollFactor)
      : position.y;
    if (x > view.width + 300 || x + object.w < -300) continue;
    const visualSet = prefab?.visualSet;
    const deviceSourceFloorRatio = 61 / 64;
    const floorAlignedDrawY = drawY + object.h * (1 - deviceSourceFloorRatio);
    if (visualSet?.startsWith('lab-decor-')) {
      const frame = Number(visualSet.at(-1));
      ctx.save();
      if (frame === 1) {
        const signalState = signalVisualState(object);
        const pulseSpeed = signalState === 'active' ? 14 : signalState === 'warning' ? 7 : 2.4;
        const pulseBase = signalState === 'active' ? 30 : signalState === 'warning' ? 20 : 7;
        ctx.shadowColor = signalState === 'active' ? '#ff5a32' : '#ffbd50';
        ctx.shadowBlur = pulseBase + Math.sin(elapsed * pulseSpeed) * 6;
      }
      ctx.drawImage(images[`decor${frame}`], x, drawY, object.w, object.h);
      ctx.restore();
    } else if (visualSet === 'crystal-growth-nozzle') {
      // Retained only as a legacy placement anchor for existing stage data.
      // Its rejected thin-nozzle artwork must never be rendered; the approved
      // device is integrated into drawCrystalGrowth() from idle through collapse.
      continue;
    } else if (object.type === 'hazard') {
      ctx.save();
      ctx.shadowColor = visualSet === 'crystal-spikes' ? '#a955ff' : '#4ccff2';
      ctx.shadowBlur = 28 + Math.sin(elapsed * 6) * 8;
      if (visualSet === 'crystal-spikes' && object.modules?.length) {
        const moduleImages = {
          LEFT: images.crystalHazardMassive1, MID_A: images.crystalHazardMassive2,
          MID_B: images.crystalHazardMassive3, MID_C: images.crystalHazardMassive4, RIGHT: images.crystalHazardMassive5,
        };
        const moduleWidth = Math.max(prefab.moduleLayout.width, 124);
        const moduleStep = object.modules.length > 1 ? (object.w - moduleWidth) / (object.modules.length - 1) : 0;
        const artHeight = Math.max(object.h * 1.72, 156);
        const floorY = drawY + object.h;
        const imageBottomY = floorY + artHeight * (1 - (prefab.moduleLayout.sourceFloorRatio ?? 1));
        object.modules.forEach((module, index) => {
          ctx.drawImage(moduleImages[module], x + index * moduleStep, imageBottomY - artHeight, moduleWidth, artHeight);
        });
      }
      ctx.restore();
    } else if (object.type === 'checkpoint') {
      ctx.save();
      if (activeCheckpointId === object.id) {
        ctx.shadowColor = '#ffbd50';
        ctx.shadowBlur = 34 + Math.sin(elapsed * 4) * 8;
      }
      ctx.drawImage(images.checkpoint, x, drawY, object.w, object.h);
      ctx.restore();
    } else if (object.type === 'switch') {
      const targets = activationTargets(object);
      const target = targets[0];
      const anyTargetActive = targets.some(candidate => candidate.active);
      const actionReady = object === nearbyActionSwitch && !anyTargetActive;
      ctx.save();
      if (actionReady) {
        const pulse = .72 + Math.sin(elapsed * 7) * .18;
        ctx.fillStyle = `rgba(255,255,255,${pulse * .14})`;
        ctx.fillRect(x - 10, drawY - 10, object.w + 20, object.h + 20);
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 36 + Math.sin(elapsed * 7) * 10;
      } else if (anyTargetActive) {
        ctx.shadowColor = '#65f4ff';
        ctx.shadowBlur = 22 + Math.sin(elapsed * 8) * 6;
      }
      if (visualSet === 'crystal-remote-switch') {
        const phases = targets.map(candidate => candidate.growthState?.phase ?? (candidate.active ? 'growing' : 'idle'));
        const frameIndex = !anyTargetActive ? 1
          : phases.some(phase => phase === 'growing') ? 2
            : phases.some(phase => phase === 'stable') ? 3 : 4;
        ctx.drawImage(images[`crystalRemoteSwitch${frameIndex}`], x, floorAlignedDrawY, object.w, object.h);
      } else {
        ctx.drawImage(anyTargetActive ? images.switchOn : images.switchOff, x, drawY, object.w, object.h);
      }
      ctx.restore();
    }
  }
}

function drawEnemyLasers() {
  for (const enemy of enemies) {
    if (!enemy.active || !enemy.laser) continue;
    const direction = enemy.laserAimDirection || -1;
    const muzzleX = (direction < 0
      ? enemy.x + (enemy.laser.muzzleOffsetX ?? 18)
      : enemy.x + enemy.w - (enemy.laser.muzzleOffsetX ?? 18)) - cameraX;
    const muzzleY = enemy.y + (enemy.laser.muzzleOffsetY ?? enemy.h * .58);

    if (enemy.laserState === 'warning') {
      const pulse = .5 + Math.sin(elapsed * 18) * .5;
      const aimLength = 72 + pulse * 18;
      ctx.save();
      ctx.shadowColor = '#ff3f28';
      ctx.shadowBlur = 26 + pulse * 18;
      ctx.strokeStyle = `rgba(102,14,31,${.72 + pulse * .2})`;
      ctx.lineWidth = 9;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(muzzleX + direction * aimLength, muzzleY);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,112,38,${.72 + pulse * .26})`;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff3ad';
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, 7 + pulse * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#711125';
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, 18 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ff6a32';
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, 18 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const laser = enemy.runtimeLaser;
    if (!laser?.active) continue;
    const x = laser.x - cameraX;
    if (x > view.width + 100 || x + laser.w < -100) continue;
    const projectileDirection = laser.direction || direction;
    const frame = droneLaserFrames[1 + (Math.floor(elapsed * 16) % 3)];
    const renderWidth = laser.w * 1.12;
    const renderHeight = laser.renderHeight;
    const centerY = laser.y + laser.h / 2;
    const leadingX = projectileDirection < 0 ? x : x + laser.w;
    const trailingX = projectileDirection < 0 ? x + laser.w : x;
    ctx.save();
    ctx.shadowColor = '#ff321f';
    ctx.shadowBlur = 38;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(
      frame,
      x - (renderWidth - laser.w) / 2,
      centerY - renderHeight / 2,
      renderWidth,
      renderHeight,
    );
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#781022';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(x + 7, centerY);
    ctx.lineTo(x + laser.w - 7, centerY);
    ctx.stroke();
    ctx.strokeStyle = '#ff3d24';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(x + 7, centerY);
    ctx.lineTo(x + laser.w - 7, centerY);
    ctx.stroke();
    ctx.strokeStyle = '#fff6c7';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#781022';
    ctx.lineWidth = 5;
    ctx.fillStyle = '#fff8d6';
    ctx.beginPath();
    ctx.arc(leadingX, centerY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff6b32';
    ctx.beginPath();
    ctx.arc(trailingX, centerY, 7, 0, Math.PI * 2);
    ctx.fill();

    if (laser.age < .18) {
      const flashAlpha = 1 - laser.age / .18;
      const connectorEnd = projectileDirection < 0 ? x + laser.w : x;
      ctx.globalAlpha = flashAlpha;
      ctx.strokeStyle = '#781022';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(connectorEnd, centerY);
      ctx.stroke();
      ctx.strokeStyle = '#ff6b32';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#fff3ad';
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, 9 + flashAlpha * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    if (!enemy.active) continue;
    const x = enemy.x - cameraX + enemy.w / 2;
    if (x < -140 || x > view.width + 140) continue;
    const frames = enemyFrameSets[enemy.visualSet] ?? enemyFrameSets['nyabi-clean-side-patrol'];
    const frameIndex = enemy.behaviorPreset === 'jump' || enemy.behaviorPreset === 'hover_laser'
      ? enemy.animationFrame
      : Math.abs(Math.floor(elapsed * 7)) % frames.length;
    const enemyImage = frames[frameIndex] ?? frames[0];
    if (!enemyImage) continue;
    const drawSize = enemy.render.drawSize ?? 172;
    const baseline = enemy.render.baseline ?? .9125;
    ctx.save();
    ctx.translate(x, enemy.y + enemy.h);
    ctx.scale(enemy.direction * (enemy.render.sourceFacing ?? 1), 1);
    ctx.shadowColor = enemy.render.glow ?? 'rgba(24,220,255,.42)';
    ctx.shadowBlur = enemy.render.shadowBlur ?? 14;
    ctx.drawImage(enemyImage, -drawSize / 2, -drawSize * baseline, drawSize, drawSize);
    ctx.restore();
  }
}

function drawBoss() {
  if (!bossIntroduced || boss.defeated) return;
  const pose = bossSpritePose(boss);
  const originX = pose.originX - cameraX;
  const bossImage = bossSpriteFrames[boss.spriteDirection][boss.spriteFrame];
  ctx.save();
  ctx.shadowColor = boss.hurt > 0 ? '#ff5544' : '#48eaff';
  ctx.shadowBlur = boss.hurt > 0 ? 42 : 24;
  if (boss.hurt > .8) ctx.filter = 'brightness(1.8) saturate(.55)';
  ctx.drawImage(bossImage, originX, pose.originY, pose.size, pose.size);
  ctx.restore();

  const beaconX = pose.originX - cameraX + 256 * pose.scale;
  const beaconY = pose.originY + 137 * pose.scale;
  const beaconActive = boss.laser && boss.laser.state !== 'recovery';
  if (beaconActive || boss.hurt > .8) {
    const pulse = boss.hurt > .8 ? 1 : .65 + Math.sin(elapsed * 18) * .25;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = boss.hurt > .8 ? '#ffffff' : `rgba(255,54,34,${pulse})`;
    ctx.shadowColor = boss.hurt > .8 ? '#ffffff' : '#ff3828'; ctx.shadowBlur = 34;
    ctx.beginPath(); ctx.arc(beaconX, beaconY, 10 + pulse * 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const thrusterX = pose.originX - cameraX + 256 * pose.scale;
  const thrusterY = pose.originY + 382 * pose.scale;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(75,235,255,.35)';
  ctx.shadowColor = '#4feeff'; ctx.shadowBlur = 24; ctx.beginPath(); ctx.ellipse(thrusterX, thrusterY, 48, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();

  const x = boss.x - cameraX;
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i < boss.hp ? '#ff4e3c' : '#402536';
    ctx.beginPath(); ctx.arc(x + boss.w / 2 + (i - 1) * 34, boss.y - 30, 11, 0, Math.PI * 2); ctx.fill();
  }
  if (!boss.laser || boss.laser.state === 'recovery') return;
  const warning = boss.laser.state === 'warning';
  for (const beam of boss.laser.beams) {
    const beamOriginX = beam.originX - cameraX;
    const beamEndX = beam.endX - cameraX;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = warning ? 'rgba(255,90,50,.75)' : '#6d1025'; ctx.lineWidth = warning ? 7 : 30;
    ctx.setLineDash(warning ? [18, 13] : []); ctx.beginPath(); ctx.moveTo(beamOriginX, beam.originY); ctx.lineTo(beamEndX, beam.endY); ctx.stroke();
    if (!warning) { ctx.strokeStyle = '#ff472d'; ctx.lineWidth = 18; ctx.stroke(); ctx.strokeStyle = '#fff5c8'; ctx.lineWidth = 6; ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.arc(beamOriginX, beam.originY, warning ? 10 + Math.sin(elapsed * 20) * 4 : 16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

function drawBossArenaGates() {
  if (!bossIntroduced || boss.defeated) return;
  const top = bossArena.floorY - 610;
  for (const worldX of [bossArena.entranceX, bossArena.exitX]) {
    const x = worldX - cameraX;
    if (x < -80 || x > view.width + 80) continue;
    const pulse = .65 + Math.sin(elapsed * 11) * .25;
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.shadowColor = '#ff633f'; ctx.shadowBlur = 28;
    ctx.strokeStyle = `rgba(255,76,45,${pulse})`; ctx.lineWidth = 10; ctx.setLineDash([22, 13]);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bossArena.floorY); ctx.stroke();
    ctx.strokeStyle = `rgba(255,238,180,${pulse})`; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.stroke();
    ctx.fillStyle = '#ffb14d'; ctx.font = '900 14px system-ui'; ctx.fillText('BOSS LOCK', x - 40, top - 18); ctx.restore();
  }
}

function getPlayerFrame() {
  if (player.moveState === 'jump' || player.moveState === 'fall') {
    const frame = player.vy < -300 ? 2 : player.vy < 120 ? 3 : 4;
    return images[`jump${frame}`];
  }
  if (player.moveState === 'slide') return images[`run${1 + Math.floor(elapsed * 13) % 4}`];
  if (player.moveState === 'run') return images[`run${1 + Math.floor(elapsed * 9) % 4}`];
  if (player.moveState === 'land') return images.idle2;
  return images[`idle${1 + Math.floor(elapsed * 4.5) % 4}`];
}

function drawPlayer() {
  if (!debugDamage && player.invincible > 0 && Math.floor(elapsed * 16) % 2) return;
  const frame = getPlayerFrame();
  const sliding = player.moveState === 'slide';
  const drawWidth = sliding ? 205 : 194;
  const drawHeight = sliding ? 142 : 194;
  const x = player.x - cameraX + player.w / 2;
  const physicsFootY = player.y + player.h;
  const frameHeight = playerContactSpec.canvasSize[1];
  const visualTop = -playerContactSpec.footBaseline / frameHeight * drawHeight;
  ctx.save();
  ctx.translate(x, physicsFootY);
  ctx.scale(player.facing, 1);
  if (sliding) ctx.rotate(-.05 * player.facing);
  ctx.shadowColor = 'rgba(3,13,25,.65)';
  ctx.shadowBlur = 16;
  ctx.drawImage(frame, -drawWidth / 2, visualTop, drawWidth, drawHeight);
  if (player.shieldTimer > 0) {
    ctx.strokeStyle = `rgba(111,244,255,${.6 + Math.sin(elapsed * 8) * .18})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = '#7ff6ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(0, -drawHeight * .43, drawWidth * .52, drawHeight * .49, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawContactDebug() {
  if (!debugContact) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.setLineDash([10, 6]);
  for (const platform of collisionShapes.platforms) {
    const x = platform.x - cameraX;
    if (x > view.width || x + platform.w < 0) continue;
    ctx.strokeStyle = '#43ff93';
    ctx.beginPath();
    ctx.moveTo(x, platform.y);
    ctx.lineTo(x + platform.w, platform.y);
    ctx.stroke();
    ctx.fillStyle = '#43ff93';
    ctx.fillText(`SURFACE y=${platform.y}`, Math.max(8, x + 8), platform.y - 7);
  }
  ctx.setLineDash([5, 4]);
  for (const sensor of collisionShapes.sensors.filter(shape => shape.source.prefab === 'crystal-remote-switch-v1')) {
    const x = sensor.x - cameraX;
    if (x > view.width || x + sensor.w < 0) continue;
    ctx.strokeStyle = '#51dcff';
    ctx.strokeRect(x, sensor.y, sensor.w, sensor.h);
    ctx.fillStyle = '#51dcff';
    ctx.fillText('SWITCH BODY', x, sensor.y - 5);
  }
  const playerX = player.x - cameraX;
  ctx.setLineDash([]);
  ctx.strokeStyle = '#ff5f7e';
  ctx.strokeRect(playerX, player.y, player.w, player.h);
  ctx.strokeStyle = '#ffe36e';
  ctx.beginPath();
  ctx.moveTo(playerX - 18, player.y + player.h);
  ctx.lineTo(playerX + player.w + 18, player.y + player.h);
  ctx.stroke();
  ctx.fillStyle = '#ffe36e';
  ctx.fillText(`FOOT y=${Math.round(player.y + player.h)}`, playerX, player.y + player.h - 7);
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const particle of particles) {
    const alpha = Math.min(1, particle.life * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(particle.x - cameraX, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAtmosphere() {
  const course = stage.courses.find(candidate => candidate.id === transitionPresentationCourseId)
    ?? courseAtX(stage, player.x + player.w / 2);
  const depth = course?.number ?? 1;
  const atmosphere = course?.atmosphere;
  ctx.save();
  if (atmosphere) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = atmosphere.alpha ?? 0;
    ctx.fillStyle = atmosphere.tint ?? '#08284d';
    ctx.fillRect(0, view.top, view.width, view.height);
  }
  ctx.globalCompositeOperation = 'screen';
  const beam = ctx.createLinearGradient(view.width * .2, view.top, view.width * .55, view.top + view.height);
  beam.addColorStop(0, 'rgba(99,232,255,.09)');
  beam.addColorStop(.42, 'rgba(99,232,255,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, view.top, view.width, view.height);
  ctx.globalAlpha = .16 + depth * .035;
  for (let i = 0; i < 18 + depth * 4; i++) {
    const x = ((i * 347 + elapsed * (8 + i % 4)) % (view.width + 100)) - 50;
    const y = view.top + (i * 193 % view.height) + Math.sin(elapsed + i) * 12;
    ctx.fillStyle = i % 4 ? '#8defff' : '#b794ff';
    ctx.fillRect(x, y, 2, 2);
  }
  if (depth > 1) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = .055 + depth * .018;
    ctx.strokeStyle = '#b9f7ff';
    ctx.lineWidth = 2;
    const bandGap = depth === 3 ? 138 : 184;
    const drift = (view.top * .18 + elapsed * 4) % bandGap;
    for (let y = view.top - bandGap + drift; y < view.top + view.height + bandGap; y += bandGap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(view.width, y - 18);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#041020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / view.width;
  ctx.setTransform(scale, 0, 0, scale, 0, -view.top * scale);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake * .5);
  for (const layer of stage.parallax) drawParallax(layer);
  drawAtmosphere();
  drawObjects('background');
  drawObjects('midground');
  for (const platform of stage.platforms) drawPlatform(platform);
  stage.pickups.forEach(drawPickup);
  drawObjects('gameplay');
  drawEnemies();
  drawEnemyLasers();
  drawBoss();
  drawBossArenaGates();
  drawPlayer();
  drawParticles();
  const centerY = view.top + view.height / 2;
  const vignette = ctx.createRadialGradient(view.width / 2, centerY, view.height * .22, view.width / 2, centerY, view.height * .82);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,6,18,.58)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, view.top, view.width, view.height);
  if (flash > 0) {
    ctx.fillStyle = `rgba(187,97,255,${flash * .3})`;
    ctx.fillRect(0, view.top, view.width, view.height);
  }
  if (courseTransitionFade > 0) {
    ctx.fillStyle = `rgba(1, 7, 20, ${courseTransitionFade})`;
    ctx.fillRect(0, view.top, view.width, view.height);
  }
  drawContactDebug();
  stageEditor.drawOverlay(ctx, cameraX, collisionShapes);
  ctx.restore();
}

let previous = performance.now();
function loop(now) {
  const dt = Math.min(.033, (now - previous) / 1000);
  previous = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

ui.loading.classList.add('is-hidden');
if (!stageEditor.active && !debugSlice && !debugEnemies && !debugExpansion && !debugPresentation && !debugInfo && !debugDamage && !debugSlide && !debugGoal && !debugObjective && !debugClear && !debugCrystalId && !debugDescentId && !debugAutoplay) {
  ui.cinematic.classList.add('is-playing');
  setTimeout(() => toast('まずは足を慣らそう。左右に進めるはずだ', 3, 'Dr.よこぼ'), 3300);
}
requestAnimationFrame(loop);

// 非表示タブでは requestAnimationFrame が発火しないため、画面を出せない環境から
// 見た目を確認するためのコマ送り口。開発ビルドのみ。
if (import.meta.env.DEV || [...urlParams.keys()].some(key => key.startsWith('debug-'))) {
  window.__qa = {
    advance(seconds = 1, step = 1 / 60) {
      for (let elapsedStep = 0; elapsedStep < seconds; elapsedStep += step) {
        update(step);
        render();
      }
      previous = performance.now();
    },
    runRight(seconds = 1) {
      input.right = true;
      this.advance(seconds);
      input.right = false;
      return { playerX: player.x, cameraX, viewTop: view.top };
    },
    state: () => ({ playerX: player.x, cameraX, viewTop: view.top }),
    lookAt(worldX) {
      cameraX = Math.max(0, Math.min(stage.world.width - view.width, worldX - view.width * .34));
      render();
    },
    shot: () => canvas.toDataURL('image/png'),
  };
}
