'use strict';
// Shared helpers for the 2.5D Three.js renderer. The 2D simulation (x right, y DOWN, pixels) is
// the source of truth; 3D space uses X = x, Y = H - y (up), and Z for depth (towards the camera).
const Z3 = { U: -14, F: 24, B: -100 }; // unit/projectile plane, terrain front face, terrain back face
const to3Y = y => H - y;

const _cssCache = new Map();
// CSS colour string -> { c: THREE.Color (linear), a: alpha }
function css3(s) {
  let v = _cssCache.get(s); if (v) return v;
  let r = 1, g = 1, b = 1, a = 1;
  if (typeof s === 'number') { const c = new THREE.Color(s); v = { c, a: 1 }; _cssCache.set(s, v); return v; }
  if (s && s[0] === '#') {
    let h = s.slice(1); if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    r = parseInt(h.slice(0, 2), 16) / 255; g = parseInt(h.slice(2, 4), 16) / 255; b = parseInt(h.slice(4, 6), 16) / 255;
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else if (s) {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(Number); r = p[0] / 255; g = p[1] / 255; b = p[2] / 255; a = p.length > 3 ? p[3] : 1; }
  }
  v = { c: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace), a };
  _cssCache.set(s, v); return v;
}
function col3(hex) { return new THREE.Color(hex); }

const _geoCache = {};
function geoCached(key, make) { return _geoCache[key] || (_geoCache[key] = make()); }
const sphereGeo = (seg = 24) => geoCached('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(8, (seg * 0.75) | 0)));
const boxGeo = () => geoCached('box', () => new THREE.BoxGeometry(1, 1, 1));
const quadGeo = () => geoCached('quad', () => new THREE.PlaneGeometry(1, 1));

// deterministic hash helpers (no Math.random so meshes are stable frame to frame)
function h3(a, b, c) { let x = Math.sin(a * 127.1 + b * 311.7 + (c || 0) * 74.7) * 43758.5453; return x - Math.floor(x); }
function rng3(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the one wave function used by the water shader AND by floating props (kept in sync by hand)
function wave3(x, z, t) {
  return 2.2 * Math.sin(x * 0.03 + t * 2.0) + 1.4 * Math.sin(x * 0.071 - t * 1.4) + 1.6 * Math.sin(z * 0.045 + x * 0.012 + t * 1.3) + 0.8 * Math.sin((x + z) * 0.11 + t * 2.6);
}
const WAVE_GLSL = `float wave3(vec2 p, float t){ return 2.2*sin(p.x*0.03+t*2.0)+1.4*sin(p.x*0.071-t*1.4)+1.6*sin(p.y*0.045+p.x*0.012+t*1.3)+0.8*sin((p.x+p.y)*0.11+t*2.6); }`;

// canvas -> texture with the right colour space
function canvasTex(cv, opts) {
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  if (opts && opts.nearest) { t.magFilter = THREE.NearestFilter; }
  t.anisotropy = 4;
  return t;
}
function makeCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }

// soft round glow texture (used by sprites)
let _glowTex = null;
function glowTex() {
  if (_glowTex) return _glowTex;
  _glowTex = canvasTex(makeCanvas(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }));
  return _glowTex;
}
function glowSprite(color, size, opacity) {
  const m = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(color), transparent: true, opacity: opacity == null ? 1 : opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
}

