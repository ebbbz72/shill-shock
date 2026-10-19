'use strict';
// Renderer3D: draws the unchanged 2D simulation (game.js) as a 2.5D Three.js scene. The 2D canvas
// stays on top (transparent) for the HUD, labels, aim reticle and floating text.

class Ambient3D {
  constructor(R) {
    this.R = R; this.max = 1200;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3); this.col = new Float32Array(this.max * 4); this.sz = new Float32Array(this.max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('acol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('asz', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    this.g = g;
    this.matN = this.mat(false); this.matA = this.mat(true);
    this.points = new THREE.Points(g, this.matN); this.points.frustumCulled = false; this.points.renderOrder = 7;
    R.scene.add(this.points); this.list = []; this.type = null; this.shoot = [];
  }
  mat(add) {
    return new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 acol; attribute float asz; uniform float uScale; varying vec4 vC; void main(){ vC = acol; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = asz*uScale/max(1.0,-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = ${add ? 'pow(max(0.0,1.0-d),2.0)' : 'smoothstep(1.0,0.6,d)'}; if (a<0.01) discard; gl_FragColor = vec4(vC.rgb, vC.a*a);
        #include <encodings_fragment>
      }`,
      transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
  setType(type, seed) {
    this.type = type; this.list = []; const r = rng3(seed || 1);
    this.points.material = type === 'fireflies' || type === 'dust' ? this.matA : this.matN;
    const n = type === 'snow' ? 1000 : type === 'fireflies' ? 90 : type === 'dust' ? 160 : type === 'petals' ? 110 : 0;
    for (let i = 0; i < n; i++) this.list.push({ x: r() * 2600 - 1300, y: r() * 900, z: -600 + r() * 900, ph: r() * 6.28, s: r() });
  }
  update(dt, t, cx, wind) {
    const L = this.list, n = Math.min(L.length, this.max), P = this.pos, C = this.col, S = this.sz, ty = this.type;
    for (let i = 0; i < n; i++) {
      const a = L[i]; let x, y, z, sz, r, g, b, al;
      if (ty === 'snow') { a.y -= (35 + a.s * 40) * dt; a.x += (wind * 60 + Math.sin(t * 0.8 + a.ph) * 14) * dt; if (a.y < 40) { a.y = 900; } sz = 2 + a.s * 3.5; r = g = b = 1; al = 0.85; }
      else if (ty === 'fireflies') { a.x += Math.sin(t * 0.7 + a.ph * 3) * 18 * dt; a.y = 70 + (a.s * 360) + Math.sin(t * 0.5 + a.ph) * 30; sz = 9 + a.s * 5; r = 0.8; g = 1; b = 0.35; al = Math.max(0, Math.sin(t * (1.2 + a.s) + a.ph)) * 0.95; }
      else if (ty === 'dust') { a.y += Math.sin(t * 0.3 + a.ph) * 4 * dt; a.x += 6 * dt; sz = 2 + a.s * 2; r = 0.85; g = 0.85; b = 1; al = 0.35; }
      else { a.y -= (10 + a.s * 12) * dt; a.x += (wind * 50 + 12 + Math.sin(t + a.ph) * 20) * dt; if (a.y < 50) a.y = 900; sz = 3 + a.s * 2.5; r = 1; g = 0.72; b = 0.85; al = 0.75; }
      // keep the field wrapped around the camera
      let wx = a.x - cx; wx = ((wx % 2600) + 3900) % 2600 - 1300; a.x = cx + wx;
      x = a.x; y = a.y; z = a.z;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = al; S[i] = sz;
    }
    this.g.setDrawRange(0, n);
    this.g.attributes.position.needsUpdate = this.g.attributes.acol.needsUpdate = this.g.attributes.asz.needsUpdate = true;
  }
}

class Renderer3D {
  constructor(game, canvas) {
    this.game = game; this.canvas = canvas; this.ok = false; this.active = false; this.time = 0; this.frameMs = 0;
    let r = null;
    try {
      const probe = canvas.getContext('webgl2', { antialias: true }) || canvas.getContext('webgl', { antialias: true });
      if (!probe) throw new Error('no WebGL');
      r = new THREE.WebGLRenderer({ canvas, context: probe, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { console.info('3D renderer unavailable, using classic 2D:', e && e.message); return; }
    THREE.ColorManagement.legacyMode = false;
    r.outputEncoding = THREE.sRGBEncoding; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor('#000000', 1); this.renderer = r; this.resize();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, W / H, 10, 12000);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 0.7); this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight('#404060', 0.3); this.scene.add(this.amb);
    this.sun = new THREE.DirectionalLight('#ffffff', 1); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); const sc = this.sun.shadow.camera; sc.left = -900; sc.right = 900; sc.top = 560; sc.bottom = -560; sc.near = 10; sc.far = 3000;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.6; this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.fx = new FX3D(this); this.ambient = new Ambient3D(this);
    this.scratchCtx = document.createElement('canvas').getContext('2d');
    this.rigs = new Map(); this.graves = new Map(); this.anims = []; this.worldGroup = null; this.builtFor = null;
    this.cam = { x: null, y: H / 2, zoom: 1, kick: 0, kb: 0, kill: null, sp: 0, intro: 0 };
    this.weapons = {};
    const qp = (location.search.match(/[?&]quality=(high|medium|low)/) || [])[1];
    this.quality = 0; this.qualityLocked = !!qp; if (qp) this.setQuality({ high: 0, medium: 1, low: 2 }[qp]);
    this.ok = true;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ok = false; this.setActive(false); if (game.toast) game.toast('3D context lost - using 2D'); });
    window.addEventListener('resize', () => this.resize());
    Renderer3D.inst = this;
    game.onFx = (kind, a, b, c, d) => { if (!this.active) return; if (kind === 'boom') { this.fx.explosion(a, b, c, d); if (!d || !this.cam.boom || this.time - this.cam.boom.t > 0.6) this.cam.boom = { x: a, y: b, t: this.time }; } else if (kind === 'splash') this.fx.splash(a, b, c); else if (kind === 'rug') this.fx.rug(a, b, c); else if (kind === 'jump') this.fx.dust(a, b, 5 + Math.round((d == null ? 0.5 : d) * 9)); };
  }
  resize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const q = Renderer3D.QUALITY[this.quality || 0];
    const pr = clamp((rect.width || W) * dpr / W, q.prMin, q.prMax);
    if (Math.abs(this.renderer.getPixelRatio() - pr) > 0.01) this.renderer.setPixelRatio(pr);
    this.renderer.setSize(W, H, false);
  }
  // Auto quality: if real frames are slow for a couple of seconds, step down (pixel ratio, then
  // shadow filtering, then shadows off). Never steps back up within a session. ?quality=high locks it.
  setQuality(level) {
    level = clamp(level | 0, 0, Renderer3D.QUALITY.length - 1); if (level === this.quality) return;
    this.quality = level; const q = Renderer3D.QUALITY[level], r = this.renderer;
    r.shadowMap.enabled = q.shadows > 0; r.shadowMap.type = q.shadows === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sun.castShadow = q.shadows > 0; if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
    this.resize(); console.info('3D quality ->', q.name);
  }
  autoQuality(now) {
    if (this.qualityLocked) return;
    const a = this._aq || (this._aq = { last: now, ema: 16, n: 0, cool: 0 }), dt = now - a.last; a.last = now;
    if (dt <= 0 || dt > 1000) return; // tab switch / stalls
    a.ema = a.ema * 0.95 + dt * 0.05; a.n++;
    if (a.n > 120 && a.ema > 24 && this.quality < Renderer3D.QUALITY.length - 1) { this.setQuality(this.quality + 1); a.n = 0; a.ema = 16; }
  }
  setActive(on) {
    this.active = !!on && this.ok;
    this.canvas.style.display = this.active ? 'block' : 'none';
    if (this.active) { this.builtFor = null; this.resize(); }
  }
  kick(k) { this.cam.kick = Math.max(this.cam.kick, k); }
  terrainChanged(T, x0, x1) { if (this.t3 && T === this.t3.T) { this.t3.markDirty(x0, x1); this.t3.wallsDirty(x0, x1); this.shoreDirty = true; } }
  // 1D distance (px, /64 into 0..1) from each column to the nearest land at the waterline
  updateShore() {
    const T = this.game.terrain, w = T.w, d = this.shoreData, y = WATER_Y + 2, solid = new Uint8Array(w);
    for (let x = 0; x < w; x++) solid[x] = T.isSolid(x, y) || T.isSolid(x, y - 3) ? 1 : 0;
    let last = -1e9; const dist = new Float32Array(w);
    for (let x = 0; x < w; x++) { if (solid[x]) last = x; dist[x] = x - last; }
    last = 1e9; for (let x = w - 1; x >= 0; x--) { if (solid[x]) last = x; dist[x] = Math.min(dist[x], last - x); }
    for (let x = 0; x < w; x++) { const v = Math.min(255, Math.round(dist[x] / 64 * 255)); d[x * 4] = v; d[x * 4 + 3] = 255; }
    this.shoreTex.needsUpdate = true; this.shoreDirty = false;
  }

  // ---------- world (re)build ----------
  build() {
    const g = this.game, T = g.terrain, id = g.worldId, cfg = WORLD3D[id] || WORLD3D.classic;
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse(o => { if (o.geometry && !Object.values(_geoCache).includes(o.geometry)) o.geometry.dispose(); });
      if (this.t3) this.t3.dispose();
    }
    for (const [, rig] of this.rigs) this.scene.remove(rig.root); this.rigs.clear();
    for (const [, gr] of this.graves) this.scene.remove(gr.obj); this.graves.clear();
    this.fx.reset(); this.anims = []; this.skyObjs = [];
    const W3 = this.worldGroup = new THREE.Group(); this.scene.add(W3);
    this.cfg = cfg; this.builtFor = T; this.builtWorld = id;
    Object.assign(this.cam, { intro: (g.state === 'play' && g.turnCount <= 1) ? 1.9 : 0, boom: null, hold: null, kill: null, kb: 0, launch: null }); this.snapCam = true;
    this.scene.fog = new THREE.Fog(cfg.fog[0], cfg.fog[1], cfg.fog[2]);
    this.hemi.color.set(cfg.hemi[0]); this.hemi.groundColor.set(cfg.hemi[1]); this.hemi.intensity = cfg.hemi[2];
    this.sun.color.set(cfg.sun[0]); this.sun.intensity = cfg.sun[1]; this.sunDir = new THREE.Vector3(...cfg.sun[2]).normalize();
    this.amb.color.set(cfg.amb[0]); this.amb.intensity = cfg.amb[1];
    this.sky = makeSky(cfg.sky[0], cfg.sky[1], cfg.sky[2]); W3.add(this.sky);
    this.stars = cfg.stars ? makeStars(cfg.stars, 7, -0.02, 0.5, 1) : null; if (this.stars) W3.add(this.stars);
    if (cfg.sunDisc) { const s = glowSprite(cfg.sunDisc.color, cfg.sunDisc.size, 0.9); s.position.set(T.w / 2 + 200, cfg.sunDisc.y, cfg.sunDisc.z); W3.add(s); const d = glowSprite('#ffffff', cfg.sunDisc.size * 0.25, 0.9); d.position.copy(s.position); W3.add(d); }
    this.water = makeWater(Object.assign({}, cfg.water), T.w); W3.add(this.water);
    this.water.material.uniforms.uSunDir.value.copy(this.sunDir);
    this.shoreData = new Uint8Array(T.w * 4); this.shoreTex = new THREE.DataTexture(this.shoreData, T.w, 1, THREE.RGBAFormat); this.shoreTex.magFilter = this.shoreTex.minFilter = THREE.LinearFilter;
    this.water.material.uniforms.uShore.value = this.shoreTex; this.updateShore();
    const K = propKit(W3, (T.seed ^ 0x5bd1e995) >>> 0);
    const helpers = {
      anims: this.anims,
      sky: (obj, xOff, y, z) => { obj.position.set(T.w / 2 + xOff, y, z); obj.traverse(o => { if (o.material) o.material.fog = false; }); W3.add(obj); },
      clouds: (grp, color, n, y0, y1, z0, z1) => this.makeClouds(grp, color, n, y0, y1, z0, z1, T.w),
      mist: (grp, color, n, y0, y1) => this.makeMist(grp, color, n, y0, y1, T.w),
      aurora: (grp) => this.makeAurora(grp, T.w),
    };
    if (PROPS3D[id]) PROPS3D[id](W3, T.w, K, helpers);
    this.mergedProps = mergeStatic(W3);
    this.t3 = new Terrain3D(this, T, cfg); W3.add(this.t3.group);
    // decorations
    const decos = [];
    for (const o of T.decos || []) {
      const d = makeDeco3D(id, o, K, helpers); if (!d) continue;
      const hz = h3(o.x, o.y, 5), z = d.z != null ? d.z : o.water ? Z3.F + 10 + hz * 60 : d.front && hz < 0.35 ? Z3.U + 16 + hz * 12 : Z3.B + 14 + hz * (Z3.U - 16 - Z3.B - 14);
      d.obj.position.set(o.x, o.water ? to3Y(WATER_Y) : to3Y(o.y) - 1, z);
      if (!o.water) d.obj.rotation.y = (hz - 0.5) * 1.2;
      decos.push({ o, obj: d.obj, anim: d.anim });
    }
    this.t3.setDecos(decos);
    this.ambient.setType(cfg.ambient, T.seed);
    this.t3.update(0, 0); // build every chunk now
    while (this.t3.dirty.size) this.t3.update(0, 0);
  }
  makeClouds(grp, color, n, y0, y1, z0, z1, WW) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 1, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.92, fog: true });
    const r = rng3(99);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Group(), z = z0 + r() * (z1 - z0), s = 40 + r() * 50; c.userData.dyn = true;
      for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(sphereGeo(16), m); b.scale.set(s * (0.8 + r() * 0.6), s * (0.45 + r() * 0.3), s * 0.6); b.position.set((k - 2.5) * s * 0.7, Math.sin(k) * s * 0.2, (r() - 0.5) * s); c.add(b); }
      c.position.set(-1500 + r() * (WW + 3000), y0 + r() * (y1 - y0), z); grp.add(c);
      const sp = 4 + r() * 8; this.anims.push((t, dt) => { c.position.x += (sp + this.game.wind * 30) * dt; if (c.position.x > WW + 1700) c.position.x = -1700; if (c.position.x < -1700) c.position.x = WW + 1700; });
    }
  }
  makeMist(grp, color, n, y0, y1, WW) {
    const tex = canvasTex(makeCanvas(256, 128, (c, w, h) => { const r = rng3(3); for (let i = 0; i < 40; i++) { const x = r() * w, y = h * 0.3 + r() * h * 0.4, rr = 20 + r() * 40, gr = c.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); } }));
    const r = rng3(17);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(quadGeo(), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.7, depthWrite: false }));
      m.userData.dyn = true; m.scale.set(700 + r() * 500, 120 + r() * 60, 1); m.position.set(-800 + r() * (WW + 1600), y0 + r() * (y1 - y0), -140 - r() * 700); m.renderOrder = 3; grp.add(m);
      const sp = 6 + r() * 10, ph = r() * 6; this.anims.push((t, dt) => { m.position.x += sp * dt; if (m.position.x > WW + 1000) m.position.x = -1000; m.material.opacity = 0.5 + 0.2 * Math.sin(t * 0.3 + ph); });
    }
  }
  makeAurora(grp, WW) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x*0.002+uTime*0.15)*220.0 + sin(p.x*0.0053-uTime*0.2)*90.0; p.y += sin(p.x*0.003+uTime*0.1)*60.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float band = 0.55+0.45*sin(vUv.x*60.0+uTime*0.6+sin(vUv.x*13.0+uTime*0.3)*3.0);
          float v = smoothstep(0.0,0.25,vUv.y)*pow(1.0-vUv.y,1.6);
          vec3 c = mix(vec3(0.1,1.0,0.6), vec3(0.55,0.35,1.0), smoothstep(0.35,1.0,vUv.y)); c = mix(c, vec3(0.2,0.9,1.0), 0.5+0.5*sin(vUv.x*7.0+uTime*0.2));
          gl_FragColor = vec4(c*band*v*0.55, 1.0);
          #include <encodings_fragment>
        }`,
    });
    for (const [z, y, s] of [[-2700, 620, 1], [-3100, 760, 1.3]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(7000 * s, 520 * s, 160, 1), mat); m.position.set(WW / 2, y, z); m.renderOrder = -5; grp.add(m); }
    this.anims.push(t => { mat.uniforms.uTime.value = t; });
  }

