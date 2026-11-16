// Tiny local helper: the game page posts photographed frames here and they are written to disk.
// Used only while retaking the How to Play guide's pictures; not part of the game.
//   node scripts/guide-shots/save-server.mjs src/assets/guide
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'src/assets/guide';
mkdirSync(outDir, { recursive: true });

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const name = new URL(req.url, 'http://x').searchParams.get('name') ?? '';
  if (req.method !== 'POST' || !/^[a-z0-9-]+\.jpg$/.test(name)) {
    res.writeHead(400).end('bad request');
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    // The contact sheet is only for checking the run; it does not belong among the guide pictures.
    const dir = name.startsWith('contact-') ? tmpdir() : outDir;
    writeFileSync(join(dir, name), body);
    console.log(`saved ${join(dir, name)} (${body.length} bytes)`);
    res.writeHead(200).end(String(body.length));
  });
}).listen(8799, '127.0.0.1', () => console.log('saving guide pictures to', outDir));
