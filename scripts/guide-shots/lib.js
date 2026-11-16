// Helpers for staging and photographing the real game inside the hidden capture browser.
const D = window.__MOUTHLIFE_DEBUG__;
const canvas = document.getElementById('mouthlife-canvas');
const sm = D.sceneMgr;
D.sound.setMuted(true);

if (!window.__capInstalled) {
  const orig = sm.renderFrame.bind(sm);
  window.__capPending = null;
  sm.renderFrame = (a) => {
    orig(a);
    if (window.__capPending) {
      const p = window.__capPending;
      window.__capPending = null;
      p();
    }
  };
  window.__capInstalled = true;
  window.__shots = {};
}

const G = {
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  cmd: (o = {}) => ({
    moveX: 0,
    moveZ: 0,
    scrubHeld: false,
    aimWorldPos: null,
    fireFlossRequested: false,
    fireRinseRequested: false,
    fireDiscloseRequested: false,
    ...o,
  }),
  step: (n, o) => {
    for (let i = 0; i < n; i++) D.session.step(1 / 60, G.cmd(typeof o === 'function' ? o(i) : o));
  },
  zoom: (z) => {
    sm.camera.zoom = z;
    sm.camera.updateProjectionMatrix();
  },
  at: (x, z, f = 0) => {
    D.session.probePos = { x, z };
    D.session.probeFacingRad = f;
  },
  /** Where a world point lands on screen, as 0..1 fractions of the view. */
  scr: (x, y, z) => {
    const p = sm.worldToScreen(x, y, z);
    return { cx: p.x / innerWidth, cy: p.y / innerHeight };
  },
  /** Grab the game picture right after it is drawn; crop round (cx, cy); save as name. */
  cap: async (name, o = {}) => {
    const { w = 640, h = 360, cx = 0.5, cy = 0.5, frac = 1, q = 0.84 } = o;
    const shot = await new Promise((resolve) => {
      window.__capPending = () => {
        const cw = canvas.width;
        const ch = canvas.height;
        let sw = cw * frac;
        let sh = (sw * h) / w;
        if (sh > ch) {
          sh = ch;
          sw = (sh * w) / h;
        }
        const sx = Math.max(0, Math.min(cw - sw, cx * cw - sw / 2));
        const sy = Math.max(0, Math.min(ch - sh, cy * ch - sh / 2));
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        const g = out.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(canvas, sx, sy, sw, sh, 0, 0, w, h);
        resolve(out);
      };
    });
    window.__shots[name] = shot;
    const blob = await new Promise((r) => shot.toBlob(r, 'image/jpeg', q));
    await fetch('http://127.0.0.1:8799/?name=' + name, { method: 'POST', body: blob });
    return blob.size;
  },
  /** One picture holding many shots, so they can be checked at a glance. */
  montage: async (names, file, cols = 4, tw = 320, th = 180) => {
    const rows = Math.ceil(names.length / cols);
    const m = document.createElement('canvas');
    m.width = cols * tw;
    m.height = rows * (th + 16);
    const g = m.getContext('2d');
    g.fillStyle = '#111';
    g.fillRect(0, 0, m.width, m.height);
    g.font = '12px sans-serif';
    names.forEach((n, i) => {
      const c = window.__shots[n];
      if (!c) return;
      const x = (i % cols) * tw;
      const y = Math.floor(i / cols) * (th + 16);
      const ar = c.width / c.height;
      const dw = Math.min(tw, th * ar);
      const dh = dw / ar;
      g.drawImage(c, x + (tw - dw) / 2, y, dw, dh);
      g.fillStyle = '#fff';
      g.fillText(n, x + 4, y + th + 12);
    });
    const blob = await new Promise((r) => m.toBlob(r, 'image/jpeg', 0.82));
    await fetch('http://127.0.0.1:8799/?name=' + file, { method: 'POST', body: blob });
    return blob.size;
  },
  /** Start a dive, wait for the fly-in, then freeze the game so each shot is staged by hand. */
  fresh: async (world) => {
    const s = D.getSave();
    if (!s.hasSeenCosmicIntro) {
      s.hasSeenCosmicIntro = true;
      D.saveSys.save(s);
    }
    D.launchStage(world);
    await G.wait(4300);
    D.getHud().setPaused(true);
    G.zoom(1);
    G.step(1, {});
  },
};