  // ---------- units ----------
  rigFor(u) {
    let rig = this.rigs.get(u);
    if (!rig) {
      rig = new MascotRig(u.char); rig.yaw.scale.setScalar(1.12); this.scene.add(rig.root); this.rigs.set(u, rig);
      const ring = new THREE.Mesh(geoCached('selRing', () => new THREE.RingGeometry(13, 16.5, 40)), new THREE.MeshBasicMaterial({ color: u.team.color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; ring.renderOrder = 4; rig.root.add(ring); rig.ring = ring;
      const hold = new THREE.Group(); hold.position.set(0, 16, 10); rig.root.add(hold); rig.hold = hold; rig.held = {};
    }
    return rig;
  }
  heldWeapon(rig, wid) {
    if (rig.held[wid]) return rig.held[wid];
    const g = new THREE.Group(), M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.4, metalness: 0.4 }, o || {}));
    const w = WEAPONS[wid];
    if (w.kind === 'impact') {
      const col = wid === 'moon' ? '#e0e0e6' : wid === 'rug' ? '#b3243b' : wid === 'fish' ? '#7fc8ea' : '#4d5a66';
      const tube = new THREE.Mesh(geoCached('tube', () => { const gg = new THREE.CylinderGeometry(3.4, 3.4, 24, 16, 1, true); gg.rotateZ(-Math.PI / 2); gg.translate(7, 0, 0); return gg; }), M(col, { side: THREE.DoubleSide })); tube.castShadow = true; g.add(tube);
      const muzzle = new THREE.Mesh(geoCached('muz', () => { const gg = new THREE.CylinderGeometry(4.2, 4.2, 3, 16); gg.rotateZ(-Math.PI / 2); gg.translate(19, 0, 0); return gg; }), M('#222')); g.add(muzzle);
      const grip = new THREE.Mesh(boxGeo(), M('#2a2a2a')); grip.scale.set(2.5, 6, 2.5); grip.position.set(2, -4.5, 0); g.add(grip);
      if (wid === 'moon') { const st = new THREE.Mesh(geoCached('mstripe', () => { const gg = new THREE.CylinderGeometry(3.5, 3.5, 3, 16); gg.rotateZ(-Math.PI / 2); gg.translate(10, 0, 0); return gg; }), M('#f2c230', { metalness: 0.8 })); g.add(st); }
    } else {
      const ball = new THREE.Mesh(sphereGeo(16), M(wid === 'fly' ? '#1b1b1b' : '#3f6b2a', { metalness: 0.2 })); ball.scale.setScalar(4.6); ball.position.x = 12; ball.castShadow = true; g.add(ball);
    }
    rig.hold.add(g); rig.held[wid] = g; return g;
  }
  graveFor(u) {
    let gr = this.graves.get(u); if (gr) return gr;
    const g = new THREE.Group();
    const stone = this._stone || (this._stone = new THREE.MeshStandardMaterial({ color: '#9aa0aa', roughness: 0.85, flatShading: false }));
    const b = new THREE.Mesh(boxGeo(), stone); b.scale.set(15, 13, 6); b.position.y = 6.5; b.castShadow = true; g.add(b);
    const top = new THREE.Mesh(geoCached('graveTop', () => { const gg = new THREE.CylinderGeometry(7.5, 7.5, 6, 20, 1, false, 0, Math.PI); gg.rotateX(Math.PI / 2); gg.rotateZ(-Math.PI / 2); return gg; }), stone); top.position.y = 13; top.castShadow = true; g.add(top);
    const band = new THREE.Mesh(boxGeo(), new THREE.MeshStandardMaterial({ color: u.team.color, roughness: 0.5, emissive: u.team.color, emissiveIntensity: 0.25 })); band.scale.set(15.4, 2.6, 6.4); band.position.y = 3; g.add(band);
    const rip = this._rip || (this._rip = canvasTex(makeCanvas(64, 32, c => { c.fillStyle = '#3a3f48'; c.font = 'bold 22px Trebuchet MS, Arial'; c.textAlign = 'center'; c.fillText('RIP', 32, 24); })));
    const pl = new THREE.Mesh(quadGeo(), new THREE.MeshBasicMaterial({ map: rip, transparent: true })); pl.scale.set(11, 5.5, 1); pl.position.set(0, 12, 3.1); g.add(pl);
    g.position.z = Z3.U; this.scene.add(g); gr = { obj: g, t: 0 }; this.graves.set(u, gr);
    return gr;
  }
  animUnits(dt, t) {
    const g = this.game, playing = g.state === 'play' || g.state === 'over', proj = g.projectiles.find(q => !q.dead) || null;
    for (const u of g.units) {
      const rig = this.rigFor(u), s = rig.s, root = rig.root;
      root.visible = playing;
      if (!playing) continue;
      root.position.set(u.x, to3Y(u.y), Z3.U);
      const isCur = u === g.cur && g.state === 'play' && !u.dead;
      const winner = g.state === 'over' && g.winner && g.winner === u.team && !u.dead;
      // facing (3/4 view so faces stay readable)
      const ty = u.facing * (Math.PI / 2 - 0.72);
      s.yaw += (ty - s.yaw) * (1 - Math.exp(-dt * 12)); rig.yaw.rotation.y = s.yaw;
      // hit reaction
      if (s.lastHp == null) s.lastHp = u.hp;
      if (u.hp < s.lastHp) { s.hit = 0.55; this.fx.hitSparks(u, s.lastHp - u.hp); }
      s.lastHp = u.hp;
      const moved = s.lastX != null ? Math.abs(u.x - s.lastX) : 0; s.lastX = u.x;
      const walking = u.onGround && !u.hop && moved > 0.05 && moved < 8;
      s.walkAmt = (s.walkAmt || 0) + ((walking ? 1 : 0) - (s.walkAmt || 0)) * (1 - Math.exp(-dt * 10)); if (walking) s.walk += dt * 15;
      s.blinkT -= dt; let blink = false; if (s.blinkT < 0) { blink = true; if (s.blinkT < -0.13) s.blinkT = 2.2 + Math.random() * 3; }
      let sq = Math.sin(t * 3 + u.phase) * 0.025, bob = 0, rz = 0, rx = 0, flip = 0;
      bob += Math.abs(Math.sin(s.walk)) * 2.4 * s.walkAmt; rz += Math.sin(s.walk) * 0.09 * s.walkAmt;
      rig.feet.forEach((f, i) => { if (f.userData.y0 == null) { f.userData.y0 = f.position.y; f.userData.z0 = f.position.z; } const ph = s.walk + (i % 2) * Math.PI; f.position.y = f.userData.y0 + Math.max(0, Math.sin(ph)) * 2.2 * s.walkAmt; f.position.z = f.userData.z0 + Math.cos(ph) * 2 * s.walkAmt; });
      const air = !u.onGround && !u.dead && !u.drowned;
      if (air && !u.hop) sq -= clamp(Math.abs(u.vy) / 900, 0, 0.12);
      // jumps: takeoff stretch comes from vy above; a backflip also spins the mascot once
      if (u.jumpId && s.jSeen !== u.jumpId) { s.jSeen = u.jumpId; s.jT = 0; s.jBack = u.jumpK === 2; }
      if (s.jT != null) s.jT += dt;
      if (s.jBack && air && s.jT < 1.2) flip = -Math.min(1, s.jT / 0.75) * Math.PI * 2; // backward somersault
      if (u.hop) { const k = clamp(u.hop.t / u.hop.dur, 0, 1), e = k < 0.15 ? 0 : k > 0.85 ? 1 : (k - 0.15) / 0.7; flip = (e * e * (3 - 2 * e)) * Math.PI * 2; sq += k < 0.12 ? (0.12 - k) * 1.2 : Math.sin(k * Math.PI) * -0.08; }
      // landing: squash + dust puff after a real fall
      if (air) s.airVy = Math.max(s.airVy || 0, u.vy || 0);
      if (!air && s.wasAir && (s.airVy || 0) > 260 && !u.dead) { s.land = 0.3; this.fx.dust(u.x, u.y, 6 + Math.min(8, (s.airVy / 120) | 0)); }
      if (!air) s.airVy = 0; s.wasAir = air;
      if (s.land > 0) { s.land -= dt; sq += Math.sin(s.land / 0.3 * Math.PI) * (0.08 + 0.16 * (u.jumpP == null ? 0.5 : u.jumpP)); } // bigger jump, bigger squash
      if (g.jumpCharge && g.jumpCharge.u === u && !air) sq += 0.03 + g.jumpCharge.p * 0.2; // crouch while charging a jump
      if (s.hit > 0) { s.hit -= dt; const k = s.hit / 0.55; sq += Math.sin(k * 18) * 0.12 * k; rx -= 0.35 * k; }
      // head: tilt with the aim; otherwise glance around, and track any projectile in flight
      const hd = rig.head, rx0 = hd.userData.rx0 || 0;
      let hx = rx0, hy = Math.sin(t * 0.37 + u.phase * 3) * 0.12 + Math.sin(t * 0.91 + u.phase) * 0.06;
      if (isCur && g.phase === 'aim') { hx = rx0 - clamp(u.aim, -60, 70) * Math.PI / 180 * 0.22; hy = 0; }
      else if (proj && !u.dead && !u.drowned) { const dx = proj.x - u.x, dy = proj.y - (u.y - 20); hy = clamp(Math.sign(dx) * 1.15 - u.facing * (Math.PI / 2 - 0.72), -0.9, 0.9) * clamp(Math.abs(dx) / 120, 0, 1); hx = rx0 + clamp(dy / 300, -0.35, 0.25); s.worry = Math.hypot(dx, dy) < 170 ? 1 : 0; }
      hd.rotation.x += (hx - hd.rotation.x) * (1 - Math.exp(-dt * 8)); hd.rotation.y += (hy - hd.rotation.y) * (1 - Math.exp(-dt * 6));
      if (rig.x.mouthO) rig.x.mouthO.visible = !winner && (s.hit > 0.05 || (air && !u.hop && (u.vy || 0) > 240) || u.drowned || (proj && s.worry && !u.dead));
      if (winner) bob += Math.abs(Math.sin(t * 6 + u.phase)) * 9;
      // death: topple + shrink, then a gravestone rises
      if (u.dead && !u.drowned) {
        if (s.dieT < 0) { s.dieT = 0; this.onDeath(u); }
        s.dieT += dt; const k = clamp(s.dieT / 0.5, 0, 1), k2 = clamp((s.dieT - 0.7) / 0.35, 0, 1);
        rz = -u.facing * k * Math.PI / 2 * 0.95; bob = Math.sin(k * Math.PI) * 6; rig.body.scale.setScalar(1 - k2);
        rig.yaw.visible = k2 < 1;
        if (s.dieT > 0.75) { const gr = this.graveFor(u); gr.t += dt; const e = clamp(gr.t / 0.45, 0, 1), el = 1 + Math.sin(e * Math.PI * 1.5) * (1 - e) * 0.5; gr.obj.position.set(u.x, to3Y(u.y), Z3.U); gr.obj.scale.set(1, e * el, 1); gr.obj.visible = true; }
      } else if (u.drowned) {
        if (s.dieT < 0) { s.dieT = 0; this.onDeath(u); }
        s.dieT += dt; rz = -u.facing * 0.5; root.visible = u.y < WATER_Y + 70;
      } else { rig.yaw.visible = true; rig.body.scale.set(1 + sq, 1 - sq, 1 + sq); s.dieT = -1; const gr = this.graves.get(u); if (gr) gr.obj.visible = false; }
      // flips pivot around the belly, not the feet
      const pc = 13; rig.body.position.set(0, bob + pc * (1 - Math.cos(flip)), pc * Math.sin(flip)); rig.body.rotation.set(rx - flip, 0, rz);
      this.fx.hopTrail(u, s, dt);
      // faces
      const ko = u.dead || u.drowned, hurt = s.hit > 0.2;
      for (const e of rig.eyes) { e.visible = !ko; e.scale.y = blink ? 0.12 : hurt ? 0.3 : 1; if (e.userData.ko) e.userData.ko.visible = ko; }
      if (rig.x.lids) for (const l of rig.x.lids) l.rotation.x = ko ? 1.55 : blink ? 1.45 : hurt ? 1.15 : 0.55 + Math.sin(t * 0.7 + u.phase) * 0.06;
      if (rig.x.tail) rig.x.tail.rotation.z = Math.sin(t * (isCur ? 12 : 5) + u.phase) * 0.35;
      if (rig.x.tongue) rig.x.tongue.visible = winner || (isCur && g.charging);
      if (rig.x.belly) rig.x.belly.scale.z = 4.6 * (1 + Math.max(0, Math.sin(t * 2.2 + u.phase)) * 0.12);
      if (rig.x.hat) rig.x.hat.rotation.z = 0.1 + Math.sin(t * 2 + u.phase) * 0.04 + (air ? 0.15 : 0);
      if (rig.x.ears) rig.x.ears.forEach((e, i) => { e.rotation.z = (i ? 0.28 : -0.28) + Math.sin(t * 3 + i) * 0.03 + (hurt ? (i ? 0.4 : -0.4) : 0); });
      rig.arms.forEach((a, i) => { const sd = i ? 1 : -1; a.rotation.x = Math.sin(s.walk + i * Math.PI) * 0.5 * s.walkAmt; a.rotation.z = (a.userData.z0 != null ? a.userData.z0 : (a.userData.z0 = a.rotation.z)) + (air || winner ? sd * -0.9 : 0) + (rig.id === 'PENGU' ? sd * Math.sin(t * 14) * 0.25 * (air ? 1 : s.walkAmt) : 0); });
      // flash red on hit
      const fl = s.hit > 0 ? (s.hit / 0.55) : 0;
      if (fl > 0 || s.flashOn) { for (const m of rig.mats) m.emissive.copy(m.userData.em0).lerp(this._red || (this._red = new THREE.Color('#ff2020')), fl * 0.6); s.flashOn = fl > 0; }
      // selection ring + held weapon
      rig.ring.visible = !u.dead && !u.drowned; // team-coloured ground ring on every unit (pulses on the active one)
      if (isCur && g.phase !== 'over') { const p = 1 + Math.sin(t * 5) * 0.08; rig.ring.scale.set(p, p, p); rig.ring.material.opacity = 0.6 + Math.sin(t * 5) * 0.25; }
      else { rig.ring.scale.set(0.85, 0.85, 0.85); rig.ring.material.opacity = 0.7; }
      const team = u.team, wid = isCur && g.phase === 'aim' ? team.weapons[team.weaponIdx] : null;
      for (const k in rig.held) rig.held[k].visible = false;
      if (wid && WEAPONS[wid].kind !== 'defense') {
        const h = this.heldWeapon(rig, wid); h.visible = true; const ang = u.aim * Math.PI / 180;
        rig.hold.rotation.set(0, 0, u.facing > 0 ? ang : Math.PI - ang); rig.hold.scale.set(1, u.facing > 0 ? 1 : -1, 1);
        rig.hold.position.set(0, 16 + bob, 10);
        if (g.charging) h.position.x = -this.game.power * 2; else h.position.x = 0;
      }
      this.fx.updateDefense(u, rig, t, dt);
    }
  }
  onDeath(u) {
    const g = this.game;
    this.fx.poof(u.x, to3Y(u.y), '#ffffff', 10);
    // kill cam: brief push-in on the victim unless a human is about to aim
    if (!this.cam.kill && !(g.phase === 'aim' && g.cur && g.cur.team.controller === 'human' && !g.cur.dead)) this.cam.kill = { x: u.x, y: u.y, t: 1.5 };
  }

