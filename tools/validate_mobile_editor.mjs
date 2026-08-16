import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [editor, css, vite, pkg, main] = await Promise.all([
  readFile(new URL('../src/stage-editor.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

assert.equal(pkg.scripts['dev:lan'], 'vite --host');
assert(vite.includes("'/__editor/ping'"));
assert(editor.includes("gesturestart") && editor.includes("touchstart"));
assert(editor.includes('state.touchPointers.size >= 2'));
assert(editor.includes('60 / state.zoom'));
assert(editor.includes('point.y - 60 / state.zoom'));
assert(editor.includes('distance <= 44 / state.zoom'));
assert(editor.includes("data-mobile-action=\"delete\""));
assert(editor.includes("data-mobile-action=\"last\""));
assert(editor.includes('state.lastPlacedId = entity.id'));
assert(editor.includes('state.selectedIds = new Set([entity.id])'));
assert(editor.includes("get('editor') === '1'"));
assert(css.includes('@media (pointer: coarse)'));
assert(css.includes('touch-action: none'));
assert(css.includes('.stage-editor__details-scroll'));
assert(!css.includes('.stage-editor[data-mobile-tab="place"]'));
assert(main.includes("startupUrlParams.get('editor') === '1'"));
console.log('MOBILE EDITOR VALIDATION PASSED');
