import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// QA annotate sink (qa-issues.md T8). Dev-server only: accepts the notes that
// src/ui/qaAnnotate.ts POSTs and writes them to qa-notes/NNN.md (+ NNN.png) so
// the orchestrator can pick them up as ordinary files. Never part of a build.
function qaNoteSink(): Plugin {
  const dir = resolve(process.cwd(), 'qa-notes');
  return {
    name: 'undertow-qa-note-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__qa/note', (req, res, next) => {
        if (req.method !== 'POST') return next();
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              markdown?: string;
              png?: string | null;
            };
            mkdirSync(dir, { recursive: true });
            // Sequence off what's already on disk so notes survive reloads and
            // never overwrite an earlier session's capture.
            const existing = readdirSync(dir).filter((f) => /^\d+\.md$/.test(f));
            const seq = existing.length
              ? Math.max(...existing.map((f) => parseInt(f, 10))) + 1
              : 1;
            const stem = String(seq).padStart(3, '0');

            writeFileSync(resolve(dir, `${stem}.md`), body.markdown ?? '', 'utf8');
            if (body.png?.startsWith('data:image/png;base64,')) {
              writeFileSync(
                resolve(dir, `${stem}.png`),
                Buffer.from(body.png.slice('data:image/png;base64,'.length), 'base64'),
              );
            }
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `qa-notes/${stem}.md` }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [qaNoteSink()],
  define: {
    // build stamp in AEST (GMT+10, no DST adjustment)
    __BUILD_DATE__: JSON.stringify(
      new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') + ' AEST',
    ),
  },
  build: {
    target: 'es2020',
  },
});
