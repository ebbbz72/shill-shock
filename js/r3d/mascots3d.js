'use strict';
// Low/mid-poly 3D mascots built from primitives. Local space: feet at the origin, +Y up, +Z = the
// direction the mascot faces (its face). Same proportions as the 2D drawings (~40px tall).

class MascotRig {
  constructor(teamId) {
    this.id = teamId; this.mats = []; this.eyes = []; this.feet = []; this.arms = [];
    this.root = new THREE.Group(); this.yaw = new THREE.Group(); this.body = new THREE.Group(); this.head = new THREE.Group();
    this.root.add(this.yaw); this.yaw.add(this.body);
    this.headY = 22; this.x = {};
    MASCOT3D[teamId](this);
    for (const m of [...this.feet, ...this.arms]) m.userData.keep = true;
    for (const k of ['tongue', 'belly']) if (this.x[k]) this.x[k].userData.keep = true;
    bakeStatic(this.root, this);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = false; } });
    // "x x" eyes for KO'd mascots (siblings of each eye, hidden until needed)
    const kmat = this.m('#1a1210', { r: 0.4 });
    for (const e of this.eyes) {
      const g = new THREE.Group(); g.position.copy(e.position); g.rotation.copy(e.rotation); g.position.z += 0.4; g.visible = false;
      for (const a of [0.785, -0.785]) { const b = new THREE.Mesh(boxGeo(), kmat); b.scale.set(4.2, 0.9, 0.9); b.rotation.z = a; g.add(b); }
      e.parent.add(g); e.userData.ko = g;
    }
    // "O" mouth for shock / pain (hidden until needed), and the head's rest pose
    const MO = { DOGE: [0, -4.6, 10.9, 1.5], FROG: [0, -3.6, 10.2, 2.2], PENGU: [0, -4.6, 11.6, 1.5], PILL: [0, -3.4, 8.7, 1.7] }[teamId];
    if (MO) { const mo = new THREE.Mesh(sphereGeo(12), this.m('#3a0d12', { r: 0.5 })); mo.scale.set(MO[3], MO[3] * 1.25, MO[3] * 0.45); mo.position.set(MO[0], MO[1], MO[2]); mo.visible = false; this.head.add(mo); this.x.mouthO = mo; }
    this.head.userData.rx0 = this.head.rotation.x; this.head.userData.ry0 = this.head.rotation.y;
    // animation state
    this.s = { yaw: 0, bob: 0, walk: 0, hit: 0, lastHp: null, lastX: null, dieT: -1, blinkT: Math.random() * 3, look: 0, flip: 0, hopId: null, sink: 0, fade: 1 };
  }
  m(color, o) {
    o = o || {};
    const mm = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.r == null ? 0.58 : o.r, metalness: o.m || 0, emissive: new THREE.Color(o.e || '#000000'), emissiveIntensity: o.ei == null ? 1 : o.ei, flatShading: !!o.flat });
    mm.userData.em0 = mm.emissive.clone(); this.mats.push(mm); return mm;
  }
  ell(p, mat, sx, sy, sz, x, y, z, seg) {
    const mesh = new THREE.Mesh(sphereGeo(seg || 22), mat); mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z); p.add(mesh); return mesh;
  }
  mesh(p, geo, mat, x, y, z, rx, ry, rz) {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.set(rx || 0, ry || 0, rz || 0); p.add(mesh); return mesh;
  }
  tube(p, mat, pts, r, caps) {
    const curve = new THREE.CatmullRomCurve3(pts.map(a => new THREE.Vector3(a[0], a[1], a[2])));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 8, false), mat); p.add(mesh);
    if (caps !== false) for (const e of [pts[0], pts[pts.length - 1]]) { const c = this.ell(p, mat, r, r, r, e[0], e[1], e[2], 10); c.userData.noShadow = true; }
    mesh.userData.noShadow = true; return mesh;
  }
  // glossy eye: dark iris + catch-lights; returns the group so it can blink (scale.y)
  eye(p, x, y, z, rx, ry, iris, yawOut) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yawOut || 0; p.add(g);
    const k = this.x.eyeMat || (this.x.eyeMat = this.m(iris || '#1d130c', { r: 0.18 }));
    const w = this.x.hiMat || (this.x.hiMat = this.m('#ffffff', { r: 0.2, e: '#ffffff', ei: 0.6 }));
    this.ell(g, k, rx, ry, rx * 0.62, 0, 0, 0, 20).userData.noShadow = true;
    this.ell(g, w, rx * 0.34, rx * 0.34, rx * 0.25, rx * 0.32, ry * 0.42, rx * 0.5, 10).userData.noShadow = true;
    this.ell(g, w, rx * 0.16, rx * 0.16, rx * 0.12, -rx * 0.3, -ry * 0.35, rx * 0.55, 8).userData.noShadow = true;
    this.eyes.push(g); return g;
  }
}

