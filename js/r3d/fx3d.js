'use strict';
// Particles, explosions, projectiles and defence visuals for the 3D renderer.

class Billboards {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.siz = new Float32Array(max * 2);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSiz = new THREE.InstancedBufferAttribute(this.siz, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iSiz', this.aSiz); g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSiz; varying vec4 vCol; varying vec2 vUv; varying float vSoft;
        #include <fog_pars_vertex>
        void main(){ vCol = iCol; vUv = position.xy; vSoft = iSiz.y; vec4 mvPosition = modelViewMatrix*vec4(iPos,1.0);
          float c = cos(iSiz.y*7.0), s = sin(iSiz.y*7.0); vec2 p = mat2(c,-s,s,c)*position.xy;
          mvPosition.xy += p*iSiz.x; gl_Position = projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec4 vCol; varying vec2 vUv; varying float vSoft;
        #include <fog_pars_fragment>
        void main(){ float d = length(vUv)*2.0;
          float a = vSoft > 0.5 ? pow(max(0.0,1.0-d),1.4) * (0.75+0.25*sin(vUv.x*9.0+vSoft*13.0)*sin(vUv.y*8.0)) : smoothstep(1.0,0.55,d);
          if (a <= 0.003) discard; gl_FragColor = vec4(vCol.rgb, vCol.a*a);
          #include <encodings_fragment>
          ${additive ? '' : '#include <fog_fragment>'}
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 8 : 6; this.g = g;
  }
  begin() { this.n = 0; }
  push(x, y, z, size, c, a, soft) {
    if (this.n >= this.max) return; const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = a;
    this.siz[i * 2] = size; this.siz[i * 2 + 1] = soft || 0;
  }
  end() { this.g.instanceCount = this.n; this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSiz.needsUpdate = true; }
}

const SPECIAL_SHOTS = { moon: 1, fly: 1, fish: 1, rug: 1 };

class FX3D {
  constructor(R) {
    this.R = R; const S = R.scene;
    this.add = new Billboards(4000, true); this.norm = new Billboards(4000, false);
    S.add(this.add.mesh); S.add(this.norm.mesh);
    this.chunks = new THREE.InstancedMesh(boxGeo(), new THREE.MeshStandardMaterial({ roughness: 0.85 }), 1600);
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.chunks.count = 0; this.chunks.frustumCulled = false; this.chunks.castShadow = false;
    this.chunks.setColorAt(0, new THREE.Color()); S.add(this.chunks);
    this.parts = [];
    this.lights = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight('#ffb050', 0, 400, 1.6); S.add(l); this.lights.push({ l, t: 0, max: 1, I: 0 }); }
    this.projLight = new THREE.PointLight('#ff9a40', 0, 260, 1.6); S.add(this.projLight);
    this.rings = []; this.ringGeo = new THREE.RingGeometry(0.82, 1, 72);
    this.proj = new Map(); this.defs = new Map();
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this.C = { white: new THREE.Color('#ffffff'), fire0: new THREE.Color('#ffe9a8'), fire1: new THREE.Color('#ff6a12'), smoke: new THREE.Color('#3a3238'), ember: new THREE.Color('#ffb040') };
  }
  reset() {
    this.parts.length = 0;
    for (const [, m] of this.proj) { m.obj.visible = false; ((this.pool || (this.pool = {}))[m.id] || (this.pool[m.id] = [])).push(m); } this.proj.clear();
    for (const [, d] of this.defs) d.g.parent && d.g.parent.remove(d.g); this.defs.clear();
    for (const r of this.rings) r.mesh.visible = false;
    for (const L of this.lights) { L.t = 0; L.l.intensity = 0; }
  }
  spawn(o) { if (this.parts.length < 3000) this.parts.push(o); return o; }
  flash(x, y, z, I, dist, color) {
    let L = this.lights.find(q => q.t <= 0) || this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.set(x, y, z + 40); L.l.color.set(color || '#ffb050'); L.l.distance = dist; L.I = I; L.t = L.max = 0.38;
  }
  ring(x, y, z, r0, r1, dur, color, horizontal, opacity) {
    let R = this.rings.find(q => !q.mesh.visible);
    if (!R) { const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.renderOrder = 9; this.R.scene.add(m); R = { mesh: m }; this.rings.push(R); }
    Object.assign(R, { t: 0, dur, r0, r1, horizontal, op: opacity || 0.9 }); R.mesh.material.color.set(color || '#ffffff');
    R.mesh.position.set(x, y, z); R.mesh.visible = true; R.mesh.rotation.set(horizontal ? -Math.PI / 2 : 0, 0, 0);
  }
  sampleTerrain(x, y) {
    const T = this.R.game.terrain; if (!T) return null;
    const xi = clamp(x | 0, 0, T.w - 1), yi = clamp(y | 0, 0, H - 1);
    const D = this.R.t3 ? this.R.t3.pixels() : null; if (!D) return null; const j = (yi * T.w + xi) * 4;
    if (D[j + 3] < 100) return null;
    return new THREE.Color().setRGB(D[j] / 255, D[j + 1] / 255, D[j + 2] / 255, THREE.SRGBColorSpace);
  }

  // --- event hooks from the simulation ---
  explosion(x, y, r, small) {
    const X = x, Y = to3Y(y), Z = Z3.U, k = r / 40;
    this.flash(X, Y, Z, small ? 1.2 : 2.2 + k * 1.2, r * (small ? 4 : 8), '#ffb05a');
    this.ring(X, Y, Z, r * 0.3, r * 2.4, small ? 0.3 : 0.5, '#fff4d8', true, 0.8);
    if (!small) this.ring(X, Y, Z + 6, r * 0.2, r * 1.8, 0.35, '#ffd890', false, 0.7);
    // white-hot core flash
    this.spawn({ k: 0, x: X, y: Y, z: Z + 10, vx: 0, vy: 0, vz: 0, life: 0.16, max: 0.16, size: r * (small ? 1.8 : 2.8), grow: r * 5, c0: this.C.white, a: 0.9, drag: 0, grav: 0, soft: 0 });
    // fireball puffs (white-hot -> orange -> deep red -> gone)
    const nf = small ? 6 : 14 + (k * 8) | 0;
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 3.14, sp = (30 + Math.random() * 80) * k;
      this.spawn({ k: 0, x: X + Math.cos(a) * r * 0.25, y: Y + Math.sin(a) * r * 0.25, z: Z + (Math.random() - 0.5) * r * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 30, vz: Math.cos(e) * sp, life: 0.55 + Math.random() * 0.45, max: 1.0, size: r * (0.45 + Math.random() * 0.45), grow: r * 1.3, c0: this.C.fire0, c1: this.C.fire1, c2: this.C.fire2 || (this.C.fire2 = new THREE.Color('#8a1e06')), a: 0.75, drag: 3, grav: -60, soft: 1 + Math.random() });
    }
    // lingering smoke column (starts a beat later, rises and drifts with the wind)
    for (let i = 0; i < (small ? 3 : 9 + k * 4); i++) this.spawn({ k: 1, delay: 0.08 + Math.random() * 0.25, x: X + (Math.random() - 0.5) * r, y: Y + (Math.random() - 0.2) * r * 0.7, z: Z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 24 + this.R.game.wind * 30, vy: 22 + Math.random() * 36, vz: (Math.random() - 0.5) * 18, life: 1.6 + Math.random() * 1.6, max: 3.2, size: r * (0.5 + Math.random() * 0.3), grow: r * 0.8, c0: Math.random() < 0.5 ? this.C.smoke : (this.C.smoke2 || (this.C.smoke2 = new THREE.Color('#6a5f66'))), a: 0.6, drag: 0.7, grav: 0, soft: 1 + Math.random() });
    // embers
    for (let i = 0; i < (small ? 6 : 18 + k * 10); i++) {
      const a = Math.random() * 6.28, sp = (120 + Math.random() * 260) * Math.sqrt(k);
      this.spawn({ k: 0, x: X, y: Y, z: Z, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 80, vz: (Math.random() - 0.5) * sp, life: 0.5 + Math.random() * 0.8, max: 1.3, size: 2.5 + Math.random() * 2.5, grow: -1, c0: this.C.ember, a: 1, drag: 0.8, grav: 520, soft: 0 });
    }
    // terrain chunks: sample colours just outside the crater
    if (!small) {
      const cols = []; for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28, c = this.sampleTerrain(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5)); if (c) cols.push(c); }
      const pal = cols.length ? cols : (this.R.game.world.debris || ['#8b5e3c']).map(s => css3(s).c);
      const n = Math.min(46, 10 + r * 0.55);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, sp = (140 + Math.random() * 300) * Math.sqrt(k);
        this.spawn({ k: 2, x: X + Math.cos(a) * r * 0.5, y: Y + Math.sin(a) * r * 0.5, z: Z + (Math.random() - 0.5) * 60, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 + 160, vz: (Math.random() - 0.3) * sp * 0.8, life: 1.6 + Math.random() * 1.4, max: 3, size: 2.5 + Math.random() * 4.5 * k, c0: pal[(Math.random() * pal.length) | 0], a: 1, drag: 0.2, grav: 620, spin: (Math.random() - 0.5) * 16, rx: Math.random() * 6, bounce: 1 });
      }
      this.R.kick(Math.min(1, r / 60));
    }
  }
  splash(x, y, s) {
    const X = x, Y = to3Y(WATER_Y), Z = Z3.U, wc = css3(this.R.game.world.water.splash).c;
    this.ring(X, Y + 1, Z, 4, 40 * s + 20, 0.9, '#ffffff', true, 0.6);
    this.ring(X, Y + 1, Z, 2, 26 * s + 10, 0.6, '#ffffff', true, 0.5);
    for (let i = 0; i < 26 * s + 6; i++) {
      const a = Math.random() * 6.28, sp = 30 + Math.random() * 90;
      this.spawn({ k: 1, x: X + Math.cos(a) * 4, y: Y, z: Z + Math.sin(a) * 6, vx: Math.cos(a) * sp * s, vy: (200 + Math.random() * 260) * s, vz: Math.sin(a) * sp * s, life: 0.7 + Math.random() * 0.5, max: 1.2, size: 3 + Math.random() * 4, grow: 2, c0: wc, a: 0.9, drag: 0.3, grav: 700, soft: 0 });
    }
  }
  rug(x, top, bottom) {
    for (let i = 0; i < 40; i++) this.spawn({ k: 0, x: x + (Math.random() - 0.5) * 50, y: to3Y(top + Math.random() * (bottom - top)), z: Z3.U + (Math.random() - 0.5) * 70, vx: (Math.random() - 0.5) * 30, vy: 40 + Math.random() * 60, vz: (Math.random() - 0.5) * 30, life: 0.8 + Math.random() * 0.7, max: 1.5, size: 6 + Math.random() * 10, grow: 8, c0: new THREE.Color(Math.random() < 0.5 ? '#ff4d8a' : '#ffd84a'), a: 0.8, drag: 1, grav: 0, soft: 1 + Math.random() });
    this.ring(x, to3Y(top), Z3.U, 10, 90, 0.6, '#ff5fa2', true, 0.8);
  }
  iceForm(w) {
    for (let i = 0; i < 40; i++) this.spawn({ k: 0, x: w.x + Math.random() * w.w, y: to3Y(w.y + Math.random() * w.h), z: Z3.U + (Math.random() - 0.5) * 40, vx: 0, vy: 15 + Math.random() * 20, vz: 0, life: 0.6 + Math.random() * 0.6, max: 1.2, size: 3 + Math.random() * 3, grow: -2, c0: new THREE.Color('#dff8ff'), a: 1, drag: 1, grav: 0, soft: 0 });
  }
  iceShatter(w) {
    const pal = [new THREE.Color('#dff6ff'), new THREE.Color('#a8dcff'), new THREE.Color('#ffffff')];
    for (let i = 0; i < 30; i++) this.spawn({ k: 2, x: w.x + Math.random() * w.w, y: to3Y(w.y + Math.random() * w.h), z: Z3.U + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 200, vy: 60 + Math.random() * 160, vz: (Math.random() - 0.5) * 160, life: 1.2 + Math.random(), max: 2.2, size: 2 + Math.random() * 4, c0: pal[i % 3], a: 1, drag: 0.2, grav: 620, spin: (Math.random() - 0.5) * 14, rx: Math.random() * 6, bounce: 1 });
  }
  hitSparks(u, amount) {
    const X = u.x, Y = to3Y(u.y - 18);
    for (let i = 0; i < Math.min(18, 4 + amount / 4); i++) { const a = Math.random() * 6.28, sp = 80 + Math.random() * 120; this.spawn({ k: 0, x: X, y: Y, z: Z3.U + 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 40, vz: (Math.random() - 0.5) * 60, life: 0.35 + Math.random() * 0.3, max: 0.65, size: 3 + Math.random() * 3, grow: -3, c0: this.C.white, a: 1, drag: 3, grav: 200, soft: 0 }); }
  }
  poof(X, Y, color, n) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; this.spawn({ k: 1, x: X + Math.cos(a) * 8, y: Y + Math.random() * 10, z: Z3.U + Math.sin(a) * 8, vx: Math.cos(a) * 40, vy: 20 + Math.random() * 30, vz: Math.sin(a) * 40, life: 0.6 + Math.random() * 0.4, max: 1, size: 8 + Math.random() * 6, grow: 14, c0: c, a: 0.7, drag: 2, grav: 0, soft: 1 + Math.random() }); }
  }

  // --- projectiles ---
  buildProj(id) {
    const g = new THREE.Group(), M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.45 }, o || {}));
    const mesh = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (sx) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); m.castShadow = true; g.add(m); return m; };
    const X = (geo) => { geo.rotateZ(-Math.PI / 2); return geo; }; // build along +X
    const o = { obj: g, flame: null, wings: null, tail: null, spinAxis: 'z' };
    if (id === 'bazooka' || id === 'moon') {
      const big = id === 'moon', L = big ? 22 : 14, R = big ? 4.4 : 2.7;
      mesh(X(new THREE.CylinderGeometry(R, R, L, 16)), M(big ? '#f4f4f4' : '#7d8b99', { metalness: big ? 0.2 : 0.6, roughness: 0.35 }));
      mesh(X(new THREE.ConeGeometry(R, R * 2.2, 16)).translate(L / 2 + R * 1.1, 0, 0), M('#e53935'));
      for (let i = 0; i < (big ? 3 : 4); i++) { const f = mesh(new THREE.BoxGeometry(R * 2, R * 1.8, 0.6), M(big ? '#e53935' : '#444'), -L / 2 + R, 0, 0); f.rotation.x = i / (big ? 3 : 4) * Math.PI * 2; f.geometry.translate(0, R * 1.2, 0); }
      if (big) { mesh(X(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 2.4, 16)), M('#f2c230', { metalness: 0.7, roughness: 0.3 }), 2); const w = mesh(sphereGeo(12), M('#7fd0ff', { emissive: '#3a7aff', emissiveIntensity: 0.6 }), 4, 0, R * 0.85, 1.8, 1.8, 0.8); void w; }
      const fl = glowSprite('#ffb040', big ? 34 : 22, 1); fl.position.x = -L / 2 - (big ? 10 : 6); g.add(fl); o.flame = fl;
      const core = glowSprite('#ffffff', big ? 14 : 9, 1); core.position.x = -L / 2 - 2; g.add(core);
      o.light = true;
    } else if (id === 'grenade') {
      mesh(new THREE.IcosahedronGeometry(4.6, 1), M('#3f6b2a', { flatShading: true, roughness: 0.6 }));
      mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10), M('#9a9a9a', { metalness: 0.7, roughness: 0.3 }), 0, 5, 0);
      mesh(new THREE.TorusGeometry(1.6, 0.35, 6, 14), M('#d0d0d0', { metalness: 0.8, roughness: 0.2 }), 2, 6.4, 0);
    } else if (id === 'fly') {
      mesh(sphereGeo(16), M('#1b1b1b', { roughness: 0.3, metalness: 0.3 }), 0, 0, 0, 4.2, 5, 4.2);
      mesh(sphereGeo(10), M('#ffd84a', { emissive: '#806000', emissiveIntensity: 0.5 }), 0, -0.5, 0, 4.4, 1.2, 4.4);
      for (const s of [-1.8, 1.8]) mesh(sphereGeo(10), M('#ff3b3b', { emissive: '#ff0000', emissiveIntensity: 0.8 }), s, 3.4, 3, 1.5);
      const wm = new THREE.MeshStandardMaterial({ color: '#dff2ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.1, depthWrite: false });
      o.wings = [-1, 1].map(s => { const w = new THREE.Mesh(sphereGeo(12), wm); w.scale.set(3, 6, 0.4); w.position.set(s * 3.5, 4.5, -1); w.geometry = sphereGeo(12); g.add(w); return w; });
    } else if (id === 'fish' || id === 'fishlet') {
      const sc = id === 'fish' ? 1.35 : 0.9, body = M('#9fe3ff', { roughness: 0.25, metalness: 0.25 });
      mesh(sphereGeo(20), body, 0, 0, 0, 8 * sc, 4.2 * sc, 3.4 * sc);
      mesh(sphereGeo(12), M('#e8f8ff', { roughness: 0.3 }), 1 * sc, -1.6 * sc, 0, 6 * sc, 2.2 * sc, 3 * sc);
      for (const s of [-1, 1]) mesh(sphereGeo(10), M('#112233', { roughness: 0.1 }), 4.8 * sc, 1 * sc, s * 2.6 * sc, 1.1 * sc);
      const tail = new THREE.Group(); tail.position.x = -7 * sc; g.add(tail);
      const tm = new THREE.Mesh(X(new THREE.ConeGeometry(4.5 * sc, 7 * sc, 4)), M('#6cc6f0')); tm.rotation.x = Math.PI / 4; tm.scale.z = 0.25; tm.position.x = -2 * sc; tm.rotation.z = Math.PI; tail.add(tm); o.tail = tail;
      const fin = mesh(X(new THREE.ConeGeometry(2.5 * sc, 4 * sc, 3)), M('#6cc6f0'), 0, 4 * sc, 0); fin.rotation.z = Math.PI / 2.5; fin.scale.z = 0.3;
    } else if (id === 'rug') {
      const tex = this.rugTex || (this.rugTex = canvasTex(makeCanvas(64, 32, (c) => { c.fillStyle = '#b3243b'; c.fillRect(0, 0, 64, 32); c.fillStyle = '#ffd84a'; for (let i = 2; i < 64; i += 8) c.fillRect(i, 0, 3, 32); c.fillStyle = '#5a1020'; c.fillRect(0, 13, 64, 6); })));
      const roll = mesh(new THREE.CylinderGeometry(4.5, 4.5, 20, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); roll.rotation.x = Math.PI / 2;
      const flap = mesh(new THREE.BoxGeometry(9, 0.8, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), 4.5, -4.2, 0); void flap;
      for (const s of [-10.5, 10.5]) { const fr = mesh(new THREE.CylinderGeometry(4.6, 4.6, 1.4, 18), M('#ffd84a')); fr.rotation.x = Math.PI / 2; fr.position.z = s; }
    } else if (id === 'whale') { // crate weapons
      mesh(sphereGeo(16), M('#2f7fd8', { roughness: 0.3 }), 0, 0, 0, 11, 6, 6);
      mesh(sphereGeo(12), M('#bfe3ff'), 1, -2.5, 0, 8, 2.6, 5);
      mesh(X(new THREE.ConeGeometry(5, 8, 4)).translate(-13, 0, 0), M('#2f7fd8'));
      for (const z of [-4, 4]) mesh(sphereGeo(8), M('#000'), 6, 1.5, z, 1.2);
      const fl = glowSprite('#46a8ff', 18, 0.9); fl.position.x = -16; g.add(fl); o.flame = fl;
    } else if (id === 'airdrop' || id === 'bomblet') {
      const k = id === 'airdrop' ? 1.2 : 0.7;
      mesh(sphereGeo(14), M('#6b3fd1', { roughness: 0.35, metalness: 0.3 }), 0, 0, 0, 7 * k, 4.6 * k, 4.6 * k);
      mesh(new THREE.BoxGeometry(3 * k, 7 * k, 7 * k), M('#ffd84a', { metalness: 0.5 }), -8 * k, 0, 0);
    } else if (id === 'shillbullet') {
      mesh(X(new THREE.CylinderGeometry(1.6, 1.6, 8, 8)), M('#ffd84a', { emissive: '#ff9a2e', emissiveIntensity: 0.8, metalness: 0.6 }));
    } else if (id === 'gasfee') {
      mesh(new THREE.CylinderGeometry(4, 4, 12, 12), M('#3aa64a'));
      mesh(new THREE.CylinderGeometry(4.1, 4.1, 3, 12), M('#7dff6a', { emissive: '#2a8020', emissiveIntensity: 0.6 }));
    } else if (id === 'fud') {
      mesh(sphereGeo(14), M('#5b6078', { roughness: 0.6 }), 0, 0, 0, 5.5);
    } else if (id === 'bridge') {
      mesh(new THREE.OctahedronGeometry(6, 0), M('#46f0ff', { emissive: '#1a8090', emissiveIntensity: 0.9 }));
      const gl = glowSprite('#b06bff', 22, 0.8); g.add(gl);
    } else {
      mesh(sphereGeo(12), M('#ccc'), 0, 0, 0, 4);
    }
    this.R.scene.add(g);
    return o;
  }
  updateProjectiles(game, dt, t) {
    const live = new Set(game.projectiles); let lit = null;
    // projectile meshes are pooled per weapon (no geometry churn over a long game)
    const pool = this.pool || (this.pool = {});
    for (const [p, o] of this.proj) if (!live.has(p)) { o.obj.visible = false; (pool[o.id] || (pool[o.id] = [])).push(o); this.proj.delete(p); }
    for (const p of game.projectiles) {
      let o = this.proj.get(p); if (!o) { o = (pool[p.w.id] && pool[p.w.id].pop()) || Object.assign(this.buildProj(p.w.id), { id: p.w.id }); o.obj.visible = true; this.proj.set(p, o); }
      const g = o.obj; g.position.set(p.x, to3Y(p.y), Z3.U); g.visible = !(p.delay > 0); // burst bullets wait their turn
      const ang = Math.atan2(-p.vy, p.vx);
      if (p.w.kind === 'impact' && p.w.id !== 'rug') { g.rotation.order = 'ZYX'; g.rotation.set(t * 9, 0, ang); }
      else if (p.w.id === 'rug') g.rotation.set(0, 0, -t * 9 * Math.sign(p.vx || 1));
      else g.rotation.set(0, 0, -(p.spin || 0));
      if (o.flame) { const s0 = o.flame.userData.s || (o.flame.userData.s = o.flame.scale.x), f = 0.75 + Math.random() * 0.5; o.flame.scale.set(s0 * f * 1.3, s0 * f, 1); }
      if (o.wings) { const fl = Math.sin(t * 70) * 0.8; o.wings[0].rotation.z = 0.5 + fl; o.wings[1].rotation.z = -0.5 - fl; g.rotation.set(0, 0, Math.sin(t * 9) * 0.25); }
      if (o.tail) { o.tail.rotation.y = Math.sin(t * 30) * 0.5; }
      if (o.light && !lit) lit = p;
      // extra 3D trail
      if (p.w.id === 'moon' && Math.random() < 0.8) this.spawn({ k: 0, x: p.x - Math.cos(ang) * 16, y: to3Y(p.y) - Math.sin(ang) * 16, z: Z3.U + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, vz: (Math.random() - 0.5) * 30, life: 0.4, max: 0.4, size: 7, grow: -10, c0: new THREE.Color(['#ff4fd8', '#46f0ff', '#fff94a', '#7dff6a'][(Math.random() * 4) | 0]), a: 1, drag: 1, grav: 0, soft: 0 });
      if (p.w.id === 'fly' && Math.random() < 0.3) this.spawn({ k: 0, x: p.x, y: to3Y(p.y), z: Z3.U, vx: 0, vy: 0, vz: 0, life: 0.4, max: 0.4, size: 4, grow: -6, c0: new THREE.Color('#ffd84a'), a: 0.8, drag: 0, grav: 0, soft: 0 });
    }
    if (lit) { this.projLight.position.set(lit.x, to3Y(lit.y), Z3.U + 30); this.projLight.intensity = 1.6 + Math.random() * 0.4; } else this.projLight.intensity = 0;
  }

  // --- supply crates: wooden box with a coin, parachute while falling ---
  updateCrates(game, t) {
    const live = new Set(game.crates || []), M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o || {}));
    this.crates3 = this.crates3 || new Map();
    for (const [c, o] of this.crates3) if (!live.has(c)) { this.R.scene.remove(o.g); this.crates3.delete(c); }
    for (const c of game.crates || []) {
      let o = this.crates3.get(c);
      if (!o) {
        const g = new THREE.Group(), box = this.crateMat || (this.crateMat = M('#8b5e3c')), band = this.crateBand || (this.crateBand = M('#ffd84a', { metalness: 0.6, roughness: 0.3, emissive: '#5a4000', emissiveIntensity: 0.4 }));
        const b = new THREE.Mesh(geoCached('crateBox', () => new THREE.BoxGeometry(20, 20, 20)), box); b.position.y = 10; b.castShadow = true; g.add(b);
        for (const [sx, sy, sz] of [[21, 3, 21], [3, 21, 21], [21, 21, 3]]) { const m = new THREE.Mesh(geoCached('crateBand' + sx + sy + sz, () => new THREE.BoxGeometry(sx, sy, sz)), band); m.position.y = 10; g.add(m); }
        const coin = new THREE.Mesh(geoCached('crateCoin', () => new THREE.CylinderGeometry(5.5, 5.5, 1.5, 18)), band); coin.rotation.x = Math.PI / 2; coin.position.set(0, 10, 11); g.add(coin);
        const chute = new THREE.Group(); chute.position.y = 20;
        const can = new THREE.Mesh(geoCached('crateChute', () => new THREE.SphereGeometry(28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6)), this.chuteMat || (this.chuteMat = M('#ff5fa2', { side: THREE.DoubleSide, emissive: '#5a1030', emissiveIntensity: 0.3 })));
        can.scale.y = 0.55; can.position.y = 32; chute.add(can);
        const lm = this.lineMat || (this.lineMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
        const pts = []; for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) pts.push(new THREE.Vector3(x * 0.8, 0, z * 0.8), new THREE.Vector3(x * 2.6, 40, z * 2.6));
        chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm)); g.add(chute);
        const glow = glowSprite('#ffd84a', 40, 0.35); glow.position.y = 10; g.add(glow);
        this.R.scene.add(g); o = { g, chute, glow }; this.crates3.set(c, o);
      }
      o.g.position.set(c.x, to3Y(c.y), Z3.U); o.chute.visible = !!c.para;
      o.g.rotation.set(0, c.landed ? 0.3 : Math.sin(t * 1.5 + (c.sway || 0)) * 0.4, c.para ? Math.sin(t * 2 + (c.sway || 0)) * 0.12 : 0);
      o.glow.material.opacity = 0.25 + Math.sin(t * 4 + (c.id || 0)) * 0.12;
    }
  }

  // --- defence visuals around a unit (brace dome / HODL diamonds / ice frost / hop ring / bubble) ---
  updateDefense(u, rig, t, dt) {
    let d = this.defs.get(u);
    const type = !u.dead && u.def ? u.def.type : null;
    if (!d) { if (!type) return; d = { g: new THREE.Group(), parts: {}, type: null, a: 0 }; rig.root.add(d.g); this.defs.set(u, d); }
    if (type && type !== d.type) {
      d.type = type; d.a = 0; for (const k in d.parts) d.parts[k].visible = false;
      if (!d.parts[type]) { d.parts[type] = this.makeDef(type); d.g.add(d.parts[type]); }
      d.parts[type].visible = true;
      const col = (DEF_STYLE[type] || {}).color || '#fff';
      this.poof(u.x, to3Y(u.y), col, 8); this.ring(u.x, to3Y(u.y) + 1, Z3.U, 8, 42, 0.5, col, true, 0.5);
      for (let i = 0; i < 16; i++) { const an = i / 16 * 6.28; this.spawn({ k: 0, x: u.x + Math.cos(an) * 20, y: to3Y(u.y) + 2, z: Z3.U + Math.sin(an) * 20, vx: 0, vy: 50 + Math.random() * 50, vz: 0, life: 0.6 + Math.random() * 0.4, max: 1, size: 3 + Math.random() * 2, grow: -3, c0: css3(col).c, a: 1, drag: 1.5, grav: 0, soft: 0 }); }
    }
    d.a = clamp(d.a + (type ? dt * 3.5 : -dt * 3), 0, 1);
    if (!type && d.a <= 0) { for (const k in d.parts) d.parts[k].visible = false; d.type = null; return; }
    const p = d.parts[d.type]; if (!p) return;
    const pulse = 0.8 + Math.sin(t * 4) * 0.2, a = d.a, e = 1 - Math.pow(1 - a, 3), ud = p.userData;
    p.position.set(0, 0, 0);
    // counter the mascot's yaw so the effect stays upright in world space
    if (d.type === 'brace') {
      ud.dome.scale.setScalar(0.4 + 0.6 * e); ud.dome.rotation.y = t * 0.35; ud.dome.material.uniforms.uOp.value = 0.85 * a; ud.dome.material.uniforms.uTime.value = t;
      ud.edges.material.opacity = 0.5 * a * pulse; ud.edges.scale.copy(ud.dome.scale); ud.edges.rotation.y = ud.dome.rotation.y;
      ud.ring.material.opacity = 0.7 * a * pulse; ud.ring.rotation.z = t * 0.8;
    } else if (d.type === 'hodl') {
      const orb = ud.orb; for (let i = 0; i < orb.length; i++) { const an = t * 2.2 + i * 2.09; orb[i].position.set(Math.cos(an) * 22, 18 + Math.sin(an * 1.3) * 6, Math.sin(an) * 22); orb[i].rotation.y = t * 3; orb[i].scale.setScalar(e); }
      ud.glow.material.opacity = 0.42 * a * pulse; ud.glow.position.y = 18; ud.ring.material.opacity = 0.75 * a * pulse; ud.ring.rotation.z = -t * 1.2;
      if (Math.random() < dt * 10) this.spawn({ k: 0, x: u.x + (Math.random() - 0.5) * 30, y: to3Y(u.y) + Math.random() * 34, z: Z3.U + (Math.random() - 0.5) * 30, vx: 0, vy: 20, vz: 0, life: 0.6, max: 0.6, size: 2.5, grow: -3, c0: this.C.gold || (this.C.gold = new THREE.Color('#ffe680')), a: 1, drag: 0, grav: 0, soft: 0 });
    } else if (d.type === 'bubble') {
      const sc = 1 + Math.sin(t * 3) * 0.03; ud.ball.scale.set(sc * e, (2 - sc) * e, sc * e); ud.ball.position.y = 18; ud.ball.material.uniforms.uTime.value = t; ud.ball.material.uniforms.uOp.value = a;
      ud.hi.position.set(-8 * e, 28 * e, 20 * e); ud.hi.material.opacity = 0.7 * a;
    } else if (d.type === 'icewall') {
      ud.ring.material.opacity = 0.6 * a * pulse; ud.ring.rotation.z = t * 0.5;
      for (let i = 0; i < ud.fl.length; i++) { const an = t * 1.3 + i * 1.047; ud.fl[i].position.set(Math.cos(an) * 19, 8 + ((t * 9 + i * 7) % 30), Math.sin(an) * 19); ud.fl[i].rotation.z = t * 2 + i; ud.fl[i].material.opacity = a * 0.9; }
    } else if (d.type === 'hop') {
      ud.ring.rotation.z = t * 1.6; ud.ring.scale.setScalar(e); for (const m of ud.ring.children) m.material.opacity = 0.85 * a;
      ud.glow.material.opacity = 0.3 * a * pulse;
    }
    d.g.rotation.y = -rig.yaw.rotation.y;
  }
  makeDef(type) {
    const g = new THREE.Group(), ud = g.userData;
    const flatRing = (r0, r1, color, op) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 56), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.8; m.renderOrder = 5; g.add(m); return m; };
    if (type === 'brace') {
      const geo = new THREE.IcosahedronGeometry(25, 1); geo.scale(1, 1.05, 1); geo.translate(0, 16, 0);
      ud.dome = new THREE.Mesh(geo, fresnelMat('#a8dcff', '#1d4fbf', 1.7, 0.85)); ud.dome.renderOrder = 7; g.add(ud.dome);
      ud.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#dff3ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); ud.edges.renderOrder = 8; g.add(ud.edges);
      ud.ring = flatRing(22, 27, '#8fd0ff', 0.7);
    } else if (type === 'hodl') {
      const gm = new THREE.MeshStandardMaterial({ color: '#bff6ff', emissive: '#58d8ff', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.05, flatShading: true });
      ud.orb = [0, 1, 2].map(() => { const m = new THREE.Mesh(geoCached('diamond', () => { const gg = new THREE.CylinderGeometry(4.2, 0.01, 6.5, 8, 1); const top = new THREE.CylinderGeometry(2.6, 4.2, 2, 8, 1); top.translate(0, 4.2, 0); const pos = [...gg.toNonIndexed().attributes.position.array, ...top.toNonIndexed().attributes.position.array]; const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.computeVertexNormals(); return out; }), gm); g.add(m); return m; });
      ud.glow = glowSprite('#ffd84a', 86, 0.42); g.add(ud.glow);
      ud.ring = flatRing(20, 24, '#ffd84a', 0.75);
    } else if (type === 'bubble') {
      ud.ball = new THREE.Mesh(new THREE.SphereGeometry(25, 36, 24), fresnelMat('#ff9ad8', '#7affc0', 2.0, 1)); ud.ball.renderOrder = 7; g.add(ud.ball);
      ud.hi = glowSprite('#ffffff', 12, 0.7); ud.hi.material.blending = THREE.NormalBlending; g.add(ud.hi);
    } else if (type === 'icewall') {
      ud.ring = flatRing(17, 21, '#bfefff', 0.6);
      const fm = new THREE.SpriteMaterial({ map: this.flakeTex(), color: '#e8fbff', transparent: true, depthWrite: false, fog: false });
      ud.fl = [0, 1, 2, 3, 4, 5].map(() => { const sp = new THREE.Sprite(fm.clone()); sp.scale.set(6, 6, 1); g.add(sp); return sp; });
    } else if (type === 'hop') {
      ud.ring = new THREE.Group(); ud.ring.rotation.x = -Math.PI / 2; ud.ring.position.y = 1; g.add(ud.ring);
      const dm = new THREE.MeshBasicMaterial({ color: '#7dff6a', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
      for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(19, 23, 6, 1, i / 12 * Math.PI * 2, Math.PI * 2 / 12 * 0.55), dm); ud.ring.add(m); }
      ud.glow = glowSprite('#7dff6a', 60, 0.3); ud.glow.position.y = 12; g.add(ud.glow);
    }
    return g;
  }
  flakeTex() {
    return this._flake || (this._flake = canvasTex(makeCanvas(32, 32, (c) => { c.strokeStyle = '#ffffff'; c.lineWidth = 2.2; c.lineCap = 'round'; c.translate(16, 16);
      for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 13); c.moveTo(0, 8); c.lineTo(4, 11); c.moveTo(0, 8); c.lineTo(-4, 11); c.stroke(); } })));
  }
  // frog hop / bubble rescue: glowing trail, landing marker and a dust puff on touchdown
  hopTrail(u, s, dt) {
    const col = u.char === 'PILL' ? '#ff8fd0' : '#7dff6a';
    if (u.hop && s.hopObj !== u.hop) { s.hopObj = u.hop; const h = u.hop; this.ring(h.x1, to3Y(h.y1) + 1, Z3.U, 44, 14, h.dur, col, true, 0.9); this.poof(u.x, to3Y(u.y), '#ffffff', 6); }
    if (u.hop) { for (let i = 0; i < 2; i++) this.spawn({ k: 0, x: u.x + (Math.random() - 0.5) * 6, y: to3Y(u.y) + 12 + (Math.random() - 0.5) * 6, z: Z3.U + (Math.random() - 0.5) * 6, vx: 0, vy: -10, vz: 0, life: 0.5, max: 0.5, size: 4, grow: -6, c0: css3(col).c, a: 0.45, drag: 0, grav: 0, soft: 0 }); }
    else if (s.hopObj) { const h = s.hopObj; s.hopObj = null; this.ring(h.x1, to3Y(h.y1) + 1, Z3.U, 6, 40, 0.45, col, true, 0.8); this.dust(h.x1, h.y1, 10); }
  }
  dust(x, y, n) {
    const c = this.sampleTerrain(x, y + 3) || this.C.white, col = c.clone().lerp(this.C.white, 0.35);
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1; this.spawn({ k: 1, x: x + s * Math.random() * 6, y: to3Y(y) + 2, z: Z3.U + (Math.random() - 0.5) * 16, vx: s * (30 + Math.random() * 50), vy: 10 + Math.random() * 20, vz: (Math.random() - 0.5) * 30, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 5 + Math.random() * 4, grow: 12, c0: col, a: 0.55, drag: 3, grav: -10, soft: 1 + Math.random() }); }
  }

  // --- per-frame particle pass: the 2D sim's particles + our own 3D ones ---
  update(game, dt) {
    const A = this.add, N = this.norm, C = this.chunks, m4 = this._m4, q = this._q, e = this._e, v = this._v, s = this._s, c = this._c;
    A.begin(); N.begin(); let nc = 0;
    const splashCol = game.world && game.world.water ? game.world.water.splash : null;
    for (const p of game.particles) {
      if (p.type === 'flash' || p.type === 'ring') continue;
      if (p._z == null) { p._z = Z3.U + (Math.random() - 0.5) * 46; p._r = Math.random() * 6; }
      const a = clamp(p.life / p.max, 0, 1), cc = css3(p.color), X = p.x, Y = to3Y(p.y);
      if (p.type === 'fire') A.push(X, Y, p._z, p.size * (0.8 + a), cc.c, a * 0.9, 1 + p._r);
      else if (p.type === 'spark') A.push(X, Y, p._z, Math.max(2, p.size * a * 1.6), cc.c, Math.min(1, a * 1.5), 0);
      else if (p.type === 'smoke') N.push(X, Y, p._z, p.size * 2.3, cc.c, cc.a * a * 0.9, 1 + p._r);
      else if (p.type === 'debris') {
        if (p.color === splashCol || cc.a < 1) N.push(X, Y, p._z, p.size * 1.7, cc.c, Math.min(1, a * 1.5) * cc.a, 0);
        else if (nc < C.count + 1600 && nc < 1600) { e.set(p._r + p.life * 7, p._r * 2 + p.life * 5, 0); q.setFromEuler(e); v.set(X, Y, p._z); s.setScalar(p.size * 1.15); m4.compose(v, q, s); C.setMatrixAt(nc, m4); C.setColorAt(nc, cc.c); nc++; }
      }
    }
    const T = game.terrain, wy = to3Y(WATER_Y);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt; if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      const dr = Math.exp(-(p.drag || 0) * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr; p.vy -= (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.grow) p.size = Math.max(0.5, p.size + p.grow * dt);
      if (p.bounce && p.vy < 0 && p.z < Z3.F && p.z > Z3.B && T && T.isSolid(p.x, H - p.y)) { p.y += 2; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; if (Math.abs(p.vy) < 30) { p.vy = 0; p.grav = 0; p.vx = p.vz = 0; p.spin = 0; } }
      if (p.k === 2 && p.y < wy - 6) { p.life = Math.min(p.life, 0.05); }
      const f = p.life / p.max, a = p.a * Math.min(1, f * 2.5);
      if (p.k === 0) { if (p.c2 && f < 0.45) c.copy(p.c2).lerp(p.c1, f / 0.45); else if (p.c1) c.copy(p.c1).lerp(p.c0, p.c2 ? Math.pow((f - 0.45) / 0.55, 1.4) : Math.pow(f, 1.5)); else c.copy(p.c0); A.push(p.x, p.y, p.z, p.size, c, a, p.soft || 0); }
      else if (p.k === 1) N.push(p.x, p.y, p.z, p.size, p.c0, a, p.soft || 0);
      else if (nc < 1600) { p.rx += (p.spin || 0) * dt; e.set(p.rx, p.rx * 0.7, p.rx * 0.3); q.setFromEuler(e); v.set(p.x, p.y, p.z); s.setScalar(p.size * Math.min(1, f * 4)); m4.compose(v, q, s); C.setMatrixAt(nc, m4); C.setColorAt(nc, p.c0); nc++; }
    }
    A.end(); N.end();
    C.count = nc; C.instanceMatrix.needsUpdate = true; if (C.instanceColor) C.instanceColor.needsUpdate = true;
    for (const L of this.lights) { if (L.t > 0) { L.t -= dt; const k = Math.max(0, L.t / L.max); L.l.intensity = L.I * k * k; } else L.l.intensity = 0; }
    const cam = this.R.camera;
    for (const R of this.rings) {
      if (!R.mesh.visible) continue; R.t += dt; const k = R.t / R.dur;
      if (k >= 1) { R.mesh.visible = false; continue; }
      const rr = R.r0 + (R.r1 - R.r0) * (1 - Math.pow(1 - k, 3)); R.mesh.scale.set(rr, rr, rr);
      R.mesh.material.opacity = R.op * (1 - k);
      if (!R.horizontal) R.mesh.quaternion.copy(cam.quaternion);
    }
  }
}
