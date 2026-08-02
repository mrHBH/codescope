import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REC_DIR = resolve(__dirname, 'recordings');
const NAME_RE = /^[\w.-]{1,80}$/;

// Dev-only persistence for the record/replay harness (src/recorder). Recordings
// are written as plain JSON so they can be committed + diffed (regression-grade).
// Mounted inline in configureServer so it runs BEFORE vite's SPA/history fallback
// (which would otherwise rewrite /__rec to index.html for fetch's `*/*` accept).
function recordingsPlugin(): Plugin {
  const ensure = () => { if (!existsSync(REC_DIR)) mkdirSync(REC_DIR, { recursive: true }); };
  const send = (res: any, code: number, body: any, type = 'application/json') => {
    res.statusCode = code; res.setHeader('content-type', type); res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const readBody = (req: any): Promise<string> => new Promise((ok, no) => {
    let s = ''; req.on('data', (c: any) => (s += c)); req.on('end', () => ok(s)); req.on('error', no);
  });
  return {
    name: 'codescope-recordings',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (!url.pathname.startsWith('/__rec')) return next();
        ensure();
        const rest = decodeURIComponent(url.pathname.slice('/__rec'.length).replace(/^\/+/, ''));
        try {
          if (req.method === 'GET' && rest === '') {
            const files = readdirSync(REC_DIR).filter((f) => f.endsWith('.json'));
            const recs = files.map((f) => JSON.parse(readFileSync(join(REC_DIR, f), 'utf8')));
            return send(res, 200, recs);
          }
          if (req.method === 'GET' && rest) {
            if (!NAME_RE.test(rest)) return send(res, 400, { error: 'bad name' });
            const file = join(REC_DIR, rest + '.json');
            if (!file.startsWith(REC_DIR) || !existsSync(file)) return send(res, 404, { error: 'not found' });
            return send(res, 200, JSON.parse(readFileSync(file, 'utf8')));
          }
          if (req.method === 'POST' && rest) {
            if (!NAME_RE.test(rest)) return send(res, 400, { error: 'bad name' });
            const file = join(REC_DIR, rest + '.json');
            if (!file.startsWith(REC_DIR)) return send(res, 400, { error: 'bad name' });
            const raw = await readBody(req);
            const data = JSON.parse(raw);            // throws → 500 below if malformed
            data.name = rest;                          // the path name is authoritative
            writeFileSync(file, JSON.stringify(data, null, 2));
            return send(res, 200, { ok: true });
          }
          if (req.method === 'DELETE' && rest) {
            if (!NAME_RE.test(rest)) return send(res, 400, { error: 'bad name' });
            const file = join(REC_DIR, rest + '.json');
            if (file.startsWith(REC_DIR) && existsSync(file)) unlinkSync(file);
            return send(res, 200, { ok: true });
          }
          return send(res, 405, { error: 'method' });
        } catch (e) {
          return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [recordingsPlugin()],
  server: { port: 3000 },
  build: { target: 'esnext' },
});