  // ---------- camera ----------
  // Cinematic perspective camera. The 2D sim's camX is only used when the player pans (A/D, mouse
  // drag); otherwise we frame the action ourselves and write camX back so a pan starts from here.
  camGoal(dt) {
    const g = this.game, c = this.cam, WW = g.WW || W, big = WW > W + 40;
    const p = g.projectiles.find(q => !q.dead), u = g.cur && !g.cur.dead ? g.cur : null;
    let tx = WW / 2, ty = H / 2, zoom = 1, pitch = 0.17;
    if (p) {
      if (!c.launch || c.launch.p !== g.stats.shots) c.launch = { p: g.stats.shots, x: u ? u.x : p.x, y: u ? u.y : p.y };
      const lead = clamp(p.vx * 0.22, -160, 160), sx = c.launch.x, span = Math.abs(p.x + lead - sx) + 420;
      zoom = clamp(W * 0.95 / span, big ? 0.6 : 0.82, 1.12);
      const w = zoom < 1.05 ? 0.62 : 1; tx = sx + (p.x + lead - sx) * w;
      ty = (clamp(p.y, -200, 640) + (c.launch.y - 30)) * 0.5 * 0.6 + H / 2 * 0.4; pitch = 0.2;
      c.hold = { x: p.x, y: p.y, t: this.time };
    } else if (g.phase === 'settle' && c.hold) {
      if (c.boom && c.boom.t >= c.hold.t - 0.25) { c.hold.x = c.boom.x; c.hold.y = c.boom.y; }
      tx = c.hold.x; ty = c.hold.y * 0.55 + H / 2 * 0.45; zoom = 1.18; pitch = 0.2;
    } else if (u && (g.phase === 'aim' || g.phase === 'fire')) {
      const bot = g.isBotTurn();
      tx = u.x + u.facing * (bot ? 70 : 110); ty = (u.y - 40) * 0.55 + H / 2 * 0.45;
      zoom = bot ? 1.3 : 1.12; pitch = bot ? 0.2 : 0.17;
      if (u.hop) { tx = u.x; zoom = 1.25; }
    } else if (g.state === 'over') {
      const ws = g.units.filter(q => !q.dead && g.winner === q.team);
      if (ws.length) { tx = ws.reduce((a, q) => a + q.x, 0) / ws.length; ty = ws.reduce((a, q) => a + q.y, 0) / ws.length - 30; zoom = 1.35; pitch = 0.22; }
    }
    if (g.camHold && !p) { tx = g.camX + (g.viewW ? g.viewW() : W) / 2; ty = H / 2; zoom = Math.min(zoom, 1); }
    zoom *= g.zoom || 1; // player zoom (wheel / + -), shared with the 2D view
    // match intro: start on an overview of the whole map, then glide in
    if (c.intro > 0 && (p || g.charging || g.camHold)) c.intro = Math.min(c.intro, 0.5);
    if (c.intro > 0) { c.intro -= dt; const k = clamp(c.intro / 1.6, 0, 1), e = k * k * (3 - 2 * k); const oz = Math.min(1, W / (WW + 160)); tx += (WW / 2 - tx) * e; ty += (H / 2 + 30 - ty) * e; zoom += (oz - zoom) * e; pitch += (0.28 - pitch) * e; }
    return { tx, ty, zoom, pitch };
  }
  updateCamera(dt) {
    const g = this.game, c = this.cam, playing = g.state === 'play' || g.state === 'over';
    let tx, ty, zoom, pitch, yaw = 0;
    if (!playing) { tx = (g.terrain ? g.terrain.w : W) / 2 + Math.sin(this.time * 0.08) * 80; ty = H / 2 - 20; zoom = 1.04; pitch = 0.2; yaw = Math.sin(this.time * 0.06) * 0.07; }
    else {
      ({ tx, ty, zoom, pitch } = this.camGoal(dt));
      const p = g.projectiles.find(q => !q.dead);
      c.sp += ((p && SPECIAL_SHOTS[p.w.id] ? 1 : 0) - c.sp) * (1 - Math.exp(-dt * 2));
      zoom *= 1 + 0.06 * c.sp;
      if (c.kill) { c.kill.t -= dt; if (c.kill.t <= 0 || (g.phase === 'aim' && g.cur && g.cur.team.controller === 'human')) c.kill = null; }
      c.kb += ((c.kill ? 1 : 0) - c.kb) * (1 - Math.exp(-dt * (c.kill ? 4 : 2.5)));
      if (c.kb > 0.001) { const kx = c.kill ? c.kill.x : c.kx, ky = c.kill ? c.kill.y - 25 : c.ky; c.kx = kx; c.ky = ky; tx += (kx - tx) * c.kb * 0.9; ty += (ky - ty) * c.kb * 0.85; zoom += (1.75 - zoom) * c.kb; pitch += (0.12 - pitch) * c.kb; }
      // a gentle yaw that drifts with the camera position across the map, for parallax
      yaw = clamp((c.x - (g.WW || W) / 2) / (g.WW || W), -0.5, 0.5) * 0.16 + Math.sin(this.time * 0.11) * 0.015;
    }
    if (this.focus) { tx = this.focus.x; ty = this.focus.y; zoom = this.focus.zoom || 2; if (this.focus.pitch != null) pitch = this.focus.pitch; if (this.focus.yaw != null) yaw = this.focus.yaw; }
    c.kick = Math.max(0, c.kick - dt * 2.5);
    const k = 1 - Math.exp(-dt * (this.focus && this.focus.snap ? 60 : 3.2)), kz = 1 - Math.exp(-dt * 2.4);
    c.zoom += (zoom - c.zoom) * kz; c.pitch = c.pitch == null ? pitch : c.pitch + (pitch - c.pitch) * kz; c.yaw = c.yaw == null ? yaw : c.yaw + (yaw - c.yaw) * kz;
    // keep the framing inside the map (with a little margin) unless we are zoomed out past it
    const WW = g.terrain ? g.terrain.w : W, halfW = W / 2 / c.zoom, halfH = H / 2 / c.zoom;
    if (!this.focus) {
      tx = WW + 160 > halfW * 2 ? clamp(tx, halfW - 80, WW - halfW + 80) : WW / 2;
      ty = clamp(ty, Math.min(H / 2, -170 + halfH), Math.max(H / 2, H + 40 - halfH));
    }
    const kx = c.x == null || this.snapCam ? 1 : 1 - Math.exp(-dt * (g.projectiles.length ? 5 : 3.2));
    c.x = c.x == null ? tx : c.x + (tx - c.x) * kx; c.y += (ty - c.y) * (this.snapCam ? 1 : k); if (this.snapCam || (this.focus && this.focus.snap)) { c.x = tx; c.y = ty; c.zoom = zoom; c.pitch = pitch; c.yaw = yaw; this.snapCam = false; }
    if (playing && !g.camHold) g.camX = g.clampCam(c.x - (g.viewW ? g.viewW() : W) / 2);
    { // touch mode only (g.viewPad from js/touch.js): shift the picture so the action sits in the band between the HUD rows
      const vp = g.viewPad, key = vp && vp.shift ? vp.shift.toFixed(1) + ':' + W : '';
      if (key !== (this._vpKey || '')) { if (key) this.camera.setViewOffset(W, H, 0, -vp.shift, W, H); else this.camera.clearViewOffset(); this._vpKey = key; }
    }
    const fov = this.camera.fov * Math.PI / 180, d = (H / 2) / Math.tan(fov / 2) / c.zoom, P = c.pitch, Y0 = c.yaw;
    // zoomed far out on a big map: push the fog back with the camera so the terrain stays visible
    if (this.scene.fog && this.cfg && this.cfg.fog) { const d0 = (H / 2) / Math.tan(fov / 2), extra = Math.max(0, d - d0 * 1.1); this.scene.fog.near = this.cfg.fog[1] + extra; this.scene.fog.far = this.cfg.fog[2] + extra * 1.1; }
    let sx = 0, sy = 0; const sh = (g.shake || 0) * 0.55 + c.kick * 5; if (sh > 0.05) { const tt = this.time * 60; sx = (Math.sin(tt * 1.7) + Math.sin(tt * 2.9)) * 0.5 * sh; sy = (Math.sin(tt * 2.3 + 1) + Math.sin(tt * 3.7)) * 0.5 * sh; }
    const Y = to3Y(c.y);
    this.camera.position.set(c.x + Math.sin(Y0) * d * Math.cos(P) + sx, Y + d * Math.sin(P) + sy, Z3.U + Math.cos(Y0) * d * Math.cos(P));
    this.camera.lookAt(c.x + sx * 0.5, Y + sy * 0.5, Z3.U);
    this.camera.updateMatrixWorld();
    // zoomed far out: stretch the sea toward the camera so there is no gap under the horizon
    if (this.water) { const front = this.camera.position.z + 300, D = Math.max(4200, front + 3300); this.water.scale.z = D / 4200; this.water.position.z = -3300 + D / 2; }
    // shadow frustum follows the view
    const sd = this.sunDir || new THREE.Vector3(-0.4, 0.8, 0.5);
    this.sun.target.position.set(c.x, Y - 60, Z3.U - 20); this.sun.position.copy(this.sun.target.position).addScaledVector(sd, 1200);
    const ext = Math.round((700 / c.zoom + 200) / 50) * 50; const sc = this.sun.shadow.camera; if (Math.abs(sc.right - ext) > 1) { sc.left = -ext; sc.right = ext; sc.top = ext * 0.62; sc.bottom = -ext * 0.62; sc.updateProjectionMatrix(); }
    if (this.sky) this.sky.position.copy(this.camera.position);
    if (this.stars) this.stars.position.copy(this.camera.position);
  }
  // visible world-x range at the unit plane (for the minimap frame)
  viewRange() { const a = this.project3inv(0), b = this.project3inv(W); return [a, b - a]; }
  project3inv(sx) {
    const v = this._iv || (this._iv = new THREE.Vector3()), o = this.camera.position;
    v.set(sx / W * 2 - 1, 0, 0.5).unproject(this.camera).sub(o); const t = (Z3.U - o.z) / v.z; return o.x + v.x * t;
  }

