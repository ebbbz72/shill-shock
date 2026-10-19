'use strict';
// Bot AI. On its turn a bot: (optionally) walks, "thinks" (searches angle/power/weapon by
// simulating trajectories with the real projectile physics, wind and terrain), then visibly
// rotates its aim, charges power and fires. A fallback always fires before the turn timer ends.

const BOT_LEVELS = {
  easy:   { defUse: 0.12, defSpecial: false, readDef: false, defNoise: 0.5, aimStep: 7, powStep: 0.06, aimErr: 9, powErr: 0.11, wind: 0, weapons: 'basic', targets: 'random', friendly: 0, self: 0.2, refine: false, reposition: 0, sigCost: 0, nearWater: 0, wander: 0.45 },
  medium: { defUse: 0.5, defSpecial: true, readDef: false, defNoise: 0.35, aimStep: 4, powStep: 0.035, aimErr: 3.5, powErr: 0.045, wind: 0.5, weapons: 'some', targets: 'nearest', friendly: 0.4, self: 0.7, refine: false, reposition: 0.2, sigCost: 4, nearWater: 0, wander: 0.3 },
  hard:   { robust: true, defUse: 1, defSpecial: true, readDef: true, defNoise: 0.2, aimStep: 3, powStep: 0.025, aimErr: 2.2, powErr: 0.03, wind: 0.85, weapons: 'all', targets: 'all', friendly: 1.5, self: 2.5, refine: true, reposition: 0.6, sigCost: 10, nearWater: 15, wander: 0 },
  pro:    { robust: true, defUse: 1, defSpecial: true, readDef: true, defNoise: 0, aimStep: 2, powStep: 0.02, aimErr: 0.25, powErr: 0.004, wind: 1, weapons: 'all', targets: 'all', friendly: 2.5, self: 4, refine: true, reposition: 1, sigCost: 6, nearWater: 40, wander: 0 },
};

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// Simulate a projectile with the same integrator as Game.updateProjectiles (fixed 60 Hz frames).
function simulateShot(game, w, s, wind, owner, hole) {
  const T0 = game.terrain, dt = 1 / 60, WW = game.WW;
  // optional "hole": treat a circle as already carved (fishlets start inside the main crater)
  const T = hole ? { isSolid: (x, y) => ((x - hole.x) ** 2 + (y - hole.y) ** 2 > hole.r * hole.r) && T0.isSolid(x, y) } : T0;
  let { x, y, vx, vy } = s, fuse = w.fuse || 0, t = 0, bounces = 0;
  const minis = w.miniR ? [] : null; // where crater-free mini-blasts (Rare Fly) will go off
  const maxT = w.kind === 'bounce' ? (w.fuse || 3) + 0.05 : 8;
  while (t < maxT) {
    t += dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) * dt / 2)), st = dt / n;
    for (let i = 0; i < n; i++) {
      vx += wind * WIND_ACC * w.wind * st;
      vy += GRAV * w.grav * st;
      if (w.homing && t > w.homeDelay) [vx, vy] = homingSteer(game, owner, x, y, vx, vy, st, w.homing); // Whale Missile
      const nx = x + vx * st, ny = y + vy * st;
      if (w.kind === 'impact') {
        if (T.isSolid(nx, ny) || game.hitUnit(nx, ny, { owner, age: t })) return { x: nx, y: ny, t };
        x = nx; y = ny;
      } else {
        if (T.isSolid(nx, ny)) {
          const [mx, my] = hole ? [0, -1] : game.normalAt(nx, ny);
          const speed = Math.hypot(vx, vy);
          if (speed > 90) { bounces++; if (minis && bounces <= 6 && speed > 140) minis.push({ x, y }); }
          const dot = vx * mx + vy * my;
          if (dot < 0) { vx -= 2 * dot * mx; vy -= 2 * dot * my; }
          vx *= w.bounce; vy *= w.bounce;
          if (Math.hypot(vx, vy) < 25) { vx *= 0.5; vy = Math.min(vy, 0); }
          let k = 0; while (T.isSolid(x, y) && k < 10) { x += mx; y += my; k++; }
        } else { x = nx; y = ny; }
      }
      if (y > WATER_Y + 2) return { x, y, water: true, t, minis };
      if (x < -400 || x > WW + 400) return { x, y, out: true, t, minis };
    }
    if (w.kind === 'bounce') { fuse -= dt; if (fuse <= 0) return { x, y, t, minis }; }
  }
  return { x, y, out: true, t, minis };
}

