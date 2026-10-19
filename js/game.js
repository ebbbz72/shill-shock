'use strict';
const JUMPS_PER_TURN = 1, JUMP_CHARGE = 0.9; // ONE charged jump per turn; hold ENTER (forward) / BACKSPACE (backflip) up to JUMP_CHARGE s
// jump strength p = hold time / JUMP_CHARGE (0..1): a quick tap is a small hop, a full hold one big jump
function jumpVel(back, p) { p = clamp(p, 0, 1); return back ? { vx: -(55 + 35 * p), vy: -(290 + 170 * p) } : { vx: 110 + 140 * p, vy: -(190 + 240 * p) }; }
// big maps (~2.8x the original width): full power reaches ~1,550 px on flat ground (about 40% of the map)
const GRAV = 620, WIND_ACC = 150, TURN_TIME = 45, MIN_SPEED = 120, MAX_SPEED = 975, CHARGE_TIME = 1.6;
const WALK_SPEED = 90; // px/s (was 62)
const WALK_BUDGET = 450; // px of walking per turn (= 5 s at WALK_SPEED; any number of separate walks; jumps don't use it)
const JUMP_FALL_MUL = 0.5; // fall damage after your own charged jump / backflip (knockback, walking off ledges: full)
const ZOOM_MAX = 1.8, MAP_W_MIN = 3600, MAP_W_MAX = 3900; // map width: 3,600-3,900 px (was 5,120-5,600; originally 1,280-1,400)
const FONT = "'Trebuchet MS','Segoe UI',Arial,sans-serif";
const DOGE_FONT = "'Comic Sans MS','Comic Neue','Chalkboard SE',cursive";

const MAX_TEAM_SIZE = 6;
const HELP_KEY = 'shillshock.help.hide';
// teams are told apart by colour (units on both teams may be the same character)
const TEAM_STYLE = [{ name: 'Team 1', color: '#ff7a3d', dark: '#8a2f0c' }, { name: 'Team 2', color: '#2fd0e0', dark: '#0b5a66' },
  { name: 'Team 3', color: '#c58bff', dark: '#4b2380' }, { name: 'Team 4', color: '#ffe14a', dark: '#7a6200' }];
const TEAM_DEFS = [
  { id: 'DOGE', name: 'DOGE', color: '#ffa62b', units: ['Such Wow', 'Much Bork', 'Very Floof', 'Shibe Lord', 'Doge Jr', 'Wow Wow'], sig: 'moon', sigDef: 'hodl' },
  { id: 'FROG', name: 'FROG', color: '#43c048', units: ['Rare Kek', 'Smug Ribbit', 'Feels Fren', 'Hopium', 'Lily Pad', 'Tadpole'], sig: 'fly', sigDef: 'hop' },
  { id: 'PENGU', name: 'PENGU', color: '#6ec6ff', units: ['Chonk', 'Pudgy Pete', 'Waddles', 'Flipper', 'Iceberg', 'Snowball'], sig: 'fish', sigDef: 'icewall' },
  { id: 'PILL', name: 'PILL', color: '#ff5fa2', units: ['Pumpy', 'Degen Dose', 'Bonding Curve', 'Ape Pill', 'Lil Mint', 'Gas Fee'], sig: 'rug', sigDef: 'bubble' },
];
const QUIPS_KILL = ['rugged!', 'ngmi', 'rekt', 'paper hands', 'sold the bottom', '-99.9%', 'exit liquidity', 'gn forever', 'down bad'];
const QUIPS_DROWN = ['liquidated!', 'ngmi', 'glub glub', 'rugged!', 'went to zero', 'sunk cost'];
const QUIPS_HIT = ['to the moon!', 'wagmi', 'much wow', 'LFG', 'few understand', 'pump it', 'gm', 'HODL', 'number go up'];
const CPU_LEVEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', pro: 'Pro' };
const CONTROLLERS = { human: 'Human', easy: 'Bot Easy', medium: 'Bot Medium', hard: 'Bot Hard', pro: 'Bot Pro' };
const DOGE_WORDS = ['wow', 'such boom', 'very crater', 'much damage', 'so explode', 'amaze'];

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

class Unit {
  constructor(team, name, idx) {
    this.team = team; this.name = name; this.idx = idx;
    this.hp = 100; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.onGround = false; this.facing = 1; this.aim = 35;
    this.dead = false; this.drowned = false; this.phase = Math.random() * 3; this.walkAnim = 0;
  }
}

