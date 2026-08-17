import assert from 'node:assert/strict';
import {
  FLOOR_ORDER,
  SAVE_KEY,
  clearSave,
  emptySave,
  floorRecord,
  highestUnlockedFloor,
  isFloorUnlocked,
  normalizeFloorId,
  normalizeSave,
  readSave,
  recordRun,
  resolveFloorRequest,
  unlockedFloors,
  writeSave,
} from '../src/save-state.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
};

const brokenStorage = () => ({
  getItem() { throw new Error('storage disabled'); },
  setItem() { throw new Error('storage disabled'); },
  removeItem() { throw new Error('storage disabled'); },
});

const clearRun = overrides => ({
  floorId: '1f', cleared: true, crystalIds: [], rank: 'C',
  timeSeconds: 100, missCount: 3, score: 0, ...overrides,
});

{
  assert.deepEqual(normalizeSave(null), emptySave());
  assert.deepEqual(normalizeSave({ schemaVersion: 999, floors: { '1f': { cleared: true } } }), emptySave());
  assert.deepEqual(normalizeSave('nonsense'), emptySave());
  console.log('PASS unknown or broken payloads fall back to an empty save');
}

{
  const save = normalizeSave({
    schemaVersion: 1,
    floors: {
      '1f': { cleared: 'yes', crystals: ['b', 'a', 'a', 7], bestRank: 'Z', bestTime: -5, fewestMisses: 1.5, bestScore: 'x' },
      '9f': { cleared: true },
    },
  });
  assert.deepEqual(Object.keys(save.floors), ['1f'], 'unknown floors are dropped');
  assert.equal(save.floors['1f'].cleared, false, 'non-boolean cleared is not truthy-coerced');
  assert.deepEqual(save.floors['1f'].crystals, ['a', 'b'], 'crystal ids are deduped, sorted, string-only');
  assert.equal(save.floors['1f'].bestRank, null);
  assert.equal(save.floors['1f'].bestTime, null);
  assert.equal(save.floors['1f'].fewestMisses, null);
  assert.equal(save.floors['1f'].bestScore, 0);
  console.log('PASS field-level garbage is discarded without killing the whole save');
}

{
  let save = recordRun(emptySave(), clearRun({ crystalIds: ['c2', 'c1'], rank: 'B', timeSeconds: 180.5, missCount: 4, score: 1200 }));
  const first = floorRecord(save, '1f');
  assert.equal(first.cleared, true);
  assert.deepEqual(first.crystals, ['c1', 'c2']);
  assert.equal(first.bestRank, 'B');
  assert.equal(first.bestTime, 180.5);

  save = recordRun(save, clearRun({ crystalIds: ['c2', 'c3'], rank: 'A', timeSeconds: 200, missCount: 1, score: 900 }));
  const second = floorRecord(save, '1f');
  assert.deepEqual(second.crystals, ['c1', 'c2', 'c3'], 'crystals accumulate across runs');
  assert.equal(second.bestRank, 'A', 'better rank wins');
  assert.equal(second.bestTime, 180.5, 'slower run does not overwrite the best time');
  assert.equal(second.fewestMisses, 1);
  assert.equal(second.bestScore, 1200, 'lower score does not overwrite the best score');

  save = recordRun(save, clearRun({ rank: 'C', timeSeconds: 999, missCount: 20, score: 0 }));
  const third = floorRecord(save, '1f');
  assert.equal(third.bestRank, 'A');
  assert.equal(third.bestTime, 180.5);
  assert.equal(third.fewestMisses, 1);
  console.log('PASS records keep the best of each metric, never the latest');
}

{
  // 途中でやめたランでも、拾った結晶は残る（結晶＝実験記録で階をまたいで繋がるため）。
  // ただしクリアしていないので、到達もランクも動かない。
  const save = recordRun(emptySave(), { floorId: '1f', cleared: false, crystalIds: ['c9'], rank: 'S', timeSeconds: 1, missCount: 0, score: 50 });
  const record = floorRecord(save, '1f');
  assert.deepEqual(record.crystals, ['c9']);
  assert.equal(record.cleared, false);
  assert.equal(record.bestRank, null, 'an unfinished run cannot set a rank');
  assert.equal(record.bestTime, null, 'an unfinished run cannot set a time');
  assert.equal(record.bestScore, 50);
  console.log('PASS an abandoned run keeps its crystals but earns no record');
}

{
  const before = recordRun(emptySave(), clearRun());
  const after = recordRun(before, clearRun({ floorId: '7f' }));
  assert.deepEqual(after, before, 'an unknown floor id changes nothing');
  const frozen = recordRun(emptySave(), clearRun({ crystalIds: ['a'] }));
  recordRun(frozen, clearRun({ crystalIds: ['b'] }));
  assert.deepEqual(floorRecord(frozen, '1f').crystals, ['a'], 'recordRun does not mutate its input');
  console.log('PASS recordRun rejects unknown floors and leaves the input untouched');
}

