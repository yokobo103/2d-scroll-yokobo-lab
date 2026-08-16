import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert(source.includes('button.setPointerCapture(event.pointerId)'), 'touch buttons must capture their pointer');
assert(source.includes("window.addEventListener('pointerup', event => releasePointerInput(event.pointerId), true)"), 'window pointerup must release captured input');
assert(source.includes("window.addEventListener('pointercancel', event => releasePointerInput(event.pointerId), true)"), 'window pointercancel must release captured input');
assert(source.includes("window.addEventListener('pagehide', resetInputs)"), 'pagehide must clear held inputs');
assert(source.includes("document.addEventListener('visibilitychange'"), 'hidden tabs must clear held inputs');
assert(source.includes("button.addEventListener('lostpointercapture', release)"), 'lost pointer capture must clear held input');
assert(!source.includes("button.addEventListener('pointerleave', release)"), 'captured controls must not depend on pointerleave');

console.log('INPUT RELEASE VALIDATION PASSED');
