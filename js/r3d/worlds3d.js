'use strict';
// Per-world 3D look: lighting, fog, sky, hazard-liquid shading, parallax background props,
// 3D versions of the surface decorations, and ambient particles. Cosmetic only.

const WORLD3D = {
  classic: {
    sky: ['#2c1f5e', '#e98aa9', '#ffcf9a'], fog: ['#d58fae', 1300, 3600], stars: 0,
    hemi: ['#ffd9ec', '#3a2a55', 0.75], sun: ['#fff0dc', 0.95, [-0.45, 0.85, 0.5]], amb: ['#4a3a6a', 0.25],
    water: { deep: '#123a8a', shallow: '#4aa6f0', foam: '#e6f6ff', opacity: 0.84, sun: '#fff1d0' },
    tufts: 'grass', rough: 0.92, fallback: '#7a5a3a', ambient: 'petals', noise: 0.1,
    sunDisc: { color: '#ffd7a0', size: 320, y: 250, z: -3200 },
  },
  moon: {
    sky: ['#010108', '#0e0b2a', '#05030f'], fog: ['#0a0820', 1700, 4200], stars: 1700,
    hemi: ['#b8c4ff', '#1a1430', 0.45], sun: ['#ffffff', 1.25, [-0.55, 0.75, 0.45]], amb: ['#2a2850', 0.3],
    water: { deep: '#07031c', shallow: '#4a1ea0', foam: '#78f0ff', opacity: 0.93, stars: true, glow: '#12062e', sun: '#a0f0ff', spec: 0.8 },
    tufts: 'pebble', rough: 0.95, fallback: '#77777f', ambient: 'dust', noise: 0.05,
  },
  swamp: {
    sky: ['#121e22', '#5d6e52', '#8a9466'], fog: ['#56664e', 650, 2300], stars: 0,
    hemi: ['#c8d8a8', '#2a2a18', 0.7], sun: ['#ffe0b0', 0.75, [-0.35, 0.7, 0.6]], amb: ['#3a4a30', 0.3],
    water: { deep: '#0f1f0c', shallow: '#4c7a36', foam: '#b8e090', opacity: 0.9, sun: '#ffe8b0', spec: 0.6 },
    tufts: 'grass', rough: 0.95, fallback: '#4e3e26', ambient: 'fireflies',
    sunDisc: { color: '#f4f0c8', size: 260, y: 520, z: -2600 },
  },
  arctic: {
    sky: ['#040a26', '#2f5f96', '#9cc8e8'], fog: ['#7fa8cc', 1200, 3800], stars: 700,
    hemi: ['#e4f2ff', '#3a5a80', 0.85], sun: ['#ffffff', 0.95, [-0.4, 0.8, 0.55]], amb: ['#30507a', 0.28],
    water: { deep: '#06234e', shallow: '#3fa6d8', foam: '#ffffff', opacity: 0.85, sun: '#ffffff', spec: 1.2 },
    tufts: 'snow', rough: 0.6, fallback: '#cfe6f7', ambient: 'snow', noise: 0.05,
  },
  pump: {
    sky: ['#05040f', '#15112e', '#0a0818'], fog: ['#0d0a20', 900, 3000], stars: 0,
    hemi: ['#b8b0ff', '#140f26', 0.55], sun: ['#e6e0ff', 0.85, [-0.4, 0.8, 0.55]], amb: ['#2a2450', 0.35],
    water: { deep: '#2a0410', shallow: '#c8284a', foam: '#ff9ab0', opacity: 0.9, glow: '#2a0008', sun: '#ffd0dc', spec: 0.9 },
    tufts: null, rough: 0.42, metal: 0.05, fallback: '#3a3060', ambient: null, noise: 0.03,
  },
};

// ---------- parallax background props ----------
function propKit(group, seed) {
  const r = rng3(seed), mats = {};
  const M = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(c), roughness: 0.9, flatShading: false }, o || {}))); };
  const add = (geo, mat, x, y, z, sx, sy, sz, ry) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); m.rotation.y = ry || 0; group.add(m); return m; };
  // jittered low-poly rock/iceberg geometry
  const lump = (detail, amt, sd) => { const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, rr = rng3(sd); const seen = new Map();
    for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3); let f = seen.get(k); if (f == null) { f = 1 + (rr() - 0.5) * amt; seen.set(k, f); } p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
    g.computeVertexNormals(); return g; };
  return { r, M, add, lump, lerp: (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t) };
}

