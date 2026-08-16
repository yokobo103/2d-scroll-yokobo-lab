import { defineConfig } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const editorFiles = new Set([
  'data/course-01-objects.json', 'data/course-01-hooks.json',
  'data/course-02-objects.json', 'data/course-02-hooks.json',
  'data/course-03-objects.json', 'data/course-03-hooks.json',
]);

const runValidate = cwd => new Promise(resolve => {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'validate'], { cwd, shell: process.platform === 'win32' });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('close', code => resolve({ code, output }));
});

const editorSavePlugin = () => ({
  name: 'editor-save',
  apply: 'serve',
  configureServer(server) {
    server.httpServer?.once('listening', () => {
      const port = server.config.server.port ?? 5173;
      const addresses = Object.values(networkInterfaces()).flat().filter(info => info?.family === 'IPv4' && !info.internal);
      if (addresses.length) console.log(`\n================ スマホ編集URL ================\n${addresses.map(info => `  http://${info.address}:${port}/?editor=1`).join('\n')}\n================================================\n`);
    });
    server.middlewares.use('/__editor/ping', (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ ok: true }));
    });
    server.middlewares.use('/__editor/save', async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.end('POST only');
        return;
      }
      try {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 4_000_000) throw new Error('request too large');
        }
        const { file, content } = JSON.parse(raw);
        const normalized = typeof file === 'string' ? file.replaceAll('\\', '/') : '';
        if (!normalized || normalized.includes('..') || !editorFiles.has(normalized)) throw new Error('保存対象がホワイトリスト外です');
        JSON.parse(content);
        const root = server.config.root;
        const target = path.resolve(root, normalized);
        const dataRoot = path.resolve(root, 'data');
        if (!target.startsWith(`${dataRoot}${path.sep}`)) throw new Error('data/外へは保存できません');
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
        const backupDir = path.join(dataRoot, '.backup', stamp);
        await fs.mkdir(backupDir, { recursive: true });
        await fs.copyFile(target, path.join(backupDir, path.basename(target)));
        await fs.writeFile(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
        const validation = await runValidate(root);
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.statusCode = validation.code === 0 ? 200 : 422;
        response.end(JSON.stringify({ ok: validation.code === 0, code: validation.code, output: validation.output }));
      } catch (error) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.statusCode = 400;
        response.end(JSON.stringify({ ok: false, code: -1, output: error instanceof Error ? error.message : String(error) }));
      }
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [editorSavePlugin()],
});
