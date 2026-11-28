/// <reference types="vitest/config" />
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { configDefaults } from 'vitest/config';

/**
 * The web edition plays the same recordings the native app bundles, straight from the native
 * Music folder, so nobody has to keep two copies of 70 MB of audio in sync. In dev the folder is
 * served as `music/` (with Range support, which <audio> needs to seek and loop); in a build the
 * files are copied to `dist/music/`. The file list reaches the app as `virtual:bundled-music`.
 */
const MUSIC_DIR = fileURLToPath(new URL('./native-apple/MouthLifeApp/Music', import.meta.url));
const MUSIC_TYPES: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function listMusicFiles(): string[] {
  if (!existsSync(MUSIC_DIR)) return [];
  return readdirSync(MUSIC_DIR)
    .filter((f) => extname(f).toLowerCase() in MUSIC_TYPES)
    .sort();
}

function bundledMusic(): Plugin {
  const VIRTUAL_ID = 'virtual:bundled-music';
  const RESOLVED_ID = '\0' + VIRTUAL_ID;
  return {
    name: 'mouthlife-bundled-music',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return `export const BUNDLED_MUSIC_FILES = ${JSON.stringify(listMusicFiles())};`;
    },
    configureServer(server) {
      server.middlewares.use('/music', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+/, ''));
        if (!name || /[\\/]/.test(name) || name.includes('..')) return next();
        const type = MUSIC_TYPES[extname(name).toLowerCase()];
        const file = resolve(MUSIC_DIR, name);
        if (!type || !existsSync(file)) return next();
        const size = statSync(file).size;
        res.setHeader('Content-Type', type);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (!range) {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(size));
          createReadStream(file).pipe(res);
          return;
        }
        let start = range[1] ? Number(range[1]) : 0;
        let end = range[2] ? Number(range[2]) : size - 1;
        if (!range[1] && range[2]) {
          start = Math.max(0, size - Number(range[2]));
          end = size - 1;
        }
        if (start >= size || end >= size || start > end) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          res.end();
          return;
        }
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        createReadStream(file, { start, end }).pipe(res);
      });
    },
    generateBundle() {
      for (const f of listMusicFiles()) {
        this.emitFile({ type: 'asset', fileName: `music/${f}`, source: readFileSync(resolve(MUSIC_DIR, f)) });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [bundledMusic()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    // Agents work in copies of the repository under .claude/worktrees; their tests are not ours.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
