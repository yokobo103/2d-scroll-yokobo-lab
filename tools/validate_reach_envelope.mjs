import fs from 'node:fs';
import { landingWindow, reachEnvelope } from '../src/reach-envelope.js';

const tuning = JSON.parse(fs.readFileSync(new URL('../data/player-movement.json', import.meta.url), 'utf8'));
const envelope = reachEnvelope(tuning);
const expectNear = (actual, expected, tolerance, label) => {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${label}: ${actual.toFixed(2)} != ${expected}`);
};
expectNear(envelope.normalGap, 352, 1, 'normal gap');
expectNear(envelope.slideGap, 377, 1, 'slide gap');
expectNear(envelope.coyoteGap, 406, 1, 'coyote gap');
expectNear(envelope.limitGap, 458, 1, 'limit gap');
expectNear(envelope.apexHeight, 166, 1, 'apex');
for (const [height, expectedMin, expectedMax] of [[0, 0, 352], [77, 46, 306], [154, 125, 227], [166, 170, 182]]) {
  const window = landingWindow(tuning, height);
  expectNear(window.minX, expectedMin, 2, `height ${height} min`);
  expectNear(window.maxX, expectedMax, 2, `height ${height} max`);
}
console.log('REACH ENVELOPE VALIDATION PASSED');
