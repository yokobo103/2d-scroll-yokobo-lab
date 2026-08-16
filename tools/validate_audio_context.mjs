import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const failures = [];

const playToneBody = source.match(/const playTone = \([^]*?\n};/)?.[0] ?? '';
if (!playToneBody) failures.push('playTone implementation was not found');
if (/new AudioContext/.test(playToneBody)) failures.push('playTone must not create an AudioContext');
if (!/!audioContext/.test(playToneBody)) failures.push('playTone must return while AudioContext is unavailable');

const ensureAudioBody = source.match(/const ensureAudio = \(\) => \{[^]*?\n};/)?.[0] ?? '';
if (!/new AudioContextClass/.test(ensureAudioBody)) failures.push('ensureAudio must create the supported AudioContext implementation');
if (!/state === 'suspended'/.test(ensureAudioBody) || !/\.resume\(\)/.test(ensureAudioBody)) {
  failures.push('ensureAudio must resume a suspended AudioContext');
}

for (const marker of [
  /addEventListener\('keydown', event => \{\s*ensureAudio\(\)/,
  /const press = event => \{[^}]*event\.preventDefault\(\);[^}]*ensureAudio\(\)/,
  /ui\.sound\.addEventListener\('click', \(\) => \{\s*ensureAudio\(\)/,
]) {
  if (!marker.test(source)) failures.push(`missing user-gesture audio initialization: ${marker}`);
}

if (failures.length) {
  console.error('AUDIO CONTEXT VALIDATION FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('AUDIO CONTEXT VALIDATION PASSED');
}