class BotTurn {
  constructor(game, level) {
    this.g = game; this.level = level; this.L = BOT_LEVELS[level] || BOT_LEVELS.medium;
    this.team = game.teams[game.turnTeam]; this.u = game.cur;
    this.state = 'pre'; this.timer = 0.9 + Math.random() * 0.4; // let the turn banner breathe
    this.walked = false; this.gen = null; this.best = null; this.plan = null; this.thinkT = 0;
    // big maps: rough full-power reach on flat ground (no wind); targets beyond it are not searched
    this.reach = MAX_SPEED * MAX_SPEED / GRAV;
    this.targets = this.pickTargets();
  }

  inRange(e, margin) { const u = this.u; return Math.abs(e.x - u.x) < this.reach * (margin || 0.92) + Math.max(0, e.y - u.y) * 0.9; }
  anyInRange(margin) { return this.enemies().some(e => this.inRange(e, margin)); }
  nearestEnemy() { const u = this.u; return this.enemies().sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0]; }

  isThinking() { return this.state === 'pre' || this.state === 'think' || this.state === 'walk'; }

  enemies() { return this.g.units.filter(x => !x.dead && x.team !== this.team); }

  pickTargets() {
    let en = this.enemies(); const u = this.u;
    if (!en.length) return [];
    const near = en.filter(e => this.inRange(e)); // prefilter by range (keeps the search time per turn small)
    if (near.length) en = near;
    if (this.L.targets === 'random') return Math.random() < 0.6 ? [en[Math.floor(Math.random() * en.length)]] : [en.sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0]];
    if (this.L.targets === 'nearest') {
      en.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
      return en.slice(0, 2);
    }
    return en;
  }

  weaponChoices() {
    const t = this.team, g = this.g;
    return t.weapons.map((wid, i) => ({ wid, i })).filter(({ wid }) => {
      if (!g.hasAmmo(t, wid) || WEAPONS[wid].kind === 'defense') return false;
      if (WEAPONS[wid].teleport) return false; // L2 Bridge: bots don't teleport (kept simple)
      if (WEAPONS[wid].crate) return true;     // crate weapons: every level uses what it picked up
      if (WEAPONS[wid].special) {
        if (this.L.weapons === 'basic') return false;
        if (this.L.weapons === 'some') return Math.random() < 0.35;
      }
      return true;
    });
  }

  // Expected value of a landing point for a weapon.
  score(res, wid) {
    const g = this.g, L = this.L, w = WEAPONS[wid], me = this.u;
    let s = 0;
    const tset = this.targets;
    let minD = 1e9;
    for (const t of tset) minD = Math.min(minD, Math.hypot(t.x - res.x, t.y - 14 - res.y));
    if (res.out || res.water) {
      let pen = -60 - Math.min(minD, 600) * 0.05;
      return pen;
    }
    const val = (u, dmg, extraKill) => {
      if (L.readDef && !extraKill) dmg = g.effectiveDamage(u, dmg);
      const eff = Math.min(dmg, u.hp), kill = dmg >= u.hp || extraKill;
      if (u.team !== this.team) {
        const focus = tset.includes(u) ? 1 : 0.35;
        let v = (eff + (kill ? 45 + (100 - u.hp) * 0.2 : 0)) * focus;
        if (!kill && L.nearWater) { const dry = WATER_Y - u.y; if (dry < 90 || u.x < 150 || u.x > g.WW - 150) v += L.nearWater * (dmg / 60); }
        return v;
      }
      const pen = u === me ? L.self : L.friendly;
      return -(eff + (kill ? 60 : 0)) * pen;
    };
    if (res.beam) { // Laser Eyes: everyone on the line takes the full damage
      for (const u of res.hits) s += val(u, w.damage, false);
      return s - (L.sigCost * 0.5) - (res.hits.some(u => u.team !== this.team) ? 0 : 20 + Math.min(minD, 800) * 0.04);
    }
    if (wid === 'rug') {
      // anything inside the pulled pit takes damage; if the pit reaches the water it drowns
      const bottom = res.y + w.colDepth, toWater = bottom >= WATER_Y - 12;
      for (const u of g.units) {
        if (u.dead) continue;
        if (Math.abs(u.x - res.x) < w.colW / 2 + 8 && u.y > res.y - 80 && u.y < bottom) {
          const saved = L.readDef && u.def && u.def.type === 'bubble';
          s += toWater && !saved ? val(u, 999, true) : val(u, w.colDmg, false);
        }
        else { const d = Math.hypot(u.x - res.x, u.y - 14 - res.y); if (d < 33) s += val(u, 15 * (1 - d / 33), false); }
      }
      s -= L.sigCost * 2.5;
    } else {
      const blastAt = (bx, by, bw, spare) => {
        const blast = bw.radius * 1.5;
        for (const u of g.units) {
          if (u.dead || (spare && u.team === spare)) continue;
          const d = Math.hypot(u.x - bx, u.y - 14 - by);
          if (d < blast) s += val(u, Math.round(bw.damage * (0.25 + 0.75 * (1 - d / blast))), false);
        }
      };
      if (w.burst) { const bw = WEAPONS[w.child], s0 = s; blastAt(res.x, res.y, bw); s = s0 + (s - s0) * w.burst * 0.85; } // ~85 % of the burst lands near the first bullet
      else blastAt(res.x, res.y, w);
      if (w.gasR) for (const u of g.units) if (!u.dead && Math.hypot(u.x - res.x, u.y - 14 - res.y) < w.gasR) s += val(u, w.gasDmg * 2, false);
      if (wid === 'fud') for (const u of g.units) if (!u.dead && u.team !== this.team && Math.hypot(u.x - res.x, u.y - 14 - res.y) < w.radius * 1.5) s += 12;
      if (res.minis) for (const m of res.minis) blastAt(m.x, m.y, { radius: w.miniR, damage: w.miniD }, this.team);
      if (w.splits && minD < 240) {
        // simulate the fishlet / bomblet fan exactly like Game.impact does
        const ns = w.splits, fw = WEAPONS[w.child || 'fishlet'];
        for (let i = 0; i < ns; i++) {
          const a = -Math.PI / 2 + (i - (ns - 1) / 2) * w.splitSpread, sp = w.splitSpeed * (1 - Math.abs(i - (ns - 1) / 2) * 0.08);
          const fr = simulateShot(g, fw, { x: res.x, y: res.y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }, g.wind * L.wind, null, { x: res.x, y: res.y, r: w.radius });
          if (!fr.out && !fr.water) blastAt(fr.x, fr.y, fw);
        }
      }
      if (w.special) s -= L.sigCost;
      if (w.crate) s += s > 15 ? 3 : -L.sigCost * 0.5; // crate weapons: use them on a good shot, don't waste them on nothing
    }
    return s - Math.min(minD, 800) * 0.04;
  }

  // landing point of a shot; crate weapons: Laser = hitscan line, Shill Spray = its first bullet
  simW(wid, sp, wind, aim, dir) {
    const g = this.g, w = WEAPONS[wid];
    if (w.kind === 'beam') { const r = g.traceBeam(this.u, aim, dir); return { x: r.x, y: r.y, beam: true, hits: r.hits }; }
    if (w.burst) return simulateShot(g, WEAPONS[w.child], { x: sp.x, y: sp.y, vx: sp.vx * 1.1, vy: sp.vy * 1.1 }, wind, this.u);
    return simulateShot(g, w, sp, wind, this.u);
  }

  *search() {
    const g = this.g, u = this.u, L = this.L;
    const wind = g.wind * L.wind;
    const choices = this.weaponChoices();
    if (!choices.length) choices.push({ wid: 'bazooka', i: 0 });
    const tx = this.targets.map(t => t.x - u.x);
    const dirs = tx.length && tx.every(d => d > 250) ? [1] : tx.length && tx.every(d => d < -250) ? [-1] : [-1, 1];
    let best = null, n = 0;
    const top = []; // best few candidates, re-checked for robustness below
    const tryShot = (c, dir, aim, pw) => {
      const sp = g.shotParams(u, aim, dir, pw);
      const res = this.simW(c.wid, sp, wind, aim, dir);
      const sc = this.score(res, c.wid);
      const cand = { score: sc, wid: c.wid, idx: c.i, dir, aim, power: pw, land: res };
      if (!best || sc > best.score) best = cand;
      if (L.robust && sc > 5) { top.push(cand); if (top.length > 40) { top.sort((a, b) => b.score - a.score); top.length = 12; } }
      this.best = best;
    };
    for (const c of choices) {
      for (const dir of dirs) {
        for (let aim = -30; aim <= 86; aim += L.aimStep) {
          for (let pw = 0.06; pw <= 1.0001; pw += L.powStep) {
            if (WEAPONS[c.wid].kind === 'beam' && pw > 0.07) break; // the laser ignores power
            tryShot(c, dir, aim, pw);
            if (++n % 250 === 0) yield n;
          }
        }
      }
    }
    // robustness: average each top candidate over our own aim/power error (bouncy shots are chaotic)
    if (L.robust && top.length) {
      top.sort((a, b) => b.score - a.score);
      const cands = top.slice(0, 12);
      let rb = null;
      for (const c of cands) {
        let sum = c.score;
        for (const [da, dp] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ae = WEAPONS[c.wid].kind === 'beam' ? L.aimErr * 0.3 : L.aimErr; // laser sight: aim is visible, little error
          const sp = g.shotParams(u, c.aim + da * ae, c.dir, clamp(c.power + dp * L.powErr, 0.02, 1));
          sum += this.score(this.simW(c.wid, sp, wind, c.aim + da * ae, c.dir), c.wid);
        }
        const avg = sum / 5;
        if (!rb || avg > rb.avg) rb = { ...c, avg };
        if (++n % 60 === 0) yield n;
      }
      if (rb) { best = { ...rb, score: rb.avg }; this.best = best; }
    }
    if (L.refine && best && !(L.robust && WEAPONS[best.wid].kind === 'bounce')) {
      const b0 = { ...best }, c = { wid: b0.wid, i: b0.idx };
      for (let aim = b0.aim - L.aimStep; aim <= b0.aim + L.aimStep; aim += 0.5)
        for (let pw = b0.power - L.powStep; pw <= b0.power + L.powStep; pw += 0.004) {
          if (pw < 0.02 || pw > 1 || aim < -88 || aim > 88) continue;
          tryShot(c, b0.dir, aim, pw);
          if (++n % 250 === 0) yield n;
        }
    }
    return best;
  }

  // Candidate defense moves with a rough value (comparable to attack scores).
  defenseOptions() {
    const g = this.g, u = this.u, t = this.team, L = this.L, out = [];
    const en = this.enemies(); if (!en.length || !u.onGround) return out;
    const dist = (x, y) => Math.min(...en.map(e => Math.hypot(e.x - x, e.y - y)));
    const md = dist(u.x, u.y);
    const near = en.filter(e => Math.hypot(e.x - u.x, e.y - u.y) < 520).length;
    const nearWater = (WATER_Y - u.y) < 85 || u.x < 170 || u.x > g.WW - 170;
    const lowHp = u.hp <= 45;
    const enemyTeams = g.teams.filter(x => x !== t && x.alive()).length;
    const threat = enemyTeams * (14 + Math.min(near, 4) * 6) * (lowHp ? 1.4 : 1) + (nearWater ? 18 : 0);
    t.weapons.forEach((wid, idx) => {
      const w = WEAPONS[wid];
      if (w.kind !== 'defense' || !g.hasAmmo(t, wid)) return;
      if (w.special && !L.defSpecial) return;
      let v = 0, facing = u.facing;
      if (wid === 'brace') v = threat * 0.3;
      else if (wid === 'hodl') v = threat * 0.2 + (lowHp ? 45 : 0);
      else if (wid === 'diamond') v = threat * 0.6 + (lowHp ? 40 : 0); // crate shield
      else if (wid === 'bubble') v = Math.min(threat, 45) * 0.75 + (nearWater ? 35 : 0);
      else if (wid === 'icewall') {
        const l = en.filter(e => e.x < u.x && Math.abs(e.x - u.x) < 700).length, r = en.filter(e => e.x >= u.x && Math.abs(e.x - u.x) < 700).length;
        facing = r >= l ? 1 : -1;
        v = threat * 0.6 * (Math.max(l, r) / Math.max(1, l + r));
      } else if (wid === 'hop') {
        const sp = g.findSafeSpot(u, u.x, w.range, true);
        if (!sp) return;
        const gain = Math.min(dist(sp.x, sp.y), 360) - Math.min(md, 360);
        v = threat * 0.2 + clamp(gain / 7, -25, 45) + (nearWater && WATER_Y - sp.y > 85 ? 20 : 0);
      }
      if (w.special || w.crate) v -= L.sigCost * 0.8;
      if (L.defNoise) v *= 1 + (Math.random() * 2 - 1) * L.defNoise;
      out.push({ wid, idx, v, facing });
    });
    return out.sort((a, b) => b.v - a.v);
  }

  safeToStep(dir, maxDrop) {
    const T = this.g.terrain, u = this.u;
    const ahead = Math.round(u.x + dir * 14);
    if (ahead < 40 || ahead > this.g.WW - 40) return false;
    const sy = T.surfaceY(ahead);
    if (sy < 0 || sy > WATER_Y - 15) return false;
    if (sy < u.y - 40) return true; // a wall / overhang ahead: walkStep decides (or we hop over it)
    return sy - u.y < (maxDrop || 60); // no big drops
  }

  // Predict a unit's ballistic hop/fall with the same integrator as Game.updateUnit -> landing spot or null (water/stuck).
  simBallistic(x, y, vx, vy) {
    const T = this.g.terrain;
    for (let f = 0; f < 240; f++) {
      vy = Math.min(950, vy + GRAV / 60);
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / 60 / 1.5)), s = 1 / 60 / n;
      for (let i = 0; i < n; i++) {
        let nx = x + vx * s, ny = y + vy * s;
        if (T.isSolid(nx, ny - 12) || T.isSolid(nx, ny - 20)) { vx = -vx * 0.3; nx = x; }
        if (vy < 0 && T.isSolid(nx, ny - 28)) { vy = 0; ny = y; }
        if (vy >= 0 && T.isSolid(nx, ny)) { let yy = Math.round(ny), k = 0; while (T.isSolid(nx, yy) && k < 30) { yy--; k++; } return { x: Math.round(nx), y: yy, v: vy }; }
        x = nx; y = ny;
        if (y > WATER_Y + 4 || x < 30 || x > this.g.WW - 30) return null;
      }
    }
    return null;
  }
  safeLanding(L, dir, minGain) { return L && L.y < WATER_Y - 25 && L.v <= 470 && (L.x - this.u.x) * dir >= (minGain || 20); }
  // best charged jump toward dir: try forward jumps and backflips (done facing away) over a range of hold
  // strengths, simulate each with the real integrator, keep the dry landings without fall damage, and pick the one that
  // gets furthest (a slight preference for gentler jumps). One jump per turn.
  planHop(dir, minGain) {
    const u = this.u; if (!(this.g.jumpsLeft > 0)) return null;
    let best = null;
    for (const back of [false, true]) for (const p of [0.12, 0.3, 0.5, 0.7, 0.85, 1]) {
      const v = jumpVel(back, p), L = this.simBallistic(u.x, u.y - 1, (back ? -v.vx : v.vx) * dir, v.vy);
      if (!this.safeLanding(L, dir, minGain)) continue;
      const score = (L.x - u.x) * dir - p * 25 - (back ? 15 : 0);
      if (!best || score > best.score) best = { back, p, L, score };
    }
    return best;
  }
  // start charging (a visible hold), released at the planned strength in update('jcharge')
  doHop(h, dir) {
    const u = this.u; u.facing = h.back ? -dir : dir;
    if (!this.g.beginJump(u, h.back)) return false;
    this.hop = h; this.resume = this.state; this.state = 'jcharge'; this.jumps = (this.jumps || 0) + 1;
    return true;
  }
  // one pixel of advancing: walk unless that would drop us somewhere bad (water, a big fall)
  advanceStep(dir) {
    const g = this.g, T = g.terrain, u = this.u, nx = Math.round(u.x) + dir, y = Math.round(u.y);
    if (nx < 40 || nx > g.WW - 40) return false;
    if (!T.isSolid(nx, y)) {
      let ground = false; for (let k = 0; k <= 7; k++) if (T.isSolid(nx, y + 1 + k)) { ground = true; break; }
      if (!ground && !this.safeLanding(this.simBallistic(nx, y, dir * 45, 0), dir, 0)) return false;
    }
    return g.walkStep(u, dir);
  }

  // a landed crate worth walking to: within the walk budget, about the same height, not past water (by level)
  crateTarget() {
    const g = this.g, u = this.u, chance = { easy: 0.35, medium: 0.7, hard: 1, pro: 1 }[this.level] || 0.6;
    if (!g.crates || !g.crates.length || g.timer < 14 || Math.random() > chance) return null;
    const budget = Math.min(g.walkLeft == null ? 450 : g.walkLeft, 430);
    let best = null;
    for (const c of g.crates) {
      if (!c.landed || c.dead) continue;
      const dx = Math.abs(c.x - u.x); if (dx > budget || dx < 4 || Math.abs(c.y - u.y) > 70) continue;
      let ok = true; const dir = Math.sign(c.x - u.x); // no water / deep pits on the way
      for (let x = u.x; Math.abs(x - u.x) < dx; x += dir * 12) { const y = g.terrain.surfaceY(Math.round(x)); if (y < 0 || y > WATER_Y - 30 || y > u.y + 90) { ok = false; break; } }
      if (ok && (!best || dx < Math.abs(best.x - u.x))) best = c;
    }
    return best;
  }

  startWalk(dir, secs) { this.walkDir = dir; this.timer = secs; this.state = 'walk'; this.walked = true; }

  update(dt) {
    const g = this.g, u = this.u;
    this.thinkT += dt;
    if (u.dead) return;
    // never stall: fire whatever we have with a few seconds left on the clock
    if (g.timer < 3 && this.state !== 'done') { this.emergencyFire(); return; }
    switch (this.state) {
      case 'pre':
        this.timer -= dt;
        if (this.timer <= 0 && u.onGround) {
          // big map: nobody in reach -> advance toward the nearest enemy (walk + hop) instead of wasting a shot
          const cr = this.crateTarget();
          if (cr) { this.advance = true; this.toCrate = cr; this.startWalk(cr.x < u.x ? -1 : 1, Math.min(g.timer - 9, Math.abs(cr.x - u.x) / WALK_SPEED + 1.5)); break; }
          const ne = this.nearestEnemy();
          if (ne && !this.anyInRange()) { this.advance = true; this.startWalk(ne.x < u.x ? -1 : 1, Math.max(2, Math.min(g.timer - 9, 18))); break; }
          if (this.L.wander && Math.random() < this.L.wander) {
            const dir = Math.random() < 0.5 ? -1 : 1;
            this.startWalk(dir, 0.3 + Math.random() * 0.6);
          } else this.beginThink();
        }
        break;
      case 'jcharge': { // holding the jump key until the planned strength
        const c = g.jumpCharge;
        if (!c) { this.state = this.resume || 'walk'; break; }
        if (c.p >= this.hop.p - 0.02) { g.releaseJump(this.hop.back, this.hop.p); this.state = this.resume || 'walk'; }
        break;
      }
      case 'walk':
        this.timer -= dt;
        if (g.walkLeft != null && g.walkLeft < 1) this.timer = Math.min(this.timer, 0); // walk budget used up: stop and think
        if (this.toCrate && (this.toCrate.dead || !(g.crates || []).includes(this.toCrate) || Math.sign(this.toCrate.x - u.x) !== this.walkDir)) { this.toCrate = null; this.timer = Math.min(this.timer, 0); } // picked up (or passed): think
        if (this.advance && !this.toCrate && this.anyInRange(0.78)) this.timer = Math.min(this.timer, 0); // close enough: stop and shoot
        if (u.onGround && this.timer > 0) {
          u.facing = this.walkDir;
          const maxJ = JUMPS_PER_TURN;
          if (this.advance) {
            u.walkAcc = (u.walkAcc || 0) + WALK_SPEED * dt; u.walkAnim += dt * 12;
            while (u.walkAcc >= 1) {
              u.walkAcc--;
              if (g.walkLeft != null && g.walkLeft < 1) { this.timer = 0; u.walkAcc = 0; break; } // out of steps (not a wall: no hop)
              if (!this.advanceStep(this.walkDir)) { // wall, gap or water ahead: hop if a safe landing is predicted, else stop here
                const h = (this.jumps || 0) < maxJ ? this.planHop(this.walkDir) : null;
                if (!(h && this.doHop(h, this.walkDir))) this.timer = 0;
                u.walkAcc = 0; break;
              }
              if (!u.onGround) break;
            }
          } else if (this.safeToStep(this.walkDir, 60)) {
            u.walkAcc = (u.walkAcc || 0) + WALK_SPEED * dt; u.walkAnim += dt * 12;
            while (u.walkAcc >= 1) {
              u.walkAcc--;
              if (g.walkLeft != null && g.walkLeft < 1) { this.timer = 0; break; } // out of steps
              if (!g.walkStep(u, this.walkDir)) { // blocked by a step/wall: hop over it if the landing is safe, else stop
                const h = (this.jumps || 0) < maxJ ? this.planHop(this.walkDir, 30) : null;
                if (h && h.L.y > u.y - 90 && h.L.y < u.y + 60 && this.doHop(h, this.walkDir)) this.timer = Math.max(this.timer, 0.5 + this.hop.p * JUMP_CHARGE);
                else this.timer = 0;
                break;
              }
            }
          } else this.timer = 0;
        }
        if (this.state === 'walk' && this.timer <= 0 && u.onGround) this.beginThink();
        break;
      case 'think': {
        const t0 = performance.now();
        let r;
        do { r = this.gen.next(); } while (!r.done && performance.now() - t0 < 8);
        if (r.done) {
          const best = r.value || this.best;
          // reposition if there is no decent shot from here
          const stale = (g.quietTurns || 0) >= 6 * g.teams.filter(t => t.alive()).length; // nobody hurt for 6 turns per team (counted in unit turns)
          if (!this.walked && best && best.score < 12 && (Math.random() < this.L.reposition || (stale && this.L.reposition > 0))) {
            const en = this.enemies().sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0];
            const dir = en && en.x < u.x ? -1 : 1;
            if (this.safeToStep(dir)) { this.startWalk(dir, 1.0 + Math.random() * 0.8); break; }
          }
          this.commit(best);
        }
        break;
      }
      case 'aim': {
        const p = this.plan;
        u.facing = p.dir;
        const d = p.aim - u.aim, sp = Math.max(55, Math.abs(this.aimFrom - p.aim) / 0.9);
        if (Math.abs(d) <= sp * dt) { u.aim = p.aim; this.state = 'charge'; g.charging = true; g.power = 0; }
        else u.aim += Math.sign(d) * sp * dt;
        break;
      }
      case 'defend':
        this.timer -= dt;
        if (this.defense.wid === 'icewall') u.facing = this.defense.facing;
        if (this.timer <= 0) {
          this.state = 'done';
          if (!g.useDefense()) { this.team.weaponIdx = this.fallback.idx || 0; this.plan = { dir: this.fallback.dir || u.facing, aim: this.fallback.aim || 45, power: this.fallback.power || 0.5 }; this.state = 'x'; this.emergencyFire(); }
        }
        break;
      case 'charge':
        g.charging = true;
        g.power = Math.min(1, g.power + dt / CHARGE_TIME);
        if (g.power >= this.plan.power - 1e-6) { g.power = this.plan.power; this.state = 'done'; g.fire(); }
        break;
    }
  }

  beginThink() {
    this.state = 'think'; this.targets = this.pickTargets();
    const stale = (this.g.quietTurns || 0) >= 4 * this.g.teams.filter(t => t.alive()).length; // stuck far apart: shoot anyway
    if (!stale && !this.anyInRange(1.02)) { this.outOfRange = true; this.gen = (function* () { return null; })(); return; } // nothing reachable: skip the search
    this.gen = this.search();
  }

  commit(best) {
    const g = this.g, L = this.L;
    if (!best) best = { idx: 0, dir: this.u.facing, aim: 45, power: 0.5, score: 0 };
    if (this.outOfRange) { // still out of reach after advancing: defend (brace) rather than waste a shot
      const t = this.team, opts = this.defenseOptions(), bi = t.weapons.indexOf('brace');
      const d = opts.find(o => o.wid !== 'hop') || (bi >= 0 ? { wid: 'brace', idx: bi, v: 1, facing: this.u.facing } : null);
      if (d && this.u.onGround) { t.weaponIdx = d.idx; this.defense = d; this.state = 'defend'; this.timer = 0.5; this.fallback = best; return; }
    }
    // attack or defend? (each turn is one action)
    const stale = (g.quietTurns || 0) >= 6 * g.teams.filter(t => t.alive()).length; // stalemate breaker
    if (!stale && Math.random() < L.defUse) {
      const d = this.defenseOptions()[0];
      if (d && d.v > 0 && d.v > best.score + 8) {
        this.team.weaponIdx = d.idx;
        this.defense = d; this.state = 'defend'; this.timer = 0.7;
        this.fallback = best;
        SFX.select();
        return;
      }
    }
    this.team.weaponIdx = best.idx;
    if (!g.hasAmmo(this.team, this.team.weapons[best.idx])) this.team.weaponIdx = 0;
    this.plan = {
      dir: best.dir,
      aim: clamp(best.aim + gauss() * L.aimErr, -88, 88),
      power: clamp(best.power + gauss() * L.powErr, 0.04, 1),
    };
    this.aimFrom = this.u.aim;
    this.state = 'aim';
    SFX.select();
  }

  emergencyFire() {
    const g = this.g;
    if (this.state === 'defend') { this.state = 'done'; if (g.useDefense()) return; this.team.weaponIdx = 0; }
    if ((WEAPONS[this.team.weapons[this.team.weaponIdx]] || {}).kind === 'defense' && !this.plan) this.team.weaponIdx = 0;
    const b = this.plan || this.best || { dir: this.u.facing, aim: 45, power: 0.55, idx: 0 };
    if (!this.plan && b.idx != null) this.team.weaponIdx = g.hasAmmo(this.team, this.team.weapons[b.idx]) ? b.idx : 0;
    this.u.facing = b.dir; this.u.aim = b.aim;
    g.charging = true; g.power = b.power; this.state = 'done';
    g.fire();
  }
}
