'use strict';
// World constants (shared by all scripts)
const W = 1280, H = 720, WATER_Y = 668;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Terrain {
  constructor(seed, width, worldId) {
    this.w = Math.max(W, (width || W) | 0);
    this.seed = seed >>> 0;
    this.worldId = WORLDS[worldId] ? worldId : 'classic'; this.world = WORLDS[this.worldId];
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); // the 3D renderer samples it
    this.mask = new Uint8Array(this.w * H); // 0 air, 1 dirt, 2 ice (Pengu walls)
    this.tag = new Uint8Array(this.w * H); // world-specific material tags (e.g. neon platforms)
    this.walls = []; this.caves = []; this.platforms = []; this.decos = []; this.rev = 0;
    this.generate();
  }

  generate() {
    const r = mulberry32(this.seed), m = this.mask, G = this.world.gen;
    const hs = new Float32Array(this.w);
    const amps = [95, 55, 30, 13, 5], freqs = [1.1, 2.4, 5, 11, 26];
    const oct = amps.map((a, i) => ({ a: a * G.amp[i] * (0.6 + r() * 0.8), f: (Math.PI * 2 / 1280) * freqs[i] * (0.7 + r() * 0.6), p: r() * Math.PI * 2 }));
    const base = G.base + (r() - 0.5) * 60;
    const ib = G.iceberg ? { f: (Math.PI * 2 / 1280) * (3 + r() * 1.5), p: r() * 6 } : null;
    for (let x = 0; x < this.w; x++) {
      let h = base;
      for (const o of oct) h += o.a * Math.sin(x * o.f + o.p);
      if (ib) h += G.iceberg * (Math.abs(Math.sin(x * ib.f + ib.p)) - 0.5); // pointy iceberg peaks
      const e = Math.min(x, this.w - 1 - x);
      if (e < 140) { const q = 1 - e / 140; h += q * q * 420; }
      hs[x] = Math.max(190, h);
    }
    this.arches = [];
    if (this.w > 2600 && G.macro !== 0) this.macro(r, hs, G); // big maps: distinct regions, not a stretched copy
    if (G.shape) G.shape(this, r, hs);
    for (let x = 0; x < this.w; x++) {
      const top = Math.floor(hs[x]);
      for (let y = Math.max(0, top); y < H; y++) m[y * this.w + x] = 1;
    }
    this.heights = hs;
    if (this.w > 2600 && G.macro !== 0) this.features(r, G);
    // tunnels through some of the big peaks (walkable: tall enough for a unit)
    for (const a of this.arches) {
      const top = hs[a.x | 0], cy = top + a.depth;
      if (cy + a.ry < WATER_Y - 30) { this._ellipseMask(a.x, cy, a.rx, a.ry, 0); this.caves.push({ x: a.x, y: cy, rx: a.rx, ry: a.ry, arch: true }); }
    }
    // caves
    const nc = Math.round((2 + Math.floor(r() * 4)) * G.caves * (this.w > 2600 ? 1.3 : 1) * this.w / 1280), cs = G.caveSize || 1;
    for (let i = 0; i < nc; i++) {
      const cx = 170 + r() * (this.w - 340), top = hs[cx | 0];
      const cy = top + 70 + r() * 110, rx = (28 + r() * 45) * cs, ry = (16 + r() * 18) * cs;
      if (cy + ry < WATER_Y - 10 && top < WATER_Y - 40) { this._ellipseMask(cx, cy, rx, ry, 0); this.caves.push({ x: cx, y: cy, rx, ry }); }
    }
    // floating islands
    const ni = Math.round((r() < 0.75 ? 1 + Math.floor(r() * 2) : 0) * G.islands * this.w / 1280), flat = G.islandFlat || -0.35;
    for (let i = 0; i < ni; i++) {
      const cx = 260 + r() * (this.w - 520);
      const cy = Math.max(170, Math.min(hs[cx | 0], WATER_Y - 40) - 130 - r() * 60);
      const rx = 55 + r() * 45, ry = 16 + r() * 8;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (x < 0 || x >= this.w || y < 0 || y >= H) continue;
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          if (dy < flat) continue;
          const wob = 0.12 * Math.sin(x * 0.2 + i);
          if (dx * dx + dy * dy < 1 + wob) m[y * this.w + x] = 1;
        }
    }
    if (G.post) G.post(this, r);
    this.paint(r);
    this.decos = this.world.decorate ? this.world.decorate(this, r) : [];
  }

  // Large-scale geography for wide maps: a slow rolling swell plus dense ~260-560 px zones, each one feature:
  // mesa/plateau (sometimes tunnelled), peak, ridge (saw-tooth), valley, cliff step (with an overhang under its lip),
  // crater, small water pit / lake, arch (tunnel through a peak), gorge with a bridge, or plain hills.
  // Per-world weights in gen.zones; gen.maxLakes caps the water pits; every world keeps its own profile on top.
  macro(r, hs, G) {
    const w = this.w, amp = 55 * (G.macroAmp == null ? 1 : G.macroAmp), f = Math.PI * 2 / (1800 + r() * 700), ph = r() * 6;
    for (let x = 0; x < w; x++) { const e = Math.min(x, w - 1 - x); if (e > 140) hs[x] += amp * Math.sin(x * f + ph) * Math.min(1, (e - 140) / 200); }
    const Z = Object.assign({ mesa: 1, peak: 0.9, ridge: 0.9, valley: 0.7, cliff: 1, crater: 0.6, lake: 0.6, arch: 0.7, bridge: 0.6, hills: 0.7 }, G.zones || {});
    if (G.arches != null && G.arches < 0) { Z.arch = 0; Z.bridge = 0; }
    const maxLakes = G.maxLakes == null ? 2 : G.maxLakes, maxBridges = G.maxBridges == null ? 2 : G.maxBridges;
    this.zones = []; this.cliffs = []; this.lakes = []; this.bridges = [];
    let prev = '';
    for (let x0 = 270; x0 < w - 380;) {
      const zw = 260 + r() * 300, x1 = Math.min(w - 270, x0 + zw), cx = (x0 + x1) / 2, half = (x1 - x0) / 2;
      const ok = Object.keys(Z).filter(k => Z[k] > 0 && !(k === prev && k !== 'hills') && !(k === 'lake' && (this.lakes.length >= maxLakes || prev === 'bridge')) && !(k === 'bridge' && (this.bridges.length >= maxBridges || prev === 'lake' || half < 150)));
      let tot = 0; for (const k of ok) tot += Z[k];
      let q = r() * tot, type = 'hills'; for (const k of ok) { q -= Z[k]; if (q <= 0) { type = k; break; } }
      prev = type; this.zones.push({ x0, x1, type });
      const lo = x0 | 0, hi = Math.min(w, x1 | 0);
      if (type === 'mesa') {
        let avg = 0; for (let x = lo; x < hi; x++) avg += hs[x]; avg /= Math.max(1, hi - lo);
        const top = Math.max(200, avg - 50 - r() * 70), edge = Math.min(70, half * 0.35);
        for (let x = lo; x < hi; x++) { const k = smooth(Math.min(1, Math.min(x - x0, x1 - x) / edge)); hs[x] = lerp(hs[x], top + Math.sin(x * 0.05) * 3, k * 0.95); }
        if (G.arches == null || G.arches >= 0) if (r() < (G.mesaTunnel == null ? 0.35 : G.mesaTunnel)) this.arches.push({ x: cx, depth: 60 + r() * 12, rx: Math.min(half * 0.75, 95 + r() * 40), ry: 25 + r() * 4 });
      } else if (type === 'peak' || type === 'arch') {
        const hgt = (type === 'arch' ? 150 : 110) + r() * 80, hw = half * (0.8 + r() * 0.2);
        for (let x = Math.max(0, cx - hw) | 0; x < Math.min(w, cx + hw); x++) hs[x] -= hgt * Math.pow(smooth(1 - Math.abs(x - cx) / hw), 1.2);
        if (type === 'arch') this.arches.push({ x: cx + (r() - 0.5) * 20, depth: 62 + r() * 16, rx: Math.min(hw * 0.7, 100 + r() * 40), ry: 27 + r() * 5 });
      } else if (type === 'ridge') {
        const n = 2 + Math.floor(r() * 3), seg = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const pc = x0 + seg * (i + 0.5), ph2 = 50 + r() * 75, hw = seg * 0.62;
          for (let x = Math.max(0, pc - hw) | 0; x < Math.min(w, pc + hw); x++) hs[x] -= ph2 * Math.pow(Math.max(0, 1 - Math.abs(x - pc) / hw), 1.5);
        }
      } else if (type === 'valley') {
        const dep = 50 + r() * 50;
        for (let x = lo; x < hi; x++) hs[x] = Math.min(hs[x] + dep * smooth(1 - Math.abs(x - cx) / half), Math.max(hs[x], WATER_Y - 55));
      } else if (type === 'cliff') { // a raised block with a sheer face on one side and a slope on the other
        const dir = r() < 0.5 ? -1 : 1, sx = cx - dir * half * (0.35 + r() * 0.2), hgt = 80 + r() * 70;
        for (let x = lo; x < hi; x++) {
          const d = (x - sx) * dir; if (d <= 0) continue;
          const far = dir > 0 ? x1 - x : x - x0; // slope back down at the zone end
          hs[x] -= hgt * smooth(Math.min(1, d / 14)) * smooth(Math.min(1, far / 110));
        }
        this.cliffs.push({ x: sx, dir, hgt });
      } else if (type === 'crater') {
        const R = Math.min(half * 0.75, 70 + r() * 70), dep = 35 + r() * 40;
        for (let x = Math.max(0, cx - R * 1.45) | 0; x < Math.min(w, cx + R * 1.45); x++) {
          const t = Math.abs(x - cx) / R;
          if (t < 1) hs[x] += dep * (1 - t * t); else hs[x] -= dep * 0.45 * smooth(1 - (t - 1) / 0.45);
        }
        (this.craters2 = this.craters2 || []).push({ x: cx, R });
      } else if (type === 'stairs') { // "pump and dump": a rising staircase, then a sheer drop (Pump: becomes a candle run)
        const dir = r() < 0.5 ? -1 : 1, hgt = 90 + r() * 80;
        for (let x = lo; x < hi; x++) { const t = dir > 0 ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0); hs[x] -= hgt * (t < 0.8 ? t / 0.8 : smooth(Math.max(0, 1 - (t - 0.8) / 0.06))); }
      } else if (type === 'lake' || type === 'bridge') { // a small water pit (lake) or a gorge spanned by a bridge
        const gw = type === 'lake' ? 38 + r() * 40 : 60 + r() * 45, bank = type === 'lake' ? 26 : 16;
        const lt = hs[Math.max(0, cx - gw - bank - 6) | 0], rt = hs[Math.min(w - 1, cx + gw + bank + 6) | 0];
        for (let x = Math.max(0, cx - gw - bank) | 0; x < Math.min(w, cx + gw + bank); x++) {
          const t = Math.abs(x - cx), k = t < gw ? 1 : smooth(1 - (t - gw) / bank);
          hs[x] = lerp(hs[x], Math.max(hs[x], WATER_Y + 22), k);
        }
        if (type === 'lake') this.lakes.push({ x: cx, w: gw });
        else this.bridges.push({ x0: cx - gw - bank - 10, x1: cx + gw + bank + 10, yl: lt, yr: rt });
      }
      x0 = x1;
    }
    for (let x = 0; x < w; x++) hs[x] = Math.max(150, hs[x]);
  }
  // mask-level features after the height field is filled: bridges (solid deck, arched underside) and overhangs
  features(r, G) {
    const m = this.mask, w = this.w, hs = this.heights;
    for (const b of this.bridges || []) {
      const span = b.x1 - b.x0;
      for (let x = Math.max(0, b.x0 | 0); x < Math.min(w, b.x1); x++) {
        const t = (x - b.x0) / span, top = Math.round(lerp(b.yl, b.yr, t) - Math.sin(t * Math.PI) * 6), e = Math.abs(t - 0.5) * 2;
        const th = 11 + 34 * Math.pow(e, 4); // thin in the middle, thick where it meets the banks
        for (let y = Math.max(0, top); y < Math.min(H, top + th); y++) m[y * w + x] = 1;
        if (top < hs[x]) hs[x] = top;
      }
    }
    if (G.overhang !== 0) for (const c of this.cliffs || []) { // undercut the cliff lip -> an overhang (with a shallow cave)
      const hx = Math.round(c.x + c.dir * 30), top = this.surfaceY(hx);
      if (top < 0 || top > WATER_Y - 120) continue;
      const cy = top + 22 + 20, ry = 18 + r() * 5, rx = 30 + r() * 10;
      if (cy + ry < WATER_Y - 20) { this._ellipseMask(c.x + c.dir * (rx - 6), cy, rx, ry, 0); this.caves.push({ x: c.x + c.dir * (rx - 6), y: cy, rx, ry, overhang: true }); }
    }
    // small floating ledges (flat tops), in addition to the world's islands
    const nl = Math.round((2 + r() * 2) * w / 1280 * (G.ledges == null ? 1 : G.ledges));
    for (let i = 0; i < nl; i++) {
      const cx = 220 + r() * (w - 440), ground = this.surfaceY(cx | 0); if (ground < 0) continue;
      const cy = Math.max(165, Math.min(ground, WATER_Y - 30) - 95 - r() * 70), rx = 30 + r() * 26, ry = 9 + r() * 5;
      if (this.isSolid(cx, cy - ry - 30) || this.isSolid(cx - rx, cy) || this.isSolid(cx + rx, cy)) continue;
      for (let y = Math.floor(cy); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x < 0 || x >= w || y >= H) continue; const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy < 1 + 0.1 * Math.sin(x * 0.3 + i)) m[y * w + x] = 1;
      }
      (this.ledges = this.ledges || []).push({ x: cx, y: cy, rx });
    }
  }

  _ellipseMask(cx, cy, rx, ry, v) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x < 0 || x >= this.w || y < 0 || y >= H) continue;
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.mask[y * this.w + x] = v;
      }
  }

  paint(r) {
    const ctx = this.ctx, img = ctx.createImageData(this.w, H), d = img.data, m = this.mask, s = this.seed, col = this.world.color, nz = this.world.noise || 22;
    for (let x = 0; x < this.w; x++) {
      let run = 0;
      for (let y = 0; y < H; y++) {
        const i = y * this.w + x;
        if (!m[i]) { run = 0; continue; }
        run++;
        const n = (hash2(x, y, s) - 0.5) * nz, c = col(x, y, run, n, this), j = i * 4;
        d[j] = c[0] + n; d[j + 1] = c[1] + n; d[j + 2] = c[2] + n; d[j + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // embedded flavour objects (bones, coins, ...), only drawn onto existing ground
    ctx.globalCompositeOperation = 'source-atop';
    const kinds = this.world.inlay;
    for (let k = 0; k < (this.world.inlayCount != null ? this.world.inlayCount : 90) * this.w / 1280; k++) {
      const x = r() * this.w, top = Math.min(this.heights[x | 0], H);
      const y = top + 22 + r() * (H - top);
      drawInlay(ctx, kinds[(r() * kinds.length) | 0], x, y, r);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  isSolid(x, y) {
    x = x | 0; y = y | 0;
    if (x < 0 || x >= this.w || y < 0 || y >= H) return false;
    return this.mask[y * this.w + x] !== 0;
  }

  surfaceY(x) {
    x = x | 0;
    if (x < 0 || x >= this.w) return -1;
    for (let y = 0; y < H; y++) if (this.mask[y * this.w + x]) return y;
    return -1;
  }

  carve(cx, cy, r) {
    const r2 = r * r, m = this.mask;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    const ir2 = (r * ICE_HARDNESS) * (r * ICE_HARDNESS);
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, d2 = dx * dx + dy * dy, i = y * this.w + x;
        if (d2 <= r2 && (m[i] !== 2 || d2 <= ir2)) m[i] = 0;
      }
    }
    this._dirtyWalls(x0, y0, x1, y1); this.rev++;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-atop';
    const sc = this.world.scorch;
    ctx.fillStyle = sc[0];
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sc[1];
    ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  carveRect(x, y, w, h) {
    const m = this.mask;
    const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(this.w - 1, Math.ceil(x + w));
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(H - 1, Math.ceil(y + h));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) m[yy * this.w + xx] = 0;
    this._dirtyWalls(x0, y0, x1, y1); this.rev++;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(60,10,40,0.55)';
    ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---- ice walls (separate material: tougher than dirt, drawn from the mask) ----
const ICE_HARDNESS = 0.5; // explosions only carve ice within this fraction of their radius
Terrain.prototype.addIceWall = function (x0, top, w, maxH) {
  x0 = Math.round(x0); top = Math.round(top);
  const wall = { x: x0, y: top, w, h: maxH, canvas: document.createElement('canvas'), dirty: true, alive: true };
  wall.canvas.width = w; wall.canvas.height = maxH;
  let cells = 0;
  for (let x = x0; x < x0 + w; x++) {
    if (x < 0 || x >= this.w) continue;
    for (let y = top; y < top + maxH && y < H; y++) {
      const i = y * this.w + x;
      if (this.mask[i] === 1) break; // stop at the ground
      if (this.mask[i] === 0) { this.mask[i] = 2; cells++; }
    }
  }
  if (!cells) return null;
  this.walls.push(wall);
  return wall;
};
Terrain.prototype.meltWall = function (wall) {
  if (!wall || !wall.alive) return;
  for (let y = wall.y; y < wall.y + wall.h && y < H; y++) for (let x = wall.x; x < wall.x + wall.w; x++) {
    if (x < 0 || x >= this.w || y < 0) continue;
    const i = y * this.w + x; if (this.mask[i] === 2) this.mask[i] = 0;
  }
  wall.alive = false; this.walls = this.walls.filter(w => w !== wall);
};
Terrain.prototype._dirtyWalls = function (x0, y0, x1, y1) {
  for (const w of this.walls) if (x1 >= w.x && x0 <= w.x + w.w && y1 >= w.y && y0 <= w.y + w.h) w.dirty = true;
};
Terrain.prototype.wallCells = function (wall) {
  let n = 0;
  for (let y = wall.y; y < wall.y + wall.h && y < H; y++) for (let x = wall.x; x < wall.x + wall.w; x++) if (x >= 0 && x < this.w && y >= 0 && this.mask[y * this.w + x] === 2) n++;
  return n;
};
Terrain.prototype.drawWalls = function (ctx) {
  for (const wall of this.walls) {
    if (wall.dirty) {
      const g = wall.canvas.getContext('2d'), img = g.createImageData(wall.w, wall.h), d = img.data;
      for (let y = 0; y < wall.h; y++) for (let x = 0; x < wall.w; x++) {
        const wx = wall.x + x, wy = wall.y + y;
        if (wx < 0 || wx >= this.w || wy < 0 || wy >= H || this.mask[wy * this.w + wx] !== 2) continue;
        const j = (y * wall.w + x) * 4, n = hash2(wx, wy, 99) * 30, edge = x < 2 || x >= wall.w - 2;
        const streak = ((x + y) % 11 === 0) ? 35 : 0;
        d[j] = (edge ? 140 : 175) + n + streak; d[j + 1] = (edge ? 215 : 232) + n * 0.5 + streak; d[j + 2] = 255; d[j + 3] = 225;
      }
      g.putImageData(img, 0, 0); wall.dirty = false;
    }
    ctx.drawImage(wall.canvas, wall.x, wall.y);
  }
};


// surface decorations are not solid; skip the ones whose ground was blown away
Terrain.prototype.drawDecos = function (ctx, t, camX, water, viewW) {
  const draw = this.world.drawDeco; if (!draw) return;
  const vw = viewW || W;
  for (const o of this.decos) {
    if (!!o.water !== water || o.x < camX - 60 || o.x > camX + vw + 60) continue;
    if (!o.water) {
      if (o.hang ? !this.isSolid(o.x, o.y - 2) : !(this.isSolid(o.x, o.y + 1) || this.isSolid(o.x, o.y + 3))) continue;
      if (!o.hang && this.isSolid(o.x, o.y - 3)) continue; // buried by nothing / under overhang after reshaping
    } else if (this.isSolid(o.x, WATER_Y - 4)) continue;
    draw(ctx, o, t);
  }
};
