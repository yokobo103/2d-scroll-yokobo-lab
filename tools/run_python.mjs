import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (!args.length) throw new Error('Python script path is required');

const bundled = 'C:\\Users\\Yokob\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const candidates = [
  ...(process.env.PYTHON ? [[process.env.PYTHON, []]] : []),
  ['python', []],
  ['py', ['-3']],
  ...(existsSync(bundled) ? [[bundled, []]] : []),
];

for (const [command, prefix] of candidates) {
  const result = spawnSync(command, [...prefix, ...args], { stdio: 'inherit', shell: false });
  if (!result.error) process.exit(result.status ?? 1);
  if (result.error.code !== 'ENOENT' && result.error.code !== 'UNKNOWN') {
    console.error(result.error.message);
  }
}
console.error('Python 3 runtime was not found. Set the PYTHON environment variable.');
process.exit(127);