// Merge the static meshes of every group (per material class, colours baked into vertex colours)
// to keep draw calls low with 20 mascots.
function bakeStatic(root, rig) {
  root.updateMatrixWorld(true);
  const groups = []; root.traverse(o => { if (o.isGroup || o === root) groups.push(o); });
  for (const g of groups) {
    const byKey = new Map();
    for (const c of g.children) if (c.isMesh && !c.userData.keep && !c.isInstancedMesh && !c.material.map) { const k = matKey(c.material) + '|' + !!c.userData.noShadow; const l = byKey.get(k) || []; l.push(c); byKey.set(k, l); }
    for (const [, list] of byKey) {
      if (list.length < 2) continue;
      const geo = mergeGeos(list, g, true, false), src = list[0].material;
      const mat = src.clone(); mat.vertexColors = true; mat.color = new THREE.Color('#ffffff'); mat.userData.em0 = src.emissive.clone(); rig.mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat); mesh.userData.noShadow = list.every(m => m.userData.noShadow);
      for (const m of list) g.remove(m); g.add(mesh);
    }
  }
}

const MASCOT3D = {
  // Shiba: orange with cream face/belly, pointy ears, curled tail, cream "eyebrow" dots, side-eye.
  DOGE(R) {
    const O = R.m('#eba04c'), OD = R.m('#bd742e'), C = R.m('#fbe9cc'), IN = R.m('#c96a35'), K = R.m('#24170e', { r: 0.25 });
    const b = R.body;
    // legs/paws
    for (const [x, z] of [[-5, 4.5], [5, 4.5], [-5, -4], [5, -4]]) R.feet.push(R.ell(b, x < 0 === z > 0 ? OD : OD, 3.4, 3, 3.8, x, 2.6, z, 16));
    R.ell(b, O, 9.2, 8, 11, 0, 10.5, -0.5);                     // body
    R.ell(b, C, 6.4, 5.6, 4.6, 0, 9.4, 6.2, 20);                // chest
    // tail: curled donut on the back
    const tail = new THREE.Group(); tail.position.set(0, 15, -10.5); b.add(tail); R.x.tail = tail;
    R.mesh(tail, new THREE.TorusGeometry(3.6, 2.1, 10, 22, Math.PI * 1.55), O, 0, 2.4, 0, 0, Math.PI / 2, 0.6);
    R.ell(tail, C, 1.9, 1.9, 1.9, 0, 5.6, 1.6, 12);
    // head
    const h = R.head; h.position.set(0, 22, 3); b.add(h); R.headY = 22;
    R.ell(h, O, 10, 8.8, 9.4, 0, 1.2, 0);
    R.ell(h, C, 6.2, 4.2, 5.4, 0, -2.6, 6.2, 22);               // muzzle
    R.ell(h, C, 3.6, 3.2, 3.2, -6.2, -1.8, 4.4, 14); R.ell(h, C, 3.6, 3.2, 3.2, 6.2, -1.8, 4.4, 14); // cheeks
    R.ell(h, K, 2.3, 1.7, 1.8, 0, -0.6, 11.2, 14);              // nose
    R.ell(h, R.m('#ffffff', { r: 0.2, e: '#fff', ei: 0.4 }), 0.7, 0.5, 0.4, -0.7, 0.1, 12.6, 8).userData.noShadow = true;
    R.tube(h, K, [[-3.2, -3.9, 10.2], [-1.4, -5, 10.8], [0, -3.6, 11.2], [1.4, -5, 10.8], [3.2, -3.9, 10.2]], 0.42); // "w" mouth
    R.x.tongue = R.ell(h, R.m('#ff7e8a', { r: 0.4 }), 1.4, 0.9, 1.2, 0.6, -5.3, 10.4, 10); R.x.tongue.visible = false;
    R.eye(h, -3.9, 2.6, 7.9, 1.7, 2.2, null, -0.3); R.eye(h, 3.9, 2.6, 7.9, 1.7, 2.2, null, 0.3);
    R.ell(h, C, 1.7, 1.0, 0.9, -4.2, 6.2, 7.0, 10); R.ell(h, C, 1.7, 1.0, 0.9, 4.2, 6.2, 7.0, 10); // brow dots
    for (const s of [-1, 1]) { // ears
      const e = new THREE.Group(); e.position.set(s * 5.6, 8.4, -0.5); e.rotation.set(-0.12, 0, -s * 0.28); h.add(e);
      R.mesh(e, geoCached('earC', () => new THREE.ConeGeometry(3.7, 9.5, 14)), O, 0, 3.8, 0);
      R.mesh(e, geoCached('earI', () => new THREE.ConeGeometry(2.3, 6.8, 12)), IN, 0, 3.2, 1.25).scale.z = 0.5;
      (R.x.ears || (R.x.ears = [])).push(e);
    }
  },

  // Smug frog: wide head, bulging heavy-lidded eyes, big lips, gold chain + medallion.
  FROG(R) {
    const G = R.m('#5fba4a'), GD = R.m('#327d2a'), B = R.m('#d9efb6'), L = R.m('#a8463b', { r: 0.4 }), W = R.m('#ffffff', { r: 0.25 });
    const GOLD = R.m('#ffd84a', { m: 0.75, r: 0.28, e: '#5a4000', ei: 0.4 });
    const b = R.body;
    for (const s of [-1, 1]) R.feet.push(R.ell(b, GD, 4.8, 2.4, 6.4, s * 6, 2.2, 2.4, 16));
    R.ell(b, G, 10.4, 9.2, 9.6, 0, 10.4, 0);
    R.x.belly = R.ell(b, B, 7, 6.8, 4.6, 0, 9.6, 5.6, 22);
    R.mesh(b, new THREE.TorusGeometry(6.4, 0.75, 8, 28), GOLD, 0, 15.2, 2.2, Math.PI / 2 - 0.42, 0, 0);
    const med = R.mesh(b, new THREE.CylinderGeometry(2.3, 2.3, 0.9, 20), GOLD, 0, 10.4, 9.6, Math.PI / 2, 0, 0);
    R.mesh(b, new THREE.CylinderGeometry(1.2, 1.2, 1.0, 12), R.m('#a8761a', { m: 0.6, r: 0.4 }), 0, 10.4, 10.0, Math.PI / 2, 0, 0);
    med.userData.noShadow = true;
    // arms (little front legs)
    for (const s of [-1, 1]) R.arms.push(R.ell(b, G, 2.4, 4.6, 2.6, s * 8.8, 8.6, 3.2, 12));
    const h = R.head; h.position.set(0, 20.5, 1.5); b.add(h); R.headY = 20.5;
    R.ell(h, G, 12.6, 7.6, 10.4, 0, 0, 0);
    R.tube(h, L, [[-9.4, -1.6, 5.6], [-5.5, -3.3, 9.0], [0, -3.9, 10.2], [5.5, -3.3, 9.0], [9.4, -1.6, 5.6]], 1.25); // lips
    R.ell(h, GD, 0.7, 0.5, 0.5, -1.8, 1.6, 10.2, 8); R.ell(h, GD, 0.7, 0.5, 0.5, 1.8, 1.6, 10.2, 8); // nostrils
    R.x.lids = [];
    for (const s of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(s * 5.4, 6.4, 3.4); h.add(eg);
      R.ell(eg, G, 5.5, 5.5, 5.5, 0, 0, 0, 22);
      R.ell(eg, W, 4.3, 4.1, 3.2, 0, 0.2, 2.9, 20).userData.noShadow = true;
      R.eye(eg, s * 0.8, 0, 5.5, 1.85, 1.85, '#121212');
      // heavy smug lid: a hemisphere shell that rotates down over the eye
      const lid = new THREE.Group(); eg.add(lid);
      R.mesh(lid, geoCached('lid', () => new THREE.SphereGeometry(5.85, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2)), G, 0, 0, 0);
      R.mesh(lid, geoCached('lidRim', () => new THREE.TorusGeometry(5.7, 0.55, 6, 24)), GD, 0, 0, 0, Math.PI / 2, 0, 0);
      lid.rotation.x = 0.55; R.x.lids.push(lid);
    }
  },

  // Chubby penguin with a knit beanie and rosy cheeks.
  PENGU(R) {
    const P = R.m('#4f72a8'), PD = R.m('#2f4774'), Wt = R.m('#f6f8fc'), Y = R.m('#ffa733', { r: 0.45 }), PK = R.m('#ff7f9b', { r: 0.7 });
    const HAT = R.m('#7fd0ff', { r: 0.85 }), BAND = R.m('#3f9ed8', { r: 0.85 });
    const b = R.body;
    for (const s of [-1, 1]) R.feet.push(R.ell(b, Y, 4.6, 2.0, 6.2, s * 5.2, 1.6, 4.4, 16));
    R.ell(b, P, 12.4, 14.6, 11.4, 0, 15.2, 0, 32);
    R.ell(b, Wt, 9, 11, 5.6, 0, 13, 6.6, 28);
    for (const s of [-1, 1]) { const f = new THREE.Group(); f.position.set(s * 11.6, 18, 0.5); f.rotation.z = s * 0.35; b.add(f); R.ell(f, PD, 2.6, 8, 4.8, 0, -6, 0, 16); R.arms.push(f); }
    const h = R.head; h.position.set(0, 21, 0); b.add(h); R.headY = 21;
    R.ell(h, PK, 2.2, 1.5, 1, -5.8, -2.2, 10.1, 10).userData.noShadow = true; R.ell(h, PK, 2.2, 1.5, 1, 5.8, -2.2, 10.1, 10).userData.noShadow = true;
    R.eye(h, -3.5, 1.2, 10.0, 2.0, 2.4, '#141824', -0.25); R.eye(h, 3.5, 1.2, 10.0, 2.0, 2.4, '#141824', 0.25);
    const beak = R.mesh(h, geoCached('beak', () => new THREE.ConeGeometry(2.7, 7.2, 14)), Y, 0, -1.6, 13.2, Math.PI / 2, 0, 0); beak.scale.set(1, 1, 0.7);
    // beanie
    const hat = new THREE.Group(); hat.position.set(0, 6.2, -0.6); hat.rotation.z = 0.1; h.add(hat); R.x.hat = hat;
    R.mesh(hat, geoCached('beanie', () => new THREE.SphereGeometry(10.2, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2)), HAT, 0, 0, 0).scale.y = 0.72;
    R.mesh(hat, geoCached('band', () => new THREE.CylinderGeometry(10.5, 10.6, 3.2, 28)), BAND, 0, 0.4, 0);
    R.ell(hat, Wt, 3, 3, 3, 0, 8.4, 0, 16);
  },

  // Green/white capsule with a cheeky face, stick limbs and pink sneakers.
  PILL(R) {
    const Gr = R.m('#46dd7e', { r: 0.25 }), Wt = R.m('#f4f4f0', { r: 0.25 }), K = R.m('#111111', { r: 0.4 }), PK = R.m('#ff5fa2', { r: 0.5 }), OL = R.m('#1c5a37', { r: 0.4 });
    const b = R.body;
    for (const s of [-1, 1]) {
      R.mesh(b, geoCached('pleg', () => new THREE.CylinderGeometry(0.9, 0.9, 6.5, 8)), K, s * 3.8, 5, 0);
      R.feet.push(R.ell(b, PK, 3.2, 1.9, 4.6, s * 4.4, 1.7, 1.2, 14));
    }
    const cap = new THREE.Group(); cap.position.set(0, 19, 0); cap.rotation.x = 0.32; b.add(cap); R.x.cap = cap;
    const rr = 8.6, hh = 7.6;
    const topPts = []; for (let i = 0; i <= 12; i++) { const a = (1 - i / 12) * Math.PI / 2; topPts.push(new THREE.Vector2(Math.max(0.01, Math.cos(a) * rr), hh + Math.sin(a) * rr)); } topPts.push(new THREE.Vector2(rr, 0));
    const botPts = [new THREE.Vector2(rr, 0)]; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; botPts.push(new THREE.Vector2(Math.max(0.01, Math.cos(a) * rr), -hh - Math.sin(a) * rr)); }
    R.mesh(cap, new THREE.LatheGeometry(topPts.reverse(), 32), Gr, 0, 0, 0);
    R.mesh(cap, new THREE.LatheGeometry(botPts.reverse(), 32), Wt, 0, 0, 0);
    R.mesh(cap, new THREE.TorusGeometry(rr + 0.05, 0.45, 6, 36), OL, 0, 0, 0, Math.PI / 2, 0, 0);
    const shine = R.ell(cap, R.m('#ffffff', { r: 0.1, e: '#ffffff', ei: 0.35 }), 1.1, 4.5, 0.8, -4.8, 6.5, 6.5, 12); shine.rotation.y = -0.6; shine.userData.noShadow = true;
    // face on the capsule
    R.eye(cap, -3.3, 4.2, 8.1, 2.0, 2.5, '#111', -0.38); R.eye(cap, 3.3, 4.2, 8.1, 2.0, 2.5, '#111', 0.38);
    R.tube(cap, K, [[-3.4, -2.2, 8.2], [-1.8, -4.1, 8.5], [0, -4.6, 8.65], [1.8, -4.1, 8.5], [3.4, -2.2, 8.2]], 0.5);
    R.ell(cap, R.m('#ff9dbf', { r: 0.7 }), 1.6, 1.0, 0.6, -5.6, 0.3, 6.1, 10).userData.noShadow = true; R.ell(cap, R.m('#ff9dbf', { r: 0.7 }), 1.6, 1.0, 0.6, 5.6, 0.3, 6.1, 10).userData.noShadow = true;
    // stick arms with round hands
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * 8.2, 18, 1); b.add(a); R.arms.push(a);
      R.tube(a, K, [[0, 0, 0], [s * 3, -3, 1], [s * 4.5, -7, 1.5]], 0.75, false);
      R.ell(a, Wt, 1.7, 1.7, 1.7, s * 4.6, -7.4, 1.6, 10);
    }
    R.head = cap; R.headY = 19;
  },
};
