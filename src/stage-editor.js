import {
  allStageEntities,
  buildCollisionShapes,
  clearLocalStagePatch,
  findStageEntity,
  hydrateStage,
  makeStagePatch,
  saveLocalStagePatch,
  sectionAtX,
  validateStage,
} from './stage-resolver.js';
import { classifyReach, jumpCurvePoint, reachEnvelope } from './reach-envelope.js';
import { imagePaths, runtimeUrl } from './asset-manifest.js';

const html = String.raw;

export function createStageEditor({
  canvas,
  shell,
  baseStage,
  stage,
  moduleSpec,
  prefabRegistry,
  prefabPlacement,
  movementTuning,
  courseLayout,
  courseSources,
  courseHookSources,
  hooks,
  view,
  getCameraX,
  setCameraX,
  onChange,
  onActorsChange,
  onPlaytest,
  onToast,
}) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const editorEnabled = import.meta.env.DEV || new URLSearchParams(location.search).get('editor') === '1';
  const panel = document.createElement('aside');
  panel.className = 'stage-editor';
  panel.setAttribute('aria-label', 'ステージ調整モード');
  panel.innerHTML = html`
    <header class="stage-editor__header">
      <div><span>CONSTRAINED EDITOR</span><strong>ステージ調整</strong></div>
      <button type="button" data-editor-action="close" aria-label="閉じる">×</button>
    </header>
    <div class="stage-editor__body">
      <label class="stage-editor__field">編集範囲
        <select data-editor-field="scope">
          <option value="pickups">アイテムだけ（かんたん）</option>
          <option value="all">コース全体（詳細）</option>
        </select>
      </label>
      <label class="stage-editor__field">選択パーツ
        <select data-editor-field="entity"></select>
      </label>
      <div class="stage-editor__meta">
        <span data-editor-meta="prefab">—</span>
        <b data-editor-meta="section">—</b>
      </div>
      <div class="stage-editor__coords">
        <label>X <input data-editor-field="x" type="number" step="1"></label>
        <label>Y <input data-editor-field="y" type="number" step="1"></label>
      </div>
      <div class="stage-editor__platform-fields" data-editor-platform>
        <label>モジュール数 <input data-editor-field="modules" type="number" min="1" max="12" step="1"></label>
        <label>接続パターン <input data-editor-field="pattern" type="text" inputmode="text" maxlength="12"></label>
      </div>
      <div class="stage-editor__platform-fields" data-editor-motion hidden>
        <label>移動軸
          <select data-editor-field="motionAxis"><option value="x">水平</option><option value="y">垂直</option></select>
        </label>
        <label>移動距離 <input data-editor-field="motionDistance" type="number" min="-320" max="320" step="8"></label>
        <label>周期(秒) <input data-editor-field="motionPeriod" type="number" min="1.2" max="12" step="0.1"></label>
        <label>開始位相 <input data-editor-field="motionPhase" type="number" min="0" max="1" step="0.05"></label>
      </div>
      <div class="stage-editor__platform-fields" data-editor-growth hidden>
        <label>成長方向
          <select data-editor-field="direction"><option value="right">右</option><option value="left">左</option><option value="up">上</option><option value="down">下</option></select>
        </label>
        <label>結晶数 <input data-editor-field="length" type="number" min="2" max="16" step="1"></label>
        <label>生成間隔(秒) <input data-editor-field="growthSpeed" type="number" min="0.08" max="0.15" step="0.01"></label>
        <label>安定時間(秒) <input data-editor-field="activeDuration" type="number" min="1" max="20" step="0.5"></label>
        <label>崩壊時間(秒) <input data-editor-field="collapseDuration" type="number" min="1" max="8" step="0.1"></label>
        <label>結晶間隔 <input data-editor-field="segmentSpacing" type="number" min="24" max="96" step="1"></label>
      </div>
      <div class="stage-editor__nudge">
        <button type="button" data-nudge-x="0" data-nudge-y="-1">↑</button>
        <button type="button" data-nudge-x="-1" data-nudge-y="0">←</button>
        <button type="button" data-nudge-x="1" data-nudge-y="0">→</button>
        <button type="button" data-nudge-x="0" data-nudge-y="1">↓</button>
        <label>刻み
          <select data-editor-field="snap"><option value="1">1px</option><option value="8" selected>8px</option><option value="16">16px</option></select>
        </label>
      </div>
      <label class="stage-editor__field">表示位置
        <input data-editor-field="camera" type="range" min="0" step="8">
      </label>
      <div class="stage-editor__sections" data-editor-sections></div>
      <label class="stage-editor__field">AIへの修正メモ
        <textarea data-editor-field="note" rows="3" placeholder="例：この区間は単調。上ルートに選択肢がほしい"></textarea>
      </label>
      <div class="stage-editor__status" data-editor-status></div>
      <div class="stage-editor__history">
        <button type="button" data-editor-action="undo">↶ 元に戻す</button>
        <button type="button" data-editor-action="redo">↷ やり直す</button>
      </div>
      <div class="stage-editor__actions">
        <button type="button" data-editor-action="copy">AI用指示をコピー</button>
        <button type="button" data-editor-action="export">差分JSONを書き出す</button>
        <button type="button" class="is-danger" data-editor-action="reset">下書きを破棄</button>
      </div>
    </div>
    <footer>ドラッグで移動・F3で終了。画像倍率と接地規格は編集できません。</footer>
  `;
  shell.append(panel);

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'stage-editor-launcher';
  launcher.textContent = '編集';
  launcher.hidden = !coarse || !editorEnabled;
  launcher.addEventListener('click', () => toggle(true));
  shell.append(launcher);
  const resetViewport = document.createElement('button');
  resetViewport.type = 'button';
  resetViewport.className = 'stage-editor-reset-view';
  resetViewport.textContent = '表示をもどす';
  resetViewport.hidden = true;
  resetViewport.addEventListener('click', () => location.reload());
  shell.append(resetViewport);
  for (const type of ['gesturestart', 'gesturechange']) canvas.addEventListener(type, event => {
    if (state?.active) event.preventDefault();
  }, { passive: false });
  window.visualViewport?.addEventListener('resize', () => { resetViewport.hidden = Math.abs((window.visualViewport?.scale ?? 1) - 1) < .01; });
  canvas.addEventListener('touchstart', event => {
    if (state?.active && event.touches.length >= 2) event.preventDefault();
  }, { passive: false });

  const toolbar = document.createElement('div');
  toolbar.className = 'stage-editor__toolbar';
  toolbar.innerHTML = `
    <div class="stage-editor__course-tabs" data-editor-course-tabs></div>
    <span class="stage-editor__save-status" data-editor-save-status>保存済み</span>
    <button type="button" data-editor-action="save">保存</button>
    <button type="button" data-editor-action="playtest">ここから試遊</button>`;
  panel.querySelector('.stage-editor__header').after(toolbar);
  const mobileTabs = document.createElement('nav');
  mobileTabs.className = 'stage-editor__mobile-tabs';
  mobileTabs.innerHTML = `<button type="button" data-mobile-tab="select" class="is-active">選ぶ</button><button type="button" data-mobile-tab="place">置く</button><button type="button" data-mobile-tab="test">試す</button>`;
  toolbar.after(mobileTabs);
  const mobileActions = document.createElement('div');
  mobileActions.className = 'stage-editor__mobile-actions';
  mobileActions.innerHTML = `
    <button type="button" data-nudge-x="-1" data-nudge-y="0" aria-label="左へ移動">←</button>
    <button type="button" data-nudge-x="0" data-nudge-y="-1" aria-label="上へ移動">↑</button>
    <button type="button" data-nudge-x="0" data-nudge-y="1" aria-label="下へ移動">↓</button>
    <button type="button" data-nudge-x="1" data-nudge-y="0" aria-label="右へ移動">→</button>
    <select data-mobile-snap aria-label="移動刻み"><option value="1">1px</option><option value="8" selected>8px</option><option value="16">16px</option></select>
    <button type="button" data-mobile-action="last">直前</button>
    <button type="button" data-mobile-action="duplicate">複製</button>
    <button type="button" data-mobile-action="delete">削除</button>
    <button type="button" data-mobile-action="undo">↶</button>
    <button type="button" data-mobile-action="guide">ガイド</button>
    <button type="button" data-mobile-action="unsnap">吸着OFF</button>
    <button type="button" data-mobile-action="cancel-place" hidden>配置終了</button>`;
  panel.querySelector('.stage-editor__body').prepend(mobileActions);
  const palette = document.createElement('div');
  palette.className = 'stage-editor__palette';
  palette.dataset.editorPalette = '';
  panel.querySelector('.stage-editor__body').prepend(palette);
  const staircase = document.createElement('fieldset');
  staircase.className = 'stage-editor__staircase';
  staircase.innerHTML = `
    <legend>階段配置（床・足場のみ）</legend>
    <label>個数 <input data-stair="count" type="number" min="2" max="6" value="3"></label>
    <label>横間隔 <input data-stair="dx" type="number" step="8" value="260"></label>
    <label>縦間隔 <input data-stair="dy" type="number" step="7" value="-77"></label>
    <button type="button" data-editor-action="staircase">階段を作る</button>`;
  panel.querySelector('.stage-editor__body').append(staircase);
  const detailsScroll = document.createElement('div');
  detailsScroll.className = 'stage-editor__details-scroll';
  const editorBody = panel.querySelector('.stage-editor__body');
  [...editorBody.children].filter(child => child !== mobileActions && child !== palette).forEach(child => detailsScroll.append(child));
  editorBody.append(detailsScroll);
  const advanced = document.createElement('details');
  advanced.className = 'stage-editor__advanced';
  advanced.open = !coarse;
  advanced.innerHTML = '<summary>区間・AIメモ・階段など</summary>';
  const advancedTargets = [
    panel.querySelector('[data-editor-sections]'),
    panel.querySelector('[data-editor-field="note"]')?.closest('label'),
    panel.querySelector('.stage-editor__actions'),
    staircase,
  ].filter(Boolean);
  advancedTargets.forEach(element => advanced.append(element));
  detailsScroll.append(advanced);
  const minimap = document.createElement('canvas');
  minimap.className = 'stage-editor__minimap';
  minimap.width = 920;
  minimap.height = 96;
  panel.querySelector('footer').before(minimap);

  const fields = Object.fromEntries(
    [...panel.querySelectorAll('[data-editor-field]')].map(element => [element.dataset.editorField, element])
  );
  const meta = Object.fromEntries(
    [...panel.querySelectorAll('[data-editor-meta]')].map(element => [element.dataset.editorMeta, element])
  );
  const status = panel.querySelector('[data-editor-status]');
  const platformFields = panel.querySelector('[data-editor-platform]');
  const motionFields = panel.querySelector('[data-editor-motion]');
  const growthFields = panel.querySelector('[data-editor-growth]');
  const sections = panel.querySelector('[data-editor-sections]');
  const saveStatus = panel.querySelector('[data-editor-save-status]');
  const courseTabs = panel.querySelector('[data-editor-course-tabs]');
  const stairFields = Object.fromEntries([...staircase.querySelectorAll('[data-stair]')].map(input => [input.dataset.stair, input]));
  stage.editorActors = hooks.actorSpawnMarkers ?? [];
  const editorEntities = () => [
    ...allStageEntities(stage),
    ...stage.editorActors.map(entity => ({ entity, group: 'actorSpawnMarkers', category: 'actor' })),
  ];
  const state = {
    active: false,
    selectedId: stage.pickups[0]?.id ?? allStageEntities(stage)[0]?.entity.id ?? null,
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    snap: 1,
    scope: 'pickups',
    history: [],
    historyIndex: -1,
    selectedIds: new Set(),
    courseIndex: 0,
    dirtyFiles: new Set(),
    zoom: 1,
    baseView: { width: view.width, height: view.height },
    panning: false,
    panStart: null,
    guidePinned: false,
    guideEntity: null,
    playtestSnapshot: null,
    playtesting: false,
    lastPickKey: '',
    lastPickIndex: 0,
    mobileTab: 'select',
    placementPrefab: null,
    unsnapped: false,
    deleteArmed: false,
    touchPointers: new Map(),
    pinchStart: null,
    dragOrigin: null,
    serverAvailable: false,
    lastPlacedId: null,
    highlightId: null,
    highlightUntil: 0,
  };
  if (state.selectedId) state.selectedIds.add(state.selectedId);
  fields.snap.value = String(state.snap);
  fields.scope.value = state.scope;
  const renderSectionButtons = () => {
    sections.replaceChildren();
    const course = stage.courses[state.courseIndex];
    for (const section of (stage.sections ?? []).filter(item => item.xStart >= course.xStart && item.xStart < course.xEnd)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = section.label;
      button.title = section.intent;
      button.addEventListener('click', () => setCameraX(section.xStart));
      sections.append(button);
    }
  };
  renderSectionButtons();
  const selectedItem = () => findStageEntity(stage, state.selectedId)
    ?? editorEntities().find(item => item.entity.id === state.selectedId);
  const allowed = (entity, key) => prefabRegistry.prefabs[entity.prefab]?.editor?.allowed?.includes(key) ?? false;
  const snapValue = value => Math.round(value / state.snap) * state.snap;
  function entityCourseIndex(entity) {
    const index = stage.courses.findIndex(course => entity.x >= course.xStart - 500 && entity.x < course.xEnd);
    return index < 0 ? state.courseIndex : index;
  }
  const entityInScope = item => entityCourseIndex(item.entity) === state.courseIndex
    && (state.scope === 'all' || item.category === 'pickup');
  const renderEntityOptions = () => {
    const scoped = editorEntities().filter(entityInScope);
    if (!scoped.some(item => item.entity.id === state.selectedId)) state.selectedId = scoped[0]?.entity.id ?? null;
    fields.entity.replaceChildren();
    for (const { entity, category } of scoped) {
      const option = document.createElement('option');
      option.value = entity.id;
      option.textContent = `${category === 'pickup' ? '◆' : category === 'platform' ? '▬' : '●'} ${entity.id}`;
      fields.entity.append(option);
    }
  };
  const editableSnapshot = () => structuredClone({
    platforms: stage.platforms,
    pickups: stage.pickups,
    objects: stage.objects,
    actorSpawnMarkers: stage.editorActors,
  });
  const recordHistory = () => {
    const snapshot = editableSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (JSON.stringify(state.history[state.historyIndex]) === serialized) return;
    state.history.splice(state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > 60) state.history.shift();
    state.historyIndex = state.history.length - 1;
  };
  renderEntityOptions();
  recordHistory();
  const selectEntity = (id, additive = false) => {
    state.selectedId = id;
    if (!additive) state.selectedIds.clear();
    if (additive && state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
    if (!state.selectedIds.size) state.selectedIds.add(id);
    const item = selectedItem();
    const preferredSnap = prefabRegistry.prefabs[item?.entity.prefab]?.editor?.snap;
    if (preferredSnap) {
      state.snap = preferredSnap;
      fields.snap.value = String(preferredSnap);
    }
    if (item?.entity && (item.entity.y < view.top + 80 || item.entity.y > view.top + view.height - 80)) {
      view.top = Math.max(0, Math.min(stage.world.height - view.height, item.entity.y - view.height * .55));
    }
    updatePanel();
  };
  const persist = (addToHistory = true) => {
    hydrateStage(stage, moduleSpec, prefabRegistry);
    const patch = makeStagePatch(baseStage, stage, prefabRegistry, fields.note.value.trim());
    saveLocalStagePatch(patch);
    onChange(buildCollisionShapes(stage, prefabRegistry));
    if (addToHistory) recordHistory();
    state.dirtyFiles.add(selectedItem()?.category === 'actor' ? 'hooks' : 'objects');
    saveStatus.textContent = '● 未保存';
    saveStatus.classList.add('is-dirty');
    updatePanel();
  };

  const restoreHistory = index => {
    const snapshot = state.history[index];
    if (!snapshot) return;
    for (const key of ['platforms', 'pickups', 'objects']) stage[key].splice(0, stage[key].length, ...structuredClone(snapshot[key]));
    stage.editorActors.splice(0, stage.editorActors.length, ...structuredClone(snapshot.actorSpawnMarkers));
    hooks.actorSpawnMarkers = stage.editorActors;
    onActorsChange?.();
    state.historyIndex = index;
    persist(false);
  };

  function updatePanel() {
    const item = selectedItem();
    if (!item) return;
    const { entity, category } = item;
    fields.entity.value = entity.id;
    fields.x.value = Math.round(entity.x);
    fields.y.value = Math.round(entity.y);
    fields.x.disabled = !allowed(entity, 'x');
    fields.y.disabled = !allowed(entity, 'y');
    platformFields.hidden = category !== 'platform';
    staircase.hidden = category !== 'platform';
    const hasMotion = category === 'platform' && allowed(entity, 'motionAxis');
    const hasGrowth = category === 'platform' && allowed(entity, 'direction');
    motionFields.hidden = !hasMotion;
    growthFields.hidden = !hasGrowth;
    if (category === 'platform') {
      fields.modules.value = entity.modules;
      fields.pattern.value = entity.pattern;
    }
    if (hasMotion) {
      fields.motionAxis.value = entity.motionAxis;
      fields.motionDistance.value = entity.motionDistance;
      fields.motionPeriod.value = entity.motionPeriod;
      fields.motionPhase.value = entity.motionPhase;
    }
    if (hasGrowth) {
      fields.direction.value = entity.direction;
      for (const key of ['length', 'growthSpeed', 'activeDuration', 'collapseDuration', 'segmentSpacing']) {
        fields[key].value = entity[key];
      }
    }
    meta.prefab.textContent = entity.prefab;
    const section = sectionAtX(stage, entity.x, entity.y);
    meta.section.textContent = section ? `${section.label} // ${section.id}` : '区間外';
    fields.camera.max = Math.max(0, stage.world.width - view.width);
    fields.camera.value = Math.min(Number(fields.camera.max), getCameraX());
    const patch = makeStagePatch(baseStage, stage, prefabRegistry, fields.note.value.trim());
    const validation = validateStage(stage, prefabRegistry);
    const count = Object.keys(patch.changes).length;
    panel.querySelector('[data-editor-action="undo"]').disabled = state.historyIndex <= 0;
    panel.querySelector('[data-editor-action="redo"]').disabled = state.historyIndex >= state.history.length - 1;
    status.classList.toggle('has-error', !validation.valid);
    status.textContent = validation.valid
      ? `下書き ${count}件 / 規格チェックOK`
      : `規格エラー: ${validation.errors[0]}`;
    drawMinimap();
  }

  function setEntityPosition(x, y) {
    const item = selectedItem();
    if (!item) return;
    if (allowed(item.entity, 'x')) item.entity.x = Math.max(-500, Math.min(stage.world.width + 500, snapValue(x)));
    if (allowed(item.entity, 'y')) item.entity.y = Math.max(-500, Math.min(stage.world.height + 500, snapValue(y)));
    persist();
  }

  const worldPoint = event => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * view.width + getCameraX(),
      y: view.top + (event.clientY - rect.top) / rect.height * view.height,
    };
  };

  const courseMeta = () => stage.courses[state.courseIndex];
  const courseTransform = index => ({
    prefix: index === 0 ? 'c1-' : index === 2 ? 'c3-' : '',
    x: index * courseLayout.courseLength,
    y: index * courseLayout.courseVerticalOffset,
  });
  const localId = (id, prefix) => prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
  const worldId = (id, prefix) => prefix ? `${prefix}${id}` : id;
  const selectedEntities = () => [...state.selectedIds]
    .map(id => editorEntities().find(item => item.entity.id === id)).filter(Boolean);
  const findGroundSurface = (x, y) => {
    const surfaces = [
      ...stage.floorBands.filter(band => x >= band.xStart && x <= band.xEnd).map(band => band.y),
      ...stage.platforms.filter(platform => x >= platform.x && x <= platform.x + (platform.w ?? 0) && platform.y >= y - 40).map(platform => platform.y),
    ].filter(surface => surface >= y - 40).sort((a, b) => a - b);
    return surfaces[0] ?? y;
  };
  const applyPlacementSnap = (entity, rule, altKey = false) => {
    if (altKey || rule.snap === 'none') return;
    if (rule.snap === 'ground') {
      const surface = findGroundSurface(entity.x + (entity.w ?? 0) / 2, entity.y);
      entity.y = surface - (entity.h ?? 0);
    } else if (rule.snap === 'shelf') {
      const index = entityCourseIndex(entity);
      const localBottom = Math.max(...stage.floorBands.filter(band => band.id.startsWith(`course-${index + 1}-`)).map(band => band.y));
      entity.y = localBottom + Math.round((entity.y - localBottom) / 154) * 154;
    }
  };
  const nextId = prefab => {
    const stem = prefab.replace(/-v\d+$/, '').split('-').slice(0, 2).join('-');
    const ids = new Set(editorEntities().map(item => item.entity.id.replace(/^(c1-|c3-)/, '')));
    for (let index = 1; index < 100; index += 1) {
      const id = `${stem}-${String(index).padStart(2, '0')}`;
      if (!ids.has(id)) return worldId(id, courseTransform(state.courseIndex).prefix);
    }
    return worldId(`${stem}-${Date.now()}`, courseTransform(state.courseIndex).prefix);
  };
  const defaultEntity = (prefab, x, y) => {
    const rule = prefabPlacement[prefab];
    const category = prefabRegistry.prefabs[prefab]?.category;
    const entity = { id: nextId(prefab), prefab, x, y };
    if (rule.target === 'platforms') {
      const defaults = prefabRegistry.prefabs[prefab]?.defaults ?? { modules: 1, pattern: 'A' };
      Object.assign(entity, defaults);
    }
    if (rule.target === 'objects') Object.assign(entity, { type: category === 'hazard' ? 'hazard' : 'midgroundDecor', w: 120, h: 100 });
    if (rule.target === 'actorSpawnMarkers') Object.assign(entity, { type: 'enemy', w: 120, h: 104, patrol: { minX: x - 100, maxX: x + 100, speed: 60 }, renderOrder: 8 });
    return entity;
  };
  const targetArray = target => target === 'actorSpawnMarkers' ? stage.editorActors : stage[target];
  const addEntity = (prefab, x, y, altKey = false) => {
    const rule = prefabPlacement[prefab];
    if (!rule) return;
    const entity = defaultEntity(prefab, x, y);
    applyPlacementSnap(entity, rule, altKey);
    targetArray(rule.target).push(entity);
    if (rule.target === 'actorSpawnMarkers') onActorsChange?.();
    state.selectedIds = new Set([entity.id]);
    state.selectedId = entity.id;
    if (coarse) {
      state.lastPlacedId = entity.id;
      state.highlightId = entity.id;
      state.highlightUntil = performance.now() + 600;
    }
    state.dirtyFiles.add(rule.target === 'actorSpawnMarkers' ? 'hooks' : 'objects');
    hydrateStage(stage, moduleSpec, prefabRegistry);
    renderEntityOptions();
    persist();
  };
  const referencedBy = id => [
    ...stage.platforms, ...stage.objects, ...hooks.encounterTriggers,
  ].filter(entity => ['activateTargetId', 'nozzleId', 'attachedToTargetId', 'linkedTargetId', 'nearEntityId']
    .some(key => entity[key] === id) || entity.activateTargetIds?.includes(id));
  const removeSelection = () => {
    const references = [...state.selectedIds].flatMap(referencedBy);
    if (references.length && !window.confirm(`参照中のパーツがあります（${references.map(item => item.id).join(', ')}）。削除しますか？`)) return;
    for (const item of selectedEntities()) {
      const list = targetArray(item.group === 'actorSpawnMarkers' ? 'actorSpawnMarkers' : item.group);
      const index = list.indexOf(item.entity);
      if (index >= 0) list.splice(index, 1);
    }
    onActorsChange?.();
    state.selectedIds.clear();
    state.selectedId = editorEntities()[0]?.entity.id ?? null;
    if (state.selectedId) state.selectedIds.add(state.selectedId);
    renderEntityOptions();
    persist();
  };
  function duplicateSelection(destination = null) {
    const items = selectedEntities();
    if (!items.length) return;
    const anchor = items[0].entity;
    const dx = destination ? destination.x - anchor.x : moduleSpec.middleWidth - moduleSpec.jointOverlap;
    const dy = destination ? destination.y - anchor.y : 0;
    const ids = new Set();
    for (const item of items) {
      const copy = structuredClone(item.entity);
      copy.id = nextId(copy.prefab);
      copy.x += dx;
      copy.y += dy;
      targetArray(item.group === 'actorSpawnMarkers' ? 'actorSpawnMarkers' : item.group).push(copy);
      ids.add(copy.id);
    }
    state.selectedIds = ids;
    state.selectedId = [...ids][0];
    onActorsChange?.();
    hydrateStage(stage, moduleSpec, prefabRegistry);
    renderEntityOptions();
    persist();
  }

  const localizeEntity = (entity, index) => {
    const transform = courseTransform(index);
    const result = structuredClone(entity);
    result.id = localId(result.id, transform.prefix);
    result.x -= transform.x;
    result.y -= transform.y;
    if (result.emitterX != null) result.emitterX -= transform.x;
    for (const key of ['activatedBy', 'nozzleId', 'attachedToTargetId', 'activateTargetId', 'linkedTargetId']) {
      if (result[key]) result[key] = localId(result[key], transform.prefix);
    }
    if (result.activateTargetIds) result.activateTargetIds = result.activateTargetIds.map(id => localId(id, transform.prefix));
    if (result.respawn) result.respawn = { x: result.respawn.x - transform.x, y: result.respawn.y - transform.y };
    for (const key of ['runtimeX', 'runtimeY', 'runtimeProgress', 'runtimeFrame', 'growthState', 'active', 'activationStartedAt']) delete result[key];
    return result;
  };
  const serializeCourse = index => {
    const transform = courseTransform(index);
    const meta = stage.courses[index];
    const inCourse = entity => entity.x >= meta.xStart - 500 && entity.x < meta.xEnd;
    const source = structuredClone(courseSources[index]);
    source.platforms = stage.platforms.filter(inCourse).map(entity => localizeEntity(entity, index));
    source.pickups = stage.pickups.filter(inCourse).map(entity => localizeEntity(entity, index));
    source.objects = stage.objects.filter(inCourse).map(entity => localizeEntity(entity, index));
    source.sections = stage.sections.filter(section => section.xStart >= meta.xStart && section.xStart < meta.xEnd).map(section => ({
      ...structuredClone(section), id: section.id.replace(/^course-\d+-/, ''), xStart: section.xStart - transform.x, xEnd: section.xEnd - transform.x,
    }));
    source.floorBands = stage.floorBands.filter(band => band.xStart >= meta.xStart && band.xStart < meta.xEnd).map(band => ({
      ...structuredClone(band), id: band.id.replace(/^course-\d+-/, ''), xStart: band.xStart - transform.x, xEnd: band.xEnd - transform.x, y: band.y - transform.y,
    }));
    source.descentPoints = stage.descentPoints.filter(point => point.x >= meta.xStart && point.x < meta.xEnd).map(point => ({
      ...structuredClone(point), id: point.id.replace(/^course-\d+-/, ''), x: point.x - transform.x,
    }));
    const actorSpawnMarkers = stage.editorActors.filter(inCourse).map(actor => {
      const local = localizeEntity(actor, index);
      if (local.patrol) local.patrol = { ...local.patrol, minX: actor.patrol.minX - transform.x, maxX: actor.patrol.maxX - transform.x };
      return local;
    });
    const localEntityIds = new Set([...source.platforms, ...source.pickups, ...source.objects, ...actorSpawnMarkers].map(entity => entity.id));
    const encounterTriggers = hooks.encounterTriggers.filter(trigger => trigger.nearEntityId
      ? localEntityIds.has(localId(trigger.nearEntityId, transform.prefix))
      : trigger.x >= meta.xStart && trigger.x < meta.xEnd).map(trigger => {
      const local = structuredClone(trigger);
      local.id = localId(local.id, transform.prefix);
      if (local.nearEntityId) local.nearEntityId = localId(local.nearEntityId, transform.prefix);
      if (local.x != null) local.x -= transform.x;
      if (local.y != null) local.y -= transform.y;
      return local;
    });
    const hookSource = structuredClone(courseHookSources[index]);
    hookSource.actorSpawnMarkers = actorSpawnMarkers;
    hookSource.encounterTriggers = encounterTriggers;
    return { objects: source, hooks: hookSource };
  };
  const saveFile = async (file, value) => {
    const response = await fetch('/__editor/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, content: `${JSON.stringify(value, null, 2)}\n` }),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) throw new Error('保存サーバがありません（公開版では持ち帰りモードを使ってください）');
    const result = await response.json();
    if (!result.ok) throw new Error(result.output || `保存失敗 HTTP ${response.status}`);
    return result;
  };
  const saveCourse = async () => {
    if (!state.serverAvailable) {
      const { patch } = patchAndContext();
      try {
        await navigator.clipboard.writeText(JSON.stringify(patch, null, 2));
        saveStatus.textContent = '差分をコピーしました。チャットに貼ってください';
      } catch { saveStatus.textContent = '差分JSONを書き出してチャットに貼ってください'; }
      return;
    }
    const number = String(state.courseIndex + 1).padStart(2, '0');
    const serialized = serializeCourse(state.courseIndex);
    saveStatus.textContent = '保存中…';
    saveStatus.classList.remove('has-error');
    try {
      if (state.dirtyFiles.has('objects')) await saveFile(`data/course-${number}-objects.json`, serialized.objects);
      if (state.dirtyFiles.has('hooks')) await saveFile(`data/course-${number}-hooks.json`, serialized.hooks);
      state.dirtyFiles.clear();
      saveStatus.textContent = '✓ 保存しました';
      saveStatus.classList.remove('is-dirty');
    } catch (error) {
      saveStatus.textContent = `保存失敗: ${error instanceof Error ? error.message : String(error)}`;
      saveStatus.classList.add('has-error');
    }
  };
  fetch('/__editor/ping').then(async response => {
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return false;
    return Boolean((await response.json()).ok);
  }).catch(() => false).then(available => {
    state.serverAvailable = available;
    panel.querySelector('[data-editor-action="save"]').textContent = available ? '保存' : '持ち帰る';
  });

  const groupedPlacement = Object.entries(prefabPlacement).reduce((groups, entry) => {
    (groups[entry[1].group] ??= []).push(entry);
    return groups;
  }, {});
  const thumbnailFor = prefab => ({
    'lab-platform-v1': imagePaths.midA, 'lab-bridge-v1': imagePaths.stripMiddle,
    'lab-bridge-short-v1': imagePaths.stripCapLeft,
    'moving-platform-v1': imagePaths.midB, 'lab-lift-v1': imagePaths.liftIdle,
    'crystal-growth-horizontal-v1': imagePaths.crystalInvertedCorePlatform,
    'crystal-growth-vertical-v1': imagePaths.crystalVertical4,
    'data-crystal-v1': imagePaths.pickup1, 'lab-coin-v1': imagePaths.labCoin,
    'cat-can-v1': imagePaths.catCan, 'fish-drink-v1': imagePaths.fishDrink,
    'future-heart-v1': imagePaths.futureHeart, 'nyabi-clean-v1': imagePaths.nyabiClean1,
    'neji-nyabi-v1': imagePaths.nejiNyabi1, 'nyabi-drone-v1': imagePaths.nyabiDrone1,
    'crystal-hazard-v1': imagePaths.crystalHazardMassive3, 'lab-switch-v1': imagePaths.switchOff,
    'checkpoint-v1': imagePaths.checkpoint,
  })[prefab];
  for (const [group, rules] of Object.entries(groupedPlacement)) {
    const details = document.createElement('details');
    details.open = group === '床・足場';
    details.innerHTML = `<summary>${group}</summary>`;
    for (const [prefab, rule] of rules) {
      const button = document.createElement('button');
      button.type = 'button';
      button.draggable = true;
      button.dataset.prefab = prefab;
      const thumbnail = thumbnailFor(prefab);
      if (thumbnail) button.innerHTML = `<img src="${runtimeUrl(thumbnail)}" alt=""><span>${rule.label}</span>`;
      else button.innerHTML = `<i aria-hidden="true"></i><span>${rule.label}</span>`;
      button.title = prefab;
      button.addEventListener('dragstart', event => event.dataTransfer.setData('application/x-prefab', prefab));
      button.addEventListener('click', () => {
        if (!coarse) return;
        state.placementPrefab = prefab;
        state.mobileTab = 'place';
        updateMobileUi();
        onToast(`配置中: ${rule.label} // 盤面をタップ`, 2);
      });
      details.append(button);
    }
    palette.append(details);
  }
  const mobileAction = name => panel.querySelector(`[data-mobile-action="${name}"]`);
  function updateMobileUi() {
    panel.dataset.mobileTab = state.mobileTab;
    panel.querySelectorAll('[data-mobile-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.mobileTab === state.mobileTab));
    mobileAction('cancel-place').hidden = !state.placementPrefab;
    mobileAction('unsnap').textContent = `吸着${state.unsnapped ? 'OFF' : 'ON'}`;
    palette.querySelectorAll('[data-prefab]').forEach(button => button.classList.toggle('is-active', button.dataset.prefab === state.placementPrefab));
  }
  panel.querySelectorAll('[data-mobile-tab]').forEach(button => button.addEventListener('click', () => {
    state.mobileTab = button.dataset.mobileTab;
    if (state.mobileTab !== 'place') state.placementPrefab = null;
    updateMobileUi();
  }));
  mobileAction('duplicate').addEventListener('click', () => duplicateSelection());
  mobileAction('last').addEventListener('click', () => {
    if (state.lastPlacedId && editorEntities().some(item => item.entity.id === state.lastPlacedId)) selectEntity(state.lastPlacedId);
  });
  mobileAction('undo').addEventListener('click', () => {
    if (state.historyIndex > 0) restoreHistory(state.historyIndex - 1);
  });
  panel.querySelector('[data-mobile-snap]').addEventListener('change', event => {
    state.snap = Number(event.target.value);
    fields.snap.value = event.target.value;
  });
  mobileAction('guide').addEventListener('click', () => {
    state.guidePinned = !state.guidePinned;
    state.guideEntity = state.guidePinned && selectedItem()?.category === 'platform' ? selectedItem().entity : null;
  });
  mobileAction('unsnap').addEventListener('click', () => { state.unsnapped = !state.unsnapped; updateMobileUi(); });
  mobileAction('cancel-place').addEventListener('click', () => { state.placementPrefab = null; updateMobileUi(); });
  mobileAction('delete').addEventListener('click', () => {
    if (!state.deleteArmed) {
      state.deleteArmed = true;
      mobileAction('delete').textContent = '消す？';
      setTimeout(() => { state.deleteArmed = false; mobileAction('delete').textContent = '削除'; }, 2200);
      return;
    }
    state.deleteArmed = false;
    mobileAction('delete').textContent = '削除';
    removeSelection();
  });
  updateMobileUi();
  canvas.addEventListener('dragover', event => {
    if (!state.active || !event.dataTransfer.types.includes('application/x-prefab')) return;
    event.preventDefault();
  });
  canvas.addEventListener('drop', event => {
    if (!state.active) return;
    const prefab = event.dataTransfer.getData('application/x-prefab');
    if (!prefab) return;
    event.preventDefault();
    const point = worldPoint(event);
    addEntity(prefab, point.x, point.y, event.altKey);
  });

  stage.courses.forEach((course, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `コース${index + 1} ${course.label}`;
    button.addEventListener('click', () => {
      if (state.dirtyFiles.size && !window.confirm('未保存の変更があります。コースを切り替えますか？')) return;
      state.courseIndex = index;
      setCameraX(course.xStart);
      view.top = index * courseLayout.courseVerticalOffset;
      renderEntityOptions();
      renderSectionButtons();
      const first = editorEntities().find(entityInScope)?.entity.id;
      if (first) selectEntity(first);
      [...courseTabs.children].forEach((tab, tabIndex) => tab.classList.toggle('is-active', tabIndex === index));
      drawMinimap();
    });
    courseTabs.append(button);
  });
  courseTabs.firstElementChild?.classList.add('is-active');

  function drawMinimap() {
    const ctx = minimap.getContext('2d');
    const course = courseMeta();
    const transform = courseTransform(state.courseIndex);
    const sx = minimap.width / courseLayout.courseLength;
    ctx.clearRect(0, 0, minimap.width, minimap.height);
    ctx.fillStyle = '#06172b'; ctx.fillRect(0, 0, minimap.width, minimap.height);
    for (const platform of stage.platforms.filter(entity => entityCourseIndex(entity) === state.courseIndex)) {
      ctx.fillStyle = '#8795a5'; ctx.fillRect((platform.x - transform.x) * sx, 44, Math.max(2, (platform.w ?? 20) * sx), 8);
    }
    for (const actor of stage.editorActors.filter(entity => entityCourseIndex(entity) === state.courseIndex)) {
      ctx.fillStyle = '#ff566d'; ctx.fillRect((actor.x - transform.x) * sx, 30, 4, 12);
    }
    for (const pickup of stage.pickups.filter(entity => entityCourseIndex(entity) === state.courseIndex)) {
      ctx.fillStyle = '#ffd657'; ctx.fillRect((pickup.x - transform.x) * sx, 58, 3, 8);
    }
    for (const object of stage.objects.filter(entity => entityCourseIndex(entity) === state.courseIndex)) {
      ctx.fillStyle = '#49bfff'; ctx.fillRect((object.x - transform.x) * sx, 68, 3, 8);
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect((getCameraX() - course.xStart) * sx, 4, view.width * sx, minimap.height - 8);
    ctx.font = '10px system-ui'; ctx.fillStyle = '#cceeff';
    for (const section of stage.sections.filter(section => section.xStart >= course.xStart && section.xStart < course.xEnd)) {
      const x = (section.xStart - course.xStart) * sx;
      ctx.fillRect(x, 0, 1, 12); ctx.fillText(section.label, x + 2, 11);
    }
  }
  const minimapMove = event => {
    const rect = minimap.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * courseLayout.courseLength + courseMeta().xStart;
    setCameraX(x - view.width / 2);
    drawMinimap();
  };
  minimap.addEventListener('pointerdown', event => { minimap.setPointerCapture(event.pointerId); minimapMove(event); });
  minimap.addEventListener('pointermove', event => { if (minimap.hasPointerCapture(event.pointerId)) minimapMove(event); });

  const stopPlaytest = () => {
    if (!state.playtesting) return;
    state.playtesting = false;
    onPlaytest?.({ active: false, snapshot: state.playtestSnapshot });
    state.playtestSnapshot = null;
    returnButton.hidden = true;
    toggle(true);
    onToast('試遊を終了し、編集位置へ戻りました', 1.8);
  };
  const returnButton = document.createElement('button');
  returnButton.type = 'button';
  returnButton.className = 'stage-editor-return';
  returnButton.textContent = '編集にもどる';
  returnButton.hidden = true;
  returnButton.addEventListener('click', stopPlaytest);
  shell.append(returnButton);
  const startPlaytest = () => {
    const item = selectedItem();
    if (!item) return;
    state.playtestSnapshot = { cameraX: getCameraX(), top: view.top };
    state.playtesting = true;
    returnButton.hidden = false;
    onPlaytest?.({ active: true, x: item.entity.x, y: item.entity.y, snapshot: state.playtestSnapshot });
    toggle(false);
    onToast('試遊中 // Escで編集へ戻る', 2);
  };
  panel.querySelector('[data-editor-action="save"]').addEventListener('click', saveCourse);
  panel.querySelector('[data-editor-action="playtest"]').addEventListener('click', startPlaytest);

  panel.querySelector('[data-editor-action="staircase"]').addEventListener('click', () => {
    const item = selectedItem();
    if (!item || item.category !== 'platform') return;
    const count = Math.max(2, Math.min(6, Math.round(Number(stairFields.count.value))));
    const dx = Number(stairFields.dx.value);
    const dy = Number(stairFields.dy.value);
    const created = new Set([item.entity.id]);
    for (let index = 1; index < count; index += 1) {
      const copy = structuredClone(item.entity);
      copy.id = nextId(copy.prefab);
      copy.x = item.entity.x + dx * index;
      copy.y = item.entity.y + dy * index;
      stage.platforms.push(copy);
      created.add(copy.id);
    }
    state.selectedIds = created;
    state.selectedId = item.entity.id;
    hydrateStage(stage, moduleSpec, prefabRegistry);
    renderEntityOptions();
    persist();
  });

  canvas.addEventListener('wheel', event => {
    if (!state.active) return;
    event.preventDefault();
    const before = worldPoint(event);
    state.zoom = Math.max(.125, Math.min(1, state.zoom * (event.deltaY > 0 ? .8 : 1.25)));
    view.width = state.baseView.width / state.zoom;
    view.height = state.baseView.height / state.zoom;
    const after = worldPoint(event);
    setCameraX(getCameraX() + before.x - after.x);
    view.top = Math.max(0, Math.min(stage.world.height - view.height, view.top + before.y - after.y));
    updatePanel();
  }, { passive: false });

  const pickAt = point => {
    const candidates = [];
    for (const item of editorEntities()) {
      if (!coarse && !entityInScope(item)) continue;
      const { entity, category } = item;
      if (coarse) {
        const left = entity.x;
        const right = entity.x + (entity.w ?? 0);
        const top = category === 'platform' ? entity.y - 36 : entity.y;
        const bottom = category === 'platform' ? entity.y + 20 : entity.y + (entity.h ?? 0);
        const nearestX = Math.max(left, Math.min(right, point.x));
        const nearestY = Math.max(top, Math.min(bottom, point.y));
        const distance = Math.hypot(point.x - nearestX, point.y - nearestY);
        if (distance <= 44 / state.zoom) {
          candidates.push({ item, score: distance });
          continue;
        }
      }
      if (category === 'pickup') {
        const distance = Math.hypot(point.x - entity.x, point.y - entity.y);
        if (distance <= 58) candidates.push({ item, score: distance });
      } else if (category === 'object' || category === 'actor') {
        if (point.x >= entity.x && point.x <= entity.x + entity.w && point.y >= entity.y && point.y <= entity.y + entity.h) {
          candidates.push({ item, score: 20 });
        }
      } else if (point.x >= entity.x && point.x <= entity.x + entity.w && Math.abs(point.y - entity.y) <= 42) {
        candidates.push({ item, score: 40 });
      }
    }
    return candidates.sort((a, b) => a.score - b.score).map(candidate => candidate.item);
  };

  canvas.addEventListener('pointerdown', event => {
    if (!state.active) return;
    event.preventDefault();
    const point = worldPoint(event);
    if (coarse && state.placementPrefab && event.pointerType !== 'mouse') {
      const existing = pickAt(point);
      if (!existing.length) {
        addEntity(state.placementPrefab, point.x, point.y - 60 / state.zoom, state.unsnapped);
        return;
      }
      state.placementPrefab = null;
      updateMobileUi();
    }
    if (coarse && event.pointerType !== 'mouse') {
      state.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (state.touchPointers.size >= 2) {
        const points = [...state.touchPointers.values()];
        state.pinchStart = { distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y), zoom: state.zoom, centerX: (points[0].x + points[1].x) / 2, centerY: (points[0].y + points[1].y) / 2, cameraX: getCameraX(), top: view.top };
        state.dragging = false;
        return;
      }
    }
    if (event.button === 1) {
      state.panning = true;
      state.panStart = { clientX: event.clientX, clientY: event.clientY, cameraX: getCameraX(), top: view.top };
      return;
    }
    const candidates = pickAt(point);
    if (!candidates.length) {
      if (coarse) {
        state.panning = true;
        state.panStart = { clientX: event.clientX, clientY: event.clientY, cameraX: getCameraX(), top: view.top };
      }
      return;
    }
    const pickKey = candidates.map(item => item.entity.id).join('|');
    state.lastPickIndex = pickKey === state.lastPickKey ? (state.lastPickIndex + 1) % candidates.length : 0;
    state.lastPickKey = pickKey;
    const hit = candidates[state.lastPickIndex];
    if (event.altKey) duplicateSelection({ x: point.x, y: point.y });
    selectEntity(hit.entity.id, event.shiftKey);
    state.dragging = true;
    state.dragOrigin = { x: hit.entity.x, y: hit.entity.y };
    state.guideEntity = hit.category === 'platform' ? hit.entity : null;
    state.dragOffset = { x: point.x - hit.entity.x, y: point.y - hit.entity.y + (coarse ? 60 / state.zoom : 0) };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!state.active) return;
    if (coarse && state.touchPointers.has(event.pointerId)) {
      state.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.touchPointers.size >= 2 && state.pinchStart) {
        const points = [...state.touchPointers.values()];
        const distance = Math.max(20, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
        const centerX = (points[0].x + points[1].x) / 2;
        const centerY = (points[0].y + points[1].y) / 2;
        state.zoom = Math.max(.125, Math.min(1, state.pinchStart.zoom * distance / state.pinchStart.distance));
        view.width = state.baseView.width / state.zoom;
        view.height = state.baseView.height / state.zoom;
        setCameraX(state.pinchStart.cameraX - (centerX - state.pinchStart.centerX) / canvas.clientWidth * view.width);
        view.top = Math.max(0, Math.min(stage.world.height - view.height, state.pinchStart.top - (centerY - state.pinchStart.centerY) / canvas.clientHeight * view.height));
        return;
      }
    }
    if (state.panning && state.panStart) {
      const rect = canvas.getBoundingClientRect();
      setCameraX(state.panStart.cameraX - (event.clientX - state.panStart.clientX) / rect.width * view.width);
      view.top = Math.max(0, Math.min(stage.world.height - view.height, state.panStart.top - (event.clientY - (state.panStart.clientY ?? event.clientY)) / rect.height * view.height));
      return;
    }
    if (!state.dragging) return;
    const point = worldPoint(event);
    const item = selectedItem();
    if (!item) return;
    const nextX = Math.max(coarse ? 0 : -500, Math.min(coarse ? stage.world.width - (item.entity.w ?? 0) : stage.world.width + 500, snapValue(point.x - state.dragOffset.x)));
    const nextY = Math.max(coarse ? 0 : -500, Math.min(coarse ? stage.world.height - (item.entity.h ?? 0) : stage.world.height + 500, snapValue(point.y - state.dragOffset.y)));
    const dx = nextX - item.entity.x;
    const dy = nextY - item.entity.y;
    for (const id of state.selectedIds) {
      const selected = editorEntities().find(candidate => candidate.entity.id === id)?.entity;
      if (!selected) continue;
      if (allowed(selected, 'x')) selected.x += dx;
      if (allowed(selected, 'y')) selected.y += dy;
    }
    persist(false);
  });
  const stopDrag = () => {
    if (state.dragging) recordHistory();
    state.dragging = false;
    state.panning = false;
    state.panStart = null;
    state.touchPointers.clear();
    state.pinchStart = null;
    if (!state.guidePinned) state.guideEntity = null;
    state.dragOrigin = null;
    updatePanel();
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  fields.entity.addEventListener('change', () => selectEntity(fields.entity.value));
  fields.scope.addEventListener('change', () => {
    state.scope = fields.scope.value === 'all' ? 'all' : 'pickups';
    renderEntityOptions();
    selectEntity(state.selectedId);
  });
  fields.snap.addEventListener('change', () => { state.snap = Number(fields.snap.value); });
  fields.camera.addEventListener('input', () => setCameraX(Number(fields.camera.value)));
  fields.note.addEventListener('input', persist);
  for (const key of ['x', 'y']) {
    fields[key].addEventListener('change', () => {
      const item = selectedItem();
      if (!item || !allowed(item.entity, key)) return;
      item.entity[key] = snapValue(Number(fields[key].value));
      persist();
    });
  }
  fields.modules.addEventListener('change', () => {
    const item = selectedItem();
    if (!item || !allowed(item.entity, 'modules')) return;
    const rules = prefabRegistry.prefabs[item.entity.prefab].constraints.modules;
    const modules = Math.max(rules.min, Math.min(rules.max, Math.round(Number(fields.modules.value))));
    item.entity.modules = modules;
    item.entity.pattern = Array.from({ length: modules }, (_, index) => item.entity.pattern[index] ?? (index % 2 ? 'B' : 'A')).join('');
    persist();
  });
  fields.pattern.addEventListener('change', () => {
    const item = selectedItem();
    if (!item || !allowed(item.entity, 'pattern')) return;
    const clean = fields.pattern.value.toUpperCase().replace(/[^AB]/g, '').slice(0, item.entity.modules);
    item.entity.pattern = clean.padEnd(item.entity.modules, 'A');
    persist();
  });
  fields.motionAxis.addEventListener('change', () => {
    const item = selectedItem();
    if (!item || !allowed(item.entity, 'motionAxis')) return;
    item.entity.motionAxis = fields.motionAxis.value === 'y' ? 'y' : 'x';
    persist();
  });
  fields.direction.addEventListener('change', () => {
    const item = selectedItem();
    if (!item || !allowed(item.entity, 'direction')) return;
    item.entity.direction = ['right', 'left', 'up', 'down'].includes(fields.direction.value) ? fields.direction.value : 'right';
    persist();
  });
  for (const key of ['length', 'growthSpeed', 'activeDuration', 'collapseDuration', 'segmentSpacing']) {
    fields[key].addEventListener('change', () => {
      const item = selectedItem();
      if (!item || !allowed(item.entity, key)) return;
      const limits = prefabRegistry.prefabs[item.entity.prefab].constraints[key];
      const value = key === 'length' ? Math.round(Number(fields[key].value)) : Number(fields[key].value);
      item.entity[key] = Math.max(limits.min, Math.min(limits.max, value));
      persist();
    });
  }
  for (const key of ['motionDistance', 'motionPeriod', 'motionPhase']) {
    fields[key].addEventListener('change', () => {
      const item = selectedItem();
      if (!item || !allowed(item.entity, key)) return;
      const limits = prefabRegistry.prefabs[item.entity.prefab].constraints[key];
      item.entity[key] = Math.max(limits.min, Math.min(limits.max, Number(fields[key].value)));
      persist();
    });
  }
  panel.querySelectorAll('[data-nudge-x]').forEach(button => button.addEventListener('click', () => {
    const item = selectedItem();
    if (!item) return;
    setEntityPosition(item.entity.x + Number(button.dataset.nudgeX) * state.snap, item.entity.y + Number(button.dataset.nudgeY) * state.snap);
  }));
  panel.querySelector('[data-editor-action="undo"]').addEventListener('click', () => {
    if (state.historyIndex <= 0) return;
    restoreHistory(state.historyIndex - 1);
    onToast('1つ前の配置へ戻しました', 1.5);
  });
  panel.querySelector('[data-editor-action="redo"]').addEventListener('click', () => {
    if (state.historyIndex >= state.history.length - 1) return;
    restoreHistory(state.historyIndex + 1);
    onToast('配置をやり直しました', 1.5);
  });

  const patchAndContext = () => {
    const patch = makeStagePatch(baseStage, stage, prefabRegistry, fields.note.value.trim());
    const selected = selectedItem()?.entity;
    const section = selected ? sectionAtX(stage, selected.x, selected.y) : null;
    const nearby = selected
      ? allStageEntities(stage).map(item => item.entity).filter(entity => Math.abs(entity.x - selected.x) <= 450)
        .map(entity => ({ id: entity.id, prefab: entity.prefab, x: Math.round(entity.x), y: Math.round(entity.y) }))
      : [];
    return { patch, section, nearby };
  };

  panel.querySelector('[data-editor-action="copy"]').addEventListener('click', async () => {
    const { patch, section, nearby } = patchAndContext();
    const brief = [
      `「${stage.stageId}」の${section?.label ?? '選択区間'}を修正してください。`,
      fields.note.value.trim() || '現在の配置差分を反映し、区間のテンポを改善してください。',
      `区間の狙い: ${section?.intent ?? '未設定'}`,
      `編集差分:\n${JSON.stringify(patch, null, 2)}`,
      `周辺要素:\n${JSON.stringify(nearby, null, 2)}`,
      'プレハブ規格・接地面・画像倍率は変更せず、validate:stage と validate:contact を通してください。',
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(brief);
      onToast('AI用の修正指示をコピーしました', 2);
    } catch {
      onToast('コピーできませんでした。差分JSONを書き出してください', 2.5);
    }
  });
  panel.querySelector('[data-editor-action="export"]').addEventListener('click', () => {
    const { patch } = patchAndContext();
    const blob = new Blob([`${JSON.stringify(patch, null, 2)}\n`], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${stage.stageId}-editor-patch.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    onToast('差分JSONを書き出しました', 2);
  });
  panel.querySelector('[data-editor-action="reset"]').addEventListener('click', () => {
    if (!window.confirm('ローカル下書きを破棄して元のステージへ戻しますか？')) return;
    clearLocalStagePatch(stage.stageId);
    window.location.reload();
  });
  panel.querySelector('[data-editor-action="close"]').addEventListener('click', () => toggle(false));

  window.addEventListener('keydown', event => {
    if (state.playtesting && event.code === 'Escape') {
      event.preventDefault();
      stopPlaytest();
      return;
    }
    if (!state.active) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.code === 'KeyS') {
      event.preventDefault();
      saveCourse();
    } else if (command && event.code === 'KeyD') {
      event.preventDefault();
      duplicateSelection();
    } else if (command && event.code === 'KeyZ' && !event.shiftKey && state.historyIndex > 0) {
      event.preventDefault();
      restoreHistory(state.historyIndex - 1);
    } else if (command && (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey)) && state.historyIndex < state.history.length - 1) {
      event.preventDefault();
      restoreHistory(state.historyIndex + 1);
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      removeSelection();
    } else if (event.code === 'Space') {
      event.preventDefault();
      startPlaytest();
    } else if (event.code === 'KeyG') {
      event.preventDefault();
      state.guidePinned = !state.guidePinned;
      state.guideEntity = state.guidePinned && selectedItem()?.category === 'platform' ? selectedItem().entity : null;
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault();
      const dx = event.code === 'ArrowLeft' ? -state.snap : event.code === 'ArrowRight' ? state.snap : 0;
      const dy = event.code === 'ArrowUp' ? -state.snap : event.code === 'ArrowDown' ? state.snap : 0;
      for (const item of selectedEntities()) {
        if (allowed(item.entity, 'x')) item.entity.x += dx;
        if (allowed(item.entity, 'y')) item.entity.y += dy;
      }
      persist();
    }
  }, true);

  function toggle(force) {
    const next = force ?? !state.active;
    if (next && view.portrait && !coarse) {
      onToast('調整モードはPC横画面で使用してください', 2.5);
      return false;
    }
    state.active = next;
    launcher.hidden = !coarse || !editorEnabled || state.active || state.playtesting;
    if (!next && !state.playtesting) {
      view.width = state.baseView.width;
      view.height = state.baseView.height;
      state.zoom = 1;
    }
    panel.classList.toggle('is-visible', state.active);
    shell.classList.toggle('is-editing', state.active);
    if (state.active) {
      updatePanel();
      onToast('F3 調整モード // 変更はローカル下書きへ保存', 2.4);
    }
    return state.active;
  }

  function drawOverlay(ctx, cameraX, collisionShapes) {
    if (!state.active) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.font = '700 12px system-ui, sans-serif';
    for (const section of stage.sections ?? []) {
      const x = section.xStart - cameraX;
      if (x >= 0 && x <= view.width) {
        ctx.strokeStyle = 'rgba(255,187,85,.72)';
        ctx.setLineDash([5, 8]);
        ctx.beginPath(); ctx.moveTo(x, view.top); ctx.lineTo(x, view.top + view.height); ctx.stroke();
        ctx.fillStyle = '#ffcf7b'; ctx.fillText(section.label, x + 8, view.top + 150);
      }
    }
    ctx.setLineDash([]);
    if (state.dragging && state.dragOrigin) {
      const item = selectedItem();
      if (item) {
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.setLineDash([7, 6]);
        ctx.strokeRect(state.dragOrigin.x - cameraX, state.dragOrigin.y - (item.category === 'platform' ? 24 : 0), item.entity.w ?? 44, item.category === 'platform' ? 48 : item.entity.h ?? 44);
        ctx.setLineDash([]);
      }
    }
    for (const item of editorEntities()) {
      if (!entityInScope(item)) continue;
      const { entity, category } = item;
      const selected = state.selectedIds.has(entity.id);
      const highlighted = entity.id === state.highlightId && performance.now() < state.highlightUntil;
      ctx.strokeStyle = highlighted ? '#ffffff' : selected ? '#ffe36e' : 'rgba(108,231,255,.62)';
      ctx.lineWidth = highlighted ? 7 + Math.sin(performance.now() / 55) * 2 : 2;
      ctx.fillStyle = selected ? 'rgba(255,227,110,.15)' : 'rgba(108,231,255,.06)';
      if (category === 'pickup') {
        ctx.beginPath(); ctx.arc(entity.x - cameraX, entity.y, selected ? 52 : 44, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        const y = category === 'platform' ? entity.y - 24 : entity.y;
        const h = category === 'platform' ? 48 : entity.h;
        ctx.fillRect(entity.x - cameraX, y, entity.w, h);
        ctx.strokeRect(entity.x - cameraX, y, entity.w, h);
      }
      ctx.lineWidth = 2;
    }
    ctx.strokeStyle = '#ff5f7e';
    for (const hazard of collisionShapes.hazards) ctx.strokeRect(hazard.x - cameraX, hazard.y, hazard.w, hazard.h);
    ctx.strokeStyle = '#43ff93';
    for (const platform of collisionShapes.platforms) {
      ctx.beginPath(); ctx.moveTo(platform.x - cameraX, platform.y); ctx.lineTo(platform.x - cameraX + platform.w, platform.y); ctx.stroke();
    }
    const guide = state.guideEntity;
    if (guide) {
      const candidates = stage.platforms.filter(platform => platform !== guide && platform.x < guide.x)
        .sort((a, b) => (guide.x - (a.x + a.w)) - (guide.x - (b.x + b.w)));
      const from = candidates[0];
      if (from) {
        const start = { x: from.x + from.w, y: from.y };
        const gap = guide.x - start.x;
        const rise = start.y - guide.y;
        const result = classifyReach(movementTuning, gap, rise);
        const envelope = reachEnvelope(movementTuning);
        const drawCurve = (distance, color) => {
          ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
          for (let step = 0; step <= 24; step += 1) {
            const xDistance = distance * step / 24;
            const height = jumpCurvePoint(movementTuning, xDistance, distance === envelope.limitGap ? 'limit' : 'normal');
            const x = start.x + xDistance - cameraX;
            const y = start.y - height;
            if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };
        drawCurve(envelope.practicalGap, '#4cff92');
        drawCurve(envelope.limitGap, '#ffd54d');
        const color = result === 'green' ? '#4cff92' : result === 'yellow' ? '#ffd54d' : '#ff5575';
        ctx.fillStyle = color;
        ctx.fillText(`${result.toUpperCase()}  横${Math.round(gap)} / 高低${Math.round(rise)}`, guide.x - cameraX, guide.y - 36);
      }
    }
    const stairItem = selectedItem();
    if (stairItem?.category === 'platform') {
      const count = Math.max(2, Math.min(6, Number(stairFields.count.value) || 2));
      const dx = Number(stairFields.dx.value) || 0;
      const dy = Number(stairFields.dy.value) || 0;
      for (let index = 1; index < count; index += 1) {
        const level = classifyReach(movementTuning, Math.abs(dx), -dy);
        ctx.strokeStyle = level === 'safe' ? '#4cff92' : level === 'limit' ? '#ffd54d' : '#ff5575';
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(stairItem.entity.x + dx * index - cameraX, stairItem.entity.y + dy * index - 24, stairItem.entity.w, 48);
      }
      ctx.setLineDash([]);
    }
    drawMinimap();
    ctx.restore();
  }

  const editorParam = new URLSearchParams(window.location.search);
  if ((import.meta.env.DEV && editorParam.has('editor')) || editorParam.get('editor') === '1') toggle(true);
  return { get active() { return state.active; }, toggle, drawOverlay, updatePanel };
}