// --- sky dome (vertical gradient) ---
function makeSky(top, horizon, bottom) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: col3(top) }, uHor: { value: col3(horizon) }, uBot: { value: col3(bottom) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop,uHor,uBot; varying vec3 vDir;
      void main(){ float h=vDir.y; vec3 c = h>0.0 ? mix(uHor,uTop,smoothstep(0.0,0.42,h)) : mix(uHor,uBot,smoothstep(0.0,-0.25,h));
      gl_FragColor=vec4(c,1.0);
      #include <encodings_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 20), mat); m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// twinkling star points on the sky (camera-relative, so they never parallax)
function makeStars(n, seed, minEl, maxEl, size) {
  const r = rng3(seed), pos = new Float32Array(n * 3), ph = new Float32Array(n), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const az = (r() - 0.5) * 2.2, el = minEl + (maxEl - minEl) * Math.pow(r(), 0.8), R = 5000;
    pos[i * 3] = Math.sin(az) * Math.cos(el) * R; pos[i * 3 + 1] = Math.sin(el) * R; pos[i * 3 + 2] = -Math.cos(az) * Math.cos(el) * R;
    ph[i] = r() * 6.28; sz[i] = (0.6 + r() * r() * 2.2) * (size || 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); g.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
    vertexShader: `attribute float ph; attribute float sz; uniform float uTime; uniform float uPR; varying float vA;
      void main(){ vA = 0.55+0.45*sin(uTime*(1.5+fract(ph)*2.0)+ph*7.0); gl_PointSize = sz*2.2*uPR; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(d)); gl_FragColor=vec4(vec3(1.0,0.97,0.9), a*vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = -9;
  return p;
}

// --- animated hazard liquid (water / void / bog / liquidation pool) ---
function makeWater(cfg, WW) {
  const uni = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uDeep: { value: col3(cfg.deep) }, uShallow: { value: col3(cfg.shallow) }, uFoam: { value: col3(cfg.foam) },
    uSunDir: { value: new THREE.Vector3(-0.4, 0.8, 0.45).normalize() }, uSunCol: { value: col3(cfg.sun || '#ffffff') },
    uGlow: { value: col3(cfg.glow || '#000000') }, uOpacity: { value: cfg.opacity == null ? 0.86 : cfg.opacity },
    uStars: { value: cfg.stars ? 1 : 0 }, uSpec: { value: cfg.spec == null ? 1 : cfg.spec },
    uShore: { value: null }, uShoreW: { value: WW }, uZF: { value: Z3.F }, uZB: { value: Z3.B },
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, fog: true, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; varying vec3 vW; varying vec3 vN;
      ${WAVE_GLSL}
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); float h = wave3(w.xz,uTime); w.y += h;
        float e=2.0; float hx=wave3(w.xz+vec2(e,0.0),uTime)-h; float hz=wave3(w.xz+vec2(0.0,e),uTime)-h;
        vN = normalize(vec3(-hx/e,1.0,-hz/e)); vW = w.xyz;
        vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uDeep,uShallow,uFoam,uSunDir,uSunCol,uGlow; uniform float uOpacity,uStars,uTime,uSpec,uShoreW,uZF,uZB; uniform sampler2D uShore;
      varying vec3 vW; varying vec3 vN;
      #include <fog_pars_fragment>
      float hsh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN);
        float fres = pow(1.0-max(dot(N,V),0.0), 2.5);
        vec3 c = mix(uDeep, uShallow, 0.25 + 0.75*fres);
        vec3 Hh = normalize(uSunDir + V); float sp = pow(max(dot(N,Hh),0.0), 90.0)*uSpec;
        c += uSunCol*sp*0.9;
        float rip = sin(vW.x*0.12 + sin(vW.z*0.06+uTime*0.8)*2.4 + uTime*1.6) * sin(vW.z*0.09 - uTime*1.1 + vW.x*0.02);
        c += uFoam * smoothstep(0.78,1.0,rip) * 0.22;
        if (uStars > 0.5) { vec2 g = floor(vW.xz/11.0); float s = hsh(g); c += vec3(0.85,0.9,1.0) * step(0.982, s) * (0.5+0.5*sin(uTime*3.0+s*50.0)); }
        c += uGlow;
        // shoreline foam where the terrain slab meets the liquid
        float dx = texture2D(uShore, vec2(clamp(vW.x/uShoreW,0.0,1.0), 0.5)).r * 64.0;
        float dz = vW.z > uZF ? vW.z-uZF : (vW.z < uZB ? uZB-vW.z : 0.0);
        float dist = dx < 0.5 ? dz : (dz <= 0.0 ? dx : length(vec2(dx,dz)));
        if (vW.x < 0.0 || vW.x > uShoreW) dist = 99.0;
        float foam = (1.0 - smoothstep(0.0, 12.0, dist)) * (0.65 + 0.35*sin(uTime*2.3 + vW.x*0.15 + vW.z*0.2));
        c = mix(c, uFoam, foam*0.75);
        gl_FragColor = vec4(c, clamp(uOpacity + fres*0.12 + foam*0.3, 0.0, 1.0));
        #include <encodings_fragment>
        #include <fog_fragment>
      }`,
  });
  const g = new THREE.PlaneGeometry(WW + 9000, 4200, 260, 90); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(WW / 2, to3Y(WATER_Y), 900 - 2100); m.renderOrder = 2; m.frustumCulled = false;
  return m;
}