const PROPS3D = {
  classic(g, WW, K, R3) {
    const wy = to3Y(WATER_Y);
    for (let i = 0; i < 16; i++) { // far dusk hills
      const x = -1600 + (i + K.r() * 0.6) * (WW + 3200) / 16, z = -950 - K.r() * 600;
      const m = K.add(sphereGeo(32), K.M('#' + K.lerp('#6b4c92', '#b56c9c', K.r()).getHexString(), { roughness: 1 }), x, wy - 30, z, 240 + K.r() * 260, 120 + K.r() * 230, 180 + K.r() * 120);
      m.receiveShadow = false;
    }
    for (let i = 0; i < 11; i++) { // mid islands with lollipop trees
      const x = -900 + (i + K.r()) * (WW + 1800) / 11, z = -330 - K.r() * 260, sx = 110 + K.r() * 150, sy = 40 + K.r() * 70;
      K.add(sphereGeo(28), K.M('#4f7d58'), x, wy - 12, z, sx, sy, 70 + K.r() * 40);
      const nt = 1 + (K.r() * 3) | 0;
      for (let t = 0; t < nt; t++) {
        const tx = x + (K.r() - 0.5) * sx * 1.1, th = 40 + K.r() * 50, ty = wy - 12 + sy * 0.75;
        K.add(geoCached('trunk', () => new THREE.CylinderGeometry(0.6, 1, 1, 8)), K.M('#5a3c2a'), tx, ty + th / 2, z + (K.r() - 0.5) * 30, 6, th, 6);
        K.add(geoCached('canopy', () => new THREE.IcosahedronGeometry(1, 1)), K.M(K.r() < 0.25 ? '#ff9ac8' : K.r() < 0.5 ? '#6db35e' : '#4c9a54', { flatShading: true }), tx, ty + th + 14, z, 26 + K.r() * 16);
      }
    }
    R3.clouds(g, '#fff0f6', 9, 520, 760, -1300, -1800);
  },
  moon(g, WW, K, R3) {
    const wy = to3Y(WATER_Y), rock = K.M('#8d8d9a', { flatShading: true, roughness: 1 });
    for (let i = 0; i < 12; i++) {
      const x = -1700 + (i + K.r() * 0.7) * (WW + 3400) / 12, z = -900 - K.r() * 700;
      K.add(K.lump(2, 0.35, 10 + i), K.M('#' + K.lerp('#6e6e7c', '#a2a2b0', K.r()).getHexString(), { flatShading: true, roughness: 1 }), x, wy + 10, z, 220 + K.r() * 240, 110 + K.r() * 160, 160);
    }
    // moon base on a mid-ground mesa
    const bx = WW * 0.32 + (K.r() - 0.5) * 300, bz = -470, top = wy + 70;
    K.add(K.lump(2, 0.2, 77), rock, bx, wy + 10, bz, 330, 64, 150);
    const glass = new THREE.MeshStandardMaterial({ color: '#a8dcff', transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.3, emissive: '#1a3a60', emissiveIntensity: 0.8 });
    const metal = K.M('#c8ccd8', { roughness: 0.4, metalness: 0.6 });
    for (const [dx, rr] of [[-60, 44], [40, 32], [110, 22]]) {
      K.add(geoCached('dome', () => new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), glass, bx + dx, top, bz, rr);
      K.add(geoCached('domeRing', () => new THREE.CylinderGeometry(1, 1, 0.12, 28)), metal, bx + dx, top, bz, rr * 1.04, 30, rr * 1.04);
      const s = glowSprite('#ffd88a', rr * 2.2, 0.55); s.position.set(bx + dx, top + rr * 0.35, bz); g.add(s);
    }
    K.add(geoCached('tubeH', () => new THREE.CylinderGeometry(1, 1, 1, 12)), metal, bx - 8, top + 8, bz, 7, 80, 7).rotation.z = Math.PI / 2;
    K.add(geoCached('tubeH', () => new THREE.CylinderGeometry(1, 1, 1, 12)), metal, bx + 75, top + 6, bz, 5, 60, 5).rotation.z = Math.PI / 2;
    const ant = K.add(geoCached('tubeH', () => new THREE.CylinderGeometry(1, 1, 1, 12)), metal, bx - 140, top + 50, bz - 10, 2, 100, 2);
    const blink = glowSprite('#ff4040', 26, 1); blink.position.set(bx - 140, top + 102, bz - 10); g.add(blink); R3.anims.push(t => { blink.material.opacity = (t % 1.4) < 0.5 ? 1 : 0.1; });
    void ant;
    // Earth + a ringed planet (far sky, follow the camera with a little parallax)
    const earthTex = canvasTex(makeCanvas(512, 256, (c, w, h) => {
      c.fillStyle = '#1d5fb8'; c.fillRect(0, 0, w, h); const rr2 = rng3(5);
      for (let i = 0; i < 26; i++) { c.fillStyle = rr2() < 0.6 ? '#3f9a4a' : '#9a8a52'; c.beginPath(); c.ellipse(rr2() * w, h * (0.15 + rr2() * 0.7), 20 + rr2() * 60, 12 + rr2() * 30, rr2() * 3, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 40; i++) { c.beginPath(); c.ellipse(rr2() * w, rr2() * h, 20 + rr2() * 50, 4 + rr2() * 6, rr2(), 0, 7); c.fill(); }
      c.fillStyle = '#f2f8ff'; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 14, w, 14);
    }));
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.6, emissive: '#0a2a5a', emissiveIntensity: 0.5, fog: false }));
    earth.scale.setScalar(150); const eg = new THREE.Group(); eg.userData.dyn = true; eg.add(earth); const atm = glowSprite('#7fc8ff', 420, 0.55); eg.add(atm);
    R3.sky(eg, 900, 640, -2700); R3.anims.push(t => { earth.rotation.y = t * 0.03; });
    const pl = new THREE.Group(); const ps = new THREE.Mesh(sphereGeo(32), new THREE.MeshStandardMaterial({ color: '#b07ad8', roughness: 0.8, fog: false })); ps.scale.setScalar(55); pl.add(ps);
    const ring = new THREE.Mesh(new THREE.RingGeometry(75, 110, 64), new THREE.MeshBasicMaterial({ color: '#e0c8ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false })); ring.rotation.x = 1.25; ring.rotation.y = 0.3; pl.add(ring);
    R3.sky(pl, -950, 600, -2900);
  },
  swamp(g, WW, K, R3) {
    const wy = to3Y(WATER_Y), bark = K.M('#3b2e22', { roughness: 1 }), moss = K.M('#7f8c68', { roughness: 1 });
    const trunkGeo = geoCached('cypress', () => { const pts = []; for (let i = 0; i <= 12; i++) { const y = i / 12; pts.push(new THREE.Vector2(0.09 + 0.33 * Math.pow(1 - y, 5) + 0.02 * Math.sin(y * 20), y)); } return new THREE.LatheGeometry(pts, 10); });
    for (let i = 0; i < 20; i++) {
      const x = -1400 + (i + K.r()) * (WW + 2800) / 20, z = -170 - Math.pow(K.r(), 0.7) * 900, th = 210 + K.r() * 200;
      K.add(trunkGeo, bark, x, wy - 8, z, th * 0.5, th, th * 0.5);
      for (let c = 0; c < 5; c++) {
        const cx = x + (K.r() - 0.5) * 120, cy = wy + th * (0.72 + K.r() * 0.3), cz = z + (K.r() - 0.5) * 50;
        K.add(geoCached('canopy', () => new THREE.IcosahedronGeometry(1, 1)), K.M(K.r() < 0.5 ? '#2f4a2a' : '#3e5a32', { flatShading: true }), cx, cy, cz, 40 + K.r() * 34, 16 + K.r() * 10, 34);
        for (let m = 0; m < 3; m++) K.add(geoCached('mossCone', () => { const gg = new THREE.ConeGeometry(1, 1, 5); gg.rotateX(Math.PI); gg.translate(0, -0.5, 0); return gg; }), moss, cx + (K.r() - 0.5) * 60, cy - 6, cz + (K.r() - 0.5) * 30, 4 + K.r() * 3, 26 + K.r() * 30, 3);
      }
    }
    // reed clumps + floating logs in the background water
    for (let i = 0; i < 26; i++) {
      const x = -600 + K.r() * (WW + 1200), z = -120 - K.r() * 260;
      for (let k = 0; k < 6; k++) {
        const h = 26 + K.r() * 36, rx = x + (K.r() - 0.5) * 24;
        const reed = K.add(geoCached('reed', () => { const gg = new THREE.CylinderGeometry(0.5, 0.9, 1, 5); gg.translate(0, 0.5, 0); return gg; }), K.M('#6a8a3a'), rx, wy - 4, z + (K.r() - 0.5) * 20, 1.4, h, 1.4);
        reed.rotation.z = (K.r() - 0.5) * 0.3;
        if (K.r() < 0.5) K.add(sphereGeo(10), K.M('#6a4428'), rx + reed.rotation.z * -h, wy - 4 + h * 0.95, reed.position.z, 2.2, 6, 2.2);
      }
    }
    for (let i = 0; i < 5; i++) { const log = K.add(geoCached('log', () => new THREE.CylinderGeometry(1, 1, 1, 10)), bark, K.r() * WW, wy, -150 - K.r() * 300, 7, 80 + K.r() * 60, 7); log.rotation.z = Math.PI / 2; log.rotation.y = (K.r() - 0.5); log.userData.dyn = true; const ph = K.r() * 6; R3.anims.push(t => { log.position.y = wy + wave3(log.position.x, log.position.z, t) - 2; log.rotation.x = Math.sin(t + ph) * 0.05; }); }
    R3.mist(g, '#c8d8b8', 14, wy + 10, wy + 120);
  },
  arctic(g, WW, K, R3) {
    const wy = to3Y(WATER_Y);
    const iceA = K.M('#f2faff', { flatShading: true, roughness: 0.55 }), iceB = K.M('#cfe8fb', { flatShading: true, roughness: 0.4 }), iceC = K.M('#9fd2f2', { flatShading: true, roughness: 0.25, metalness: 0.1 });
    for (let i = 0; i < 9; i++) { // far mountains
      const x = -1800 + (i + K.r() * 0.5) * (WW + 3600) / 9, z = -1900 - K.r() * 400, h = 380 + K.r() * 420;
      K.add(geoCached('mtn' + (i % 3), () => { const gg = new THREE.ConeGeometry(1, 1, 7, 3); const p = gg.attributes.position, rr = rng3(40 + i % 3); for (let v = 0; v < p.count; v++) if (p.getY(v) < 0.49) { p.setX(v, p.getX(v) * (0.85 + rr() * 0.3)); p.setZ(v, p.getZ(v) * (0.85 + rr() * 0.3)); } gg.computeVertexNormals(); gg.translate(0, 0.5, 0); return gg; }), K.r() < 0.5 ? iceA : iceB, x, wy - 20, z, h * 0.9, h, h * 0.6, K.r() * 6);
    }
    for (let i = 0; i < 22; i++) { // icebergs
      const x = -1200 + (i + K.r()) * (WW + 2400) / 22, z = -180 - Math.pow(K.r(), 0.8) * 1100, s = 40 + K.r() * 120;
      const m = K.add(K.lump(1, 0.5, 100 + i), K.r() < 0.4 ? iceB : iceA, x, wy + s * 0.15, z, s * (1 + K.r()), s * (0.5 + K.r() * 0.9), s * 0.8, K.r() * 6);
      if (K.r() < 0.35) K.add(geoCached('spire', () => new THREE.ConeGeometry(1, 1, 5)), iceC, x + (K.r() - 0.5) * s, wy + s * 0.8, z, s * 0.25, s * 1.2, s * 0.25);
      void m; K.r();
    }
    R3.aurora(g);
  },
  pump(g, WW, K, R3) {
    const wy = to3Y(WATER_Y);
    const up = new THREE.MeshStandardMaterial({ color: '#2fd47a', emissive: '#0f6a38', emissiveIntensity: 0.55, roughness: 0.35 });
    const dn = new THREE.MeshStandardMaterial({ color: '#ff4d6d', emissive: '#6a1022', emissiveIntensity: 0.55, roughness: 0.35 });
    for (const [z, s, n] of [[-420, 0.8, 30], [-850, 1.25, 26], [-1400, 1.9, 22]]) {
      let v = 260 + K.r() * 120; const x0 = -1600, step = (WW + 3200) / n;
      for (let i = 0; i < n; i++) {
        const o = v; v = clamp(v + (K.r() - 0.45) * 120 * s, 120, 520 + 160 * s); const hi = Math.max(o, v) + K.r() * 30 * s, lo = Math.min(o, v) - K.r() * 30 * s;
        const x = x0 + i * step, mat = v >= o ? up : dn, bw = 22 * s;
        K.add(boxGeo(), mat, x, wy + (o + v) / 2 - 40, z, bw, Math.max(6, Math.abs(v - o)), bw);
        K.add(boxGeo(), mat, x, wy + (hi + lo) / 2 - 40, z, 2.5 * s, hi - lo, 2.5 * s);
      }
    }
    // faint grid wall far behind
    const grid = canvasTex(makeCanvas(512, 256, (c, w, h) => { c.strokeStyle = 'rgba(140,120,255,0.55)'; c.lineWidth = 1; for (let x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke(); } for (let y = 0; y <= h; y += 32) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke(); } }));
    grid.wrapS = grid.wrapT = THREE.RepeatWrapping; grid.repeat.set(10, 3);
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(9000, 2600), new THREE.MeshBasicMaterial({ map: grid, transparent: true, opacity: 0.12, depthWrite: false, fog: false }));
    R3.sky(gp, 0, 700, -2600, 0.6);
  },
};