{
  const fresh = emptySave();
  assert.equal(isFloorUnlocked(fresh, '1f'), true, 'the first floor is always open');
  assert.equal(isFloorUnlocked(fresh, '2f'), false);
  assert.equal(isFloorUnlocked(fresh, '9f'), false);
  assert.deepEqual(unlockedFloors(fresh), ['1f']);
  assert.equal(highestUnlockedFloor(fresh), '1f');

  const cleared1f = recordRun(fresh, clearRun());
  assert.deepEqual(unlockedFloors(cleared1f), ['1f', '2f']);
  assert.equal(highestUnlockedFloor(cleared1f), '2f');

  // 1Fを飛ばして2Fだけクリア済みの壊れたセーブでも、3Fは開かない。
  const skipped = { schemaVersion: 1, floors: { '2f': { cleared: true, crystals: [], bestScore: 0 } } };
  assert.equal(isFloorUnlocked(skipped, '3f'), false, 'unlocking stays strictly sequential');
  console.log('PASS floors unlock one at a time and only in order');
}

{
  assert.equal(normalizeFloorId('3'), '3f');
  assert.equal(normalizeFloorId('3F'), '3f');
  assert.equal(normalizeFloorId(' 3f '), '3f');
  assert.equal(normalizeFloorId('12f'), null);
  assert.equal(normalizeFloorId(''), null);
  assert.equal(normalizeFloorId(null), null);
  console.log('PASS floor ids accept "3", "3f", "3F" and reject the rest');
}

{
  const save = recordRun(emptySave(), clearRun());

  const none = resolveFloorRequest(save, null);
  assert.equal(none.floorId, '2f', 'with no request, resume at the highest unlocked floor');

  const open = resolveFloorRequest(save, '2');
  assert.deepEqual(open, { floorId: '2f', requested: '2f', bypassed: false, blocked: false, unavailable: false });

  const blocked = resolveFloorRequest(save, '5f');
  assert.equal(blocked.floorId, '2f', 'a locked floor sends a visitor back to their own progress');
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.bypassed, false);

  const bypass = resolveFloorRequest(save, '5f', { devBypass: true });
  assert.equal(bypass.floorId, '5f', 'the dev bypass reaches a locked floor');
  assert.equal(bypass.bypassed, true);
  assert.equal(bypass.blocked, false);

  const junk = resolveFloorRequest(save, 'basement', { devBypass: true });
  assert.equal(junk.floorId, '2f', 'a bad floor id is not smuggled in by the bypass');
  assert.equal(junk.requested, null);
  console.log('PASS ?floor= is gated by progress and opened only by the dev bypass');
}

{
  // 実装済みが1Fだけの現状。1Fをクリアして2Fが解放されても、行き先は1Fのまま。
  const save = recordRun(emptySave(), clearRun());
  const available = ['1f'];
  assert.equal(resolveFloorRequest(save, null, { available }).floorId, '1f', 'an unbuilt floor is never auto-loaded');

  const asked = resolveFloorRequest(save, '2f', { available });
  assert.equal(asked.floorId, '1f');
  assert.equal(asked.unavailable, true, 'unbuilt is reported apart from locked');
  assert.equal(asked.blocked, false);

  const forced = resolveFloorRequest(save, '2f', { available, devBypass: true });
  assert.equal(forced.floorId, '1f', 'not even the dev bypass can load a floor that does not exist');
  assert.equal(forced.unavailable, true);
  console.log('PASS unbuilt floors stay unreachable even when unlocked');
}

{
  const storage = fakeStorage();
  assert.deepEqual(readSave(storage), emptySave(), 'an empty storage reads as an empty save');
  assert.equal(writeSave(recordRun(emptySave(), clearRun({ crystalIds: ['c1'] })), storage), true);
  assert.equal(storage.map.size, 1);
  assert.equal([...storage.map.keys()][0], SAVE_KEY);
  assert.ok(SAVE_KEY.startsWith('nyabbit-'), 'the key is namespaced against other prototypes on the same origin');
  assert.deepEqual(floorRecord(readSave(storage), '1f').crystals, ['c1'], 'a round trip keeps the record');

  storage.setItem(SAVE_KEY, '{ not json');
  assert.deepEqual(readSave(storage), emptySave(), 'unparsable stored text reads as an empty save');

  assert.equal(clearSave(storage), true);
  assert.equal(storage.map.size, 0, 'clearSave wipes the slot for the next player');
  console.log('PASS storage round trip, corruption recovery, and reset all behave');
}

{
  const storage = brokenStorage();
  assert.deepEqual(readSave(storage), emptySave());
  assert.equal(writeSave(emptySave(), storage), false, 'a failed write is reported, not thrown');
  assert.equal(clearSave(storage), false);
  console.log('PASS a disabled storage (private mode) degrades to a playable no-save session');
}

{
  assert.deepEqual(FLOOR_ORDER, ['1f', '2f', '3f', '4f', '5f'], 'floor order matches docs/FLOOR_DESIGN.md');
  console.log('PASS the floor list matches the design document');
}

console.log('\nSAVE STATE VALIDATION PASSED');
