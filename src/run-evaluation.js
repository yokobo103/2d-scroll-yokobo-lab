export const dataCrystals = stage => stage.pickups.filter(pickup => pickup.prefab === 'data-crystal-v1');

export const dataCrystalTotal = stage => dataCrystals(stage).length;

export const formatRunTime = seconds => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`;
};

export function evaluateRank({ crystals, totalCrystals, missCount }) {
  const ratio = totalCrystals > 0 ? crystals / totalCrystals : 0;
  if (ratio >= 1 && missCount === 0) return 'S';
  if (ratio >= .75 && missCount <= 2) return 'A';
  if (ratio >= .5) return 'B';
  return 'C';
}
