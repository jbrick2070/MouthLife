// Runs JavaScript files inside the hidden capture browser (see README.md) and prints the result.
//   node scripts/guide-shots/cdp-eval.mjs [--reload] [--dpr=2] [--w=1280] [--h=720] [--mobile] [--timeout=120] [--shot=out.jpg] <a.js> [b.js ...]
// The files are joined and run as the body of one async function.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}`));
  if (!hit) return dflt;
  return hit.includes('=') ? hit.split('=')[1] : true;
};
const timeoutMs = Number(opt('timeout', 120)) * 1000;

const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:5173')) ?? targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let nextId = 1;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) {
    events.push(msg);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const timer = setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(2);
}, timeoutMs);

const dpr = opt('dpr', null);
if (dpr) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(opt('w', 1280)),
    height: Number(opt('h', 720)),
    deviceScaleFactor: Number(dpr),
    mobile: Boolean(opt('mobile', false)),
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: Boolean(opt('mobile', false)) });
}
if (opt('reload', false)) {
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await sleep(2500);
}

if (files.length > 0) {
  const source = files.map((f) => readFileSync(f, 'utf8')).join('\n;\n');
  const expression = `(async () => {\n${source}\n})()`;
  const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (reply.result?.exceptionDetails) {
    const d = reply.result.exceptionDetails;
    console.error('PAGE ERROR:', d.exception?.description ?? JSON.stringify(d));
    process.exit(1);
  }
  console.log(JSON.stringify(reply.result?.result?.value, null, 1));
}
const shot = opt('shot', null);
if (shot) {
  const { writeFileSync } = await import('node:fs');
  const cap = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  writeFileSync(shot, Buffer.from(cap.result.data, 'base64'));
}
clearTimeout(timer);
ws.close();