class Game {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.keys = {}; this.state = 'menu'; this.t = 0;
    this.worldId = 'classic'; this.world = WORLDS.classic; this.bgCache = {}; this.ambient = [];
    this.bg = this.worldBg('classic');
    this.clouds = Array.from({ length: 7 }, () => ({ x: rand(0, W), y: rand(60, 260), s: rand(0.6, 1.4) }));
    this.terrain = new Terrain((Math.random() * 1e9) | 0);
    this.particles = []; this.texts = []; this.projectiles = []; this.teams = []; this.units = [];
    this.wind = 0.3; this.shake = 0; this.showHelp = false; this.explosionCount = 0; this.turnCount = 0;
    this.onGameOver = null; this.banner = null; this.bigQuip = null;
    this.WW = MAP_W; this.camX = 0; this.camY = 0; this.zoom = 1; this.zoomT = 1; this.camHold = false; this.paused = false; this.userPaused = false;
    this.bot = null; this.stats = { maxTurnTime: 0 }; this.turnStartT = 0;
    this.bindInput();
  }

  // ---------- setup ----------
  // opts: { numTeams, teamSize, teamSizes: [a, b], controllers: ['human'|'easy'|'medium'|'hard'|'pro', ...], seed }
  // The menus and online lobbies always make 2 teams with 2-6 units each (sizes may differ, e.g. 6 vs 3);
  // the engine still accepts up to 4 teams for the bot sims / old tests.
  start(opts, seed) {
    if (typeof opts !== 'object' || opts === null) opts = { numTeams: opts, seed };
    const numTeams = clamp(opts.numTeams | 0 || 2, 2, 4);
    const teamSize = clamp(opts.teamSize | 0 || 2, 1, MAX_TEAM_SIZE);
    const ctrls = opts.controllers || [];
    // per-unit characters: opts.chars = [[charId per unit], ...] (mixed teams); legacy opts.teamIds = one mascot per team
    const legacy = (opts.teamIds || []).length >= 2 ? opts.teamIds.filter(id => TEAM_DEFS.some(d => d.id === id)).slice(0, 4) : TEAM_DEFS.slice(0, numTeams).map(d => d.id);
    const nT = Array.isArray(opts.chars) && opts.chars.length >= 2 ? Math.min(4, opts.chars.length) : legacy.length;
    const sizes = Array.from({ length: nT }, (_, i) => Array.isArray(opts.chars) && opts.chars[i] ? clamp(opts.chars[i].length, 1, MAX_TEAM_SIZE) : clamp((opts.teamSizes && opts.teamSizes[i]) | 0 || teamSize, 1, MAX_TEAM_SIZE));
    const charsOf = ti => Array.from({ length: sizes[ti] }, (_, i) => { const c = Array.isArray(opts.chars) && opts.chars[ti] && opts.chars[ti][i]; return TEAM_DEFS.some(d => d.id === c) ? c : legacy[ti % legacy.length]; });
    this.numTeams = numTeams; this.teamSize = Math.max(...sizes); this.teamSizes = sizes;
    const total = sizes.reduce((a, b) => a + b, 0);
    // big world (~4x the old size; camera scrolls + zooms); a little wider with lots of units
    this.WW = opts.mapWidth > 0 ? Math.round(clamp(opts.mapWidth, MAP_W, 8000)) : Math.round(clamp(3080 + total * 70, MAP_W_MIN, MAP_W_MAX));
    this.setWorld(opts.world);
    this.terrain = new Terrain(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0, this.WW, this.worldId);
    this.particles = []; this.ambient = []; this.texts = []; this.projectiles = []; this.crates = []; this.beams = []; this.crateSeq = 0;
    this.cratesOn = opts.crates !== false; // supply crates (2 per round); opts.crates=false turns them off (tests)
    this.numTeams = nT;
    this.turnTime = opts.turnTime > 0 ? opts.turnTime : TURN_TIME;
    const nameCount = {};
    this.teams = Array.from({ length: nT }, (_, ti) => {
      const controller = CONTROLLERS[ctrls[ti]] ? ctrls[ti] : 'human';
      const pl = controller === 'human' && opts.players && opts.players[ti] ? String(opts.players[ti]).slice(0, 12) : null;
      // team identity = a team colour (not a mascot); every unit brings its own character + specials
      const st = TEAM_STYLE[ti];
      const team = { id: 'T' + (ti + 1), name: st.name, color: st.color, dark: st.dark, index: ti, controller, player: pl, unitIdx: -1, weaponIdx: 0 };
      team.units = charsOf(ti).map((c, i) => {
        const d = TEAM_DEFS.find(x => x.id === c), k = nameCount[c] = (nameCount[c] || 0) + 1, n = d.units.length;
        const u = new Unit(team, k <= n ? d.units[k - 1] : `${d.units[(k - 1) % n]} ${Math.ceil(k / n)}`, i);
        u.char = c; u.def0 = d;
        u.weapons = ['bazooka', 'grenade', d.sig, 'brace', d.sigDef]; // shared kit + this unit's own specials
        u.ammo = { [d.sig]: WEAPONS[d.sig].ammo, [d.sigDef]: WEAPONS[d.sigDef].ammo }; // special uses are per unit
        return u;
      });
      team.weapons = team.units[0].weapons; team.ammo = team.units[0].ammo; // = the active unit's kit (set every turn)
      team.chars = team.units.map(u => u.char);
      // online play: optional per-unit controller ({ ctrl, player, pid }); each human controls their own unit
      const uc = opts.units && opts.units[ti];
      if (uc) team.units.forEach((u, i) => {
        const c = uc[i]; if (!c) return;
        u.ctrl = CONTROLLERS[c.ctrl] ? c.ctrl : 'medium'; u.pid = c.pid || null;
        if (u.ctrl === 'human' && c.player) { u.player = String(c.player).slice(0, 12); u.name = u.player; }
      });
      team.alive = () => team.units.some(u => !u.dead);
      return team;
    });
    this.units = this.teams.flatMap(t => t.units);
    this.spawnUnits();
    this.turnTeam = -1; this.cur = null; this.state = 'play'; this.phase = 'aim'; this.played = null; this.round = 0;
    this.showHelp = this.teams.some(t => t.controller === 'human') && !opts.noHelp && !Game.helpHidden(); // 'Don't show again' remembered
    this.explosionCount = 0; this.turnCount = 0; this.bigQuip = null; this.banner = null;
    this.stats = { maxTurnTime: 0, shots: 0 }; this.userPaused = false; this.winner = undefined;
    this.zoom = this.zoomT = 1; this.camHold = false;
    this.nextTurn();
    this.camX = this.camTarget(); this.camY = this.camYTarget();
  }

  // world: 'classic' | 'moon' | 'swamp' | 'arctic' | 'pump' | 'random' (random picks one of the 4 themed worlds)
  setWorld(id) {
    this.worldId = resolveWorld(id); this.world = WORLDS[this.worldId];
    this.bg = this.worldBg(this.worldId);
    const cy = this.world.cloudY || [60, 260]; this.clouds.forEach(c => { c.y = rand(cy[0], cy[1]); });
  }
  // touch devices: change the view width (screen aspect) at runtime, e.g. on rotation or a Safari toolbar resize
  setViewWidth(nw) {
    nw = Math.round(nw); if (!(nw >= MAP_W) || nw === W) return false;
    W = nw; this.cv.width = W; // the 3D canvas is sized by its renderer (resize below)
    this.bgCache = {}; this.bg = this.worldBg(this.worldId || 'classic');
    this.camX = this.clampCam(this.camX);
    if (this.r3d && this.r3d.camera) { this.r3d.camera.aspect = W / H; this.r3d.camera.updateProjectionMatrix(); this.r3d.resize(); }
    return true;
  }
  worldBg(id) { return this.bgCache[id] || (this.bgCache[id] = makeBackground(7 + id.length * 31, id)); }

  ctrlOf(u) { return u.ctrl ? (u.ctrl === 'human' && u.away ? 'medium' : u.ctrl) : u.team.controller; }
  isBotTurn() { const t = this.teams[this.turnTeam]; return !!t && t.controller !== 'human'; }

  // Spawns: every unit of every team at a random spot anywhere on the (big) map, teams mixed together.
  // Spots are dry, on the top surface (never inside a cave or under an overhang) with head room, never
  // overlapping, with a minimum spacing between any two units and a larger one between enemies (nobody
  // starts point-blank). New spots every game.
  spawnUnits() {
    const T = this.terrain, WW = this.WW, x0 = 150, span = WW - 300;
    const okSpot = (x) => {
      const y = T.surfaceY(x);
      if (y < 60 || y > WATER_Y - 40) return null;
      if (!T.isSolid(x - 3, y + 2) || !T.isSolid(x + 3, y + 2)) return null; // solid footing under both feet
      for (let h = 2; h <= 40; h += 4) if (T.isSolid(x, y - h)) return null;
      if (T.isSolid(x - 8, y - 12) && T.isSolid(x + 8, y - 12)) return null; // wedged in a slot
      return { x, y };
    };
    const placed = []; // { x, y, team }
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const free = (c, team, minAlly, minEnemy) => placed.every(p => dist(p, c) >= (p.team === team ? minAlly : minEnemy));
    const order = this.units.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const n = order.length, base = Math.min(320, span / (n * 1.5)); // ~200-300 px apart on a 5k map
    this.spawnMin = { ally: 0, enemy: 0 };
    order.forEach((u, k) => {
      let spot = null;
      for (const f of [1, 0.7, 0.45, 0.25]) {
        const minA = Math.max(30, base * f), minE = Math.max(60, base * f * 1.6);
        for (let tries = 0; tries < 160 && !spot; tries++) {
          const c = okSpot(Math.round(x0 + Math.random() * span));
          if (c && free(c, u.team, minA, minE)) spot = c;
        }
        if (spot) break;
      }
      if (!spot) for (let x = x0; x < WW - 150 && !spot; x += 7) { const c = okSpot(x); if (c && free(c, u.team, 28, 50)) spot = c; } // scan for any free dry spot
      if (!spot) { const x = Math.round(x0 + span * (k + 0.5) / n); spot = { x, y: Math.min(T.surfaceY(x) > 0 ? T.surfaceY(x) : WATER_Y - 40, WATER_Y - 40) }; }
      placed.push({ x: spot.x, y: spot.y, team: u.team });
      u.x = spot.x; u.y = spot.y - 1; u.onGround = true;
    });
    // face the nearest enemy
    for (const u of this.units) { let best = null; for (const o of this.units) if (o.team !== u.team && (!best || Math.abs(o.x - u.x) < Math.abs(best.x - u.x))) best = o; u.facing = best && best.x < u.x ? -1 : 1; }
  }

  // Turn order = ROUNDS. In each round every living unit gets exactly one turn. Turns alternate between the teams
  // one unit at a time (each team in its slot order); when a team has nobody left who hasn't played this round, the
  // other team plays its remaining units back to back. Then a new round starts with the team that did NOT take the
  // last turn. Units that die before their turn in the round lose it. (1 v 4: T1a, T2a, T2b, T2c, T2d, then T1a ...)
  pendingIn(team, played) { return team.units.filter(x => !x.dead && !played.has(x)); }
  // pick the next unit after team index `from`: the next team (cyclic) that still has an unplayed unit
  pickNext(from, played) {
    const n = this.teams.length;
    for (let k = 1; k <= n; k++) { const i = (from + k + n) % n, t = this.teams[i]; if (!t.alive()) continue; const c = this.pendingIn(t, played); if (c.length) return { i, u: c[0] }; }
    return null;
  }
  // who is still to play this round, in order (for the HUD queue); cheap: <= 12 units
  roundQueue() {
    if (!this.played || !this.cur) return [];
    const played = new Set(this.played), out = []; let from = this.turnTeam;
    for (let k = 0; k < 24; k++) { const nx = this.pickNext(from, played); if (!nx) break; out.push(nx.u); played.add(nx.u); from = nx.i; }
    return out;
  }
  nextTurn() {
    const alive = this.teams.filter(t => t.alive());
    if (alive.length <= 1) { this.gameOver(alive[0] || null); return; }
    this.newRound = false;
    if (!this.played) { this.played = new Set(); this.round = 1; this.newRound = true; }
    const prevTeam = this.turnTeam;
    let nx = this.pickNext(prevTeam, this.played);
    if (!nx) { this.round++; this.played = new Set(); this.newRound = true; nx = this.pickNext(prevTeam, this.played); } // new round: the other team starts
    const i = nx.i; this.turnTeam = i;
    const team = this.teams[i];
    // defenses last "until your team's next turn" (the next one after an enemy turn): expire them now
    if (i !== prevTeam) for (const x of team.units) if (x.def) this.clearDefense(x, true);
    this.cur = nx.u; this.played.add(nx.u);
    team.unitIdx = team.units.indexOf(nx.u);
    this.roundTurn = [...this.played].filter(x => x.team === team).length; // this team's turn k of n in the round
    this.roundOf = this.roundTurn + this.pendingIn(team, this.played).length;
    if (this.pruneItems) this.pruneItems(this.cur); // used-up crate items leave the inventory
    team.weapons = this.cur.weapons; team.ammo = this.cur.ammo;
    // make sure the current weapon exists for this unit and still has ammo
    if (team.weaponIdx >= team.weapons.length || !this.hasAmmo(team, team.weapons[team.weaponIdx])) team.weaponIdx = 0;
    // stalemate tracking: consecutive turns in which nobody took any damage (bots stop turtling)
    this.quietTurns = this.turnCount === 0 ? 0 : (this.turnDamage ? 0 : (this.quietTurns || 0) + 1); this.turnDamage = 0;
    const wm = this.world.windMul || 1; // Arctic: gustier (same for every team)
    this.wind = Math.round(rand(-wm, wm) * 10) / 10;
    // online: the team's controller/player follow the unit whose turn it is (disconnected humans -> bot)
    if (this.cur.ctrl) { team.controller = this.ctrlOf(this.cur); team.player = team.controller === 'human' ? this.cur.player : null; }
    this.jumpsLeft = JUMPS_PER_TURN; this.jumpCharge = null; this.walkLeft = WALK_BUDGET; this.outOfSteps = false;
    this.timer = this.turnTime || TURN_TIME; this.phase = 'aim'; this.power = 0; this.charging = false;
    this.settleT = 0; this.settleMax = 0; this.lastTick = 99;
    this.turnCount++;
    if (this.turnStartT) this.stats.maxTurnTime = Math.max(this.stats.maxTurnTime, this.t - this.turnStartT);
    this.turnStartT = this.t;
    this.camHold = false;
    this.bot = !this.mirror && team.controller !== 'human' && typeof BotTurn !== 'undefined' ? new BotTurn(this, team.controller) : null;
    this.banner = { text: `Round ${this.round} — ` + (team.player ? `${team.player}'s turn (${team.name})` : `${team.name}: ${this.cur.name}`), sub: (team.player ? this.cur.name + ' · ' : '') + this.cur.char + (team.controller !== 'human' ? `  ·  CPU ${CPU_LEVEL[team.controller]}` : '') + `  ·  ${team.name} turn ${this.roundTurn} of ${this.roundOf} this round`, color: team.color, t: this.turnCount === 1 ? 3.2 : 2.2, world: this.world.name, wcol: this.world.color, first: this.turnCount === 1 };
    if (this.newRound && this.cratesOn && !this.mirror && this.spawnCrates) this.spawnCrates(CRATES_PER_ROUND); // supply drop every round
    if (this.cur.poison && this.gasTick) this.gasTick(this.cur);
  }

  gameOver(winner) {
    this.state = 'over'; this.phase = 'over'; this.winner = winner;
    SFX.win();
    if (this.onGameOver) setTimeout(() => this.onGameOver(winner), 900);
  }

  closeHelp(never) {
    this.showHelp = false;
    if (never != null) { try { if (never) localStorage.setItem(HELP_KEY, '1'); else localStorage.removeItem(HELP_KEY); } catch (e) { /* ignore */ } }
  }
  static helpHidden() { try { return localStorage.getItem(HELP_KEY) === '1'; } catch (e) { return false; } }

  hasAmmo(team, wid) { return !(wid in team.ammo) || team.ammo[wid] > 0; }

  // ---------- input ----------
  bindInput() {
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return; // typing a name
      let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'Spacebar') k = ' ';
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter'].includes(k) && this.state === 'play') e.preventDefault();
      if (e.repeat) return;
      SFX.unlock();
      this.keys[k] = true;
      this.keyConsumed = false;
      this.onKeyDown(k);
      if (this.keyConsumed) { e.preventDefault(); e.__ssConsumed = true; this.keys[k] = false; } // e.g. Enter that closed the help
    });
    window.addEventListener('keyup', e => {
      let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'Spacebar') k = ' ';
      this.keys[k] = false;
      if (k === ' ' && !(this.netLocalAllowed && !this.netLocalAllowed())) this.releaseFire();
      if ((k === 'Enter' || k === 'Backspace') && !(this.netLocalAllowed && !this.netLocalAllowed())) this.releaseJump(k === 'Backspace');
    });
    window.addEventListener('blur', () => { this.keys = {}; });
    // camera: drag to pan, click/drag the minimap to jump there, wheel to zoom, mouse at a screen edge to scroll
    let drag = null;
    const toCanvas = e => { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / (r.width || W), y: (e.clientY - r.top) * H / (r.height || H) }; };
    this.cv.addEventListener('mousedown', e => {
      const p = toCanvas(e);
      if (this.state === 'play' && this.minimapAt(p.x, p.y)) { drag = { mini: true }; this.minimapPan(p.x); return; }
      drag = { x: e.clientX, y: e.clientY, cam: this.camX, camY: this.camY };
    });
    window.addEventListener('mousemove', e => {
      const p = toCanvas(e), r = this.cv.getBoundingClientRect();
      this.mouse = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom ? p : null;
      if (!drag) return;
      if (drag.mini) { this.minimapPan(p.x); return; }
      const scale = W / (r.width || W) / this.zoom;
      if (Math.abs(e.clientX - drag.x) > 3 || Math.abs(e.clientY - drag.y) > 3) {
        this.camHold = true; this.camX = this.clampCam(drag.cam - (e.clientX - drag.x) * scale);
        this.camY = this.clampCamY(drag.camY - (e.clientY - drag.y) * scale);
      }
    });
    window.addEventListener('mouseup', () => { drag = null; });
    this.cv.addEventListener('mouseleave', () => { this.mouse = null; });
    this.cv.addEventListener('wheel', e => {
      if (this.state !== 'play' && this.state !== 'over') return;
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, toCanvas(e));
    }, { passive: false });
  }

  // ---------- camera (shared by 2D and 3D) ----------
  minZoom() { return Math.min(1, W / (this.WW + 120)); } // fully zoomed out = the whole map width
  viewW() { return W / this.zoom; }
  viewH() { return H / this.zoom; }
  zoomBy(f, at) {
    const old = this.zoom, nz = clamp(this.zoomT * f, this.minZoom(), ZOOM_MAX);
    this.zoomT = nz;
    if (at && this.camHold) { // keep the point under the mouse still while zooming a held (panned) view
      const wx = this.camX + at.x / old; this.zoom = nz; this.camX = this.clampCam(wx - at.x / nz); this.camY = this.clampCamY(this.camY);
    }
  }
  resetZoom() { this.zoomT = 1; }
  recenter() { this.camHold = false; }
  clampCamY(y) { const vh = this.viewH(); return vh >= H ? H - vh : clamp(y, 0, H - vh); }
  camYTarget() {
    const vh = this.viewH(); if (vh >= H) return H - vh; // zoomed out: water at the bottom of the screen, sky above
    const p = this.projectiles.find(q => !q.dead), fy = p ? p.y : this.cur ? this.cur.y - 40 : H / 2;
    return this.clampCamY(fy - vh * 0.55);
  }
  minimapRect() { const mw = 460, mh = 62; return { x: W / 2 - mw / 2, y: 72, w: mw, h: mh }; }
  minimapAt(x, y) { const m = this.minimapRect(); return x >= m.x - 3 && x <= m.x + m.w + 3 && y >= m.y - 3 && y <= m.y + m.h + 3; }
  minimapPan(sx) { const m = this.minimapRect(), wx = clamp((sx - m.x) / m.w, 0, 1) * this.WW; this.camHold = true; this.camX = this.clampCam(wx - this.viewW() / 2); this.minimapClicks = (this.minimapClicks || 0) + 1; }

  onKeyDown(k) {
    if (k === 'm') { SFX.muted = !SFX.muted; this.toast(SFX.muted ? 'sound off' : 'sound on'); }
    if (this.state !== 'play') return;
    if (k === 'h' || k === '?') { this.showHelp = !this.showHelp; return; }
    // Enter / Esc while the help is open only close it (no jump, no pause, nothing relayed online)
    if (this.showHelp && (k === 'Escape' || k === 'Enter')) { this.closeHelp(); this.keyConsumed = true; return; }
    if (k === 'Escape') return;
    if (k === 'p' && this.online) { this.toast('no pausing online'); return; }
    if (k === 'p') { this.userPaused = !this.userPaused; this.toast(this.userPaused ? 'paused (P to resume)' : 'resumed'); return; }
    if (k === 'c') { this.recenter(); return; } // camera back to the active unit
    if (k === '+' || k === '=') { this.zoomBy(1.2); return; }
    if (k === '-' || k === '_') { this.zoomBy(1 / 1.2); return; }
    if (k === '0') { this.resetZoom(); return; }
    if (this.netLocalAllowed && !this.netLocalAllowed()) return; // online: not your turn (or a mirror client)
    this.actionKey(k);
  }

  // turn actions (local keyboard, or relayed from the active online player)
  actionKey(k) {
    if (this.mirror) return;
    const u = this.cur;
    if (this.phase !== 'aim' || !u || u.dead || this.isBotTurn() || this.userPaused) return;
    const team = this.teams[this.turnTeam];
    if (k === ' ') {
      if (this.jumpCharge) return; // charging a jump
      this.showHelp = false;
      if ((WEAPONS[team.weapons[team.weaponIdx]] || {}).kind === 'defense') this.useDefense();
      else { this.charging = true; this.power = 0; }
    }
    else if (k === 'Enter' || k === 'Backspace') this.beginJump(u, k === 'Backspace'); // hold to charge, release to jump
    else if (k >= '1' && k <= '9') this.selectWeapon(team, parseInt(k, 10) - 1);
    else if (k === 'q') this.cycleWeapon(team, -1);
    else if (k === 'e') this.cycleWeapon(team, 1);
  }

  selectWeapon(team, idx) {
    if (idx < 0 || idx >= team.weapons.length || this.charging) return;
    if (!this.hasAmmo(team, team.weapons[idx])) { this.toast('out of ammo — ngmi'); return; }
    team.weaponIdx = idx; SFX.select();
  }
  cycleWeapon(team, d) {
    if (this.charging) return;
    let i = team.weaponIdx;
    for (let n = 0; n < team.weapons.length; n++) {
      i = (i + d + team.weapons.length) % team.weapons.length;
      if (this.hasAmmo(team, team.weapons[i])) break;
    }
    team.weaponIdx = i; SFX.select();
  }

  // Worms-style charged jump (real terrain collision via updateUnit; fall damage + water rules unchanged).
  // Hold ENTER (forward) or BACKSPACE (backflip: higher, slightly backward); the longer the hold, the stronger the
  // jump (JUMP_CHARGE s = max). ONE jump per turn. Online, key down/up are relayed so the host times the hold.
  beginJump(u, back) {
    if (this.jumpCharge || this.charging || u.hop) return false;
    if (!(this.jumpsLeft > 0)) { this.toast('jump already used this turn'); return false; }
    if (!u.onGround) return false;
    this.jumpCharge = { u, back, p: 0 };
    return true;
  }
  // release: jump with the charged strength (pOverride: bots pick an exact strength)
  releaseJump(back, pOverride) {
    if (this.mirror) return false;
    const c = this.jumpCharge; if (!c) return false;
    if (back != null && c.back !== back) return false; // releasing the other key
    this.jumpCharge = null;
    if (this.phase !== 'aim' || this.cur !== c.u) return false;
    return this.jump(c.u, c.back, pOverride != null ? pOverride : c.p);
  }
  updateJumpCharge(dt) {
    const c = this.jumpCharge; if (!c) return;
    if (this.phase !== 'aim' || this.cur !== c.u || c.u.dead || !c.u.onGround || this.charging || this.state !== 'play') { this.jumpCharge = null; return; }
    if (!this.userPaused) c.p = Math.min(1, c.p + dt / JUMP_CHARGE);
  }
  jump(u, back, p) {
    if (!u.onGround || this.charging || u.hop) return false;
    if (p == null) p = 0.5;
    if (this.cur === u && this.state === 'play') {
      if (this.jumpsLeft != null && this.jumpsLeft <= 0) { this.toast('jump already used this turn'); return false; }
      if (this.jumpsLeft != null) this.jumpsLeft--;
    }
    const v = jumpVel(back, p); u.vx = v.vx * u.facing; u.vy = v.vy;
    u.onGround = false; u.y -= 1; u.selfJump = true; // own jump: reduced fall damage until landing or knockback
    u.jumpK = back ? 2 : 1; u.jumpId = (u.jumpId || 0) + 1; u.jumpP = Math.round(clamp(p, 0, 1) * 100) / 100;
    this.lastJump = { u, t: this.t, back, p };
    this.stats.jumps = (this.stats.jumps || 0) + 1;
    this.jumpFx(u.x, u.y, back, p);
    return true;
  }
  // visuals + sound only (also replayed by online clients)
  jumpFx(x, y, back, p) {
    const n = 6 + Math.round((p == null ? 0.5 : p) * 8);
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1; this.particles.push({ x: x + s * rand(0, 6), y: y - 1, vx: s * rand(20, 70), vy: rand(-50, -10), life: 0.45, max: 0.45, size: rand(3, 6), color: 'rgba(225,215,200,0.55)', type: 'smoke', grav: 0 }); }
    if (back) SFX.flip(); else SFX.jump();
    if (this.onFx) this.onFx('jump', x, y, back, p);
  }
  landFx(x, y, v) {
    const n = Math.min(14, 4 + (v / 90) | 0);
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1; this.particles.push({ x: x + s * rand(0, 8), y: y - 1, vx: s * rand(30, 90), vy: rand(-40, -5), life: 0.5, max: 0.5, size: rand(3, 6), color: 'rgba(225,215,200,0.5)', type: 'smoke', grav: 0 }); }
    if (v > 380) SFX.land();
  }

  releaseFire() {
    if (this.mirror) return;
    if (this.state === 'play' && this.phase === 'aim' && this.charging) this.fire();
  }

  fire() {
    const u = this.cur, team = this.teams[this.turnTeam];
    const wid = team.weapons[team.weaponIdx], w = WEAPONS[wid];
    this.charging = false;
    if (!w) return;
    if (w.kind === 'defense') { this.useDefense(); return; }
    if (!this.hasAmmo(team, wid)) return;
    if (wid in team.ammo) team.ammo[wid]--;
    // crate boosts: Moon Scope (+25 % for a few shots), FUD (-40 % on the next attack)
    let mul = 1; if (u.scope > 0) { mul *= SCOPE_MUL; u.scope--; } if (u.fud) { mul *= FUD_MUL; u.fud = false; this.floatText('FUD: -40% dmg', u.x, u.y - 80, '#9aa0b8', 13); }
    this.scopePower = this.power;
    if (w.kind === 'beam') { this.fireBeam(u, mul); this.phase = 'fire'; this.firedPower = this.power; this.power = 0; this.camHold = false; this.stats.shots = (this.stats.shots || 0) + 1; return; }
    const s = this.shotParams(u, u.aim, u.facing, this.power);
    if (w.burst) { // Shill Spray: a burst of bullets, slightly spread, fired one after another
      const cw = WEAPONS[w.child], sp = Math.hypot(s.vx, s.vy) * 1.1, a0 = Math.atan2(s.vy, s.vx);
      for (let i = 0; i < w.burst; i++) { const a = a0 + (i - (w.burst - 1) / 2) * 0.012 + rand(-0.008, 0.008), p = this.makeProj(cw, s.x, s.y, Math.cos(a) * sp, Math.sin(a) * sp, u); p.delay = i * 0.07; p.dmgMul = mul; this.projectiles.push(p); }
    } else { const p = this.makeProj(w, s.x, s.y, s.vx, s.vy, u); p.dmgMul = mul; this.projectiles.push(p); }
    this.phase = 'fire'; this.firedPower = this.power; this.power = 0; this.camHold = false;
    this.stats.shots = (this.stats.shots || 0) + 1;
    SFX.shoot();
  }

  // ---------- defense moves ----------
  // Turn economy: each turn the active unit may walk/jump freely, then takes ONE action:
  // an attack (fire) or a defense move. A defense ends the turn and lasts until the start of
  // that team's next turn.
  useDefense() {
    if (this.state !== 'play' || this.phase !== 'aim') return false;
    const u = this.cur, team = this.teams[this.turnTeam];
    const wid = team.weapons[team.weaponIdx], w = WEAPONS[wid];
    if (!w || w.kind !== 'defense' || !this.hasAmmo(team, wid) || !u.onGround) { if (!u.onGround) this.toast('land first!'); return false; }
    if (wid in team.ammo) team.ammo[wid]--;
    this.charging = false;
    if (u.def) this.clearDefense(u, false);
    const def = { type: wid, dmgMul: w.dmgMul, knockMul: w.knockMul, shield: w.absorb || 0, used: false };
    u.def = def;
    const st = DEF_STYLE[wid];
    let delay = 1.0;
    if (wid === 'hop') {
      const spot = this.findSafeSpot(u, u.x, w.range, true);
      if (spot) {
        const dist = Math.abs(spot.x - u.x);
        u.hop = { x0: u.x, y0: u.y, x1: spot.x, y1: spot.y, t: 0, dur: 0.55 + dist / 900, h: 70 + dist * 0.25 };
        u.facing = spot.x >= u.x ? 1 : -1;
        delay = 0.6;
      }
      this.floatText('hop away!', u.x, u.y - 60, st.color, 18, true);
      SFX.jump();
    } else if (wid === 'icewall') {
      const dir = u.facing, x0 = dir > 0 ? u.x + w.gap : u.x - w.gap - w.wallW;
      // keep columns clear where other units stand so nobody gets frozen inside
      const wall = this.terrain.addIceWall(x0, u.y - w.wallH, w.wallW, w.wallH + 60);
      if (wall) {
        for (const o of this.units) if (!o.dead && o !== u && o.x > x0 - 8 && o.x < x0 + w.wallW + 8) this.terrain.meltWall(wall);
        if (wall.alive) def.wall = wall;
      }
      for (let i = 0; i < 25; i++) this.particles.push({ x: x0 + rand(0, w.wallW), y: u.y - rand(0, w.wallH), vx: rand(-40, 40), vy: rand(-80, 10), life: 0.8, max: 0.8, size: rand(2, 4), color: '#e6faff', type: 'debris', grav: 0.4 });
      this.floatText('ice wall!', u.x, u.y - 60, st.color, 18, true);
    } else if (wid === 'hodl') {
      this.floatText('HODL', u.x, u.y - 60, st.color, 22, true, DOGE_FONT);
      this.floatText('diamond hands', u.x, u.y - 82, '#bff', 13);
    } else if (wid === 'bubble') {
      this.floatText('liquidity locked', u.x, u.y - 60, st.color, 18, true);
    } else if (wid === 'diamond') {
      this.floatText('DIAMOND HANDS', u.x, u.y - 60, st.color, 20, true);
    } else {
      this.floatText('brace!', u.x, u.y - 60, st.color, 18, true);
    }
    SFX.select();
    this.stats.defenses = (this.stats.defenses || 0) + 1;
    this.lastDefense = { type: wid, t: this.t };
    this.beginSettle(delay);
    return true;
  }

  clearDefense(u, expired) {
    const d = u.def; if (!d) return;
    if (d.wall) this.terrain.meltWall(d.wall);
    u.def = null;
  }

  // Safest dry spot near x (used by Hop Away and the Liquidity Lock water rescue).
  findSafeSpot(u, cx, range, preferSafety) {
    const T = this.terrain, enemies = this.units.filter(o => !o.dead && o.team !== u.team);
    let best = null;
    for (let x = Math.round(cx - range); x <= cx + range; x += 8) {
      if (x < 70 || x > this.WW - 70) continue;
      const y = T.surfaceY(x);
      if (y < 40 || y > WATER_Y - 45) continue;
      if (!T.isSolid(x - 3, y + 2) || !T.isSolid(x + 3, y + 2)) continue;
      let blocked = false;
      for (let h = 2; h <= 40; h += 4) if (T.isSolid(x, y - h)) { blocked = true; break; }
      if (blocked) continue;
      if (this.units.some(o => !o.dead && o !== u && Math.abs(o.x - x) < 26 && Math.abs(o.y - y) < 40)) continue;
      let sc;
      if (preferSafety) {
        const md = enemies.length ? Math.min(...enemies.map(e => Math.hypot(e.x - x, e.y - y))) : 600;
        const edge = Math.min(x, this.WW - x);
        // far enough to be safe (diminishing past ~360px) but still close enough to fight back
        sc = Math.min(md, 360) + Math.min(WATER_Y - y, 200) * 0.25 - (edge < 200 ? 60 : 0) - Math.abs(x - u.x) * 0.12;
      } else sc = -Math.abs(x - cx) + Math.min(WATER_Y - y, 200) * 0.1;
      if (!best || sc > best.sc) best = { x, y: y - 1, sc };
    }
    return best;
  }

  // Damage after the target's defense (no side effects) — also used by the bots.
  effectiveDamage(u, amount) {
    const d = u.def;
    if (!d) return amount;
    let a = Math.round(amount * d.dmgMul);
    if (d.shield) a = Math.max(0, a - d.shield);
    if (d.type === 'hodl' && !d.used && a >= u.hp) a = u.hp - 1;
    return a;
  }

  shotParams(u, aimDeg, facing, power) {
    const ang = aimDeg * Math.PI / 180;
    const sp = MIN_SPEED + clamp(power, 0, 1) * (MAX_SPEED - MIN_SPEED);
    return { x: u.x + Math.cos(ang) * facing * 16, y: u.y - 16 - Math.sin(ang) * 16, vx: Math.cos(ang) * facing * sp, vy: -Math.sin(ang) * sp };
  }

  makeProj(w, x, y, vx, vy, owner) {
    return { w, x, y, vx, vy, owner, age: 0, fuse: w.fuse || 0, bounces: 0, spin: 0, dead: false, trailT: 0 };
  }

  // ---------- update ----------
  update(dt) {
    if (this.mirror && this.mirrorUpdate) { this.mirrorUpdate(dt); return; } // online client: host is authoritative
    this.t += dt;
    for (const c of this.clouds) {
      c.x += (this.wind * 40 + 6) * dt * c.s;
      if (c.x > W + 120) c.x = -120; if (c.x < -120) c.x = W + 120;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    this.updateParticles(dt);
    if (this.state !== 'play' && this.state !== 'over') return;
    this.updateCamera(dt);
    if (this.userPaused) return;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.bigQuip) { this.bigQuip.t -= dt; if (this.bigQuip.t <= 0) this.bigQuip = null; }

    if (this.state === 'play' && this.phase === 'aim') {
      if (this.bot) {
        try { this.bot.update(dt); } catch (e) { console.error('bot error', e); this.bot = null; if (this.phase === 'aim') { this.charging = true; this.power = 0.5; this.fire(); } }
      } else this.handleControls(dt);
    }
    this.updateJumpCharge(dt);
    for (const u of this.units) this.updateUnit(u, dt);
    this.updateProjectiles(dt);
    if (this.updateCrates) this.updateCrates(dt);
    if (this.state !== 'play') return;

    if (this.phase === 'aim') {
      this.timer -= dt;
      const sec = Math.ceil(this.timer);
      if (sec <= 5 && sec !== this.lastTick && sec > 0) { this.lastTick = sec; SFX.tick(); }
      if (this.cur.dead) this.beginSettle(1.0);
      else if (this.timer <= 0) { this.timer = 0; if (this.charging) this.fire(); else { this.toast('time\'s up — paper hands'); this.beginSettle(0.6); } }
    }
    if (this.phase === 'fire' && this.projectiles.length === 0) this.beginSettle(1.1);
    if (this.phase === 'settle' && (this.crates || []).some(c => !c.landed && !c.para)) this.settleMax = Math.min(this.settleMax, 7); // let a knocked crate drop
    if (this.phase === 'settle') {
      this.settleMax += dt;
      const stable = this.projectiles.length === 0 && this.units.every(u => u.drowned || (u.onGround && !u.hop));
      if (stable || this.settleMax > 8) {
        this.settleT -= dt;
        if (this.settleT <= 0) this.nextTurn();
      }
    }
  }

  clampCam(x) { const vw = this.viewW(); return vw >= this.WW ? (this.WW - vw) / 2 : clamp(x, 0, this.WW - vw); }
  camTarget() {
    const p = this.projectiles.find(q => !q.dead);
    const fx = p ? p.x : this.cur ? this.cur.x : this.WW / 2;
    return this.clampCam(fx - this.viewW() / 2);
  }
  // arrow keys pan only when they don't drive the active unit (bot / remote turn, shot in flight, spectating)
  arrowsPan() { return this.phase !== 'aim' || this.isBotTurn() || !!this.mirror || !!(this.netLocalAllowed && !this.netLocalAllowed()); }
  updateCamera(dt) {
    // smooth zoom toward the target, keeping the view centre
    if (Math.abs(this.zoomT - this.zoom) > 1e-4) {
      const cx = this.camX + this.viewW() / 2, cy = this.camY + this.viewH() / 2;
      this.zoom += (this.zoomT - this.zoom) * (1 - Math.exp(-dt * 12)); if (Math.abs(this.zoomT - this.zoom) < 1e-3) this.zoom = this.zoomT;
      this.camX = this.clampCam(cx - this.viewW() / 2); this.camY = this.clampCamY(cy - this.viewH() / 2);
    }
    const ak = this.arrowsPan();
    let pan = (this.keys['a'] ? -1 : 0) + (this.keys['d'] ? 1 : 0) + (ak ? (this.keys['ArrowLeft'] ? -1 : 0) + (this.keys['ArrowRight'] ? 1 : 0) : 0);
    let panY = ak ? (this.keys['ArrowUp'] ? -1 : 0) + (this.keys['ArrowDown'] ? 1 : 0) : 0;
    const m = this.mouse; // edge scroll (not over the HUD panels / minimap)
    if (m && !this.showHelp && m.y > 140 && m.y < H - 70) { if (m.x < 18) pan = -1; else if (m.x > W - 18) pan = 1; }
    const sp = 900 / Math.sqrt(this.zoom);
    if (pan || panY) {
      this.camHold = true; this.camX = this.clampCam(this.camX + Math.sign(pan) * sp * dt); this.camY = this.clampCamY(this.camY + panY * sp * 0.6 * dt);
      this.panned = (this.panned || 0) + 1; return;
    }
    if (this.projectiles.length) this.camHold = false;
    if (this.camHold) { this.camY = this.clampCamY(this.camY); return; }
    const k = 1 - Math.exp(-dt * (this.projectiles.length ? 6 : 3.5));
    this.camX += (this.camTarget() - this.camX) * k;
    this.camY += (this.camYTarget() - this.camY) * k;
  }

  beginSettle(delay) { this.phase = 'settle'; this.settleT = delay; this.settleMax = 0; this.charging = false; }

  handleControls(dt) {
    const u = this.cur; if (!u || u.dead) return;
    const keys = this.netKeys ? this.netKeys() : this.keys; // online: the active player's (relayed) keys
    const L = keys['ArrowLeft'], R = keys['ArrowRight'];
    if (L !== R && !this.charging) {
      const dir = L ? -1 : 1;
      this.camHold = false;
      u.facing = dir;
      if (u.onGround && !this.jumpCharge) { // crouched while charging a jump: ← → only turn
        u.walkAcc = (u.walkAcc || 0) + WALK_SPEED * dt;
        while (u.walkAcc >= 1) { u.walkAcc--; if (!this.walkStep(u, dir)) { u.walkAcc = 0; break; } if (!u.onGround) break; }
        u.walkAnim += dt * 12;
      }
    } else u.walkAcc = 0;
    if (keys['ArrowUp']) u.aim = Math.min(88, u.aim + 70 * dt);
    if (keys['ArrowDown']) u.aim = Math.max(-88, u.aim - 70 * dt);
    if (this.charging) {
      this.power = Math.min(1, this.power + dt / CHARGE_TIME);
      if (this.power >= 1) this.fire();
    }
  }

  headClear(x, y) {
    for (let h = 6; h <= 26; h += 5) if (this.terrain.isSolid(x, y - h)) return false;
    return true;
  }

  walkStep(u, dir) {
    const T = this.terrain, nx = Math.round(u.x) + dir, y = Math.round(u.y);
    if (nx < 2 || nx > this.WW - 3) return false;
    // walk budget: WALK_BUDGET px of horizontal walking per turn for the active unit (host-side; mirrors show the meter)
    const budget = u === this.cur && this.state === 'play' && this.walkLeft != null;
    if (budget && this.walkLeft < 1) { if (!this.outOfSteps) { this.outOfSteps = true; this.toast('Out of steps'); this.floatText('out of steps', u.x, u.y - 60, '#ffd84a', 14, true); } return false; }
    const ok = this.walkStep1(u, dir, T, nx, y);
    if (ok && budget) this.walkLeft = Math.max(0, this.walkLeft - 1);
    return ok;
  }
  walkStep1(u, dir, T, nx, y) {
    if (T.isSolid(nx, y)) {
      for (let k = 1; k <= 7; k++) {
        if (!T.isSolid(nx, y - k)) {
          if (this.headClear(nx, y - k)) { u.x = nx; u.y = y - k; return true; }
          return false;
        }
      }
      return false;
    }
    if (!this.headClear(nx, y)) return false;
    u.x = nx;
    for (let k = 0; k <= 7; k++) if (T.isSolid(nx, y + 1 + k)) { u.y = y + k; return true; }
    u.y = y; u.onGround = false; u.vx = dir * 45; u.vy = 0; u.selfJump = false; // walked off a ledge: normal fall damage
    return true;
  }

  updateUnit(u, dt) {
    const T = this.terrain;
    if (u.drowned) { u.y += 25 * dt; return; }
    if (u.hop) {
      const h = u.hop; h.t += dt;
      const k = Math.min(1, h.t / h.dur);
      u.x = h.x0 + (h.x1 - h.x0) * k; u.y = h.y0 + (h.y1 - h.y0) * k - Math.sin(k * Math.PI) * h.h;
      if (Math.random() < 0.6) this.particles.push({ x: u.x, y: u.y - 14, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 5, color: 'rgba(125,255,106,0.6)', type: 'smoke', grav: 0 });
      if (k >= 1) { u.hop = null; u.x = h.x1; u.y = h.y1; u.onGround = true; u.vx = u.vy = 0; }
      return;
    }
    if (u.onGround && !u.dead && u.y < WATER_Y - 30) u.lastSafe = { x: u.x, y: u.y };
    if (u.y > WATER_Y + 4) { this.checkWater(u); return; } // standing/landed under the waterline
    if (u.onGround) {
      const x = Math.round(u.x), y = Math.round(u.y);
      if (T.isSolid(x, y + 1) || T.isSolid(x, y + 2) || T.isSolid(x - 3, y + 1) || T.isSolid(x + 3, y + 1)) return;
      u.onGround = false; u.vx = 0; u.vy = 0;
    }
    u.vy = Math.min(950, u.vy + GRAV * dt);
    const dist = Math.max(Math.abs(u.vx), Math.abs(u.vy)) * dt;
    const n = Math.max(1, Math.ceil(dist / 1.5)), s = dt / n;
    for (let i = 0; i < n; i++) {
      let nx = u.x + u.vx * s, ny = u.y + u.vy * s;
      if (T.isSolid(nx, ny - 12) || T.isSolid(nx, ny - 20)) { u.vx = -u.vx * 0.3; nx = u.x; }
      if (u.vy < 0 && T.isSolid(nx, ny - 28)) { u.vy = 0; ny = u.y; }
      if (u.vy >= 0 && T.isSolid(nx, ny)) {
        let yy = Math.round(ny), k = 0;
        while (T.isSolid(nx, yy) && k < 30) { yy--; k++; }
        u.x = Math.round(nx); u.y = yy;
        this.land(u); return;
      }
      u.x = nx; u.y = ny;
    }
    this.checkWater(u);
  }

  checkWater(u) {
    if (u.drowned || u.hop) return;
    if (u.y > WATER_Y + 4) {
      if (!u.dead && u.def && u.def.type === 'bubble') {
        // Liquidity Lock: float back to the nearest dry spot (once)
        const from = u.lastSafe || { x: u.x, y: u.y };
        const spot = this.findSafeSpot(u, clamp(from.x, 80, this.WW - 80), 260, false) || this.findSafeSpot(u, this.WW / 2, this.WW, false);
        this.splash(u.x, WATER_Y, 0.8);
        if (spot) {
          u.hop = { x0: u.x, y0: WATER_Y, x1: spot.x, y1: spot.y, t: 0, dur: 0.8, h: 90 };
          u.vx = u.vy = 0;
          this.quip('SAFU!', DEF_STYLE.bubble.color);
          this.clearDefense(u);
          return;
        }
      }
      this.drown(u);
    }
  }

  land(u) {
    const v = u.vy;
    const own = !!u.selfJump; u.selfJump = false;
    u.vx = 0; u.vy = 0; u.onGround = true; u.jumpK = 0;
    if (!u.dead && v > 260) this.landFx(u.x, u.y, v);
    if (!u.dead && v > 470) {
      const dmg = Math.round((v - 470) * 0.09 * (own ? JUMP_FALL_MUL : 1));
      this.lastFall = { u, v, dmg, own };
      if (dmg > 0) { this.damage(u, dmg); this.floatText('ouch', u.x, u.y - 30, '#fff', 13); }
    }
  }

  drown(u) {
    if (u.drowned) return;
    this.turnDamage = (this.turnDamage || 0) + 100;
    const wasDead = u.dead;
    u.drowned = true; u.dead = true; u.hp = 0; u.onGround = false;
    this.splash(u.x, WATER_Y, 1.2);
    if (!wasDead) {
      this.quip(pick(QUIPS_DROWN), u.team.color);
      this.floatText(u.name + ' drowned', u.x, WATER_Y - 40, u.team.color, 15);
    }
  }

  damage(u, amount) {
    if (u.dead || amount <= 0) return;
    this.turnDamage = (this.turnDamage || 0) + amount;
    const d = u.def;
    if (d) {
      amount = Math.round(amount * d.dmgMul);
      if (d.shield) {
        const ab = Math.min(d.shield, amount); d.shield -= ab; amount -= ab;
        if (ab > 0) this.floatText(`absorbed ${ab}`, u.x, u.y - 72, DEF_STYLE.bubble.color, 13);
        if (d.shield <= 0) { this.floatText('bubble popped', u.x, u.y - 86, '#fff', 12); this.clearDefense(u); }
      }
      if (d.type === 'hodl' && !d.used && amount >= u.hp && u.hp > 1) {
        amount = u.hp - 1; d.used = true;
        this.quip('HODL!', DEF_STYLE.hodl.color);
        this.floatText('survived at 1 HP', u.x, u.y - 80, '#ffd84a', 14, true);
      }
      if (amount <= 0) return;
    }
    u.hp = Math.max(0, u.hp - amount);
    this.floatText('-' + amount, u.x, u.y - 50, u.team.color, 22, true);
    if (u.hp <= 0) {
      u.dead = true;
      this.quip(pick(QUIPS_KILL), u.team.color);
      this.deathFx(u.x, u.y, u.team.color);
    }
  }
  deathFx(x, y, color) {
    for (let i = 0; i < 20; i++) this.particles.push({ x, y: y - 14, vx: rand(-120, 120), vy: rand(-260, -40), life: 1.2, max: 1.2, size: rand(2, 4), color, type: 'debris', grav: 1 });
  }

  // ---------- projectiles ----------
  updateProjectiles(dt) {
    const T = this.terrain, spawned = [];
    for (const p of this.projectiles) {
      if (p.dead) continue;
      if (p.delay > 0) { p.delay -= dt; if (p.delay <= 0 && p.owner && !p.owner.dead) { SFX.shoot(); } continue; } // burst bullets wait their turn
      p.age += dt;
      const w = p.w;
      const sp = Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt;
      const n = Math.max(1, Math.ceil(sp / 2)), s = dt / n;
      for (let i = 0; i < n && !p.dead; i++) {
        p.vx += this.wind * WIND_ACC * w.wind * s;
        p.vy += GRAV * w.grav * s;
        if (w.homing && p.age > w.homeDelay) [p.vx, p.vy] = homingSteer(this, p.owner, p.x, p.y, p.vx, p.vy, s, w.homing);
        const nx = p.x + p.vx * s, ny = p.y + p.vy * s;
        if (w.kind === 'impact') {
          if (T.isSolid(nx, ny) || this.hitUnit(nx, ny, p)) { p.x = nx; p.y = ny; this.impact(p, spawned); p.dead = true; break; }
          p.x = nx; p.y = ny;
        } else {
          if (T.isSolid(nx, ny)) {
            const [mx, my] = this.normalAt(nx, ny);
            const dot = p.vx * mx + p.vy * my;
            const speed = Math.hypot(p.vx, p.vy);
            if (dot < 0) { p.vx -= 2 * dot * mx; p.vy -= 2 * dot * my; }
            p.vx *= w.bounce; p.vy *= w.bounce;
            if (speed > 90) { p.bounces++; this.onBounce(p, speed, spawned); }
            if (Math.hypot(p.vx, p.vy) < 25) { p.vx *= 0.5; p.vy = Math.min(p.vy, 0); }
            // push out if embedded
            let k = 0; while (T.isSolid(p.x, p.y) && k < 10) { p.x += mx; p.y += my; k++; }
          } else { p.x = nx; p.y = ny; }
        }
        if (p.y > WATER_Y + 2) { this.splash(p.x, WATER_Y, 0.6); p.dead = true; this.floatText('blub', p.x, WATER_Y - 20, '#bfe8ff', 14); }
        if (p.x < -400 || p.x > this.WW + 400) p.dead = true;
      }
      if (!p.dead && w.kind === 'bounce') {
        p.spin += p.vx * dt * 0.08;
        p.fuse -= dt;
        if (p.fuse <= 0) { this.explode(p.x, p.y, w.radius, w.damage, w.knock, p); if (w.gasR) this.gasCloud(p); p.dead = true; }
      }
      if (!p.dead && p.age > 20) p.dead = true;
      if (!p.dead) {
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = w.id === 'moon' ? 0.012 : 0.03;
          const fire = w.id === 'moon' || w.id === 'bazooka';
          this.particles.push({ x: p.x, y: p.y, vx: rand(-10, 10), vy: rand(-20, 0), life: fire ? 0.6 : 0.4, max: fire ? 0.6 : 0.4, size: w.id === 'moon' ? 5 : 3, color: w.id === 'fish' || w.id === 'fishlet' ? 'rgba(200,240,255,0.8)' : 'rgba(230,230,230,0.6)', type: 'smoke', grav: -0.05 });
          if (w.id === 'moon') this.particles.push({ x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.25, max: 0.25, size: 3, color: '#ffb02e', type: 'spark', grav: 0 });
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead).concat(spawned);
  }

  hitUnit(x, y, p) {
    for (const u of this.units) {
      if (u.dead) continue;
      if (u === p.owner && p.age < 0.3) continue;
      const dx = x - u.x, dy = y - (u.y - 15);
      if (dx * dx + dy * dy < 13 * 13) return true;
    }
    return false;
  }

  normalAt(x, y) {
    let nx = 0, ny = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy > 16) continue;
      if (this.terrain.isSolid(x + dx, y + dy)) { nx -= dx; ny -= dy; }
    }
    const l = Math.hypot(nx, ny);
    return l < 0.001 ? [0, -1] : [nx / l, ny / l];
  }

  onBounce(p, speed, spawned) {
    if (p.w.id === 'fly') {
      if (p.bounces <= 6 && speed > 140) {
        // no crater (keeps the bounce path predictable) and the flies spare their own frens
        this.explode(p.x, p.y, p.w.miniR, p.w.miniD, 0, p, true, true, p.owner && p.owner.team);
        this.floatText(pick(['ribbit', 'bzzz', 'rare!', 'kek']), p.x, p.y - 18, '#9cff7a', 13);
        SFX.ribbit();
      }
    } else SFX.bounce();
  }

  impact(p, spawned) {
    const w = p.w;
    if (w.splits) { // Ice Fish fishlets / Airdrop Cluster bomblets
      this.explode(p.x, p.y, w.radius, w.damage, w.knock, p);
      const ns = w.splits || 5, cw = WEAPONS[w.child || 'fishlet'];
      for (let i = 0; i < ns; i++) {
        // fixed, symmetric fan so the result is predictable (bots simulate it too)
        const a = -Math.PI / 2 + (i - (ns - 1) / 2) * w.splitSpread;
        const sp = w.splitSpeed * (1 - Math.abs(i - (ns - 1) / 2) * 0.08);
        const c = this.makeProj(cw, p.x, p.y - 4, Math.cos(a) * sp, Math.sin(a) * sp, w.child ? p.owner : null); c.dmgMul = p.dmgMul; if (w.child) c.age = 0.3; spawned.push(c);
      }
      this.floatText(w.id === 'fish' ? 'ice ice baby' : 'AIRDROP!', p.x, p.y - 40, w.id === 'fish' ? '#bfefff' : '#b06bff', 16, w.id !== 'fish');
    } else if (w.teleport) { // L2 Bridge: the owner bridges to dry ground where the beacon landed
      const u = p.owner, spot = u && !u.dead ? (this.findSafeSpot(u, p.x, 90, false) || this.findSafeSpot(u, p.x, 260, false)) : null;
      if (spot) { const fx = u.x, fy = u.y; u.x = spot.x; u.y = spot.y; u.vx = u.vy = 0; u.onGround = true; u.selfJump = false; this.crateFx('tp', fx, fy, spot.x, spot.y); this.floatText('bridged to L2', spot.x, spot.y - 60, '#46f0ff', 16, true); }
      else this.floatText('bridge failed (no dry land)', p.x, p.y - 30, '#46f0ff', 14);
    } else if (w.id === 'rug') {
      this.rugPull(p.x, p.y, p);
    } else {
      this.explode(p.x, p.y, w.radius, w.damage, w.knock, p);
      if (w.id === 'fud') for (const u of this.units) if (!u.dead && p.owner && u.team !== p.owner.team && Math.hypot(u.x - p.x, u.y - 14 - p.y) < w.radius * 1.5) { u.fud = true; this.floatText('FUD', u.x, u.y - 70, '#9aa0b8', 16, true); }
      if (w.id === 'moon') {
        for (let i = 0; i < 4; i++) this.floatText(pick(DOGE_WORDS), p.x + rand(-90, 90), p.y - rand(20, 90), pick(['#ff4fd8', '#46f0ff', '#fff94a', '#7dff6a', '#ff8a3d']), rand(16, 24), false, DOGE_FONT);
      }
    }
  }

  rugPull(x, y, p) {
    const w = WEAPONS.rug, cw = w.colW, top = y - 50, bottom = Math.min(H, y + w.colDepth);
    // explosion first, then the floor gets pulled out from under everything in the column
    this.explode(x, y, w.radius, w.damage, w.knock, p, true);
    this.terrain.carveRect(x - cw / 2, top, cw, bottom - top);
    for (const u of this.units) {
      if (u.dead) continue;
      if (Math.abs(u.x - x) < cw / 2 + 8 && u.y > top - 30 && u.y < bottom) {
        this.damage(u, w.colDmg);
        if (u.dead) continue;
        u.onGround = false; u.vy = Math.max(u.vy, 60); u.selfJump = false;
        u.x = clamp(u.x, x - cw / 2 + 6, x + cw / 2 - 6); // gets sucked into the hole
      }
    }
    this.rugFx(x, top, bottom);
    this.floatText('RUG PULLED!', x, top - 30, '#ff5fa2', 26, true);
    this.floatText('-99%', x + 40, top - 6, '#ff4b4b', 18);
    this.explosionCount++; this.lastExplosion = { x, y, t: this.t };
  }
  // visuals only (also replayed by online clients)
  rugFx(x, top, bottom) {
    const cw = WEAPONS.rug.colW;
    for (let i = 0; i < 70; i++) {
      this.particles.push({ x: x + rand(-cw / 2, cw / 2), y: rand(top, bottom), vx: rand(-40, 40), vy: rand(-60, 60), life: rand(0.8, 1.6), max: 1.6, size: rand(2, 5), color: pick(['#8b5e3c', '#6d4a2f', '#b3243b', '#ffd84a']), type: 'debris', grav: 1 });
    }
    if (this.onFx) this.onFx('rug', x, top, bottom);
    this.shake = 10; SFX.boom(40);
  }

  explode(x, y, r, dmg, knock, p, small, noCarve, spareTeam) {
    if (!noCarve) this.terrain.carve(x, y, r);
    const blast = r * 1.5;
    const owner = p && p.owner ? p.owner : this.cur;
    let bigHit = false;
    for (const u of this.units) {
      if (u.dead || (spareTeam && u.team === spareTeam)) continue;
      const cx = u.x, cy = u.y - 14;
      const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy);
      if (d > blast) continue;
      const f = 1 - d / blast;
      const amount = Math.round(dmg * (0.25 + 0.75 * f) * (p && p.dmgMul ? p.dmgMul : 1));
      if (owner && u.team !== owner.team && amount >= 30) bigHit = true;
      this.damage(u, amount);
      const imp = knock <= 0 ? 0 : ((small ? 120 : 430) * knock * f + 40) * (u.def ? u.def.knockMul : 1);
      let nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : -1;
      ny -= 0.7; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      u.vx += nx * imp; u.vy += ny * imp; u.onGround = false; u.y -= 1; u.selfJump = false; // knockback: normal fall damage
    }
    if (bigHit && owner && !this.bigQuip) this.floatText(pick(QUIPS_HIT), owner.x, owner.y - 70, '#fff', 16);
    this.explodeFx(x, y, r, small);
    if (!small) { this.explosionCount++; this.lastExplosion = { x, y, t: this.t }; }
    if (this.crateBlast && r >= 9) this.crateBlast(x, y, r);
  }
  gasCloud(p) { // Gas Fee: everyone near the cloud pays a fee at the start of their next turns
    const w = p.w;
    for (const u of this.units) if (!u.dead && Math.hypot(u.x - p.x, u.y - 14 - p.y) < w.gasR) { u.poison = { dmg: w.gasDmg, turns: w.gasTurns }; this.floatText('gassed', u.x, u.y - 70, '#7dff6a', 14, true); }
    this.crateFx('gas', p.x, p.y, w.gasR);
    this.floatText('GAS FEE', p.x, p.y - 40, '#7dff6a', 20, true);
  }
  // explosion visuals + sound only (also replayed by online clients)
  explodeFx(x, y, r, small) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.32, max: 0.32, size: r * 1.7, color: '#fff6c8', type: 'flash', grav: 0 });
    for (let i = 0; i < (small ? 3 : 10); i++) {
      const a = rand(0, Math.PI * 2), d = rand(0, r * 0.6);
      this.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * rand(20, 80), vy: Math.sin(a) * rand(20, 80) - 30, life: rand(0.35, 0.6), max: 0.6, size: rand(0.35, 0.6) * r, color: pick(['#ffb02e', '#ff7a1a', '#ffd84a']), type: 'fire', grav: -0.05 });
    }
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: r * 1.6, color: '#ffffff', type: 'ring', grav: 0 });
    const nf = small ? 6 : Math.round(r * 0.7);
    for (let i = 0; i < nf; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 260) * (r / 40);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.3, 0.7), max: 0.7, size: rand(3, 7) * (r / 40) + 1, color: pick(['#ffd84a', '#ff9a2e', '#ff5a1f']), type: 'spark', grav: 0.2 });
      this.particles.push({ x: x + rand(-r / 2, r / 2), y: y + rand(-r / 2, r / 2), vx: rand(-30, 30), vy: rand(-60, -10), life: rand(0.8, 1.6), max: 1.6, size: rand(6, 14) * (r / 40) + 2, color: 'rgba(70,60,70,0.55)', type: 'smoke', grav: -0.05 });
      this.particles.push({ x, y, vx: Math.cos(a) * s * 0.9, vy: Math.sin(a) * s * 0.9 - 120, life: rand(0.8, 1.5), max: 1.5, size: rand(2, 4), color: pick(this.world.debris), type: 'debris', grav: 1 });
    }
    this.shake = Math.max(this.shake, Math.min(14, r / 3.5));
    if (!small) SFX.boom(r);
    if (this.onFx) this.onFx('boom', x, y, r, small);
  }

  splash(x, y, s) {
    for (let i = 0; i < 24 * s; i++) this.particles.push({ x: x + rand(-8, 8), y, vx: rand(-90, 90) * s, vy: rand(-320, -80) * s, life: rand(0.5, 1), max: 1, size: rand(2, 4), color: this.world.water.splash, type: 'debris', grav: 1 });
    if (this.onFx) this.onFx('splash', x, y, s);
    SFX.splash();
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += GRAV * p.grav * dt;
      if (p.type === 'smoke') { p.vx *= 0.98; p.size += dt * 6; }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.updateBeams) this.updateBeams(dt);
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.97; }
    this.texts = this.texts.filter(t => t.life > 0);
    if (this.toastMsg) { this.toastMsg.t -= dt; if (this.toastMsg.t <= 0) this.toastMsg = null; }
  }

  floatText(text, x, y, color, size, bold, font) {
    this.texts.push({ text, x, y, vy: -40, life: 1.8, max: 1.8, color, size: size || 16, bold, font });
  }
  quip(text, color) { this.bigQuip = { text, color, t: 2.2, max: 2.2 }; }
  toast(text) { this.toastMsg = { text, t: 1.6 }; }

  // ---------- render ----------
  render() {
    if (this.r3d && this.r3d.active) { this.render3D(); return; }
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
    ctx.drawImage(this.bg, 0, 0);
    this.drawClouds(ctx);
    const z = this.zoom, cam = z === 1 ? Math.round(this.camX) : this.camX, cy = z === 1 ? Math.round(this.camY) : this.camY, vw = W / z, vh = H / z;
    const playing = this.state === 'play' || this.state === 'over', small = z < 0.85; // zoomed out: labels at screen size
    ctx.save(); if (z !== 1) ctx.scale(z, z); ctx.translate(-cam, -cy);
    // only the visible slice of the (big) terrain bitmap
    const sx0 = Math.max(0, Math.floor(cam)), sx1 = Math.min(this.terrain.w, Math.ceil(cam + vw) + 1), sy0 = Math.max(0, Math.floor(cy)), sy1 = Math.min(H, Math.ceil(cy + vh) + 1);
    if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(this.terrain.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
    this.terrain.drawDecos(ctx, this.t, cam, false, vw);
    this.terrain.drawWalls(ctx);
    const inView = (x, pad) => x > cam - pad && x < cam + vw + pad;
    if (playing) {
      for (const u of this.units) if (inView(u.x, 120)) this.drawUnit(ctx, u, small ? 'body' : undefined);
      for (const p of this.projectiles) if (!(p.delay > 0)) drawProjectile(ctx, p, this.t);
      for (const c of this.crates || []) if (inView(c.x, 60)) this.drawCrate(ctx, c, this.t);
      this.drawBeams(ctx);
    }
    this.drawParticles(ctx, cam, vw);
    this.drawWater(ctx);
    this.terrain.drawDecos(ctx, this.t, cam, true, vw);
    this.drawAmbient(ctx, cam, false);
    if (!small) this.drawTexts(ctx);
    ctx.restore();
    if (small && playing) { // readable name/HP tags + floating text when zoomed out
      const sm = ctx.getTransform();
      for (const u of this.units) if (!u.dead && !u.drowned && inView(u.x, 60)) { ctx.translate((u.x - cam) * z - u.x, (u.y - cy) * z - u.y + 50 * (1 - z) * 0.7); this.drawUnit(ctx, u, 'label'); ctx.setTransform(sm); }
      for (const t of this.texts) { ctx.translate((t.x - cam) * z - t.x, (t.y - cy) * z - t.y); this.drawTexts(ctx, [t]); ctx.setTransform(sm); }
    }
    this.drawAmbient(ctx, cam, true);
    ctx.restore();
    if (this.state === 'play' || this.state === 'over') this.drawHUD(ctx);
  }

  // 2.5D mode: Three.js draws the world (js/r3d/); this transparent 2D canvas on top keeps the
  // labels, aim reticle, floating text and HUD, projected to where the 3D units actually are.
  render3D() {
    const ctx = this.ctx, now = performance.now(), dt = Math.min(0.05, Math.max(0, (now - (this._r3t || now)) / 1000)); this._r3t = now;
    this.r3d.render(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    if (this.state === 'play' || this.state === 'over') {
      // aim reticle / previews are world-locked; name + HP labels keep a readable size at any zoom
      for (const u of this.units) { if (u.dead || u.drowned) continue; this.r3d.overlayTransform(ctx, u.x, u.y); this.drawUnit(ctx, u, 'aim'); }
      const order = this.units.filter(u => !u.dead && !u.drowned).sort((a, b) => (a === this.cur) - (b === this.cur));
      for (const u of order) { this.r3d.overlayTransform(ctx, u.x, u.y - 44, 0.95, 1.4); this.drawUnit(ctx, u, 'label'); }
      ctx.textAlign = 'center';
      for (const t of this.texts) {
        this.r3d.overlayTransform(ctx, t.x, t.y);
        ctx.globalAlpha = clamp(t.life / t.max * 1.6, 0, 1); ctx.font = `bold ${t.size}px ${t.font || FONT}`;
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      if (this.beams && this.beams.length) { this.r3d.overlayTransform(ctx, this.beams[0].x0, this.beams[0].y0); this.drawBeams(ctx); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawHUD(ctx);
    }
  }

  // ambient world flavour (snow, fireflies, shooting stars...). Purely cosmetic; advanced on real time
  // in render so headless sims (externalStep) don't pay for it.
  drawAmbient(ctx, cam, screen) {
    const A = this.ambient, w = this.world;
    if (!screen) {
      const now = performance.now(), dt = Math.min(0.05, ((now - (this._ambT || now)) / 1000)); this._ambT = now;
      if (w.ambient && dt > 0) w.ambient(A, cam, this.t, dt, this.wind);
      for (const a of A) {
        a.life -= dt; a.x += (a.vx + (a.type === 'snow' ? this.wind * 50 + Math.sin(this.t + a.ph) * 12 : 0)) * dt; a.y += a.vy * dt;
        if (a.type === 'firefly') { a.vx += rand(-20, 20) * dt; a.vy += rand(-20, 20) * dt; }
        if (a.type === 'snow' && (a.y > WATER_Y || this.terrain.isSolid(a.x, a.y))) a.life = Math.min(a.life, 0.3);
        if (a.type === 'bubble' && a.y < WATER_Y) a.life = 0;
      }
      for (let i = A.length - 1; i >= 0; i--) if (A[i].life <= 0) A.splice(i, 1);
    }
    for (const a of A) {
      if (!!a.screen !== screen) continue;
      const f = Math.min(1, a.life / 0.4, (a.max - a.life) / 0.4 + 0.2);
      if (a.type === 'snow') { ctx.fillStyle = `rgba(255,255,255,${0.85 * f})`; ctx.beginPath(); ctx.arc(a.x, a.y, a.sz, 0, Math.PI * 2); ctx.fill(); }
      else if (a.type === 'firefly') { const g = 0.5 + 0.5 * Math.sin(this.t * 4 + a.ph); glowDot(ctx, a.x, a.y, 9, 'rgba(220,255,120,A)', 0.5 * g * f); ctx.fillStyle = `rgba(250,255,190,${g * f})`; ctx.fillRect(a.x - 1, a.y - 1, 2, 2); }
      else if (a.type === 'dust') { ctx.fillStyle = `rgba(220,220,240,${0.35 * f})`; ctx.fillRect(a.x, a.y, 2, 2); }
      else if (a.type === 'bubble') { ctx.strokeStyle = `rgba(190,230,140,${0.6 * f})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a.x, a.y, 2.5, 0, Math.PI * 2); ctx.stroke(); }
      else if (a.type === 'spark') { ctx.fillStyle = `rgba(${a.col},${0.8 * f})`; ctx.fillRect(a.x, a.y, 2, 2); }
      else if (a.type === 'ticker') { ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = a.text[0] === '-' || a.text === 'DUMP' ? `rgba(255,90,120,${0.5 * f})` : `rgba(90,255,170,${0.5 * f})`; ctx.fillText(a.text, a.x, a.y); }
      else if (a.type === 'shoot') {
        const sx = a.x - cam; ctx.strokeStyle = `rgba(255,255,255,${0.8 * f})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, a.y); ctx.lineTo(sx - a.vx * 0.08, a.y - a.vy * 0.08); ctx.stroke();
      }
    }
  }

  drawClouds(ctx) {
    const w = this.world; if (!w.clouds) return;
    ctx.fillStyle = w.clouds;
    for (const c of this.clouds) {
      ctx.beginPath();
      const s = c.s * 22 * (w.cloudScale || 1);
      ctx.ellipse(c.x, c.y, s * 2.2, s * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - s, c.y + 4, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + s * 1.1, c.y - 4, s * 1.3, s * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWater(ctx) {
    const t = this.t;
    const L = this.world.water;
    const g = ctx.createLinearGradient(0, WATER_Y - 10, 0, H);
    g.addColorStop(0, L.top); g.addColorStop(1, L.bottom);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
    const x0 = Math.floor(this.camX / 10) * 10 - 20, x1 = this.camX + this.viewW() + 20;
    ctx.lineTo(x0, H);
    for (let x = x0; x <= x1; x += 10) ctx.lineTo(x, WATER_Y + Math.sin(x * 0.03 + t * 2) * 3 + Math.sin(x * 0.071 - t * 1.4) * 2);
    ctx.lineTo(x1, H); ctx.closePath(); ctx.fill();
    if (L.stars) for (let x = x0; x <= x1; x += 23) { const k = hash2(x, 1, 5); if (k > 0.5) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * 2 + k * 20))})`; ctx.fillRect(x + k * 20, WATER_Y + 10 + k * 36, 2, 2); } }
    if (L.ticker) { ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,200,210,0.35)'; const off = (t * 40) % 220; for (let x = Math.floor(x0 / 220) * 220 - off; x < x1; x += 220) ctx.fillText('LIQUIDATED ▼', x, WATER_Y + 32); }
    ctx.save(); if (L.stars || L.ticker) { ctx.shadowColor = L.line; ctx.shadowBlur = 10; }
    ctx.strokeStyle = L.line; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = x0; x <= x1; x += 10) { const y = WATER_Y + Math.sin(x * 0.03 + t * 2) * 3 + Math.sin(x * 0.071 - t * 1.4) * 2; x !== x0 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.restore();
  }

  drawUnit(ctx, u, overlay) {
    if (u.drowned) {
      if (u.y < WATER_Y + 30) { ctx.globalAlpha = 0.5; drawMascot(ctx, u.char, u.x, u.y, u.facing, 1, this.t); ctx.globalAlpha = 1; }
      return;
    }
    if (u.dead) { drawGrave(ctx, u.x, u.y + 1, u.team.color); return; }
    const isCur = u === this.cur && this.state === 'play';
    let bob = u.onGround ? Math.sin(this.t * 3 + u.phase) * 0.03 : -0.05;
    const walkHop = isCur && (this.keys['ArrowLeft'] || this.keys['ArrowRight']) && u.onGround ? Math.abs(Math.sin(u.walkAnim)) * 2 : 0;
    // jump animation (render-side timers, so online mirrors animate too): stretch in the air, squash on landing, backflip spin
    if (u.jumpId && u._jSeen !== u.jumpId) { u._jSeen = u.jumpId; u._jT0 = this.t; u._jBack = u.jumpK === 2; }
    const jt = u._jT0 != null ? this.t - u._jT0 : 99;
    if (!u.onGround && jt < 1.5) bob = -clamp(0.06 + Math.abs(u.vy || 0) / 2600, 0, 0.2);
    if (u.onGround && !u._wasGround && jt < 3) u._landT = this.t;
    u._wasGround = u.onGround;
    if (u._landT != null && this.t - u._landT < 0.22) bob = Math.sin((this.t - u._landT) / 0.22 * Math.PI) * (0.1 + 0.16 * (u.jumpP == null ? 0.5 : u.jumpP)); // bigger jump, bigger squash
    if (this.jumpCharge && this.jumpCharge.u === u && u.onGround) bob = 0.04 + this.jumpCharge.p * 0.2; // crouch while charging
    const spin = u._jBack && !u.onGround && jt < 1.2 ? -u.facing * Math.min(1, jt / 0.75) * Math.PI * 2 : 0;
    if (!overlay || overlay === 'body') {
      if (u.def) this.drawDefense(ctx, u, false);
      if (u.onGround) { ctx.fillStyle = u.team.color; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.ellipse(u.x, u.y + 1, 13, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; } // team ground ring
      if (spin) { ctx.save(); ctx.translate(u.x, u.y - 14); ctx.rotate(spin); ctx.translate(-u.x, -(u.y - 14)); }
      drawMascot(ctx, u.char, u.x, u.y - walkHop, u.facing, 1, this.t, { phase: u.phase, squash: bob });
      if (spin) ctx.restore();
      if (u.def) this.drawDefense(ctx, u, true);
    } else if (overlay === 'label') {
    } else if (u.def && u.def.type === 'bubble') { // shield points stay readable on the 3D bubble
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(60,0,40,0.8)';
      ctx.strokeText(u.def.shield, u.x, u.y + 6); ctx.fillStyle = '#fff'; ctx.fillText(u.def.shield, u.x, u.y + 6);
    }

    if (isCur && this.phase === 'aim' && overlay !== 'label') this.drawAim(ctx, u, overlay);
    if (overlay === 'aim' || overlay === 'body') return;

    // label
    const ly = u.y - 50;
    ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center';
    const nw = ctx.measureText(u.name).width + 10;
    // team colour tag (units on both teams can be the same character): solid team-coloured name plate + HP frame
    ctx.fillStyle = u.team.color; this.rr(ctx, u.x - nw / 2, ly - 22, nw, 13, 4); ctx.fill();
    ctx.fillStyle = u.team.dark || '#000'; ctx.fillText(u.name, u.x, ly - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; this.rr(ctx, u.x - 16, ly - 8, 32, 13, 4); ctx.fill();
    ctx.strokeStyle = u.team.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 11px ${FONT}`; ctx.fillText(u.hp, u.x, ly + 2);
    if (u.def) this.drawDefIcon(ctx, u.def.type, u.x + 24, ly - 1, 7);
    if (isCur && this.phase === 'aim' && this.bot && this.bot.isThinking()) {
      const dots = '.'.repeat(1 + (Math.floor(Math.max(0, this.t) * 3) % 3));
      ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'left';
      const tw = ctx.measureText('thinking...').width + 14, bx = u.x - tw / 2, byy = ly - 70;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; this.rr(ctx, bx, byy, tw, 20, 10); ctx.fill();
      ctx.strokeStyle = this.teams[this.turnTeam].color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#2a1a50'; ctx.fillText('thinking' + dots, bx + 7, byy + 15);
      ctx.textAlign = 'center';
    }
    const jc = this.jumpCharge;
    if (jc && jc.u === u) { // jump charge meter next to the unit
      const mx = u.x + (u.facing > 0 ? -26 : 26) - 4, my0 = u.y - 44, mh = 38;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; this.rr(ctx, mx - 2, my0 - 2, 12, mh + 4, 5); ctx.fill();
      ctx.fillStyle = jc.p >= 1 ? '#ffd84a' : jc.back ? '#b06bff' : '#7fd8ff';
      const fh = Math.max(3, mh * jc.p); this.rr(ctx, mx, my0 + mh - fh, 8, fh, 3); ctx.fill();
      ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const jt = jc.p >= 1 ? 'MAX' : jc.back ? 'FLIP' : 'JUMP'; ctx.strokeText(jt, mx + 4, my0 - 5); ctx.fillStyle = '#fff'; ctx.fillText(jt, mx + 4, my0 - 5);
    }
    if (isCur && this.phase !== 'over') {
      const ay = ly - 34 + Math.sin(this.t * 6) * 4;
      ctx.fillStyle = u.team.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(u.x - 7, ay - 8); ctx.lineTo(u.x + 7, ay - 8); ctx.lineTo(u.x, ay); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  drawDefIcon(ctx, type, x, y, r) {
    const st = DEF_STYLE[type]; if (!st) return;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = st.color; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (st.icon === 'shield') { ctx.moveTo(0, -r); ctx.lineTo(r, -r * 0.6); ctx.quadraticCurveTo(r, r * 0.6, 0, r * 1.1); ctx.quadraticCurveTo(-r, r * 0.6, -r, -r * 0.6); ctx.closePath(); }
    else if (st.icon === 'diamond') { ctx.moveTo(-r, -r * 0.3); ctx.lineTo(-r * 0.5, -r); ctx.lineTo(r * 0.5, -r); ctx.lineTo(r, -r * 0.3); ctx.lineTo(0, r); ctx.closePath(); }
    else if (st.icon === 'wing') { ctx.moveTo(-r, r * 0.4); ctx.quadraticCurveTo(-r * 0.2, -r * 1.2, r, -r * 0.8); ctx.quadraticCurveTo(r * 0.2, -r * 0.1, r * 0.6, r * 0.2); ctx.quadraticCurveTo(0, r * 0.1, -r, r * 0.4); ctx.closePath(); }
    else if (st.icon === 'ice') { ctx.rect(-r * 0.8, -r, r * 1.6, r * 2); }
    else { ctx.arc(0, 0, r, 0, Math.PI * 2); }
    ctx.fill(); ctx.stroke();
    if (st.icon === 'bubble') { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  drawDefense(ctx, u, front) {
    const d = u.def, st = DEF_STYLE[d.type], cx = u.x, cy = u.y - 17, t = this.t;
    if (d.type === 'bubble') {
      if (!front) return;
      const r = 24 + Math.sin(t * 3) * 1.2;
      const g = ctx.createRadialGradient(cx - 7, cy - 8, 2, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.7, 'rgba(255,143,208,0.12)'); g.addColorStop(1, 'rgba(120,255,180,0.45)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,230,0.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(cx - 9, cy - 11, 5, 3, -0.6, 0, 7); ctx.fill();
      ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(d.shield, cx, cy + r - 4);
      return;
    }
    if (front) {
      if (d.type === 'hodl') {
        // orbiting diamonds
        for (let i = 0; i < 3; i++) {
          const a = t * 2.2 + i * 2.09;
          this.drawDefIcon(ctx, 'hodl', cx + Math.cos(a) * 21, cy + Math.sin(a) * 9, 4);
        }
      }
      return;
    }
    // behind-the-body auras
    ctx.save();
    const pulse = 0.55 + Math.sin(t * 4) * 0.15;
    if (d.type === 'brace') {
      ctx.strokeStyle = `rgba(159,211,255,${pulse})`; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 24, cy + Math.sin(a) * 24); }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(159,211,255,0.12)'; ctx.fill();
    } else {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 28);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, st.color + '33'); g.addColorStop(1, st.color + '00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = st.color; ctx.globalAlpha = pulse; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  drawAim(ctx, u, overlay) {
    const team = this.teams[this.turnTeam], wid0 = team.weapons[team.weaponIdx], wid = WEAPONS[wid0] ? wid0 : 'bazooka';
    const ang = u.aim * Math.PI / 180, dir = u.facing;
    const cx = u.x, cy = u.y - 16;
    if (WEAPONS[wid].kind === 'defense') {
      // preview the defense instead of a crosshair
      ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(this.t * 5) * 0.2;
      if (wid === 'icewall') {
        const w = WEAPONS.icewall, x0 = dir > 0 ? u.x + w.gap : u.x - w.gap - w.wallW;
        ctx.strokeStyle = '#bfefff'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(x0, u.y - w.wallH, w.wallW, w.wallH);
      } else if (wid === 'hop') {
        const sp = this.findSafeSpot(u, u.x, WEAPONS.hop.range, true);
        if (sp) {
          ctx.strokeStyle = '#7dff6a'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.beginPath();
          const midx = (u.x + sp.x) / 2, midy = Math.min(u.y, sp.y) - 70 - Math.abs(sp.x - u.x) * 0.25;
          ctx.moveTo(u.x, u.y - 14); ctx.quadraticCurveTo(midx, midy, sp.x, sp.y - 14); ctx.stroke();
          ctx.setLineDash([]); ctx.beginPath(); ctx.arc(sp.x, sp.y - 14, 10, 0, Math.PI * 2); ctx.stroke();
        }
      } else this.drawDefIcon(ctx, wid, cx, cy - 46, 9);
      ctx.restore();
      return;
    }
    // launcher / held weapon (the 3D renderer models its own)
    if (!overlay || overlay === 'body') {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(dir, 1); ctx.rotate(-ang);
    if (WEAPONS[wid].kind === 'impact') {
      ctx.fillStyle = wid === 'moon' ? '#d9d9d9' : wid === 'rug' ? '#b3243b' : wid === 'fish' ? '#7fc8ea' : '#4d5a66';
      ctx.fillRect(-4, -3.5, 22, 7); ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.strokeRect(-4, -3.5, 22, 7);
      ctx.fillStyle = '#222'; ctx.fillRect(16, -4.5, 3, 9);
    } else {
      ctx.fillStyle = wid === 'fly' ? '#1b1b1b' : '#3f6b2a'; ctx.beginPath(); ctx.arc(12, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    }
    // crosshair
    const hx = cx + Math.cos(ang) * dir * 62, hy = cy - Math.sin(ang) * 62;
    ctx.strokeStyle = team.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.moveTo(hx - 11, hy); ctx.lineTo(hx - 4, hy); ctx.moveTo(hx + 4, hy); ctx.lineTo(hx + 11, hy);
    ctx.moveTo(hx, hy - 11); ctx.lineTo(hx, hy - 4); ctx.moveTo(hx, hy + 4); ctx.lineTo(hx, hy + 11); ctx.stroke();
    if (this.drawAimExtras && (!overlay || overlay === 'aim')) this.drawAimExtras(ctx, u, wid, cx, cy); // laser sight / Moon Scope path
    // charge dots along the aim line
    if (this.charging) {
      const nd = Math.ceil(this.power * 12);
      for (let i = 0; i < nd; i++) {
        const d = 20 + i * 5.5, f = i / 12;
        ctx.fillStyle = `rgb(255,${Math.round(230 - f * 200)},${Math.round(60 - f * 40)})`;
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * dir * d, cy - Math.sin(ang) * d, 2 + f * 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawParticles(ctx, cam, vw) {
    const x0 = cam == null ? -1e9 : cam - 200, x1 = cam == null ? 1e9 : cam + vw + 200;
    for (const p of this.particles) {
      if (p.x < x0 || p.x > x1) continue;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 'flash') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, `rgba(255,255,230,${a})`); g.addColorStop(0.4, `rgba(255,200,80,${a * 0.8})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'ring') {
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.15 - a * 0.7), 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = p.type === 'smoke' ? a * 0.8 : Math.min(1, a * 1.5);
        ctx.fillStyle = p.color;
        if (p.type === 'debris') ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.type === 'spark' || p.type === 'fire' ? a : 1), 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  }

  drawTexts(ctx, list) {
    ctx.textAlign = 'center';
    for (const t of list || this.texts) {
      const a = clamp(t.life / t.max * 1.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `bold ${t.size}px ${t.font || FONT}`;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  panel(ctx, x, y, w, h, border) {
    ctx.fillStyle = 'rgba(14,10,40,0.78)'; this.rr(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = border || 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  }

  drawHUD(ctx) {
    const team = this.teams[this.turnTeam], u = this.cur;
    if (!team || !u) return;
    ctx.textBaseline = 'alphabetic';
    // current team / unit
    this.panel(ctx, 12, 10, 290, 60, team.color);
    ctx.fillStyle = team.color; ctx.globalAlpha = 0.25; this.rr(ctx, 18, 16, 48, 48, 8); ctx.fill(); ctx.globalAlpha = 1;
    drawMascot(ctx, (this.cur && this.cur.char) || 'DOGE', 42, 60, 1, 1.05, this.t);
    ctx.textAlign = 'left';
    const title = team.player ? `${team.name} — ${team.player}` : team.name;
    let fs = 22; ctx.font = `bold ${fs}px ${FONT}`;
    const maxW = team.controller !== 'human' ? 120 : 160;
    while (fs > 12 && ctx.measureText(title).width > maxW) ctx.font = `bold ${--fs}px ${FONT}`;
    ctx.fillStyle = team.color; ctx.fillText(title, 76, 36);
    ctx.fillStyle = '#fff'; ctx.font = `bold 15px ${FONT}`; ctx.fillText(u.name, 76, 58);
    ctx.fillStyle = '#ccc'; ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(`HP ${u.hp}`, 292, 36);
    ctx.fillText(`Round ${this.round || 1}`, 292, 58);
    if (u.def) { this.drawDefIcon(ctx, u.def.type, 236, 52, 6); }
    if (team.controller !== 'human') {
      ctx.textAlign = 'left'; ctx.font = `bold 11px ${FONT}`;
      const tag = 'CPU ' + CPU_LEVEL[team.controller].toUpperCase(), tw = ctx.measureText(tag).width + 10;
      const nx = 76 + (ctx.font = `bold 22px ${FONT}`, ctx.measureText(title).width) + 8;
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillStyle = '#ffd84a'; this.rr(ctx, nx, 21, tw, 16, 5); ctx.fill();
      ctx.fillStyle = '#1a1030'; ctx.fillText(tag, nx + 5, 33);
    }

    // team totals
    let ty = 80;
    for (const tm of this.teams) {
      const hp = tm.units.reduce((s, x) => s + (x.dead ? 0 : x.hp), 0);
      ctx.fillStyle = 'rgba(14,10,40,0.6)'; this.rr(ctx, 12, ty, 240, 18, 6); ctx.fill();
      ctx.fillStyle = tm.color; ctx.globalAlpha = tm.alive() ? 1 : 0.35;
      this.rr(ctx, 66, ty + 4, Math.max(0, 100 * hp / (tm.units.length * 100)), 10, 4); ctx.fill();
      ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(tm.name, 18, ty + 13);
      ctx.globalAlpha = 1;
      ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = '#cfc8f0'; ctx.textAlign = 'right';
      ctx.textAlign = 'left';
      ctx.fillText(`${tm.units.filter(x => !x.dead).length}/${tm.units.length}` + (tm.controller !== 'human' ? ' · CPU ' + tm.controller.toUpperCase() : ' · ' + (tm.player || 'HUMAN').slice(0, 10)), 172, ty + 13);
      if (!tm.alive()) { ctx.fillStyle = '#ff6b6b'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('NGMI', 100, ty + 13); }
      ty += 21;
    }
    // round queue: who is still to play this round, in order
    if (this.state === 'play') {
      const q = this.roundQueue(); ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(14,10,40,0.6)'; this.rr(ctx, 12, ty, 290, 20, 6); ctx.fill();
      ctx.fillStyle = '#ffd84a'; ctx.fillText(q.length ? `R${this.round} NEXT` : `R${this.round} LAST`, 18, ty + 14);
      let qx = 72;
      if (!q.length) { ctx.fillStyle = '#cfc8f0'; ctx.fillText('new round after this turn', qx, ty + 14); }
      for (let k = 0; k < q.length; k++) {
        const nm = q[k].name.length > 9 ? q[k].name.slice(0, 8) + '…' : q[k].name, w = ctx.measureText(nm).width + 8;
        if (qx + w > 296) { ctx.fillStyle = '#cfc8f0'; ctx.fillText(`+${q.length - k}`, qx, ty + 14); break; }
        ctx.fillStyle = q[k].team.color; this.rr(ctx, qx, ty + 4, w, 13, 4); ctx.fill();
        ctx.fillStyle = q[k].team.dark || '#000'; ctx.fillText(nm, qx + 4, ty + 14); qx += w + 3;
      }
      ty += 23;
    }

    // timer
    const tx = W / 2;
    this.panel(ctx, tx - 44, 10, 88, 56, this.phase === 'aim' && this.timer <= 10 ? '#ff4b4b' : null);
    ctx.textAlign = 'center';
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = this.phase === 'aim' ? (this.timer <= 10 ? '#ff6b6b' : '#fff') : '#888';
    ctx.fillText(this.phase === 'aim' ? Math.ceil(this.timer) : '--', tx, 50);
    ctx.font = `bold 10px ${FONT}`; ctx.fillStyle = '#aaa'; ctx.fillText('TURN TIME', tx, 63);

    // wind
    const wx = W - 232;
    this.panel(ctx, wx, 10, 220, 56);
    ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('WIND', wx + 12, 28);
    ctx.textAlign = 'right'; ctx.fillText((this.wind > 0 ? '→ ' : this.wind < 0 ? '← ' : '') + Math.abs(Math.round(this.wind * 100)) + '%', wx + 208, 28);
    const bx = wx + 110, by = 46;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; this.rr(ctx, wx + 12, by - 6, 196, 12, 6); ctx.fill();
    const wl = clamp(this.wind, -1.3, 1.3) * 72;
    ctx.fillStyle = this.wind >= 0 ? '#7dd3fc' : '#fda4af';
    ctx.fillRect(Math.min(bx, bx + wl), by - 4, Math.abs(wl), 8);
    if (Math.abs(wl) > 2) {
      const s = Math.sign(wl);
      ctx.beginPath(); ctx.moveTo(bx + wl + s * 9, by); ctx.lineTo(bx + wl, by - 7); ctx.lineTo(bx + wl, by + 7); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(bx - 1, by - 8, 2, 16);

    // weapons + angle + power (bottom)
    const slotW = 152, n = Math.min(team.weapons.length, BASE_SLOTS), pw = n * slotW + 262;
    const px = (W - pw) / 2, py = H - 62;
    this.panel(ctx, px, py, pw, 54);
    const selW = WEAPONS[team.weapons[team.weaponIdx]] || WEAPONS.bazooka;
    team.weapons.slice(0, BASE_SLOTS).forEach((wid, i) => {
      const w = WEAPONS[wid], sx = px + 8 + i * slotW, sel = i === team.weaponIdx, ok = this.hasAmmo(team, wid);
      const isDef = w.kind === 'defense';
      ctx.fillStyle = sel ? team.color : isDef ? 'rgba(120,190,255,0.14)' : 'rgba(255,140,90,0.13)';
      ctx.globalAlpha = sel ? 0.92 : 1; this.rr(ctx, sx, py + 7, slotW - 8, 40, 8); ctx.fill(); ctx.globalAlpha = 1;
      if (w.special) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.textAlign = 'left'; ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = sel ? '#120a2a' : ok ? '#fff' : '#777';
      ctx.fillText(`${i + 1} ${w.name}`, sx + 7, py + 24);
      if (isDef) this.drawDefIcon(ctx, wid, sx + slotW - 20, py + 19, 6);
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillStyle = sel ? '#2a1a40' : ok ? '#bbb' : '#666';
      const kindTxt = isDef ? (w.special ? '★ special defense' : 'basic defense') : (w.special ? '★ special attack' : 'basic attack');
      ctx.fillText(`${kindTxt} · ${w.special ? team.ammo[wid] + ' left' : '∞'}`, sx + 7, py + 40);
    });
    const ax = px + n * slotW + 10;
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `bold 13px ${FONT}`;
    if (selW.kind === 'defense') {
      ctx.fillStyle = '#8ff5b5'; ctx.fillText('DEFENSE MOVE', ax, py + 24);
      ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${FONT}`;
      ctx.fillText(this.isBotTurn() ? 'bot is deciding...' : 'Press SPACE to use (ends turn)', ax, py + 42);
    } else {
      ctx.fillText(`ANGLE ${Math.round(u.aim)}°`, ax, py + 24);
      const jc = this.jumpCharge;
      ctx.fillText(jc ? (jc.back ? 'BACKFLIP' : 'JUMP') : 'POWER', ax + 104, py + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; this.rr(ctx, ax, py + 32, 240, 12, 6); ctx.fill();
      const pv = this.charging ? this.power : (this.phase === 'fire' ? this.firedPower || 0 : 0);
      if (jc) { // jump charge (hold ENTER / BACKSPACE)
        const g = ctx.createLinearGradient(ax, 0, ax + 240, 0);
        g.addColorStop(0, '#7fd8ff'); g.addColorStop(1, '#b06bff');
        ctx.fillStyle = g; this.rr(ctx, ax, py + 32, Math.max(12, 240 * jc.p), 12, 6); ctx.fill();
      } else if (pv > 0) {
        const g = ctx.createLinearGradient(ax, 0, ax + 240, 0);
        g.addColorStop(0, '#4ade80'); g.addColorStop(0.6, '#ffd84a'); g.addColorStop(1, '#ff4b4b');
        ctx.fillStyle = g; this.rr(ctx, ax, py + 32, Math.max(12, 240 * pv), 12, 6); ctx.fill();
      }
    }
    if (this.jumpsLeft != null) { // ONE charged jump per turn: READY / USED chip
      const ready = this.jumpsLeft > 0, jx = ax + 176;
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillStyle = ready ? 'rgba(143,245,181,0.2)' : 'rgba(255,255,255,0.08)'; this.rr(ctx, jx, py + 12, 64, 16, 8); ctx.fill();
      ctx.strokeStyle = ready ? '#8ff5b5' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = ready ? '#8ff5b5' : 'rgba(255,255,255,0.4)'; ctx.fillText(ready ? 'JUMP READY' : 'JUMP USED', jx + 5, py + 24);
    }
    if (this.walkLeft != null) { // walk budget meter (STEPS), just above the JUMP chip
      const f = clamp(this.walkLeft / WALK_BUDGET, 0, 1), sx = ax + 96, sy = py - 17;
      ctx.fillStyle = 'rgba(14,10,40,0.7)'; this.rr(ctx, sx - 4, sy - 3, 152, 16, 7); ctx.fill();
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = f > 0 ? '#ffd84a' : '#ff8a8a'; ctx.fillText(f > 0 ? 'STEPS' : 'NO STEPS', sx, sy + 9);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; this.rr(ctx, sx + 52, sy + 1, 90, 8, 4); ctx.fill();
      if (f > 0) { ctx.fillStyle = f > 0.3 ? '#ffd84a' : '#ff9a4a'; this.rr(ctx, sx + 52, sy + 1, Math.max(6, 90 * f), 8, 4); ctx.fill(); }
    }
    const rowH = this.drawItemRow ? this.drawItemRow(ctx, team, px, py - (this.walkLeft != null ? 6 : 0)) : 0;
    ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const desc = (WEAPONS[team.weapons[team.weaponIdx]] || {}).desc || '', dy = py - 7 - (rowH ? rowH + 6 : 0);
    ctx.strokeText(desc, px + 10, dy); ctx.fillStyle = '#e8e2ff'; ctx.fillText(desc, px + 10, dy);
    if (u.scope > 0 || u.fud || u.poison) { // active crate effects on the current character
      const tags = [u.scope > 0 ? `MOON SCOPE ×${u.scope}` : '', u.fud ? 'FUD (-40% next attack)' : '', u.poison ? `GAS FEE ${u.poison.turns}×-${u.poison.dmg}` : ''].filter(Boolean).join('  ·  ');
      ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'right'; ctx.strokeText(tags, px + pw - 10, dy); ctx.fillStyle = '#ffd84a'; ctx.fillText(tags, px + pw - 10, dy);
    }

    // help hint
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `bold 12px ${FONT}`;
    if (!(window.TouchUI && TouchUI.on)) ctx.fillText('hold ENTER: jump (BKSP flip, 1/turn) · H help · M mute · P pause · A/D, drag, edge: pan · wheel/+/-: zoom · C', W - 14, 152); // keyboard hint (not on touch)
    ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = this.world.color; ctx.fillText('WORLD: ' + this.world.name, W - 14, 84);
    if (Math.abs(this.zoom - 1) > 0.02) { ctx.fillStyle = '#fff'; ctx.fillText(`ZOOM ${Math.round(this.zoom * 100)}%  (0 resets)`, W - 14, 100); }
    if (this.WW > W) this.drawMinimap(ctx);
    if (this.userPaused) {
      ctx.textAlign = 'center'; ctx.font = `bold 48px ${FONT}`; ctx.lineWidth = 6; ctx.strokeStyle = '#000';
      ctx.strokeText('PAUSED', W / 2, H / 2); ctx.fillStyle = '#fff'; ctx.fillText('PAUSED', W / 2, H / 2);
    }

    // banner
    if (this.banner) {
      const a = clamp(this.banner.t / 0.5, 0, 1);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.font = `bold 44px ${FONT}`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const by0 = this.WW > W ? 172 : 140;
      ctx.strokeText(this.banner.text, W / 2, by0); ctx.fillStyle = this.banner.color; ctx.fillText(this.banner.text, W / 2, by0);
      ctx.font = `bold 22px ${FONT}`; ctx.strokeText(this.banner.sub, W / 2, by0 + 32); ctx.fillStyle = '#fff'; ctx.fillText(this.banner.sub, W / 2, by0 + 32);
      if (this.banner.world) { // world name (big "welcome" line on the first turn)
        const wt = this.banner.first ? `Welcome to ${this.banner.world}` : this.banner.world;
        ctx.font = `bold ${this.banner.first ? 20 : 15}px ${FONT}`; ctx.lineWidth = 5;
        ctx.strokeText(wt, W / 2, by0 + (this.banner.first ? 60 : 56)); ctx.fillStyle = this.banner.wcol; ctx.fillText(wt, W / 2, by0 + (this.banner.first ? 60 : 56));
        if (this.banner.first && this.world.twist && this.worldId !== 'classic') { ctx.font = `bold 13px ${FONT}`; ctx.lineWidth = 4; ctx.strokeText(this.world.twist, W / 2, by0 + 80); ctx.fillStyle = '#e8e2ff'; ctx.fillText(this.world.twist, W / 2, by0 + 80); }
      }
      ctx.globalAlpha = 1;
    }
    if (this.bigQuip) {
      const q = this.bigQuip, k = 1 - q.t / q.max, a = clamp(q.t / 0.5, 0, 1);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 230); ctx.rotate(-0.06); ctx.scale(1 + Math.min(k * 6, 1) * 0.3, 1 + Math.min(k * 6, 1) * 0.3);
      ctx.textAlign = 'center'; ctx.font = `900 54px ${FONT}`; ctx.lineWidth = 8; ctx.strokeStyle = '#000';
      ctx.strokeText(q.text.toUpperCase(), 0, 0); ctx.fillStyle = '#ffd84a'; ctx.fillText(q.text.toUpperCase(), 0, 0);
      ctx.restore();
    }
    if (this.toastMsg) {
      ctx.textAlign = 'center'; ctx.font = `bold 18px ${FONT}`; ctx.fillStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeStyle = '#000';
      ctx.strokeText(this.toastMsg.text, W / 2, H - 80); ctx.fillText(this.toastMsg.text, W / 2, H - 80);
    }
    if (this.showHelp) this.drawHelp(ctx);
  }

  // minimap: terrain (cached, re-rendered when the terrain changes), team-coloured unit dots, shots and the
  // camera viewport. Click or drag on it to move the camera there.
  drawMinimap(ctx) {
    const R = this.minimapRect(), mx = R.x, my = R.y, mw = R.w, mh = R.h, sx = mw / this.WW, sy = mh / H, T = this.terrain;
    const mm = this._mm || (this._mm = { c: document.createElement('canvas'), rev: -1, walls: -1, t: -9, T: null });
    if (mm.T !== T || ((mm.rev !== T.rev || mm.walls !== T.walls.length) && this.t - mm.t > 0.25)) {
      mm.c.width = mw; mm.c.height = mh; const g = mm.c.getContext('2d');
      g.clearRect(0, 0, mw, mh); g.drawImage(T.canvas, 0, 0, T.w, H, 0, 0, mw, mh);
      g.fillStyle = 'rgba(200,240,255,0.9)'; for (const w of T.walls) g.fillRect(w.x * sx, w.y * sy, Math.max(1, w.w * sx), w.h * sy);
      g.fillStyle = this.world.water.mini; g.fillRect(0, WATER_Y * sy, mw, mh - WATER_Y * sy);
      mm.rev = T.rev; mm.walls = T.walls.length; mm.t = this.t; mm.T = T;
    }
    ctx.fillStyle = 'rgba(14,10,40,0.72)'; this.rr(ctx, mx - 3, my - 3, mw + 6, mh + 6, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.drawImage(mm.c, mx, my);
    for (const u of this.units) {
      if (u.dead) continue;
      const c = u === this.cur, d = c ? 6 : 4.5, x = mx + u.x * sx, y = my + (u.y - 10) * sy;
      ctx.fillStyle = '#000'; ctx.fillRect(x - d / 2 - 1, y - d / 2 - 1, d + 2, d + 2);
      ctx.fillStyle = u.team.color; ctx.fillRect(x - d / 2, y - d / 2, d, d);
      if (c) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x - d / 2 - 2, y - d / 2 - 2, d + 4, d + 4); }
    }
    for (const p of this.projectiles) { ctx.fillStyle = '#fff'; ctx.fillRect(mx + p.x * sx - 1.5, my + p.y * sy - 1.5, 3, 3); }
    for (const c of this.crates || []) { const x = mx + c.x * sx, y = my + Math.max(0, c.y - 8) * sy; ctx.fillStyle = '#000'; ctx.fillRect(x - 3.5, y - 3.5, 7, 7); ctx.fillStyle = c.para ? '#ff5fa2' : '#ffd84a'; ctx.fillRect(x - 2.5, y - 2.5, 5, 5); }
    let v0, v1, y0 = 0, y1 = H;
    if (this.r3d && this.r3d.active) { const vr = this.r3d.viewRange(); v0 = vr[0]; v1 = vr[0] + vr[1]; }
    else { v0 = this.camX; v1 = this.camX + this.viewW(); y0 = Math.max(0, this.camY); y1 = Math.min(H, this.camY + this.viewH()); }
    v0 = clamp(v0, 0, this.WW); v1 = clamp(v1, 0, this.WW);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(mx + v0 * sx, my + y0 * sy, Math.max(4, (v1 - v0) * sx), Math.max(4, (y1 - y0) * sy));
  }

  // Step the game without rendering (used by headless tests / sims).
  runSim(maxSeconds, maxTurns, dt) {
    dt = dt || 1 / 60;
    const end = this.t + maxSeconds;
    while (this.state === 'play' && this.t < end && (!maxTurns || this.turnCount <= maxTurns)) this.update(dt);
    return { state: this.state, turns: this.turnCount, t: this.t };
  }

  drawHelp(ctx) {
    const w = 700, h = 490, x = (W - w) / 2, y = 130; // DOM close controls (#helpCtl) sit over the bottom strip
    this.panel(ctx, x, y, w, h, '#ffd84a');
    ctx.fillStyle = 'rgba(255,216,74,0.12)'; ctx.fillRect(x + 6, y + h - 52, w - 12, 46);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffd84a'; ctx.font = `bold 24px ${FONT}`; ctx.fillText('HOW TO NOT GET REKT', W / 2, y + 36);
    const rows = window.TouchUI && TouchUI.on ? [ // touch devices (js/touch.js); the desktop rows below are unchanged
      ['◀ ▶ (hold)', 'Walk · STEPS meter = ~5 s of walking per turn'], ['AIM pad ▲ ▼', 'Aim angle: hold or slide up / down'], ['Hold FIRE', 'Charge power — release to fire'],
      ['Hold JUMP', 'Charge a jump: tap = hop, hold ~1 s = big jump (1/turn)'], ['Hold FLIP', 'Charged backflip (higher, slightly back)'], ['ARMS · tap weapon bar', 'Pick an attack, defense or crate item'], ['Defense picked', 'FIRE uses it (lasts until your team\'s next turn)'],
      ['1-finger drag on map', 'Pan camera · ◎ recenters'],
      ['Pinch', 'Zoom in / out · tap the minimap to look there'],
      ['⏸ · ? · 💬 · 3D/2D · ⛶', 'Menu / pause · help · chat (online) · view · full screen'],
    ] : [
      ['← →', 'Walk'], ['↑ ↓', 'Aim angle'], ['Hold SPACE', 'Charge power — release to fire'],
      ['Hold ENTER', 'Charge a jump: tap = hop, hold ~1 s = big jump (1/turn)'], ['Hold BACKSPACE', 'Charged backflip (higher, slightly back)'], ['1 2 3  /  Q E', 'Attacks: Bazooka, Grenade, ★ special'], ['4 5', 'Defenses: Brace, ★ special — SPACE to use'],
      ['A D · drag · screen edge', 'Pan camera (← → ↑ ↓ too when not aiming) · C recenters'],
      ['Wheel  /  + −  /  0', 'Zoom in / out / reset · click the minimap to look there'],
      ['P · H · M', 'Pause · this help · mute'], ['V', 'Toggle 3D / classic 2D view'],
    ];
    ctx.font = `bold 15px ${FONT}`;
    rows.forEach(([k, d], i) => {
      const ry = y + 68 + i * 23;
      ctx.textAlign = 'right'; ctx.fillStyle = '#8ff5b5'; ctx.fillText(k, x + 250, ry);
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(d, x + 270, ry);
    });
    const ht = this.teams[this.turnTeam];
    if (ht) {
      ctx.textAlign = 'center'; ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = ht.color;
      const cd = (this.cur && this.cur.def0) || TEAM_DEFS[0], sa = WEAPONS[cd.sig], sd = WEAPONS[cd.sigDef];
      ctx.fillText(`${cd.name} ★ ${sa.name} (3, attack, ${sa.ammo} uses per unit): ${sa.desc}`, W / 2, y + 335);
      ctx.fillText(`${cd.name} ★ ${sd.name} (5, defense, ${sd.ammo} uses per unit): ${sd.desc}`, W / 2, y + 355);
      ctx.fillStyle = '#9fd3ff'; ctx.fillText(`Shared: Bazooka (1) · Grenade (2) · Brace (4, -40% dmg / -60% knockback) — unlimited`, W / 2, y + 375);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#c9c2ea'; ctx.font = `13px ${FONT}`;
    ctx.fillText('Per turn: walk ~5 s (STEPS meter) + 1 charged jump (half fall dmg), then ATTACK or DEFEND.', W / 2, y + 399);
    ctx.fillText('Rounds: every character gets ONE turn per round; teams alternate, a bigger team plays its extra characters last.', W / 2, y + 419);
    ctx.fillText('2 supply crates drop every round: walk into one for a memecoin item (CRATE ITEMS row). Water = ngmi.', W / 2, y + 437);
  }
}