  // Pre-rendered 3D mascot portraits for the (2D) menus: [eyes open, blink] canvases, 256x256,
  // 5px per mascot unit, feet at (128, 236). Rendered once through the main WebGL canvas.
  portrait(id) {
    if (!this.ok) return null;
    if (!this.portraits) this.buildPortraits();
    return this.portraits[id] || null;
  }
  // All 4 mascots x (open, blink) rendered in ONE pass into a 4x2 atlas and read back once
  // (a single GPU readback instead of one per portrait).
  buildPortraits() {
    this.portraits = {};
    const r = this.renderer, pr = r.getPixelRatio(), S = 256, ids = ['DOGE', 'FROG', 'PENGU', 'PILL'];
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight('#fff6ff', '#4a3a70', 0.85)); sc.add(new THREE.AmbientLight('#ffffff', 0.15));
    const dl = new THREE.DirectionalLight('#ffffff', 0.9); dl.position.set(-30, 60, 80); sc.add(dl);
    const rim = new THREE.DirectionalLight('#ffd8a8', 0.5); rim.position.set(60, 30, -40); sc.add(rim);
    const cam = new THREE.OrthographicCamera(-25.6, 25.6, 47.2, -4, 1, 1000); cam.position.set(0, 0, 300); cam.lookAt(0, 0, 0);
    const prevClear = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha(), shadows = r.shadowMap.enabled;
    r.setClearColor('#000000', 0); r.shadowMap.enabled = false; r.setScissorTest(true);
    r.setViewport(0, 0, W, H); r.setScissor(0, 0, W, H); r.clear();
    ids.forEach((id, i) => {
      const rig = new MascotRig(id); rig.yaw.rotation.y = 0.5; sc.add(rig.root);
      [false, true].forEach((blink, j) => {
        for (const e of rig.eyes) e.scale.y = blink ? 0.12 : 1;
        if (rig.x.lids) for (const l of rig.x.lids) l.rotation.x = blink ? 1.45 : 0.55;
        r.setViewport(i * S, j * S, S, S); r.setScissor(i * S, j * S, S, S); r.render(sc, cam);
      });
      sc.remove(rig.root);
    });
    const atlas = document.createElement('canvas'); atlas.width = 4 * S; atlas.height = 2 * S;
    atlas.getContext('2d').drawImage(this.canvas, 0, this.canvas.height - 2 * S * pr, 4 * S * pr, 2 * S * pr, 0, 0, 4 * S, 2 * S);
    ids.forEach((id, i) => { this.portraits[id] = [0, 1].map(j => { const c = document.createElement('canvas'); c.width = c.height = S; c.getContext('2d').drawImage(atlas, i * S, (1 - j) * S, S, S, 0, 0, S, S); return c; }); });
    r.setScissorTest(false); r.setViewport(0, 0, W, H); r.setClearColor(prevClear, prevA); r.shadowMap.enabled = shadows;
    if (this.active && this.t3) r.render(this.scene, this.camera); // don't leave the atlas on screen
  }

  // world (2D px) -> overlay canvas px
  project(x, y, z) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(x, to3Y(y), z == null ? Z3.U : z).project(this.camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, behind: v.z > 1 };
  }
  overlayTransform(ctx, x, y, smin, smax) {
    const a = this.project(x, y), b = this.project(x + 20, y); let s = Math.hypot(b.x - a.x, b.y - a.y) / 20;
    if (smin != null) s = clamp(s, smin, smax);
    ctx.setTransform(s, 0, 0, s, a.x - s * x, a.y - s * y);
    return s;
  }

  render(dt) {
    if (!this.active) return;
    const t0 = performance.now(); this.autoQuality(t0);
    const g = this.game;
    if (this.builtFor !== g.terrain || this.builtWorld !== g.worldId) this.build();
    this.time += dt;
    const t = g.t;
    this.t3.update(dt, this.time);
    for (const a of this.anims) a(this.time, dt);
    this.water.material.uniforms.uTime.value = this.time;
    if (this.shoreDirty) this.updateShore();
    if (this.stars) this.stars.material.uniforms.uTime.value = this.time;
    this.animUnits(dt, this.time);
    this.fx.updateProjectiles(g, dt, this.time);
    if (this.fx.updateCrates) this.fx.updateCrates(g, this.time);
    this.updateCamera(dt);
    this.fx.update(g, dt);
    this.ambient.update(dt, this.time, this.cam.x, g.wind || 0);
    const t1 = performance.now();
    this.renderer.render(this.scene, this.camera);
    void t;
    const t2 = performance.now();
    this.updMs = (this.updMs || 0) * 0.9 + (t1 - t0) * 0.1; this.frameMs = this.frameMs * 0.9 + (t2 - t0) * 0.1;
    this.stats = this.stats || { frames: 0, sum: 0, max: 0, updSum: 0 }; const st = this.stats; st.frames++; st.sum += t2 - t0; st.updSum += t1 - t0; if (st.frames > 30) st.max = Math.max(st.max, t2 - t0);
  }
}

Renderer3D.QUALITY = [
  { name: 'high', prMin: 1, prMax: 2, shadows: 2, shadowSize: 2048 },
  { name: 'medium', prMin: 1, prMax: 1.25, shadows: 1, shadowSize: 1024 },
  { name: 'low', prMin: 0.75, prMax: 0.75, shadows: 0, shadowSize: 512 },
];

// Terrain edits -> mark the touched chunks dirty (wraps the 2D terrain API without changing it)
(function hookTerrain() {
  const P = Terrain.prototype, wrap = (name, range) => { const f = P[name]; P[name] = function (...a) { const r = f.apply(this, a); const R = Renderer3D.inst; if (R && R.active) { const [x0, x1] = range.apply(this, a); R.terrainChanged(this, x0, x1); } return r; }; };
  wrap('carve', (cx, cy, r) => [cx - r - 10, cx + r + 10]);
  wrap('carveRect', (x, y, w) => [x - 8, x + w + 8]);
  wrap('addIceWall', (x0, top, w) => [x0 - 4, x0 + w + 4]);
  wrap('meltWall', (wall) => wall ? [wall.x - 4, wall.x + wall.w + 4] : [0, 0]);
})();