// --- fresnel bubble (Liquidity Lock shield, ice-wall sheen) ---
function fresnelMat(rim, core, power, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uRim: { value: col3(rim) }, uCore: { value: col3(core) }, uPow: { value: power || 2.2 }, uOp: { value: opacity == null ? 1 : opacity }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uRim,uCore; uniform float uPow,uOp,uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))), uPow);
        float sw = 0.5+0.5*sin(vP.y*0.35 + vP.x*0.2 + uTime*3.0);
        vec3 c = mix(uCore, uRim, f) + vec3(0.25)*smoothstep(0.92,1.0,sw)*f;
        gl_FragColor = vec4(c, (0.10 + f*0.8)*uOp);
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// Merge meshes (already expressed in a common parent space via their .matrix chain up to `rel`)
// into one non-indexed BufferGeometry. withColor bakes each mesh's material colour into a vertex
// colour attribute so differently-coloured parts can share one material (one draw call).
function mergeGeos(list, rel, withColor, withUv) {
  let n = 0; const inv = new THREE.Matrix4().copy(rel.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const parts = list.map(m => { m4.multiplyMatrices(inv, m.matrixWorld); const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); geo.applyMatrix4(m4); n += geo.attributes.position.count; return [geo, m]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = withColor ? new Float32Array(n * 3) : null, uv = withUv ? new Float32Array(n * 2) : null; let o = 0;
  for (const [geo, m] of parts) {
    const c = geo.attributes.position.count; pos.set(geo.attributes.position.array, o * 3); nor.set(geo.attributes.normal.array, o * 3);
    if (col) { const cc = m.material.color; for (let i = 0; i < c; i++) { col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b; } }
    if (uv && geo.attributes.uv) uv.set(geo.attributes.uv.array, o * 2);
    o += c; geo.dispose();
  }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) mg.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (uv) mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mg.computeBoundingSphere(); return mg;
}
function matKey(m) { return [m.type, m.roughness, m.metalness, m.emissive ? m.emissive.getHexString() : '', m.emissiveIntensity, m.flatShading, m.transparent, m.opacity, m.side, m.map ? m.map.uuid : '', m.vertexColors].join('|'); }
// Collapse every static mesh below `root` (not flagged userData.dyn, not under a dyn group) into
// one mesh per material class, parented to root. Cuts hundreds of prop draw calls to a handful.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), skip = new Set();
  root.traverse(o => { if (o !== root && (o.userData.dyn || skip.has(o.parent))) skip.add(o); });
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || !o.visible || !o.geometry.attributes.normal) return;
    const m = o.material; if (Array.isArray(m) || m.isShaderMaterial || (m.map && !o.geometry.attributes.uv)) return;
    const k = matKey(m) + (m.map ? '' : '') + '|' + (m.fog === false ? 'nf' : 'f') + '|' + o.castShadow + o.receiveShadow;
    (groups.get(k) || groups.set(k, { mat: m, list: [] }).get(k)).list.push(o);
  });
  let removed = 0;
  for (const [, { mat, list }] of groups) {
    if (list.length < 2) continue;
    const textured = !!mat.map, geo = mergeGeos(list, root, !textured, textured);
    const nm = textured ? mat : mat.clone(); if (!textured) { nm.vertexColors = true; nm.color = new THREE.Color('#ffffff'); }
    const mesh = new THREE.Mesh(geo, nm); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.renderOrder = list[0].renderOrder;
    for (const o of list) { o.parent.remove(o); removed++; }
    root.add(mesh);
  }
  // drop now-empty groups
  const empty = []; root.traverse(o => { if (o !== root && o.isGroup && !o.children.length && !o.userData.dyn) empty.push(o); }); for (const o of empty) o.parent && o.parent.remove(o);
  return removed;
}
