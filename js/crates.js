'use strict';
// Supply crates: at the start of every round 2 memecoin-themed crates parachute down onto random walkable spots.
// Walk / jump / land into one to pick it up (any character, any time); explosions destroy crates (weapon crates
// go off). Contents (weighted random) are new crate weapons and a defense (added to the character's own
// inventory with limited uses, keys 6-9 or Q/E), or instant boosts (heal, scope). Host-authoritative online:
// crates + inventories ride in the snapshot, pickups / beams / gas / teleports are replayed through crateFx events.
const CRATES_PER_ROUND = 2;
const CRATE_ITEMS = [
  { id: 'laser',      kind: 'weapon',  w: 12, uses: 1, icon: 'L', color: '#ff3b5c', name: 'Laser Eyes' },
  { id: 'shillspray', kind: 'weapon',  w: 12, uses: 2, icon: 'S', color: '#ffb02e', name: 'Shill Spray' },
  { id: 'airdrop',    kind: 'weapon',  w: 12, uses: 1, icon: 'A', color: '#b06bff', name: 'Airdrop Cluster' },
  { id: 'whale',      kind: 'weapon',  w: 9,  uses: 1, icon: 'W', color: '#46a8ff', name: 'Whale Missile' },
  { id: 'gasfee',     kind: 'weapon',  w: 9,  uses: 1, icon: 'G', color: '#7dff6a', name: 'Gas Fee' },
  { id: 'fud',        kind: 'weapon',  w: 7,  uses: 2, icon: 'F', color: '#9aa0b8', name: 'FUD Bomb' },
  { id: 'bridge',     kind: 'weapon',  w: 6,  uses: 1, icon: 'B', color: '#46f0ff', name: 'L2 Bridge' },
  { id: 'diamond',    kind: 'defense', w: 10, uses: 1, icon: 'D', color: '#7fe9ff', name: 'Diamond Hands' },
  { id: 'hopium',     kind: 'instant', w: 14, heal: 35, icon: '+', color: '#4ade80', name: 'Hopium' },
  { id: 'scope',      kind: 'instant', w: 10, shots: 3, icon: 'O', color: '#ffd84a', name: 'Moon Scope' },
];
const CRATE_BY_ID = Object.fromEntries(CRATE_ITEMS.map(c => [c.id, c]));
const SCOPE_MUL = 1.25, FUD_MUL = 0.6;
// crate weapons (same WEAPONS table, so the HUD, bots, 2D/3D projectiles and the online snapshot just work)
Object.assign(WEAPONS, {
  laser:      { id: 'laser', name: 'Laser Eyes', kind: 'beam', damage: 38, knock: 0.45, range: 1500, crate: true, ammo: 0, desc: 'Crate: bitcoin-maxi laser eyes — instant straight beam along your aim (no power, no wind), 38 dmg to everyone in line until it hits ground.' },
  shillspray: { id: 'shillspray', name: 'Shill Spray', kind: 'impact', burst: 8, child: 'shillbullet', radius: 15, damage: 10, knock: 0.25, wind: 0.2, grav: 0.35, crate: true, ammo: 0, desc: 'Crate: machine gun — a burst of 8 shill bullets (10 dmg each at the centre of a tiny blast), low drop, barely any wind.' },
  shillbullet:{ id: 'shillbullet', name: 'Shill Bullet', kind: 'impact', radius: 15, damage: 10, knock: 0.25, wind: 0.2, grav: 0.35, ammo: 0 },
  airdrop:    { id: 'airdrop', name: 'Airdrop Cluster', kind: 'impact', radius: 28, damage: 25, knock: 0.7, wind: 0.6, grav: 1, splits: 6, child: 'bomblet', splitSpeed: 210, splitSpread: 0.36, crate: true, ammo: 0, desc: 'Crate: cluster bomb — 25 dmg blast, then 6 airdrop bomblets (16 dmg each) scatter.' },
  bomblet:    { id: 'bomblet', name: 'Bomblet', kind: 'impact', radius: 24, damage: 16, knock: 0.6, wind: 0.3, grav: 1, ammo: 0 },
  whale:      { id: 'whale', name: 'Whale Missile', kind: 'impact', radius: 44, damage: 50, knock: 1.1, wind: 0.25, grav: 0.6, homing: 2.4, homeDelay: 0.45, crate: true, ammo: 0, desc: 'Crate: homing whale — after a moment it steers toward the nearest enemy. 50 dmg.' },
  gasfee:     { id: 'gasfee', name: 'Gas Fee', kind: 'bounce', radius: 28, damage: 20, knock: 0.4, wind: 0.2, grav: 1, fuse: 2.5, bounce: 0.4, gasR: 120, gasDmg: 10, gasTurns: 3, crate: true, ammo: 0, desc: 'Crate: gas grenade — 20 dmg, everyone within 120px pays a 10 gas fee at the start of their next 3 turns.' },
  fud:        { id: 'fud', name: 'FUD Bomb', kind: 'impact', radius: 32, damage: 30, knock: 0.6, wind: 0.8, grav: 1, crate: true, ammo: 0, desc: 'Crate: 30 dmg; enemies it hits get FUD — their next attack does 40% less damage.' },
  bridge:     { id: 'bridge', name: 'L2 Bridge', kind: 'impact', radius: 0, damage: 0, knock: 0, wind: 0.5, grav: 1, teleport: true, crate: true, ammo: 0, desc: 'Crate: teleport beacon — you bridge to wherever it lands (dry ground). Ends your turn.' },
  diamond:    { id: 'diamond', name: 'Diamond Hands', kind: 'defense', dmgMul: 0.5, knockMul: 0.3, crate: true, ammo: 0, desc: 'Crate defense: diamond-hands shield, -50% damage, -70% knockback until your team\'s next turn.' },
});
DEF_STYLE.diamond = { color: '#7fe9ff', icon: 'diamond' };
const BASE_SLOTS = 5; // u.weapons[0..4] = the character kit, [5..] = crate items

