'use strict';
// ---- Themed worlds (arenas). Each one is still procedurally generated every game, but has its own
// terrain profile, palette, sky, decorations, hazard liquid and ambience. Gameplay twists are modest
// and apply to every team equally (arenas, not team buffs).
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

// push a stretch of terrain down below the waterline -> separate islands / icebergs
function cutChannel(hs, cx, half, depth) {
  for (let x = Math.max(0, Math.floor(cx - half * 1.6)); x < Math.min(hs.length, cx + half * 1.6); x++) {
    const t = Math.abs(x - cx) / (half * 1.6);
    const k = t < 0.55 ? 1 : smooth(1 - (t - 0.55) / 0.45);
    hs[x] = lerp(hs[x], Math.max(hs[x], WATER_Y + depth), k);
  }
}
// pick n channel centers spread over the map, away from edges and from each other
function channelSpots(r, w, n) {
  const out = [], seg = (w - 520) / n;
  for (let i = 0; i < n; i++) out.push(260 + seg * (i + 0.25 + r() * 0.5));
  return out;
}

function stars(g, r, n, maxY, big) {
  for (let i = 0; i < n; i++) {
    const s = r() < (big || 0.9) ? 1 : 2;
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.75})`;
    g.fillRect(r() * W, r() * maxY, s, s);
  }
}
function ridge(g, col, base, amp, f, ph, step, sharp) {
  g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += step || 8) {
    let s = Math.sin(x * f + ph) + Math.sin(x * f * 2.7 + ph * 2) * 0.4;
    if (sharp) s = 1 - Math.abs(Math.sin(x * f + ph)) * 2 + Math.sin(x * f * 3.1 + ph) * 0.25;
    g.lineTo(x, base + s * amp);
  }
  g.lineTo(W, H); g.closePath(); g.fill();
}
function glowDot(ctx, x, y, r, col, a) {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0));
  ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const WORLDS = {
  // ------------------------------------------------------------------ classic
  classic: {
    id: 'classic', name: 'Classic Hills', team: null, color: '#8ff5b5', tagline: 'The original grassy dusk hills.',
    twist: 'None — the original map.',
    gen: { amp: [1, 1, 1, 1, 1], base: 430, caves: 1, islands: 1, maxLakes: 2 }, // big maps: all zone kinds (terrain.js macro/features)
    color(x, y, run, n, T) {
      if (run <= 2) return [160, 240, 110];
      if (run <= 7) return [84, 186, 64];
      if (run <= 10) return [62, 128, 48];
      const band = Math.sin(y * 0.06 + Math.sin(x * 0.012) * 2.2), dk = Math.min(1, run / 260) * 0.38;
      let c = [(138 + band * 14) * (1 - dk), (92 + band * 9) * (1 - dk), (62 + band * 7) * (1 - dk)];
      if (hash2(x >> 2, y >> 2, T.seed + 7) > 0.93) c = [c[0] * 0.8, c[1] * 0.8, c[2] * 0.85];
      return c;
    },
    inlay: ['rock', 'coin', 'bone'],
    scorch: ['rgba(40,22,14,0.55)', 'rgba(25,12,8,0.5)'], debris: ['#8b5e3c', '#6d4a2f', '#54b640'],
    water: { top: 'rgba(60,150,230,0.82)', bottom: 'rgba(20,40,120,0.95)', line: 'rgba(200,240,255,0.7)', splash: 'rgba(170,220,255,0.9)', mini: 'rgba(60,150,230,0.7)', name: 'water' },
    clouds: 'rgba(255,235,245,0.22)',
    bg(g, r) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0d1240'); sky.addColorStop(0.45, '#3a2a80'); sky.addColorStop(0.8, '#c9557a'); sky.addColorStop(1, '#ff9d5c');
      g.fillStyle = sky; g.fillRect(0, 0, W, H); stars(g, r, 160, H * 0.5);
      const mx = 1060, my = 140, glow = g.createRadialGradient(mx, my, 40, mx, my, 150);
      glow.addColorStop(0, 'rgba(255,240,190,0.45)'); glow.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = glow; g.fillRect(mx - 160, my - 160, 320, 320);
      g.fillStyle = '#fff1c2'; g.beginPath(); g.arc(mx, my, 58, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(210,190,140,0.6)';
      [[-18, -12, 12], [20, 8, 9], [-6, 24, 7], [24, -22, 6]].forEach(([dx, dy, rr]) => { g.beginPath(); g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2); g.fill(); });
      let price = 470;
      for (let x = 30; x < W - 20; x += 22) {
        const o = price, cl = price + (r() - 0.62) * 40; price = Math.max(220, Math.min(560, cl));
        g.fillStyle = cl < o ? 'rgba(80,255,150,0.13)' : 'rgba(255,80,110,0.13)';
        g.fillRect(x + 6, Math.min(o, cl) - 10 - r() * 10, 2, Math.abs(cl - o) + 24);
        g.fillRect(x, Math.min(o, cl), 14, Math.max(3, Math.abs(cl - o)));
      }
      ridge(g, 'rgba(70,40,110,0.85)', 470, 50, 0.006, r() * 6);
      ridge(g, 'rgba(95,45,115,0.9)', 540, 35, 0.011, r() * 6);
    },
  },

  // ------------------------------------------------------------------ DOGE
  moon: {
    id: 'moon', name: 'Doge Moon Base', team: 'DOGE', color: '#ffd84a', tagline: 'Grey craters, starfield, Earthrise. Much space.',
    twist: 'Taller peaks and deep craters (same gravity).',
    gen: { amp: [1.3, 1.15, 0.9, 0.8, 0.6], base: 440, caves: 0.6, islands: 1, islandFlat: -0.7, maxLakes: 1, maxBridges: 1,
      zones: { crater: 1.7, ridge: 1.1, cliff: 0.9, lake: 0.3, bridge: 0.35, valley: 0.5 }, // crater fields, ridges, a void pit
      shape(T, r, hs) { // impact craters with raised rims
        const n = Math.round((T.w > 2600 ? 2 + r() * 1.5 : 3 + r() * 2) * T.w / 1280);
        T.craters = [];
        for (let i = 0; i < n; i++) {
          const cx = 200 + r() * (T.w - 400), R = 55 + r() * 60, depth = 28 + r() * 34;
          T.craters.push({ x: cx, R });
          for (let x = Math.max(0, Math.floor(cx - R * 1.4)); x < Math.min(T.w, cx + R * 1.4); x++) {
            const t = Math.abs(x - cx) / R;
            if (t < 1) hs[x] += depth * (1 - t * t);
            else hs[x] -= depth * 0.4 * smooth(1 - (t - 1) / 0.4);
            hs[x] = Math.min(hs[x], WATER_Y - 70);
          }
        }
      } },
    color(x, y, run, n, T) {
      if (run <= 2) return [226, 226, 234];
      if (run <= 9) return [178, 178, 190];
      const band = Math.sin(y * 0.05 + Math.sin(x * 0.01) * 2), dk = Math.min(1, run / 280) * 0.45;
      let v = (128 + band * 10) * (1 - dk);
      const sp = hash2(x >> 3, y >> 3, T.seed + 3);
      if (sp > 0.9) v *= 0.78; else if (sp < 0.04) v *= 1.18;
      return [v, v * 0.98, v * 1.08];
    },
    inlay: ['bone', 'coin', 'coin', 'moonrock'],
    scorch: ['rgba(30,30,40,0.55)', 'rgba(15,15,25,0.5)'], debris: ['#9a9aa8', '#6d6d7a', '#d8d8e0'],
    water: { top: 'rgba(90,40,170,0.9)', bottom: 'rgba(8,4,30,0.98)', line: 'rgba(120,240,255,0.95)', splash: 'rgba(160,120,255,0.9)', mini: 'rgba(110,60,200,0.85)', name: 'the void', stars: true },
    clouds: null,
    bg(g, r) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#02030c'); sky.addColorStop(0.6, '#0b0f2e'); sky.addColorStop(1, '#1d1846');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // nebula
      for (let i = 0; i < 5; i++) glowDot(g, 200 + r() * 900, 80 + r() * 260, 160 + r() * 140, i % 2 ? 'rgba(120,60,200,A)' : 'rgba(40,120,200,A)', 0.12);
      stars(g, r, 420, H * 0.85, 0.85);
      // Earth
      const ex = 470, ey = 150, er = 62;
      glowDot(g, ex, ey, er * 1.7, 'rgba(90,170,255,A)', 0.35);
      g.save(); g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#2f7fe0'; g.fillRect(ex - er, ey - er, er * 2, er * 2);
      g.fillStyle = '#4caf50';
      [[-24, -18, 26, 16], [18, 10, 22, 28], [-10, 30, 18, 10], [30, -30, 14, 10]].forEach(([dx, dy, a, b]) => { g.beginPath(); g.ellipse(ex + dx, ey + dy, a, b, 0.5, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = 'rgba(255,255,255,0.7)';
      [[-30, 4, 30, 5], [10, -22, 26, 4], [20, 34, 22, 4]].forEach(([dx, dy, a, b]) => { g.beginPath(); g.ellipse(ex + dx, ey + dy, a, b, -0.2, 0, Math.PI * 2); g.fill(); });
      const sh = g.createLinearGradient(ex - er, 0, ex + er, 0); sh.addColorStop(0, 'rgba(0,0,10,0)'); sh.addColorStop(0.55, 'rgba(0,0,10,0.15)'); sh.addColorStop(1, 'rgba(0,0,10,0.75)');
      g.fillStyle = sh; g.fillRect(ex - er, ey - er, er * 2, er * 2); g.restore();
      // distant planet + rocket trail
      g.fillStyle = '#c98a5a'; g.beginPath(); g.arc(1010, 200, 22, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,220,180,0.5)'; g.lineWidth = 3; g.beginPath(); g.ellipse(1010, 200, 38, 8, -0.3, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,200,120,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(760, 330); g.quadraticCurveTo(860, 220, 930, 90); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(930, 90, 3, 0, Math.PI * 2); g.fill();
      // grey lunar ridges with little domes
      ridge(g, 'rgba(70,72,95,0.95)', 500, 45, 0.007, r() * 6, 6, true);
      ridge(g, 'rgba(95,96,120,0.95)', 560, 28, 0.013, r() * 6);
      for (let i = 0; i < 4; i++) { const x = 120 + r() * 1040, y = 552 + r() * 20; g.fillStyle = 'rgba(180,200,230,0.35)'; g.beginPath(); g.arc(x, y, 14 + r() * 10, Math.PI, 0); g.fill(); g.fillStyle = 'rgba(255,230,120,0.7)'; g.fillRect(x - 2, y - 6, 4, 3); }
    },
    decorate(T, r) {
      const d = [];
      const n = Math.round(9 * T.w / 1280);
      for (let i = 0; i < n; i++) {
        const x = 80 + r() * (T.w - 160), y = T.surfaceY(x); if (y < 0 || y > WATER_Y - 20) continue;
        const k = r();
        d.push({ x, y, type: k < 0.25 ? 'flag' : k < 0.5 ? 'dish' : k < 0.75 ? 'rock' : 'lamp', s: 0.8 + r() * 0.5, f: r() < 0.5 ? 1 : -1 });
      }
      return d;
    },
    drawDeco(ctx, o, t) {
      const { x, y, s, f } = o;
      if (o.type === 'flag') {
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34 * s); ctx.stroke();
        ctx.fillStyle = '#ffa62b'; ctx.fillRect(x, y - 34 * s, 20 * s * f, 12 * s);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${8 * s | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('WOW', x + 10 * s * f, y - 25 * s);
      } else if (o.type === 'dish') {
        ctx.strokeStyle = '#9aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 12 * s); ctx.stroke();
        ctx.fillStyle = '#dde'; ctx.beginPath(); ctx.ellipse(x, y - 16 * s, 10 * s, 5 * s, -0.6 * f, 0, Math.PI); ctx.fill();
        ctx.fillStyle = (t * 2 | 0) % 2 ? '#ff4b4b' : '#661111'; ctx.fillRect(x - 1, y - 24 * s, 2, 2);
      } else if (o.type === 'rock') {
        ctx.fillStyle = '#8c8c9a'; ctx.beginPath(); ctx.ellipse(x, y - 3 * s, 7 * s, 4 * s, 0, Math.PI, 0); ctx.fill();
      } else {
        ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22 * s); ctx.stroke();
        glowDot(ctx, x, y - 23 * s, 14, 'rgba(255,230,140,A)', 0.4 + Math.sin(t * 3 + x) * 0.1);
        ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x - 2, y - 25 * s, 4, 3);
      }
    },
    ambient(A, cam, t, dt) {
      if (Math.random() < dt * 0.35) A.push({ type: 'shoot', x: cam + rand(100, W), y: rand(20, 220), vx: -rand(500, 800), vy: rand(150, 260), life: 0.9, max: 0.9, screen: true });
      if (A.length < 40 && Math.random() < dt * 12) A.push({ type: 'dust', x: cam + rand(0, W), y: rand(300, 650), vx: rand(-8, 8), vy: rand(-6, -2), life: 4, max: 4 });
    },
  },

  // ------------------------------------------------------------------ FROG
  swamp: {
    id: 'swamp', name: 'Rare Pepe Bayou', team: 'FROG', color: '#7dff6a', tagline: 'Mossy mud islands, reeds, fireflies, misty dusk.',
    twist: 'More islands: murky channels split the land, plus extra floating mud rafts.',
    gen: { amp: [0.75, 0.7, 0.7, 0.9, 1], base: 470, caves: 0.5, islands: 2, maxLakes: 1, maxBridges: 3, ledges: 1.4,
      zones: { bridge: 1.1, lake: 0.3, mesa: 0.9, ridge: 0.5, crater: 0.25, valley: 0.4, cliff: 0.8 }, // mud bridges over the channels, raised mounds
      shape(T, r, hs) {
        const n = Math.max(2, Math.round((T.w > 2600 ? 1.6 : 2.4) * T.w / 1280));
        for (const cx of channelSpots(r, T.w, n)) cutChannel(hs, cx, 34 + r() * 26, 40);
      } },
    color(x, y, run, n, T) {
      if (run <= 3) return [134, 190, 70];
      if (run <= 8) return [82, 128, 44];
      if (run <= 12) return [60, 88, 36];
      const band = Math.sin(y * 0.08 + Math.sin(x * 0.015) * 2.5), dk = Math.min(1, run / 240) * 0.45;
      let c = [(96 + band * 10) * (1 - dk), (80 + band * 9) * (1 - dk), (48 + band * 5) * (1 - dk)];
      if (hash2(x >> 2, y >> 3, T.seed + 9) > 0.94) c = [c[0] * 0.75, c[1] * 0.9, c[2] * 0.7];
      return c;
    },
    inlay: ['rock', 'coin', 'root', 'root', 'bone'],
    scorch: ['rgba(30,26,10,0.6)', 'rgba(15,14,5,0.5)'], debris: ['#5e4a2c', '#3e3220', '#6fae3c'],
    water: { top: 'rgba(70,110,50,0.88)', bottom: 'rgba(20,36,18,0.97)', line: 'rgba(170,220,120,0.7)', splash: 'rgba(140,190,100,0.9)', mini: 'rgba(70,110,50,0.85)', name: 'the bog', pads: true },
    clouds: 'rgba(225,240,215,0.10)', cloudScale: 2.2, cloudY: [330, 520],
    bg(g, r) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#17213a'); sky.addColorStop(0.45, '#3d4a5c'); sky.addColorStop(0.75, '#9a7a5a'); sky.addColorStop(1, '#d9a35a');
      g.fillStyle = sky; g.fillRect(0, 0, W, H); stars(g, r, 50, H * 0.3);
      // low hazy sun
      glowDot(g, 900, 430, 260, 'rgba(255,190,110,A)', 0.4);
      g.fillStyle = 'rgba(255,214,150,0.85)'; g.beginPath(); g.arc(900, 430, 46, 0, Math.PI * 2); g.fill();
      // cypress silhouettes with hanging moss
      const tree = (x, base, h, col) => {
        g.fillStyle = col; g.beginPath(); g.moveTo(x - 12, base); g.lineTo(x - 5, base - h); g.lineTo(x + 5, base - h); g.lineTo(x + 14, base); g.fill();
        for (let k = 0; k < 4; k++) { const yy = base - h + k * h * 0.18; g.beginPath(); g.ellipse(x + (k % 2 ? 18 : -18), yy, 30 - k * 3, 12, 0, 0, Math.PI * 2); g.fill(); }
        g.strokeStyle = col; g.lineWidth = 1.5;
        for (let k = 0; k < 8; k++) { const xx = x - 40 + r() * 80, yy = base - h + r() * h * 0.6; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + r() * 4 - 2, yy + 20 + r() * 30); g.stroke(); }
      };
      for (let i = 0; i < 9; i++) tree(40 + i * 150 + r() * 60, 560, 200 + r() * 110, 'rgba(40,50,48,0.65)');
      ridge(g, 'rgba(48,62,52,0.9)', 560, 18, 0.01, r() * 6);
      for (let i = 0; i < 7; i++) tree(r() * W, 600, 140 + r() * 80, 'rgba(26,36,30,0.85)');
      // mist bands
      for (let i = 0; i < 4; i++) { const yy = 480 + i * 45, gm = g.createLinearGradient(0, yy - 30, 0, yy + 30); gm.addColorStop(0, 'rgba(200,220,200,0)'); gm.addColorStop(0.5, 'rgba(200,220,200,0.16)'); gm.addColorStop(1, 'rgba(200,220,200,0)'); g.fillStyle = gm; g.fillRect(0, yy - 30, W, 60); }
    },
    decorate(T, r) {
      const d = [];
      for (let i = 0; i < Math.round(26 * T.w / 1280); i++) {
        const x = 40 + r() * (T.w - 80), y = T.surfaceY(x); if (y < 0 || y > WATER_Y - 8) continue;
        const k = r();
        d.push({ x, y, type: k < 0.55 ? 'reeds' : k < 0.8 ? 'shroom' : 'stump', s: 0.7 + r() * 0.6, ph: r() * 6 });
      }
      // lily pads float on the bog
      for (let i = 0; i < Math.round(14 * T.w / 1280); i++) { const x = r() * T.w; if (T.surfaceY(x) > WATER_Y - 2 || T.surfaceY(x) < 0) d.push({ x, y: WATER_Y, type: 'pad', water: true, s: 0.7 + r() * 0.6, ph: r() * 6, flower: r() < 0.3 }); }
      return d;
    },
    drawDeco(ctx, o, t) {
      const { x, y, s, ph } = o;
      if (o.type === 'reeds') {
        ctx.strokeStyle = '#4f7a2a'; ctx.lineWidth = 2;
        for (let k = -2; k <= 2; k++) { const sw = Math.sin(t * 1.5 + ph + k) * 3; ctx.beginPath(); ctx.moveTo(x + k * 3, y + 1); ctx.quadraticCurveTo(x + k * 4, y - 14 * s, x + k * 5 + sw, y - (24 + Math.abs(k) * -3) * s); ctx.stroke(); }
        ctx.fillStyle = '#6b3f1f'; ctx.fillRect(x + Math.sin(t * 1.5 + ph) * 3 - 2, y - 30 * s, 4, 9 * s);
      } else if (o.type === 'shroom') {
        ctx.fillStyle = '#e8dcc0'; ctx.fillRect(x - 1.5, y - 7 * s, 3, 7 * s);
        ctx.fillStyle = '#c74a6a'; ctx.beginPath(); ctx.ellipse(x, y - 7 * s, 6 * s, 4 * s, 0, Math.PI, 0); ctx.fill();
        glowDot(ctx, x, y - 8 * s, 12 * s, 'rgba(255,120,200,A)', 0.18);
      } else if (o.type === 'stump') {
        ctx.fillStyle = '#4a3622'; ctx.fillRect(x - 6 * s, y - 14 * s, 12 * s, 15 * s);
        ctx.fillStyle = '#7a5a36'; ctx.beginPath(); ctx.ellipse(x, y - 14 * s, 6 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      } else if (o.type === 'pad') {
        const yy = y + Math.sin(t * 1.2 + ph) * 2.5;
        ctx.fillStyle = '#3f8f3a'; ctx.beginPath(); ctx.ellipse(x, yy, 13 * s, 4.5 * s, 0, 0.35, Math.PI * 2 - 0.1); ctx.lineTo(x, yy); ctx.fill();
        if (o.flower) { ctx.fillStyle = '#ffb6d9'; ctx.beginPath(); ctx.arc(x + 3, yy - 3, 3, 0, Math.PI * 2); ctx.fill(); }
      }
    },
    ambient(A, cam, t, dt) {
      if (A.length < 34 && Math.random() < dt * 8) A.push({ type: 'firefly', x: cam + rand(0, W), y: rand(260, 640), vx: rand(-12, 12), vy: rand(-8, 8), life: rand(4, 8), max: 8, ph: rand(0, 6) });
      if (Math.random() < dt * 3) A.push({ type: 'bubble', x: cam + rand(0, W), y: WATER_Y + rand(8, 40), vx: 0, vy: -rand(10, 22), life: 1.6, max: 1.6 });
    },
  },

  // ------------------------------------------------------------------ PENGU
  arctic: {
    id: 'arctic', name: 'Iceberg Arctic', team: 'PENGU', color: '#bfefff', tagline: 'Snowy icebergs, ice caves, aurora skies, snowfall.',
    twist: 'Gustier: wind range up to ±130% (vs ±100%).', windMul: 1.3,
    gen: { amp: [1, 1.05, 1, 0.8, 0.5], base: 440, caves: 1.6, caveSize: 1.25, islands: 0.6, iceberg: 70, maxLakes: 1, ledges: 1.2,
      zones: { cliff: 1.5, arch: 1.2, ridge: 1.1, crater: 0.3, lake: 0.45, mesa: 0.8 }, // ice cliffs with overhangs, ice arches, jagged ridges
      shape(T, r, hs) {
        const n = Math.max(1, Math.round((T.w > 2600 ? 1.1 : 1.6) * T.w / 1280));
        for (const cx of channelSpots(r, T.w, n)) cutChannel(hs, cx, 26 + r() * 16, 34);
      } },
    color(x, y, run, n, T) {
      if (run <= 5) return [242, 248, 255];
      if (run <= 9) return [206, 228, 246];
      const crack = hash2((x + y) >> 3, (x - y) >> 4, T.seed + 5) > 0.9 ? 0.85 : 1;
      const band = Math.sin(y * 0.045 + x * 0.008), dk = Math.min(1, run / 300) * 0.5;
      return [(132 + band * 14) * (1 - dk) * crack, (182 + band * 12) * (1 - dk * 0.7) * crack, (228 + band * 8) * (1 - dk * 0.35)];
    },
    inlay: ['fishbone', 'coin', 'crystal', 'rock'],
    scorch: ['rgba(30,60,100,0.45)', 'rgba(15,35,70,0.45)'], debris: ['#e8f6ff', '#a6d4f2', '#ffffff'],
    water: { top: 'rgba(70,170,220,0.85)', bottom: 'rgba(10,40,90,0.96)', line: 'rgba(225,250,255,0.85)', splash: 'rgba(220,245,255,0.95)', mini: 'rgba(70,170,220,0.8)', name: 'freezing water', ice: true },
    clouds: 'rgba(230,240,255,0.18)', snowClouds: true,
    bg(g, r) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#040b1f'); sky.addColorStop(0.5, '#0f2a4a'); sky.addColorStop(1, '#3d7da3');
      g.fillStyle = sky; g.fillRect(0, 0, W, H); stars(g, r, 220, H * 0.6);
      // aurora ribbons
      g.save(); g.globalCompositeOperation = 'lighter';
      [['rgba(80,255,170,', 150, 0.004, 0], ['rgba(150,90,255,', 210, 0.005, 2], ['rgba(60,220,255,', 120, 0.006, 4]].forEach(([c, base, f, ph]) => {
        for (let x = 0; x < W; x += 3) {
          const y = base + Math.sin(x * f + ph) * 40 + Math.sin(x * f * 3 + ph) * 12, h = 70 + Math.sin(x * 0.02 + ph) * 30;
          const gr = g.createLinearGradient(0, y - h, 0, y); gr.addColorStop(0, c + '0)'); gr.addColorStop(1, c + '0.16)');
          g.fillStyle = gr; g.fillRect(x, y - h, 3, h);
        }
      });
      g.restore();
      g.fillStyle = '#eef6ff'; g.beginPath(); g.arc(960, 160, 34, 0, Math.PI * 2); g.fill();
      glowDot(g, 960, 160, 110, 'rgba(200,230,255,A)', 0.25);
      ridge(g, 'rgba(150,185,215,0.9)', 470, 70, 0.006, r() * 6, 5, true);
      ridge(g, 'rgba(200,225,245,0.95)', 540, 40, 0.012, r() * 6, 5, true);
      ridge(g, 'rgba(110,160,200,0.85)', 600, 16, 0.02, r() * 6);
    },
    decorate(T, r) {
      const d = [];
      for (let i = 0; i < Math.round(8 * T.w / 1280); i++) {
        const x = 80 + r() * (T.w - 160), y = T.surfaceY(x); if (y < 0 || y > WATER_Y - 20) continue;
        const k = r(); d.push({ x, y, type: k < 0.35 ? 'igloo' : k < 0.7 ? 'crystal' : 'snowman', s: 0.7 + r() * 0.5 });
      }
      for (const c of T.caves || []) for (let k = 0; k < 6; k++) { // icicles hanging from cave ceilings
        const x = c.x + (r() - 0.5) * c.rx * 1.4, dy = Math.sqrt(Math.max(0, 1 - ((x - c.x) / c.rx) ** 2)) * c.ry;
        d.push({ x, y: c.y - dy, type: 'icicle', hang: true, s: 0.6 + r() * 0.8 });
      }
      for (let i = 0; i < Math.round(7 * T.w / 1280); i++) { const x = r() * T.w; if (T.surfaceY(x) > WATER_Y - 2 || T.surfaceY(x) < 0) d.push({ x, y: WATER_Y, type: 'floe', water: true, s: 0.6 + r() * 0.8, ph: r() * 6 }); }
      return d;
    },
    drawDeco(ctx, o, t) {
      const { x, y, s } = o;
      if (o.type === 'igloo') {
        ctx.fillStyle = '#f4faff'; ctx.beginPath(); ctx.arc(x, y + 1, 15 * s, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(120,160,200,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y + 1, 10 * s, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#2b4a6a'; ctx.beginPath(); ctx.arc(x + 6 * s, y + 1, 5 * s, Math.PI, 0); ctx.fill();
      } else if (o.type === 'crystal') {
        ctx.fillStyle = 'rgba(170,230,255,0.85)'; ctx.beginPath(); ctx.moveTo(x - 4 * s, y); ctx.lineTo(x, y - 16 * s); ctx.lineTo(x + 4 * s, y); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x + 8 * s, y - 9 * s); ctx.lineTo(x + 8 * s, y); ctx.fill();
        glowDot(ctx, x, y - 8 * s, 14 * s, 'rgba(150,230,255,A)', 0.2 + Math.sin(t * 2 + x) * 0.08);
      } else if (o.type === 'snowman') {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 6 * s, 7 * s, 0, Math.PI * 2); ctx.arc(x, y - 16 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff8a2a'; ctx.fillRect(x, y - 17 * s, 5 * s, 2); ctx.fillStyle = '#123'; ctx.fillRect(x - 2, y - 19 * s, 1.5, 1.5);
      } else if (o.type === 'icicle') {
        ctx.fillStyle = 'rgba(210,240,255,0.9)'; ctx.beginPath(); ctx.moveTo(x - 3 * s, y - 1); ctx.lineTo(x + 3 * s, y - 1); ctx.lineTo(x, y + 14 * s); ctx.fill();
      } else if (o.type === 'floe') {
        const xx = x + Math.sin(t * 0.3 + o.ph) * 14, yy = y + Math.sin(t * 1.1 + o.ph) * 2;
        ctx.fillStyle = '#eaf7ff'; ctx.beginPath(); ctx.moveTo(xx - 18 * s, yy); ctx.lineTo(xx - 12 * s, yy - 6 * s); ctx.lineTo(xx + 10 * s, yy - 7 * s); ctx.lineTo(xx + 18 * s, yy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(160,210,240,0.8)'; ctx.fillRect(xx - 16 * s, yy, 32 * s, 3);
      }
    },
    ambient(A, cam, t, dt, wind) {
      if (A.length < 140 && Math.random() < dt * 60) A.push({ type: 'snow', x: cam + rand(-100, W + 100), y: -10, vx: 0, vy: rand(25, 60), life: 14, max: 14, sz: rand(1, 2.6), ph: rand(0, 6) });
    },
  },

  // ------------------------------------------------------------------ PILL
  pump: {
    id: 'pump', name: 'Degen Pump Lab', team: 'PILL', color: '#ff5fa2', tagline: 'Clean trading floor of green/red candlestick pillars over a liquidation pool.',
    twist: 'Candlestick terrain: wide walkable candle bars with bevelled steps, a pump-and-dump run and a few neon platforms.',
    gen: { amp: [0.95, 0.9, 0.6, 0.3, 0], base: 440, caves: 0, islands: 0, arches: -1, macroAmp: 0.8, maxLakes: 0, overhang: 0, ledges: 0, mesaTunnel: 0,
      zones: { stairs: 1.3, ridge: 1.1, cliff: 1, peak: 1, mesa: 1, crater: 0.5, lake: 0 }, // candle formations: pump-and-dump stairs, towers, ranges; no tunnels/clutter
      // Walkable candles: the profile is quantised into wide candlestick bars whose tops differ by at most BAR_STEP px
      // from their neighbours, and every bar-to-bar step is bevelled (chamfered) into a ramp of at most BEVEL px rise
      // per px, so walking (game.walkStep climbs up to 7 px per px) never gets stuck on a bar edge. Big features (the
      // pump-and-dump staircase, peaks, ranges) survive as long candle runs; no water pits, few platforms.
      shape(T, r, hs) {
        const BAR_STEP = 22, BEVEL = 2;
        T.colKind = new Uint8Array(T.w); T.candleEdge = new Uint8Array(T.w); T.candles = [];
        let x = 0; const bars = [];
        while (x < T.w) {
          let cw = Math.round(56 + r() * 40); if (T.w - (x + cw) < 50) cw = T.w - x; const x1 = Math.min(T.w, x + cw);
          let avg = 0; for (let i = x; i < x1; i++) avg += hs[i]; avg /= (x1 - x);
          bars.push({ x, x1, t: Math.min(avg + (r() - 0.5) * 18, WATER_Y - 60) });
          x = x1;
        }
        // the big features: a tall "pump" (a long green candle run up to a summit, then the red dump) and a "crash" valley
        const n0 = bars.length, feat = (ci, half, amp) => { for (let i = Math.max(0, ci - half); i <= Math.min(n0 - 1, ci + half); i++) { const q = 1 - Math.abs(i - ci) / (half + 1); bars[i].t -= amp * Math.min(1, q * 1.25); } };
        const pumpAt = Math.round(n0 * (0.3 + r() * 0.4)), pumpHalf = 9 + Math.floor(r() * 3);
        feat(pumpAt, pumpHalf, 190 + r() * 50);
        const crashAt = pumpAt < n0 / 2 ? Math.round(n0 * (0.78 + r() * 0.08)) : Math.round(n0 * (0.14 + r() * 0.08));
        feat(crashAt, 5, -(70 + r() * 40));
        for (const b of bars) b.t = Math.min(b.t, WATER_Y - 60);
        T.pumpX = (bars[pumpAt].x + bars[pumpAt].x1) / 2; T.crashX = (bars[crashAt].x + bars[crashAt].x1) / 2;
        // limit neighbouring bar differences: midpoint of the upper and lower Lipschitz envelopes (keeps peaks + valleys)
        const n = bars.length, up = bars.map(b => b.t), lo = bars.map(b => b.t);
        for (let i = 1; i < n; i++) { up[i] = Math.min(up[i], up[i - 1] + BAR_STEP); lo[i] = Math.max(lo[i], lo[i - 1] - BAR_STEP); }
        for (let i = n - 2; i >= 0; i--) { up[i] = Math.min(up[i], up[i + 1] + BAR_STEP); lo[i] = Math.max(lo[i], lo[i + 1] - BAR_STEP); }
        let prev = null;
        for (let i = 0; i < n; i++) {
          const b = bars[i]; b.top = Math.min(WATER_Y - 60, Math.max(150, Math.round((up[i] + lo[i]) / 4) * 2));
          if (prev !== null && Math.abs(b.top - prev) > BAR_STEP) b.top = prev + Math.sign(b.top - prev) * BAR_STEP;
          b.kind = prev === null || b.top <= prev ? 1 : 2; prev = b.top;
        }
        for (let i = 0; i < n; i++) {
          const b = bars[i];
          for (let k = b.x; k < b.x1; k++) { hs[k] = b.top; T.colKind[k] = b.kind; }
          T.candleEdge[b.x] = 1; if (b.x + 1 < T.w) T.candleEdge[b.x + 1] = 1;
          T.candles.push({ x: b.x, x1: b.x1, top: b.top, kind: b.kind, wick: 10 + r() * 26 });
        }
        // bevel each step on the taller bar's side: a ramp from the taller top down to the lower one at the edge
        for (let i = 1; i < n; i++) {
          const a = bars[i - 1], b = bars[i], d = a.top - b.top; if (!d) continue;
          const L = Math.ceil(Math.abs(d) / BEVEL), hi = d > 0 ? b : a, lowTop = Math.max(a.top, b.top);
          for (let k = 0; k < L; k++) { const xx = d > 0 ? b.x + k : a.x1 - 1 - k; if (xx >= hi.x && xx < hi.x1) hs[xx] = Math.max(hs[xx], lowTop - (k + 1) * BEVEL); }
        }
        T.barStep = BAR_STEP; T.bevel = BEVEL;
      },
      post(T, r) { // a few floating neon platforms, high above the bars (never in the walking path)
        const n = 2 + (r() < 0.5 ? 1 : 0), seg = (T.w - 600) / n;
        for (let i = 0; i < n; i++) {
          const cx = 300 + seg * (i + 0.25 + r() * 0.5), pw = 90 + r() * 40;
          let ground = WATER_Y; for (let x = Math.floor(cx - pw / 2 - 30); x < cx + pw / 2 + 30; x++) ground = Math.min(ground, T.heights[Math.max(0, Math.min(T.w - 1, x))]);
          const top = Math.round(ground - 130 - r() * 50); if (top < 150) continue;
          for (let y = top; y < top + 12; y++) for (let x = Math.floor(cx - pw / 2); x < cx + pw / 2; x++) {
            if (x < 0 || x >= T.w) continue; const i2 = y * T.w + x;
            if (!T.mask[i2]) { T.mask[i2] = 1; T.tag[i2] = 1; }
          }
          T.platforms.push({ x: cx - pw / 2, w: pw, y: top });
        }
      } },
    color(x, y, run, n, T) {
      const i = y * T.w + x;
      if (T.tag[i] === 1) return run <= 2 ? [120, 220, 255] : [44, 50, 104]; // floating platform
      const green = (T.colKind ? T.colKind[x] : 1) === 1;
      if (run <= 3) return green ? [140, 255, 170] : [255, 120, 150];
      if (run <= 64) {
        if (T.candleEdge && T.candleEdge[x] === 1) return [20, 16, 40];
        const sh = 1 - run / 160;
        return green ? [30 * sh, 190 * sh, 100 * sh] : [200 * sh, 40 * sh, 80 * sh];
      }
      const dk = Math.min(1, run / 320) * 0.45; // calm dark base under the candles
      return [54 * (1 - dk), 44 * (1 - dk), 92 * (1 - dk)];
    },
    inlay: ['coin'], inlayCount: 14, noise: 8,
    scorch: ['rgba(30,10,40,0.55)', 'rgba(15,5,25,0.5)'], debris: ['#ff6f9a', '#4ade80', '#5a4ab0'],
    water: { top: 'rgba(200,40,70,0.85)', bottom: 'rgba(60,5,25,0.97)', line: 'rgba(255,140,160,0.8)', splash: 'rgba(255,100,130,0.95)', mini: 'rgba(200,40,70,0.85)', name: 'the liquidation pool' },
    clouds: null,
    bg(g, r) { // deliberately calm: dark gradient, faint grid, one soft distant chart line
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a0a1f'); sky.addColorStop(0.6, '#171436'); sky.addColorStop(1, '#2a1a44');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(160,150,255,0.05)'; g.lineWidth = 1;
      for (let x = 0; x <= W; x += 64) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
      for (let y = 0; y <= H; y += 64) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
      g.strokeStyle = 'rgba(120,255,180,0.10)'; g.lineWidth = 2; g.beginPath();
      let p = 330; for (let x = 0; x <= W; x += 40) { p = Math.max(180, Math.min(420, p + (r() - 0.55) * 40)); x ? g.lineTo(x, p) : g.moveTo(x, p); } g.stroke();
      const vg = g.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, 800); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    },
    decorate(T, r) { // just the candle wicks
      const d = [];
      for (const c of T.candles || []) if (c.top < WATER_Y - 20) d.push({ x: (c.x + c.x1) / 2, y: c.top, type: 'wick', h: c.wick, kind: c.kind });
      return d;
    },
    drawDeco(ctx, o) {
      ctx.fillStyle = o.kind === 1 ? 'rgba(120,255,170,0.6)' : 'rgba(255,110,140,0.6)';
      ctx.fillRect(o.x - 1.5, o.y - o.h, 3, o.h);
    },
  },
};
const WORLD_ORDER = ['moon', 'swamp', 'arctic', 'pump'];
function resolveWorld(id) {
  if (id && WORLDS[id]) return id;
  if (id === 'random' || id === undefined || id === null) return id === 'random' ? WORLD_ORDER[(Math.random() * WORLD_ORDER.length) | 0] : 'classic';
  return 'classic';
}

// embedded inlays (drawn onto existing ground only)
function drawInlay(ctx, kind, x, y, r) {
  if (kind === 'rock' || kind === 'moonrock') {
    ctx.fillStyle = kind === 'rock' ? `rgba(${90 + r() * 30 | 0},${80 + r() * 20 | 0},${75 + r() * 20 | 0},0.9)` : `rgba(${80 + r() * 30 | 0},${80 + r() * 30 | 0},${95 + r() * 25 | 0},0.9)`;
    ctx.beginPath(); ctx.ellipse(x, y, 3 + r() * 6, 2 + r() * 4, r() * 3, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'coin') {
    const rr = 3 + r() * 3;
    ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a8761a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, rr * 0.6, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'bone') {
    ctx.strokeStyle = 'rgba(235,225,200,0.85)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    const a = r() * 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6); ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.stroke();
    ctx.fillStyle = 'rgba(235,225,200,0.85)';
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([s1, s2]) => { ctx.beginPath(); ctx.arc(x + s1 * Math.cos(a) * 6 + s2 * Math.sin(a) * 1.6, y + s1 * Math.sin(a) * 6 - s2 * Math.cos(a) * 1.6, 1.6, 0, Math.PI * 2); ctx.fill(); });
  } else if (kind === 'root') {
    ctx.strokeStyle = 'rgba(60,40,22,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) ctx.lineTo(x + (r() - 0.5) * 20, y + k * 6 + r() * 6); ctx.stroke();
  } else if (kind === 'fishbone') {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y);
    for (let k = -4; k <= 4; k += 3) { ctx.moveTo(x + k, y - 3); ctx.lineTo(x + k + 1, y + 3); } ctx.stroke();
  } else if (kind === 'crystal') {
    ctx.fillStyle = 'rgba(200,245,255,0.7)'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 3, y); ctx.fill();
  } else if (kind === 'chip') {
    ctx.fillStyle = 'rgba(90,240,200,0.5)'; ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeStyle = 'rgba(90,240,200,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 18, y); ctx.lineTo(x + 18, y + 10); ctx.stroke();
  }
}

function makeBackground(seed, worldId) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  (WORLDS[worldId] || WORLDS.classic).bg(c.getContext('2d'), mulberry32(seed || 1234));
  return c;
}
