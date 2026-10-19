'use strict';
// Extrudes the 2D terrain mask into a 3D slab: marching-squares contour walls (smooth normals,
// vertex colours sampled from the painted 2D terrain) + the painted terrain canvas as the front
// (and darkened back) cap. Rebuilt per 128px chunk, only where the mask changed.

const TS = 2;            // contour grid step in px
const TCHUNK = 64;       // cells per chunk (128px)
const TK = 5;            // strips along depth

// Build a contour-extruded mesh over cell range [i0,i1) x [j0,j1) where solid(i,j) says if the
// grid corner (i*TS, j*TS) is inside. Returns { geo, tops } (tops = upward-facing surface points).
function contourGeometry(field, i0, i1, j0, j1, zF, zB, colorAt, opts) {
  // field(i, j) -> 0..1 (smoothed occupancy at grid corner); iso-surface at 0.5 with linear
  // interpolation gives smooth slopes instead of pixel stairs.
  opts = opts || {};
  const NI = i1 - i0 + 1, NJ = j1 - j0 + 1, grid = new Float32Array(NI * NJ);
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) grid[j * NI + i] = field(i0 + i, j0 + j);
  const g = (i, j) => grid[(j - j0) * NI + (i - i0)];
  const segs = [], nacc = new Map(), pts = new Map();
  const hk = (i, j) => ((j * 4099 + i + 2) * 2), vk = (i, j) => ((j * 4099 + i + 2) * 2 + 1);
  const ept = (k) => {
    let p = pts.get(k); if (p) return p;
    const e = k & 1, idx = k >> 1, j = Math.floor(idx / 4099), i = idx - j * 4099 - 2;
    if (e) { const a = g(i, j), b = g(i, j + 1), t = clamp((0.5 - a) / ((b - a) || 1e-6), 0.02, 0.98); p = [i * TS, (j + t) * TS]; }
    else { const a = g(i, j), b = g(i + 1, j), t = clamp((0.5 - a) / ((b - a) || 1e-6), 0.02, 0.98); p = [(i + t) * TS, j * TS]; }
    pts.set(k, p); return p;
  };
  const add = (ka, kb, cx, cy) => {
    const a = ept(ka), b = ept(kb);
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    segs.push(ka, kb, nx, ny);
    for (const k of [ka, kb]) { const v = nacc.get(k); if (v) { v[0] += nx * l; v[1] += ny * l; } else nacc.set(k, [nx * l, ny * l]); }
  };
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const a = g(i, j) >= 0.5 ? 1 : 0, b = g(i + 1, j) >= 0.5 ? 1 : 0, c = g(i + 1, j + 1) >= 0.5 ? 1 : 0, d = g(i, j + 1) >= 0.5 ? 1 : 0;
    const sum = a + b + c + d; if (sum === 0 || sum === 4) continue;
    const T = hk(i, j), B = hk(i, j + 1), L = vk(i, j), Rr = vk(i + 1, j);
    const X = i * TS, Y = j * TS;
    if (a === c && b === d && a !== b) { // saddle: keep solids separate
      if (a) { add(L, T, X, Y); add(Rr, B, X + TS, Y + TS); } else { add(T, Rr, X + TS, Y); add(B, L, X, Y + TS); }
      continue;
    }
    const es = []; if (a !== b) es.push(T); if (b !== c) es.push(Rr); if (c !== d) es.push(B); if (d !== a) es.push(L);
    let cx = 0, cy = 0; if (a) { cx += X; cy += Y; } if (b) { cx += X + TS; cy += Y; } if (c) { cx += X + TS; cy += Y + TS; } if (d) { cx += X; cy += Y + TS; }
    add(es[0], es[1], cx / sum, cy / sum);
  }
  const ns = segs.length / 4, vpS = 2 * (TK + 1);
  const pos = new Float32Array(ns * vpS * 3), nor = new Float32Array(ns * vpS * 3), colA = new Float32Array(ns * vpS * 3), idx = new Uint32Array(ns * TK * 6);
  const tops = [], cc = new THREE.Color(), colCache = new Map();
  let vp = 0, ip = 0;
  for (let s = 0; s < ns; s++) {
    const ka = segs[s * 4], kb = segs[s * 4 + 1], snx = segs[s * 4 + 2], sny = segs[s * 4 + 3];
    const base = vp / 3;
    for (const [e, k] of [[0, ka], [1, kb]]) {
      const p = ept(k), na = nacc.get(k), nl = Math.hypot(na[0], na[1]) || 1, nx = na[0] / nl, ny = na[1] / nl;
      let c = colCache.get(k); if (!c) { c = colorAt(p[0], p[1], nx, ny); colCache.set(k, c); }
      const up = clamp((-ny - 0.3) / 0.5, 0, 1);
      for (let kz = 0; kz <= TK; kz++) {
        const f = kz / TK, z = zF + (zB - zF) * f;
        pos[vp] = p[0]; pos[vp + 1] = H - p[1]; pos[vp + 2] = z;
        // a little bevel: lean the normals forward at the front lip and backward at the back edge
        let n3x = nx, n3y = -ny, n3z = kz === 0 ? 0.55 : kz === TK ? -0.35 : 0; const ll = Math.hypot(n3x, n3y, n3z); n3x /= ll; n3y /= ll; n3z /= ll;
        nor[vp] = n3x; nor[vp + 1] = n3y; nor[vp + 2] = n3z;
        const shade = (1 - 0.24 * f) * (1 + (h3(k, kz, 3) - 0.5) * (opts.noise == null ? 0.12 : opts.noise)) * (1 + up * ((opts.topLift || 1.07) - 1));
        cc.copy(c).multiplyScalar(shade);
        colA[vp] = cc.r; colA[vp + 1] = cc.g; colA[vp + 2] = cc.b;
        vp += 3;
      }
      void e;
    }
    for (let kz = 0; kz < TK; kz++) {
      const a0 = base + kz, a1 = base + kz + 1, b0 = base + (TK + 1) + kz, b1 = b0 + 1;
      // winding so the face normal points along (snx,-sny) in 3D
      const p0 = ept(ka), p1 = ept(kb), dx = p1[0] - p0[0], dy = -(p1[1] - p0[1]);
      // face normal of (a0,b0,a1) = (b0-a0) x (a1-a0) = (dx,dy,0) x (0,0,dz) with dz<0
      const fnx = dy * (zB - zF) / TK, fny = -dx * (zB - zF) / TK;
      if (fnx * snx + fny * (-sny) > 0) { idx[ip++] = a0; idx[ip++] = b0; idx[ip++] = a1; idx[ip++] = a1; idx[ip++] = b0; idx[ip++] = b1; }
      else { idx[ip++] = a0; idx[ip++] = a1; idx[ip++] = b0; idx[ip++] = a1; idx[ip++] = b1; idx[ip++] = b0; }
    }
    if (sny < -0.7) { const p0 = ept(ka), p1 = ept(kb); tops.push((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, ka); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return { geo, tops };
}

class Terrain3D {
  constructor(R, T, cfg) {
    this.R = R; this.T = T; this.cfg = cfg; this.group = new THREE.Group();
    this.nx = Math.ceil(T.w / TS); this.ny = Math.ceil(H / TS);
    this.nChunks = Math.ceil((this.nx + 2) / TCHUNK);
    this.chunks = new Array(this.nChunks).fill(null);
    this.dirty = new Set(); for (let c = 0; c < this.nChunks; c++) this.dirty.add(c);
    this.tex = canvasTex(T.canvas);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: cfg.rough == null ? 0.9 : cfg.rough, metalness: cfg.metal || 0 });
    this.frontMat = new THREE.MeshStandardMaterial({ map: this.tex, alphaTest: 0.5, roughness: cfg.rough == null ? 0.92 : cfg.rough, metalness: cfg.metal || 0, bumpMap: this.tex, bumpScale: 0.9 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(T.w, H), this.frontMat);
    front.position.set(T.w / 2, H / 2, Z3.F); front.receiveShadow = true; this.group.add(front);
    // (no back cap: from the front-side camera it is never visible, and it cost a full-screen fill)
    this.decos = []; this.walls = new Map(); this.decoT = 0;
    this.data = null; this.dataRev = -1;
    this.texDirty = false;
    this.fallback = css3(cfg.fallback || '#7a5a3a').c;
  }
  markDirty(x0, x1) {
    const c0 = Math.max(0, Math.floor((x0 / TS + 1) / TCHUNK) - 0), c1 = Math.min(this.nChunks - 1, Math.floor((x1 / TS + 1) / TCHUNK));
    for (let c = c0; c <= c1; c++) this.dirty.add(c);
    // neighbouring chunk edges share contour cells
    if (c0 > 0) this.dirty.add(c0 - 1); if (c1 < this.nChunks - 1) this.dirty.add(c1 + 1);
    this.texDirty = true; this.decoDirty = true;
    const a = Math.max(0, Math.floor(x0) - 40), b = Math.min(this.T.w, Math.ceil(x1) + 40); // pixel cache: re-read only this slice
    this.pixDirty = this.pixDirty ? [Math.min(this.pixDirty[0], a), Math.max(this.pixDirty[1], b)] : [a, b];
  }
  solid(i, j) { // smoothed occupancy (5x5 px box) at grid corner
    const x = i * TS, y = j * TS, w = this.T.w, m = this.T.mask;
    if (x < 0 || x >= w) return 0; if (y >= H) return 1; if (y < 0) return 0;
    let n = 0, c = 0;
    for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy < 0) { c += 5; continue; } if (yy >= H) { n += 5; c += 5; continue; }
      for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; c++; if (xx >= 0 && xx < w && m[yy * w + xx] === 1) n++; } }
    return n / c;
  }
  pixels() { // CPU copy of the terrain bitmap (colours for the mesh); on a big map only the changed slice is re-read
    if (!this.data) { this.data = this.T.ctx.getImageData(0, 0, this.T.w, H).data; this.pixDirty = null; }
    else if (this.pixDirty && this.texDirtyData) {
      const [a, b] = this.pixDirty, w = this.T.w, sw = b - a;
      if (sw > 0) { const part = this.T.ctx.getImageData(a, 0, sw, H).data; for (let y = 0; y < H; y++) this.data.set(part.subarray(y * sw * 4, (y + 1) * sw * 4), (y * w + a) * 4); }
      this.pixDirty = null;
    }
    this.texDirtyData = false;
    return this.data;
  }
  colorAt(px, py, nx, ny) {
    const d = this.pixels(), w = this.T.w;
    for (const k of [2.5, 5, 9, 15, 24]) {
      const sx = Math.round(clamp(px - nx * k, 0, w - 1)), sy = Math.round(clamp(py - ny * k, 0, H - 1)), j = (sy * w + sx) * 4;
      if (d[j + 3] > 128) return new THREE.Color().setRGB(d[j] / 255, d[j + 1] / 255, d[j + 2] / 255, THREE.SRGBColorSpace);
    }
    return this.fallback.clone();
  }
  buildChunk(c) {
    const old = this.chunks[c];
    if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); if (old.tufts) { this.group.remove(old.tufts); old.tufts.dispose(); } }
    const i0 = c * TCHUNK - 1, i1 = Math.min(this.nx + 1, (c + 1) * TCHUNK - 1);
    const res = contourGeometry((i, j) => this.solid(i, j), i0, i1, 0, this.ny, Z3.F, Z3.B, (x, y, nx, ny) => this.colorAt(x, y, nx, ny), this.cfg);
    const mesh = new THREE.Mesh(res.geo, this.mat); mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const ch = { mesh, tufts: null };
    if (this.cfg.tufts && res.tops.length) ch.tufts = this.makeTufts(res.tops, c);
    this.chunks[c] = ch;
  }
  makeTufts(tops, c) {
    const kind = this.cfg.tufts, n = tops.length / 3;
    const geo = kind === 'grass' ? geoCached('tuft', () => { const g = new THREE.ConeGeometry(1.0, 6, 4); g.translate(0, 3, 0); return g; })
      : kind === 'snow' ? geoCached('snowlump', () => { const g = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); return g; })
        : geoCached('pebble', () => new THREE.IcosahedronGeometry(1, 0));
    const per = kind === 'grass' ? 3 : 1, dens = kind === 'grass' ? 0.75 : kind === 'snow' ? 0.18 : 0.22;
    const mat = this._tuftMat || (this._tuftMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: kind !== 'grass' }));
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n * per)); im.count = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    for (let t = 0; t < n; t++) {
      const x = tops[t * 3], y = tops[t * 3 + 1], k = tops[t * 3 + 2];
      if (h3(k, 7, c) > dens) continue;
      const base = this.colorAt(x, y, 0, -1);
      for (let b = 0; b < per; b++) {
        const r1 = h3(k, b, 11), r2 = h3(k, b, 12), r3 = h3(k, b, 13);
        const z = Z3.F - 3 - r1 * (Z3.F - Z3.B - 8);
        p.set(x + (r2 - 0.5) * 3, H - y - 0.6, z);
        if (kind === 'grass') { e.set((r3 - 0.5) * 0.7, r1 * 6, (r2 - 0.5) * 0.7); s.set(1, 0.6 + r3 * 0.9, 1); col.copy(base).multiplyScalar(1.05 + r3 * 0.35); }
        else if (kind === 'snow') { e.set(0, r1 * 6, 0); s.set(2 + r2 * 3, 0.8 + r3 * 1.2, 2 + r3 * 3); col.setRGB(0.92, 0.96, 1); }
        else { e.set(r1 * 6, r2 * 6, r3 * 6); s.setScalar(0.8 + r3 * 1.6); col.copy(base).multiplyScalar(0.7 + r2 * 0.4); }
        q.setFromEuler(e); m4.compose(p, q, s); im.setMatrixAt(im.count, m4); im.setColorAt(im.count, col); im.count++;
      }
    }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.receiveShadow = true; this.group.add(im);
    return im;
  }
  update(dt, t) {
    if (this.texDirty) { this.tex.needsUpdate = true; this.texDirty = false; this.texDirtyData = true; }
    let n = 0;
    for (const c of this.dirty) { this.buildChunk(c); this.dirty.delete(c); if (++n >= 6) break; }
    this.updateWalls();
    this.updateDecos(dt, t);
  }

  // ---- PENGU ice walls: contour-extruded translucent blocks ----
  updateWalls() {
    const T = this.T, live = new Set(T.walls);
    for (const [w, o] of this.walls) if (!live.has(w)) { this.group.remove(o.g); o.g.traverse(m => { if (m.geometry && !m.isSprite && !Object.values(_geoCache).includes(m.geometry)) m.geometry.dispose(); if (m.material && m.material.map && m.material.map !== this.tex) m.material.map.dispose(); }); this.walls.delete(w); this.R.fx.iceShatter(w); }
    for (const w of T.walls) {
      let o = this.walls.get(w);
      if (o && !o.dirty3d) continue;
      if (!o) { o = { g: new THREE.Group(), born: this.R.time }; this.group.add(o.g); this.walls.set(w, o); this.R.fx.iceForm(w); }
      while (o.g.children.length) { const m = o.g.children.pop(); if (m.geometry && !m.isSprite && !Object.values(_geoCache).includes(m.geometry)) m.geometry.dispose(); if (m.material && m.material.map && !m.isSprite) { m.material.map.dispose(); m.material.dispose(); } }
      const i0 = Math.floor(w.x / TS) - 2, i1 = Math.ceil((w.x + w.w) / TS) + 2, j0 = Math.max(0, Math.floor(w.y / TS) - 2), j1 = Math.min(this.ny, Math.ceil((w.y + w.h) / TS) + 2);
      const sol = (i, j) => { const x = i * TS, y = j * TS; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < T.w && yy >= 0 && yy < H && T.mask[yy * T.w + xx] === 2) n++; } return n / 9; };
      const ice = new THREE.Color('#d6f3ff');
      const res = contourGeometry(sol, i0, i1, j0, j1, Z3.U + 17, Z3.U - 17, () => ice, { noise: 0.2, topLift: 1.1 });
      const mat = this._iceMat || (this._iceMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.9, emissive: new THREE.Color('#4a9ac8'), emissiveIntensity: 0.45 }));
      const side = new THREE.Mesh(res.geo, mat); side.castShadow = true; o.g.add(side);
      // caps: the 2D ice texture on the front and back faces
      T.drawWalls(this.R.scratchCtx);
      const tex = canvasTex(w.canvas); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      for (const [z, ry] of [[Z3.U + 17, 0], [Z3.U - 17, Math.PI]]) {
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.1, metalness: 0.1, emissive: new THREE.Color('#5aaad8'), emissiveIntensity: 0.4, opacity: 0.95 }));
        cap.position.set(w.x + w.w / 2, H - (w.y + w.h / 2), z); cap.rotation.y = ry; o.g.add(cap);
      }
      // jagged crystal spikes along the top edge + a cold inner glow
      const cm = this._crystMat || (this._crystMat = new THREE.MeshStandardMaterial({ color: '#e8fbff', roughness: 0.05, metalness: 0.1, emissive: new THREE.Color('#6ac8f0'), emissiveIntensity: 0.55, transparent: true, opacity: 0.92, flatShading: true }));
      const cg = geoCached('cryst', () => new THREE.OctahedronGeometry(1, 0));
      for (let k = 0; k < 5; k++) {
        const x = Math.round(w.x + (k + 0.5) * w.w / 5); let y = -1;
        for (let yy = Math.max(0, w.y - 4); yy < Math.min(H, w.y + w.h); yy++) if (T.mask[yy * T.w + x] === 2) { y = yy; break; }
        if (y < 0) continue;
        for (const zz of [-9, 0, 9]) {
          const hh = 5 + h3(x, zz, 31) * 9, m = new THREE.Mesh(cg, cm);
          m.scale.set(2.2 + h3(x, zz, 32) * 1.5, hh, 2.2 + h3(x, zz, 33) * 1.5); m.position.set(x + (h3(x, zz, 34) - 0.5) * 4, H - y + hh * 0.45, Z3.U + zz); m.rotation.set((h3(x, zz, 35) - 0.5) * 0.5, h3(x, zz, 36) * 3, (h3(x, zz, 37) - 0.5) * 0.6); m.castShadow = true; o.g.add(m);
        }
      }
      if (!o.glow) { o.glow = glowSprite('#7fd8ff', Math.max(w.w, w.h) * 1.6, 0.35); } o.glow.position.set(w.x + w.w / 2, H - (w.y + w.h * 0.4), Z3.U + 20); o.g.add(o.glow);
      o.dirty3d = false;
    }
  }
  wallsDirty(x0, x1) { for (const [w, o] of this.walls) if (x1 >= w.x - 4 && x0 <= w.x + w.w + 4) o.dirty3d = true; }

  // ---- 3D decorations (reeds, domes, igloos, candle wicks ...) ----
  setDecos(list) { this.decos = list; for (const d of list) this.group.add(d.obj); this.decoDirty = true; }
  updateDecos(dt, t) {
    const T = this.T;
    if (this.decoDirty) {
      this.decoDirty = false;
      for (const d of this.decos) {
        const o = d.o; let vis = true;
        if (!o.water) {
          if (o.hang ? !T.isSolid(o.x, o.y - 2) : !(T.isSolid(o.x, o.y + 1) || T.isSolid(o.x, o.y + 3))) vis = false;
          if (!o.hang && T.isSolid(o.x, o.y - 3)) vis = false;
        } else if (T.isSolid(o.x, WATER_Y - 4)) vis = false;
        d.obj.visible = vis;
      }
    }
    for (const d of this.decos) if (d.obj.visible && d.anim) d.anim(d.obj, t, dt);
  }
  dispose() {
    this.group.traverse(m => { if (m.geometry && !Object.values(_geoCache).includes(m.geometry)) m.geometry.dispose(); });
    this.tex.dispose();
  }
}