// ---------- 3D surface decorations ----------
// returns { obj, anim } or null; obj is placed at the deco's (x, y) on the top surface
function makeDeco3D(worldId, o, K, R3) {
  const s = o.s || 1, g = new THREE.Group();
  const M = K.M, add = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); m.castShadow = true; g.add(m); return m; };
  const cyl = geoCached('dcyl', () => new THREE.CylinderGeometry(1, 1, 1, 10)), cone = geoCached('dcone', () => new THREE.ConeGeometry(1, 1, 10));
  let anim = null, front = false;
  switch (o.type) {
    case 'flag': {
      add(cyl, M('#d8d8e0', { metalness: 0.6, roughness: 0.3 }), 0, 22 * s, 0, 0.8, 44 * s, 0.8);
      const tex = R3.flagTex || (R3.flagTex = canvasTex(makeCanvas(64, 40, (c) => { c.fillStyle = '#ffd84a'; c.fillRect(0, 0, 64, 40); c.fillStyle = '#e9a04a'; c.beginPath(); c.arc(32, 20, 13, 0, 7); c.fill(); c.fillStyle = '#4a2a12'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillText('Ð', 32, 27); })));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(22 * s, 14 * s, 8, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
      f.position.set(11 * s * (o.f || 1), 36 * s, 0); f.castShadow = true; f.userData.dyn = true; g.add(f);
      const p = f.geometry.attributes.position, x0 = Float32Array.from({ length: p.count }, (_, i) => p.getX(i));
      anim = (obj, t) => { for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(t * 4 + x0[i] * 0.4) * (x0[i] + 11 * s) * 0.12); p.needsUpdate = true; };
      break;
    }
    case 'dish': {
      const m = M('#e2e4ec', { metalness: 0.4, roughness: 0.35 });
      add(cyl, m, 0, 6 * s, 0, 1.3, 12 * s, 1.3);
      const d = new THREE.Mesh(new THREE.SphereGeometry(10 * s, 20, 8, 0, Math.PI * 2, 0, 1.0), new THREE.MeshStandardMaterial({ color: '#f2f2f6', side: THREE.DoubleSide, metalness: 0.3, roughness: 0.3 }));
      d.position.set(0, 13 * s, 0); d.rotation.set(-0.9, 0, 0.4 * (o.f || 1)); d.castShadow = true; d.userData.dyn = true; g.add(d);
      add(sphereGeo(10), M('#ff5a5a', { emissive: '#ff2020', emissiveIntensity: 0.8 }), 0, 15 * s, 4 * s, 1.4);
      anim = (obj, t) => { d.rotation.y = Math.sin(t * 0.4 + o.x) * 0.6; };
      break;
    }
    case 'rock': add(K.lump(1, 0.45, (o.x | 0) + 3), M('#8a8a96', { flatShading: true }), 0, 4 * s, 0, 9 * s, 6 * s, 7 * s); front = true; break;
    case 'lamp': {
      add(cyl, M('#b8bcc8', { metalness: 0.6, roughness: 0.3 }), 0, 13 * s, 0, 0.9, 26 * s, 0.9);
      add(sphereGeo(14), M('#fff3c0', { emissive: '#ffd060', emissiveIntensity: 1.6 }), 0, 27 * s, 0, 3.2 * s);
      const gl = glowSprite('#ffd27a', 46 * s, 0.7); gl.position.set(0, 27 * s, 0); g.add(gl);
      anim = (obj, t) => { gl.material.opacity = 0.55 + 0.15 * Math.sin(t * 7 + o.x); };
      break;
    }
    case 'reeds': {
      const st = M('#6f9a3a'), tip = M('#6a4428');
      const blades = [];
      for (let k = 0; k < 6; k++) {
        const b = new THREE.Group(); b.position.set((h3(o.x, k, 1) - 0.5) * 12 * s, 0, (h3(o.x, k, 2) - 0.5) * 10); b.rotation.z = (h3(o.x, k, 3) - 0.5) * 0.4; g.add(b);
        const hgt = (18 + h3(o.x, k, 4) * 18) * s;
        const m = new THREE.Mesh(geoCached('reedB', () => { const gg = new THREE.CylinderGeometry(0.35, 0.8, 1, 5); gg.translate(0, 0.5, 0); return gg; }), st); m.scale.set(1, hgt, 1); m.castShadow = true; b.add(m);
        if (k % 2 === 0) { const c = new THREE.Mesh(sphereGeo(10), tip); c.scale.set(1.6, 4.5, 1.6); c.position.y = hgt * 0.92; b.add(c); }
        blades.push(b);
      }
      anim = (obj, t) => { obj.rotation.z = Math.sin(t * 1.6 + (o.ph || 0)) * 0.05; obj.rotation.x = Math.sin(t * 1.1 + (o.ph || 0) * 2) * 0.04; };
      break;
    }
    case 'shroom': {
      add(cyl, M('#efe2c4'), 0, 3.5 * s, 0, 1.6 * s, 7 * s, 1.6 * s);
      const cap = add(geoCached('scap', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M('#e0603a', { emissive: '#ff6a2a', emissiveIntensity: 0.25 }), 0, 6.5 * s, 0, 5.5 * s, 4 * s, 5.5 * s);
      for (let k = 0; k < 4; k++) add(sphereGeo(8), M('#fff6e8'), Math.cos(k * 1.7) * 3 * s, 9 * s, Math.sin(k * 1.7) * 3 * s, 0.9 * s);
      const gl = glowSprite('#ffb070', 22 * s, 0.35); gl.position.y = 7 * s; g.add(gl); void cap; front = true;
      break;
    }
    case 'stump': {
      add(cyl, M('#5a4028'), 0, 5 * s, 0, 6 * s, 10 * s, 6 * s);
      add(cyl, M('#c49a62'), 0, 10.1 * s, 0, 5.4 * s, 0.4, 5.4 * s);
      break;
    }
    case 'pad': {
      const pad = new THREE.Mesh(geoCached('pad', () => new THREE.CylinderGeometry(1, 1, 0.2, 20, 1, false, 0.35, Math.PI * 2 - 0.7)), M('#4f9a3a', { roughness: 0.5 }));
      pad.scale.set(14 * s, 1, 11 * s); g.add(pad);
      if (o.flower) { for (let k = 0; k < 6; k++) { const p = add(cone, M('#ff9ac8', { emissive: '#ff6aa8', emissiveIntensity: 0.2 }), Math.cos(k) * 2.5, 2.5, Math.sin(k) * 2.5, 1.6, 4.5, 1.6); p.rotation.set(Math.sin(k) * 0.6, 0, -Math.cos(k) * 0.6); } add(sphereGeo(8), M('#ffe066'), 0, 2.5, 0, 1.4); }
      anim = (obj, t) => { obj.position.y = to3Y(WATER_Y) + wave3(obj.position.x, obj.position.z, t) + 0.4; obj.rotation.y = Math.sin(t * 0.3 + o.ph) * 0.4; };
      break;
    }
    case 'igloo': {
      const snow = M('#f4fbff', { roughness: 0.7 });
      add(geoCached('dome', () => new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), snow, 0, 0, 0, 13 * s, 11 * s, 12 * s);
      const door = add(geoCached('igDoor', () => { const gg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, -Math.PI / 2, Math.PI); gg.rotateX(Math.PI / 2); return gg; }), snow, 0, 0, 11 * s, 5 * s, 6 * s, 6 * s);
      void door; add(sphereGeo(10), M('#203048'), 0, 2.5 * s, 14.2 * s, 3.2 * s, 3.6 * s, 1);
      break;
    }
    case 'crystal': {
      const cm = new THREE.MeshStandardMaterial({ color: '#9fe6ff', emissive: '#3ab0e8', emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85, flatShading: true });
      for (let k = 0; k < 3; k++) { const c = add(geoCached('cryst', () => new THREE.OctahedronGeometry(1, 0)), cm, (k - 1) * 4 * s, 7 * s, (k % 2) * 3, 2.6 * s, (8 + k * 3) * s * (k === 1 ? 1.3 : 0.8), 2.6 * s); c.rotation.z = (k - 1) * 0.35; }
      const gl = glowSprite('#7fdcff', 34 * s, 0.4); gl.position.y = 8 * s; g.add(gl);
      anim = (obj, t) => { gl.material.opacity = 0.3 + 0.15 * Math.sin(t * 2 + o.x); };
      break;
    }
    case 'snowman': {
      const sn = M('#fafdff', { roughness: 0.8 });
      add(sphereGeo(20), sn, 0, 7 * s, 0, 8 * s); add(sphereGeo(20), sn, 0, 18 * s, 0, 6 * s); add(sphereGeo(20), sn, 0, 27 * s, 0, 4.4 * s);
      const n = add(cone, M('#ff8a2a'), 0, 27 * s, 5.5 * s, 1.1 * s, 5 * s, 1.1 * s); n.rotation.x = Math.PI / 2;
      for (const ex of [-1.6, 1.6]) add(sphereGeo(8), M('#111'), ex * s, 28.5 * s, 3.8 * s, 0.7 * s);
      add(cyl, M('#3a6ea8'), 0, 23.5 * s, 0, 4.8 * s, 1.6 * s, 4.8 * s);
      break;
    }
    case 'icicle': {
      const ic = new THREE.MeshStandardMaterial({ color: '#d8f4ff', roughness: 0.05, transparent: true, opacity: 0.85, emissive: '#5ab0e0', emissiveIntensity: 0.3 });
      for (let k = 0; k < 3; k++) { const c = add(cone, ic, (k - 1) * 3 * s, -(5 + k * 2) * s, (k - 1) * 3, 1.5 * s, (10 + (k % 2) * 6) * s, 1.5 * s); c.rotation.x = Math.PI; }
      break;
    }
    case 'floe': {
      const f = add(K.lump(1, 0.25, (o.x | 0) + 9), M('#f2faff', { flatShading: true, roughness: 0.5 }), 0, 0, 0, 22 * s, 4 * s, 15 * s);
      void f; anim = (obj, t) => { obj.position.y = to3Y(WATER_Y) + wave3(obj.position.x, obj.position.z, t) + 1; obj.rotation.z = Math.sin(t * 0.8 + o.ph) * 0.05; obj.rotation.y = o.ph + t * 0.02; };
      break;
    }
    case 'wick': {
      const m = new THREE.MeshStandardMaterial({ color: o.kind === 1 ? '#7dffb0' : '#ff8aa0', emissive: o.kind === 1 ? '#1a8a4a' : '#8a1a30', emissiveIntensity: 0.8, roughness: 0.3 });
      const hgt = Math.max(4, o.h || 20);
      add(boxGeo(), m, 0, hgt / 2, 0, 2.6, hgt, 2.6);
      return { obj: g, anim: null, z: (Z3.F + Z3.B) / 2 };
    }
    default: return null;
  }
  mergeStatic(g);
  return { obj: g, anim, front };
}
