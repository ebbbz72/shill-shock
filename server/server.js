'use strict';
// Shill Shock online server: serves the static game over HTTP and hosts lobbies over WebSocket on the SAME port.
//   cd server && npm install && npm start      (PORT env var, default 8080)
// Netcode model (see ../DEPLOY.md / README): the host player's browser runs the real simulation (and the bots);
// this server only keeps the lobby, relays the active player's inputs to the host, and fans out the host's
// snapshots/events to everyone else. It also remembers the terrain-edit log so people can rejoin mid-game,
// and migrates the host if the host drops.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8080;
const ROOT = path.resolve(__dirname, '..');
const MAX_PLAYERS = 12;                 // real people per room (2 teams x up to 6)
const MIN_SIZE = 2, MAX_SIZE = 6;       // units per team; the two teams may differ (e.g. 6 vs 3)
const CHARS = ['DOGE', 'FROG', 'PENGU', 'PILL'];
const LEVELS = ['easy', 'medium', 'hard', 'pro'];
const WORLDS = ['random', 'moon', 'swamp', 'arctic', 'pump', 'classic'];
const THEMED = ['moon', 'swamp', 'arctic', 'pump'];
const TURN_TIMES = [15, 30, 45, 60, 90];
const ROOM_TTL_MS = 10 * 60 * 1000;     // empty rooms are kept this long (so people can rejoin)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------------- static files ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const ALLOWED = /^(index\.html|style\.css|README\.md|MOVES\.md|DEPLOY\.md|manifest\.webmanifest|icons\/[A-Za-z0-9_\-]+\.png|js\/[A-Za-z0-9_\-\/.]+\.js)$/;
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end('bad request'); return; }
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok ' + rooms.size + ' rooms'); return; }
  if (p === '/' || p === '') p = '/index.html';
  const rel = p.replace(/^\/+/, '');
  if (!ALLOWED.test(rel) || rel.includes('..')) { res.writeHead(404); res.end('not found'); return; }
  const file = path.join(ROOT, rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': rel === 'index.html' || rel === 'manifest.webmanifest' ? 'no-cache' : 'public, max-age=300' });
    res.end(data);
  });
});

// ---------------- rooms ----------------
const TEAM_NAMES = ['Team 1', 'Team 2'];
const rooms = new Map(); // code -> room
const rid = n => crypto.randomBytes(n).toString('hex');
function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);

