// セッションをまたぐ保存。ステージ途中の状態は持たず、フロア単位の到達と記録だけを持つ。
// 保存が消えても遊べることを前提にする（iOS Safariは7日でスクリプト書き込みのストレージを消す）。

export const SAVE_KEY = 'nyabbit-save:v1';
export const SAVE_SCHEMA_VERSION = 1;
export const FLOOR_ORDER = ['1f', '2f', '3f', '4f', '5f'];

const RANK_ORDER = ['C', 'B', 'A', 'S'];

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

const finiteAtLeastZero = value => (Number.isFinite(value) && value >= 0 ? value : null);

const integerAtLeastZero = value => (Number.isInteger(value) && value >= 0 ? value : null);

const betterRank = (a, b) => {
  const indexA = RANK_ORDER.indexOf(a);
  const indexB = RANK_ORDER.indexOf(b);
  if (indexB < 0) return indexA < 0 ? null : a;
  if (indexA < 0) return b;
  return indexB > indexA ? b : a;
};

const smaller = (a, b) => {
  if (b === null) return a;
  if (a === null) return b;
  return Math.min(a, b);
};

export const emptyFloorRecord = () => ({
  cleared: false,
  crystals: [],
  bestRank: null,
  bestTime: null,
  fewestMisses: null,
  bestScore: 0,
});

export const emptySave = () => ({ schemaVersion: SAVE_SCHEMA_VERSION, floors: {} });

const normalizeFloorRecord = raw => {
  if (!isPlainObject(raw)) return null;
  return {
    cleared: raw.cleared === true,
    crystals: Array.isArray(raw.crystals)
      ? [...new Set(raw.crystals.filter(id => typeof id === 'string' && id))].sort()
      : [],
    bestRank: RANK_ORDER.includes(raw.bestRank) ? raw.bestRank : null,
    bestTime: finiteAtLeastZero(raw.bestTime),
    fewestMisses: integerAtLeastZero(raw.fewestMisses),
    bestScore: integerAtLeastZero(raw.bestScore) ?? 0,
  };
};

// 未知のスキーマ・壊れた値は捨てて空セーブに戻す。キーにバージョンを含めているので、
// 別バージョンのデータは読まれる前にキーが違う。ここは同一キー内の破損対策。
export function normalizeSave(raw) {
  if (!isPlainObject(raw) || raw.schemaVersion !== SAVE_SCHEMA_VERSION) return emptySave();
  const floors = {};
  for (const floorId of FLOOR_ORDER) {
    const record = normalizeFloorRecord(raw.floors?.[floorId]);
    if (record) floors[floorId] = record;
  }
  return { schemaVersion: SAVE_SCHEMA_VERSION, floors };
}

export const floorRecord = (save, floorId) => normalizeSave(save).floors[floorId] ?? emptyFloorRecord();

// 結晶は「見つけた時点で累積」。クリアしていなくても残す。
// 結晶＝実験記録であり、階をまたいで話が繋がるため（docs/FLOOR_DESIGN.md §1-3）。
// ランク・タイムはそのランの成績なので、クリアしたランからのみ更新する。
export function recordRun(save, run) {
  const base = normalizeSave(save);
  if (!FLOOR_ORDER.includes(run?.floorId)) return base;
  const previous = base.floors[run.floorId] ?? emptyFloorRecord();
  const cleared = run.cleared === true;
  const next = {
    cleared: previous.cleared || cleared,
    crystals: [...new Set([
      ...previous.crystals,
      ...(Array.isArray(run.crystalIds) ? run.crystalIds.filter(id => typeof id === 'string' && id) : []),
    ])].sort(),
    bestRank: cleared ? betterRank(previous.bestRank, run.rank) : previous.bestRank,
    bestTime: cleared ? smaller(previous.bestTime, finiteAtLeastZero(run.timeSeconds)) : previous.bestTime,
    fewestMisses: cleared ? smaller(previous.fewestMisses, integerAtLeastZero(run.missCount)) : previous.fewestMisses,
    bestScore: Math.max(previous.bestScore, integerAtLeastZero(run.score) ?? 0),
  };
  return { schemaVersion: SAVE_SCHEMA_VERSION, floors: { ...base.floors, [run.floorId]: next } };
}

export function isFloorUnlocked(save, floorId) {
  const index = FLOOR_ORDER.indexOf(floorId);
  if (index < 0) return false;
  if (index === 0) return true;
  const base = normalizeSave(save);
  return FLOOR_ORDER.slice(0, index).every(id => base.floors[id]?.cleared === true);
}

export const unlockedFloors = save => FLOOR_ORDER.filter(floorId => isFloorUnlocked(save, floorId));

export const highestUnlockedFloor = save => unlockedFloors(save).at(-1) ?? FLOOR_ORDER[0];

// '3' / '3f' / '3F' を受ける。それ以外はnull。
export function normalizeFloorId(request) {
  if (typeof request !== 'string') return null;
  const token = request.trim().toLowerCase();
  if (!token) return null;
  const floorId = /^\d+$/.test(token) ? `${token}f` : token;
  return FLOOR_ORDER.includes(floorId) ? floorId : null;
}

// 解放式が本線。開発中（devBypass）だけ未解放の階へ直接飛べる。
// 配布ビルドで見知らぬ人が ?floor=5 と打っても、解放済みの最上階へ戻される。
// availableは「実装済みの階」。解放されていても未実装の階へは誰も飛べない。
export function resolveFloorRequest(save, request, { devBypass = false, available = FLOOR_ORDER } = {}) {
  const playable = FLOOR_ORDER.filter(floorId => available.includes(floorId));
  const fallback = unlockedFloors(save).filter(floorId => playable.includes(floorId)).at(-1)
    ?? playable[0]
    ?? FLOOR_ORDER[0];
  const result = { floorId: fallback, requested: null, bypassed: false, blocked: false, unavailable: false };
  const requested = normalizeFloorId(request);
  if (!requested) return result;
  result.requested = requested;
  if (!playable.includes(requested)) return { ...result, unavailable: true };
  if (isFloorUnlocked(save, requested)) return { ...result, floorId: requested };
  if (devBypass) return { ...result, floorId: requested, bypassed: true };
  return { ...result, blocked: true };
}

// 以下はブラウザ用。ストレージが使えない環境（プライベートモード等）でも例外を投げない。
export function readSave(storage = globalThis.localStorage) {
  try {
    return normalizeSave(JSON.parse(storage.getItem(SAVE_KEY) || 'null'));
  } catch {
    return emptySave();
  }
}

export function writeSave(save, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(normalizeSave(save)));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  try {
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