// homing steer (shared by the game and the bot simulator so bots predict whales correctly)
function homingSteer(game, owner, x, y, vx, vy, st, rate) {
  let best = null, bd = 1e9;
  for (const u of game.units) { if (u.dead || !owner || u.team === owner.team) continue; const d = Math.hypot(u.x - x, u.y - 14 - y); if (d < bd) { bd = d; best = u; } }
  if (!best) return [vx, vy];
  const sp = Math.hypot(vx, vy), a = Math.atan2(vy, vx), want = Math.atan2(best.y - 14 - y, best.x - x);
  let da = want - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const na = a + clamp(da, -rate * st, rate * st), s2 = Math.max(sp, 320);
  return [Math.cos(na) * s2, Math.sin(na) * s2];
}

Object.assign(Game.prototype, {
  pickCrateItem() {
    const tot = CRATE_ITEMS.reduce((a, c) => a + c.w, 0); let r = Math.random() * tot;
    for (const c of CRATE_ITEMS) { r -= c.w; if (r < 0) return c.id; }
    return 'hopium';
  },
  // a random dry, walkable spot (gentle slope, head room), away from units and other crates
  crateSpot() {
    const T = this.terrain;
    for (let k = 0; k < 200; k++) {
      const x = Math.round(150 + Math.random() * (this.WW - 300)), y = T.surfaceY(x);
      if (y < 90 || y > WATER_Y - 45) continue;
      const a = T.surfaceY(x - 10), b = T.surfaceY(x + 10);
      if (a < 0 || b < 0 || Math.abs(a - y) > 12 || Math.abs(b - y) > 12) continue;
      if (k < 150 && this.units.some(u => !u.dead && Math.abs(u.x - x) < 60)) continue;
      if ((this.crates || []).some(c => Math.abs(c.x - x) < 220)) continue;
      return { x, y };
    }
    return null;
  },
  spawnCrates(n) {
    this.crates = this.crates || []; this.crateSeq = this.crateSeq || 0;
    for (let i = 0; i < n; i++) {
      const s = this.crateSpot(); if (!s) continue;
      const item = this.pickCrateItem();
      this.crates.push({ id: ++this.crateSeq, x: s.x, y: -30, vy: 0, para: true, landed: false, item, sway: Math.random() * 6 });
      this.stats.crates = (this.stats.crates || 0) + 1;
    }
    if (n) this.crateFx('drop', 0, 0, this.round);
  },
  updateCrates(dt) {
    if (!this.crates || !this.crates.length || this.mirror) return;
    const T = this.terrain;
    for (const c of this.crates) {
      if (c.dead) continue;
      if (c.landed && !T.isSolid(c.x, c.y + 1) && !T.isSolid(c.x - 6, c.y + 1) && !T.isSolid(c.x + 6, c.y + 1)) c.landed = false; // ground blown away
      if (!c.landed) {
        if (c.para) c.vy = 85; else c.vy = Math.min(700, c.vy + GRAV * dt);
        const n = Math.max(1, Math.ceil(c.vy * dt / 2)), s = dt / n;
        for (let i = 0; i < n; i++) {
          const ny = c.y + c.vy * s;
          if (ny > 0 && (T.isSolid(c.x, ny) || T.isSolid(c.x - 6, ny) || T.isSolid(c.x + 6, ny))) { c.landed = true; c.para = false; c.vy = 0; let k = 0; while (T.isSolid(c.x, c.y) && k < 20) { c.y--; k++; } break; }
          c.y = ny;
        }
        if (c.y > WATER_Y) { c.dead = true; this.splash(c.x, WATER_Y, 0.5); this.floatText('crate rugged by the pool', c.x, WATER_Y - 30, '#bfe8ff', 13); continue; }
      }
      // pickup: any living character touching the crate (walking, jumping or landing on it)
      for (const u of this.units) {
        if (u.dead || u.drowned) continue;
        if (Math.abs(u.x - c.x) < 20 && u.y > c.y - 34 && u.y - 30 < c.y + 2) { this.pickupCrate(u, c); break; }
      }
    }
    this.crates = this.crates.filter(c => !c.dead);
  },
  pickupCrate(u, c) {
    c.dead = true;
    const it = CRATE_BY_ID[c.item]; if (!it) return;
    let sub = '';
    if (it.kind === 'instant') {
      if (it.heal) { const before = u.hp; u.hp = Math.min(100, u.hp + it.heal); sub = `+${u.hp - before} HP`; }
      if (it.shots) { u.scope = (u.scope || 0) + it.shots; sub = `next ${u.scope} shots: long aim preview, +${Math.round((SCOPE_MUL - 1) * 100)}% damage`; }
    } else {
      if (!u.weapons.includes(it.id)) u.weapons.push(it.id);
      u.ammo[it.id] = (u.ammo[it.id] || 0) + it.uses;
      sub = `${u.ammo[it.id]} use${u.ammo[it.id] > 1 ? 's' : ''} · key ${u.weapons.indexOf(it.id) + 1}`;
    }
    this.stats.pickups = (this.stats.pickups || 0) + 1;
    this.lastPickup = { u, item: it.id, t: this.t };
    this.quip(`${it.name.toUpperCase()}!`, it.color);
    this.floatText(`${u.name}: ${it.name}`, c.x, c.y - 46, it.color, 18, true);
    if (sub) this.floatText(sub, c.x, c.y - 26, '#fff', 12);
    this.crateFx('pickup', c.x, c.y, it.id);
  },
  // explosions hit crates: weapon crates go off, the others just break
  crateBlast(x, y, r) {
    if (!this.crates || !this.crates.length || this.mirror) return;
    for (const c of this.crates) {
      if (c.dead || Math.hypot(c.x - x, c.y - 10 - y) > r * 1.3 + 10) continue;
      c.dead = true; const it = CRATE_BY_ID[c.item];
      if (it && it.kind !== 'instant') { this.floatText('crate went off!', c.x, c.y - 40, '#ffb02e', 15, true); this.explode(c.x, c.y - 10, 30, 20, 0.7, null); }
      else { this.floatText(it ? `${it.name} spilled` : 'crate broke', c.x, c.y - 40, '#ddd', 13); this.crateFx('pop', c.x, c.y, c.item); }
    }
  },
  // visuals + sound for crate events (replayed on online mirrors)
  crateFx(kind, x, y, a, b, c2, d) {
    if (kind === 'drop') { SFX.crate && SFX.crate(); this.toast(`Round ${a}: ${CRATES_PER_ROUND} supply crates incoming!`); return; }
    if (kind === 'pickup' || kind === 'pop') {
      const it = CRATE_BY_ID[a], col = it ? it.color : '#fff';
      for (let i = 0; i < (kind === 'pickup' ? 26 : 14); i++) this.particles.push({ x: x + rand(-8, 8), y: y - 10 + rand(-8, 8), vx: rand(-120, 120), vy: rand(-220, -40), life: rand(0.5, 1), max: 1, size: rand(2, 4), color: i % 3 ? col : '#ffd84a', type: i % 2 ? 'spark' : 'debris', grav: 0.6 });
      if (kind === 'pickup') { SFX.pickup && SFX.pickup(); this.particles.push({ x, y: y - 10, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 46, color: '#ffffff', type: 'ring', grav: 0 }); }
      else SFX.bounce();
      return;
    }
    if (kind === 'beam') { // x,y -> a,b ; c2 = hit count
      (this.beams = this.beams || []).push({ x0: x, y0: y, x1: a, y1: b, life: 0.55, max: 0.55 });
      for (let i = 0; i < 12; i++) this.particles.push({ x: a, y: b, vx: rand(-160, 160), vy: rand(-160, 60), life: 0.4, max: 0.4, size: rand(2, 4), color: pick(['#ff3b5c', '#ffd0d8', '#ff8a3d']), type: 'spark', grav: 0.3 });
      SFX.laser && SFX.laser(); this.shake = Math.max(this.shake, 4);
      return;
    }
    if (kind === 'gas') {
      for (let i = 0; i < 34; i++) { const ang = rand(0, Math.PI * 2), d2 = rand(0, a || 110); this.particles.push({ x: x + Math.cos(ang) * d2, y: y + Math.sin(ang) * d2 * 0.5 - 10, vx: rand(-20, 20), vy: rand(-25, 5), life: rand(1.2, 2.2), max: 2.2, size: rand(10, 20), color: 'rgba(125,255,106,0.35)', type: 'smoke', grav: -0.02 }); }
      SFX.splash();
      return;
    }
    if (kind === 'tp') { // teleport: x,y -> a,b
      for (const [px, py] of [[x, y], [a, b]]) for (let i = 0; i < 18; i++) this.particles.push({ x: px + rand(-10, 10), y: py - rand(0, 40), vx: rand(-30, 30), vy: rand(-90, -20), life: 0.8, max: 0.8, size: rand(2, 4), color: pick(['#46f0ff', '#b06bff', '#fff']), type: 'spark', grav: 0 });
      SFX.flip();
    }
  },
  // laser: hitscan from the muzzle along the aim until terrain / the map edge / range
  traceBeam(u, aimDeg, facing) {
    const T = this.terrain, w = WEAPONS.laser, ang = aimDeg * Math.PI / 180, dx = Math.cos(ang) * facing, dy = -Math.sin(ang);
    let x = u.x + dx * 16, y = u.y - 16 + dy * 16; const hits = [];
    for (let d = 0; d < w.range; d += 3) {
      x += dx * 3; y += dy * 3;
      if (x < 0 || x > this.WW || y > WATER_Y || y < -300) break;
      if (y >= 0 && T.isSolid(x, y)) return { x, y, hits, ground: true };
      for (const o of this.units) if (!o.dead && o !== u && !hits.includes(o) && Math.hypot(o.x - x, o.y - 15 - y) < 14) hits.push(o);
    }
    return { x, y, hits, ground: false };
  },
  fireBeam(u, mul) {
    const w = WEAPONS.laser, r = this.traceBeam(u, u.aim, u.facing), ang = u.aim * Math.PI / 180;
    const x0 = u.x + Math.cos(ang) * u.facing * 16, y0 = u.y - 16 - Math.sin(ang) * 16;
    this.crateFx('beam', x0, y0, r.x, r.y, r.hits.length);
    for (const o of r.hits) {
      this.damage(o, Math.round(w.damage * mul));
      if (o.dead) continue;
      const imp = 180 * w.knock * (o.def ? o.def.knockMul : 1);
      o.vx += Math.cos(ang) * u.facing * imp; o.vy -= 60 + Math.sin(ang) * imp * 0.5; o.onGround = false; o.y -= 1; o.selfJump = false;
    }
    if (r.ground) { this.terrain.carve(r.x, r.y, 14); this.explodeFx(r.x, r.y, 14, true); this.crateBlast(r.x, r.y, 14); }
    this.floatText(r.hits.length ? 'LASER EYES' : 'laser eyes (miss)', u.x, u.y - 64, '#ff3b5c', 18, true);
    this.lastBeam = { hits: r.hits.length, x: r.x, y: r.y, t: this.t };
    this.explosionCount++; this.lastExplosion = { x: r.x, y: r.y, t: this.t };
  },
  // gas fee ticks at the start of the poisoned character's own turn
  gasTick(u) {
    const ps = u.poison; if (!ps || u.dead) return;
    ps.turns--; this.floatText(`gas fee -${ps.dmg}`, u.x, u.y - 66, '#7dff6a', 15, true);
    this.damage(u, ps.dmg);
    if (ps.turns <= 0) u.poison = null;
  },
  pruneItems(u) {
    if (!u || !u.weapons) return;
    const keep = u.weapons.filter((w, i) => i < BASE_SLOTS || (u.ammo[w] || 0) > 0);
    if (keep.length !== u.weapons.length) { u.weapons.length = 0; u.weapons.push(...keep); }
  },
  // Moon Scope: the exact flight path for the current power (same integrator as updateProjectiles, wind included)
  scopePath(u, wid, power) {
    const w0 = WEAPONS[wid], w = w0.burst ? WEAPONS[w0.child] : w0, s = this.shotParams(u, u.aim, u.facing, power), T = this.terrain, dt = 1 / 60;
    let { x, y, vx, vy } = s; if (w0.burst) { vx *= 1.1; vy *= 1.1; }
    const pts = []; let t = 0;
    for (let f = 0; f < 300; f++) {
      t += dt; const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) * dt / 2)), st = dt / n;
      for (let i = 0; i < n; i++) {
        vx += this.wind * WIND_ACC * w.wind * st; vy += GRAV * w.grav * st;
        if (w.homing && t > w.homeDelay) [vx, vy] = homingSteer(this, u, x, y, vx, vy, st, w.homing);
        x += vx * st; y += vy * st;
        if (T.isSolid(x, y) || (t > 0.3 && this.hitUnit(x, y, { owner: u, age: t })) || y > WATER_Y || x < -50 || x > this.WW + 50) { pts.push([x, y]); return { pts, end: [x, y], bounce: w.kind === 'bounce' }; }
      }
      if (f % 3 === 0) pts.push([x, y]);
    }
    return { pts, end: [x, y] };
  },
  drawAimExtras(ctx, u, wid, cx, cy) {
    const w = WEAPONS[wid]; if (!w) return;
    if (w.kind === 'beam') { // laser sight
      const r = this.traceBeam(u, u.aim, u.facing);
      ctx.save(); ctx.strokeStyle = 'rgba(255,59,92,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -this.t * 30;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(r.x, r.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(r.x, r.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return;
    }
    if (u.scope > 0 && w.kind !== 'defense') {
      const pw = this.charging ? this.power : (this.scopePower != null ? this.scopePower : 0.6), r = this.scopePath(u, wid, Math.max(0.05, pw));
      ctx.save(); ctx.fillStyle = 'rgba(255,216,74,0.85)';
      for (const [x, y] of r.pts) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.end[0], r.end[1], 10, 0, Math.PI * 2); ctx.stroke();
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(`SCOPE ${Math.round(pw * 100)}%`, r.end[0], r.end[1] - 15);
      ctx.restore();
    }
  },
  drawCrate(ctx, c, t) {
    const it = CRATE_BY_ID[c.item], sway = c.para ? Math.sin(t * 2 + c.sway) * 0.12 : 0;
    ctx.save(); ctx.translate(c.x, c.y);
    if (c.para) { // parachute
      ctx.save(); ctx.rotate(sway);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(-9, -18); ctx.lineTo(-24, -52); ctx.moveTo(9, -18); ctx.lineTo(24, -52); ctx.moveTo(0, -20); ctx.lineTo(0, -56); ctx.stroke();
      ctx.fillStyle = '#ff5fa2'; ctx.beginPath(); ctx.moveTo(-28, -50); ctx.quadraticCurveTo(0, -84, 28, -50); ctx.quadraticCurveTo(14, -56, 0, -52); ctx.quadraticCurveTo(-14, -56, -28, -50); ctx.fill();
      ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(-10, -61); ctx.quadraticCurveTo(0, -70, 10, -61); ctx.lineTo(0, -53); ctx.fill();
      ctx.restore();
    }
    ctx.rotate(sway * 0.5);
    ctx.fillStyle = '#8b5e3c'; ctx.fillRect(-10, -20, 20, 20); ctx.strokeStyle = '#3a2412'; ctx.lineWidth = 1.5; ctx.strokeRect(-10, -20, 20, 20);
    ctx.strokeStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, -10); ctx.moveTo(0, -20); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(0, -10, 5.5, 0, Math.PI * 2); ctx.fill(); // the coin: what's inside stays a surprise
    ctx.fillStyle = '#3a2412'; ctx.font = `bold 8px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('?', 0, -7.2);
    ctx.restore(); void it;
  },
  drawBeams(ctx) {
    if (!this.beams || !this.beams.length) return;
    for (const b of this.beams) {
      const a = clamp(b.life / b.max, 0, 1);
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,40,80,${0.45 * a})`; ctx.lineWidth = 12 * a + 2; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,220,230,${a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.restore();
    }
  },
  updateBeams(dt) { if (this.beams) { for (const b of this.beams) b.life -= dt; this.beams = this.beams.filter(b => b.life > 0); } },
  // inventory row above the weapon bar: crate items (keys 6-9, Q/E)
  drawItemRow(ctx, team, px, py) {
    const items = team.weapons.slice(BASE_SLOTS); if (!items.length) return 0;
    const cw = 150, y = py - 40; let x = px;
    ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(14,10,40,0.78)'; this.rr(ctx, x, y - 2, 64 + items.length * (cw + 4), 32, 8); ctx.fill();
    ctx.fillStyle = '#ffd84a'; ctx.fillText('CRATE', x + 8, y + 12); ctx.fillText('ITEMS', x + 8, y + 24); x += 58;
    items.forEach((wid, k) => {
      const i = BASE_SLOTS + k, w = WEAPONS[wid], it = CRATE_BY_ID[wid] || {}, sel = i === team.weaponIdx, n = team.ammo[wid] || 0;
      ctx.fillStyle = sel ? team.color : 'rgba(255,255,255,0.08)'; this.rr(ctx, x, y + 1, cw, 26, 7); ctx.fill();
      ctx.strokeStyle = it.color || '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = it.color || '#fff'; ctx.beginPath(); ctx.arc(x + 13, y + 14, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#120a2a'; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(it.icon || '?', x + 13, y + 17.5);
      ctx.textAlign = 'left'; ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = sel ? '#120a2a' : '#fff';
      ctx.fillText(`${i < 9 ? i + 1 : 'Q/E'} ${w.name}`, x + 26, y + 13);
      ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = sel ? '#2a1a40' : '#ccc';
      ctx.fillText(`${w.kind === 'defense' ? 'crate defense' : w.kind === 'beam' ? 'crate beam' : 'crate weapon'} · ×${n}`, x + 26, y + 24);
      x += cw + 4;
    });
    return 36;
  },
});