function makeRoom() {
  const code = newCode();
  const room = {
    code, hostPid: null, players: [], inGame: false, start: null, ops: [], snap: null, chat: [], emptySince: null,
    L: { numTeams: 2, sizes: [3, 3], teamSize: 3, world: 'random', turnTime: 45, teams: [0, 1].map(ti => ({ cpu: [0, 1, 2, 3, 4, 5].map(() => 'medium'), cpuChar: [0, 1, 2, 3, 4, 5].map(i => CHARS[(i + ti * 2) % 4]) })) }, // per bot slot: level + character
  };
  rooms.set(code, room);
  return room;
}
const connected = room => room.players.filter(p => p.ws);
const humansOn = (room, ti) => room.players.filter(p => p.team === ti);
// a player can control several characters on their team (p.n, 1..team size; p.chars = one character type each)
const unitsOf = p => Math.max(1, p.n | 0 || 1);
const usedOn = (room, ti, except) => humansOn(room, ti).filter(p => p !== except).reduce((a, p) => a + unitsOf(p), 0);
function setCount(p, n) { p.n = n; p.chars = Array.from({ length: n }, (_, i) => (p.chars && p.chars[i]) || p.char || CHARS[0]); p.char = p.chars[0]; }
// the team's human slots, interleaved by owner (A1, B1, A2, B2 ...) so one player's characters don't all go back to back
function slotsOf(room, ti) {
  const hs = humansOn(room, ti), out = [], max = Math.max(0, ...hs.map(unitsOf));
  for (let k = 0; k < max; k++) for (const p of hs) if (unitsOf(p) > k) out.push({ p, k });
  return out;
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(room, msg, exceptPid) { const s = JSON.stringify(msg); for (const p of room.players) if (p.pid !== exceptPid) send(p.ws, s); }
function lobbyState(room) {
  return { t: 'lobby', code: room.code, hostPid: room.hostPid, inGame: room.inGame, maxPlayers: MAX_PLAYERS, ...room.L,
    players: room.players.map(p => ({ pid: p.pid, name: p.name, team: p.team, char: p.char, n: unitsOf(p), chars: (p.chars || [p.char]).slice(0, unitsOf(p)), ready: p.ready, connected: !!p.ws })) };
}
const pushLobby = room => broadcast(room, lobbyState(room));
function sysChat(room, text) { const m = { t: 'chat', name: '', text, sys: true }; room.chat.push(m); if (room.chat.length > 40) room.chat.shift(); broadcast(room, m); }

// team with the fewest humans that still has room (or -1 = spectator)
function autoTeam(room) {
  let best = -1, bestN = 99;
  for (let i = 0; i < room.L.numTeams; i++) { const n = humansOn(room, i).length, free = room.L.sizes[i] - usedOn(room, i); if (free > 0 && n < bestN) { best = i; bestN = n; } }
  return best;
}
// -1 = needs a team (auto-placed), -2 = spectating by choice
function fixTeams(room) { for (const p of room.players) if (p.team >= room.L.numTeams) p.team = -1; for (const p of room.players) if (p.team === -1) { setCount(p, 1); p.team = autoTeam(room); } }
// moving onto a team: keep as many of the player's characters as fit (at least 1), else refuse
function fitOn(room, p, ti) { const free = room.L.sizes[ti] - usedOn(room, ti, p); if (free < 1) return false; if (unitsOf(p) > free) setCount(p, free); return true; }

function pickHost(room) {
  const c = room.players.find(p => p.ws);
  room.hostPid = c ? c.pid : null;
}

// ---------------- lobby actions ----------------
function lobbyAction(room, p, m) {
  const L = room.L, isHost = p.pid === room.hostPid;
  if (room.inGame) return 'game in progress';
  const a = m.a;
  // mixed teams: every unit has its own character; duplicates allowed, on either team
  // character of one of a player's units: { char, i = unit index, pid = (host only) someone else's }
  const target = m.pid && m.pid !== p.pid ? (isHost ? room.players.find(q => q.pid === m.pid) : null) : p;
  if (a === 'pick') { const ch = String(m.char); if (!CHARS.includes(ch)) return 'bad character'; if (!target) return 'only the host can change that';
    const i = Math.max(0, Math.min(unitsOf(target) - 1, m.i | 0)); setCount(target, unitsOf(target)); target.chars[i] = ch; target.char = target.chars[0]; return null; }
  if (a === 'count') { // how many characters a player controls (own slot, or the host for anyone)
    if (!target) return 'only the host can change that';
    const ti = target.team; if (ti < 0 || ti >= L.numTeams) return 'join a team first';
    const n = Math.max(1, Math.min(L.sizes[ti], m.v | 0)); if (usedOn(room, ti, target) + n > L.sizes[ti]) return `${TEAM_NAMES[ti]} has room for ${L.sizes[ti] - usedOn(room, ti, target)} more`;
    setCount(target, n); target.ready = false; return null;
  }
  if (a === 'join') { // a player joins either team (any character), if it has room
    const ti = m.team | 0; if (ti < 0 || ti >= L.numTeams) return 'bad team';
    if (p.team !== ti && !fitOn(room, p, ti)) return 'that team is full';
    p.team = ti; p.ready = false; return null;
  }
  if (!isHost) return 'only the host can change that';
  if (a === 'teams') return 'Shill Shock is always 2 teams';
  if (a === 'size') { // units on one team (2-6); { team, v }; without team: both teams
    const s = Math.max(MIN_SIZE, Math.min(MAX_SIZE, m.v | 0)), which = m.team === 0 || m.team === 1 ? [m.team] : [0, 1];
    for (const i of which) if (usedOn(room, i) > s) return `team ${i + 1} has more than ${s} player characters`;
    for (const i of which) L.sizes[i] = s;
    L.teamSize = Math.max(...L.sizes); fixTeams(room); return null;
  }
  if (a === 'world') { if (!WORLDS.includes(m.v)) return 'bad world'; L.world = m.v; return null; }
  if (a === 'turn') { const v = m.v | 0; if (!TURN_TIMES.includes(v)) return 'bad turn time'; L.turnTime = v; return null; }
  if (a === 'botchar') { // host sets the character of one bot slot
    const ti = m.team | 0, si = m.slot | 0, ch = String(m.char); if (ti < 0 || ti >= L.numTeams || si < 0 || si >= MAX_SIZE || !CHARS.includes(ch)) return 'bad';
    L.teams[ti].cpuChar[si] = ch; return null;
  }
  if (a === 'botchars') { // host: 'All same' (char) or 'Randomize' (char = 'random') for a team's bot slots
    const ti = m.team | 0, ch = String(m.char); if (ti < 0 || ti >= L.numTeams || !(CHARS.includes(ch) || ch === 'random')) return 'bad';
    L.teams[ti].cpuChar = L.teams[ti].cpuChar.map(() => ch === 'random' ? CHARS[crypto.randomInt(CHARS.length)] : ch); return null;
  }
  if (a === 'move') { // host moves a player to a team (-2 = spectator)
    const x = room.players.find(q => q.pid === m.pid), ti = m.team | 0; if (!x) return 'no such player';
    if (ti === -2) { x.team = -2; x.ready = false; return null; }
    if (ti < 0 || ti >= L.numTeams) return 'bad team';
    if (x.team !== ti && !fitOn(room, x, ti)) return 'that team is full';
    x.team = ti; x.ready = false; return null;
  }
  if (a === 'cpu') { // host sets the bot difficulty of an empty slot
    const ti = m.team | 0, si = m.slot | 0; if (ti < 0 || ti >= L.numTeams || si < 0 || si >= MAX_SIZE || !LEVELS.includes(m.v)) return 'bad';
    L.teams[ti].cpu[si] = m.v; return null;
  }
  if (a === 'kick') {
    const x = room.players.find(q => q.pid === m.pid); if (!x || x === p) return 'bad';
    send(x.ws, { t: 'kicked' }); if (x.ws) x.ws.close(); room.players = room.players.filter(q => q !== x);
    sysChat(room, `${x.name} was removed by the host`); return null;
  }
  return 'unknown action';
}

function startCheck(room) {
  const L = room.L, humans = room.players.filter(p => p.team >= 0 && p.team < L.numTeams);
  if (!humans.length) return 'need at least one player on a team';
  const notReady = humans.filter(p => p.pid !== room.hostPid && p.ws && !p.ready);
  if (notReady.length) return 'waiting for ' + notReady.map(p => p.name).join(', ') + ' to be ready';
  if (humans.some(p => !p.ws)) return 'a player is disconnected';
  return null;
}
function buildStart(room) {
  const L = room.L, teams = L.teams.slice(0, L.numTeams);
  const world = L.world === 'random' ? THEMED[crypto.randomInt(THEMED.length)] : L.world;
  const slots = teams.map((t, ti) => slotsOf(room, ti));
  const units = teams.map((t, ti) => Array.from({ length: L.sizes[ti] }, (_, i) => { const s = slots[ti][i];
    return s ? Object.assign({ ctrl: 'human', player: s.p.name, pid: s.p.pid }, unitsOf(s.p) > 1 ? { num: s.k + 1 } : {}) : { ctrl: t.cpu[i] || 'medium' }; }));
  const chars = teams.map((t, ti) => Array.from({ length: L.sizes[ti] }, (_, i) => { const s = slots[ti][i]; return s ? ((s.p.chars && s.p.chars[s.k]) || s.p.char) : t.cpuChar[i]; }));
  return {
    seed: crypto.randomInt(1e9), world, teamSize: L.teamSize, teamSizes: L.sizes.slice(), turnTime: L.turnTime, teamIds: chars.map(c => c[0]), chars,
    controllers: units.map(us => us.some(u => u.ctrl === 'human') ? 'human' : us[0].ctrl), units, gameId: rid(4),
  };
}

// ---------------- websocket ----------------
const wss = new WebSocketServer({ server, maxPayload: 512 * 1024, perMessageDeflate: false }); // no compression: small frames, no zlib delay
function mergeSnap(base, d) { if (!d || !d.d) return d; if (!base) return null; const out = Object.assign({}, base, d); delete out.d; out.U = base.U.slice(); for (const k in d.U) out.U[+k] = d.U[k]; return out; }
wss.on('connection', (ws, req) => {
  if (req && req.socket && req.socket.setNoDelay) req.socket.setNoDelay(true); // no Nagle batching
  let room = null, me = null, budget = 400;
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  const tick = setInterval(() => { budget = 400; }, 1000);
  const err = msg => send(ws, { t: 'error', msg });

  ws.on('message', (data) => {
    if (--budget < 0) return; // flood guard
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      if (me) return;
      const name = cleanName(m.name);
      if (!name) { err('enter a name'); return; }
      if (m.a === 'create') {
        room = makeRoom();
      } else {
        room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) { err('no lobby with that code'); return; }
      }
      // rejoin: same name (or same token) as a disconnected player reclaims their slot
      const lname = name.toLowerCase();
      let p = room.players.find(x => !x.ws && ((m.token && x.token === m.token) || x.name.toLowerCase() === lname));
      if (!p && room.players.some(x => x.ws && x.name.toLowerCase() === lname)) { err('that name is taken in this lobby'); room = null; return; }
      if (p) { p.ws = ws; p.name = p.name || name; }
      else {
        if (room.players.length >= MAX_PLAYERS) {
          // free a slot held by someone who left before the game started
          const gone = !room.inGame && room.players.find(x => !x.ws);
          if (gone) room.players = room.players.filter(x => x !== gone);
          else { err(`lobby is full (${MAX_PLAYERS} players)`); room = null; return; }
        }
        p = { pid: rid(4), token: rid(12), name, ws, team: -1, ready: false, char: CHARS[crypto.randomInt(CHARS.length)], n: 1 }; p.chars = [p.char];
        room.players.push(p);
        p.team = room.inGame ? -2 : autoTeam(room); // mid-game newcomers spectate until the next game
      }
      me = p; room.emptySince = null;
      if (!room.hostPid || !room.players.some(x => x.pid === room.hostPid && x.ws)) {
        const hadHost = !!room.hostPid; room.hostPid = p.pid;
        if (hadHost) broadcast(room, { t: 'host', pid: p.pid });
      }
      send(ws, { t: 'welcome', pid: p.pid, token: p.token, code: room.code, name: p.name });
      for (const c of room.chat.slice(-20)) send(ws, c);
      pushLobby(room);
      sysChat(room, `${p.name} ${m.a === 'create' ? 'created the lobby' : 'joined'}`);
      if (room.inGame && room.start) {
        send(ws, { t: 'gamestart', start: room.start, ops: room.ops, snap: room.snap, hostPid: room.hostPid, rejoin: true });
        broadcast(room, { t: 'presence', pid: p.pid, name: p.name, connected: true }, p.pid);
      }
      return;
    }
    if (!me || !room) return;

    switch (m.t) {
      case 'lobby': { const e = lobbyAction(room, me, m); if (e) err(e); pushLobby(room); break; }
      case 'ready': if (!room.inGame) { me.ready = !!m.v; pushLobby(room); } break;
      case 'start': {
        if (me.pid !== room.hostPid || room.inGame) return;
        const e = startCheck(room); if (e) { err(e); return; }
        room.start = buildStart(room); room.ops = []; room.snap = null; room.inGame = true;
        broadcast(room, { t: 'gamestart', start: room.start, ops: [], snap: null, hostPid: room.hostPid });
        pushLobby(room);
        break;
      }
      case 'ping': send(ws, { t: 'pong', c: m.c }); break;
      case 'chat': {
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200); if (!text) return;
        const c = { t: 'chat', name: me.name, text }; room.chat.push(c); if (room.chat.length > 40) room.chat.shift(); broadcast(room, c);
        break;
      }
      case 'input': // active player's key -> host (the host checks it really is their turn)
        if (room.inGame && me.pid !== room.hostPid) { const h = room.players.find(x => x.pid === room.hostPid); const fw = { t: 'input', pid: me.pid, k: String(m.k).slice(0, 12), d: !!m.d };
          if (fw.k === 'aim') { const a = Number(m.a); if (!isFinite(a)) break; fw.a = Math.max(-90, Math.min(90, a)); fw.f = m.f === -1 ? -1 : 1; } // touch aim angle
          send(h && h.ws, fw); }
        break;
      case 'snap': // host -> everyone else
        if (!room.inGame || me.pid !== room.hostPid || m.gameId !== room.start.gameId) return;
        if (Array.isArray(m.ev)) for (const e of m.ev) if (e && e[0] === 't') room.ops.push(e);
        if (m.s && typeof m.s === 'object') room.snap = m.s.d ? (mergeSnap(room.snap, m.s) || room.snap) : m.s; // keep a full snapshot for rejoins
        broadcast(room, m, me.pid);
        break;
      case 'over':
        if (!room.inGame || me.pid !== room.hostPid) return;
        room.inGame = false; room.start = null; room.ops = []; room.snap = null;
        for (const x of room.players) { x.ready = false; if (x.team === -2) x.team = -1; }
        room.players = room.players.filter(x => x.ws); // drop people who never came back
        if (!room.players.some(x => x.pid === room.hostPid)) pickHost(room);
        fixTeams(room);
        broadcast(room, { t: 'over', winner: m.winner, digest: m.digest });
        pushLobby(room);
        break;
      case 'leave': ws.close(); break;
    }
  });

  ws.on('close', () => {
    clearInterval(tick);
    if (!me || !room) return;
    if (me.ws === ws) me.ws = null;
    me.ready = false;
    if (!room.inGame) room.players = room.players.filter(x => x !== me); // left the lobby: free the slot
    sysChat(room, `${me.name} ${room.inGame ? 'disconnected (a bot takes over; rejoin with the same name or link)' : 'left'}`);
    if (room.inGame) broadcast(room, { t: 'presence', pid: me.pid, name: me.name, connected: false });
    if (room.hostPid === me.pid) { pickHost(room); if (room.hostPid) broadcast(room, { t: 'host', pid: room.hostPid }); }
    if (!connected(room).length) room.emptySince = Date.now();
    pushLobby(room);
  });
});

// heartbeat (also keeps idle connections alive behind proxies) + room cleanup
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignore */ } }
  for (const [code, r] of rooms) if (r.emptySince && Date.now() - r.emptySince > ROOM_TTL_MS) rooms.delete(code);
}, 20000);

server.listen(PORT, () => console.log(`Shill Shock server on http://localhost:${PORT}  (WebSocket on the same port)`));
