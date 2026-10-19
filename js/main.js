'use strict';
// Pre-game flow: Title -> Page 1 match setup (per team: players + bots, bot skill, timer, view, world)
// -> Page 2 characters (each human player in turn, then the host picks the bots') -> game.
(function () {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.game = game; // handy for debugging / automated tests

  const $ = id => document.getElementById(id);
  const menu = $('menu'), victory = $('victory');
  const menuArt = $('menuArt'), mctx = menuArt.getContext('2d');
  const winArt = $('winArt'), wctx = winArt.getContext('2d');
  const CHARS = TEAM_DEFS.map(d => d.id);
  const LEVELS = ['easy', 'medium', 'hard', 'pro'];
  const LEVEL_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard', pro: 'Pro' };
  const FLAVOR = {
    DOGE: 'Much wow. Big booms, diamond paws.', FROG: 'Rare and bouncy. Hops out of trouble.',
    PENGU: 'Chonky and cool. Rains fish, builds ice.', PILL: 'Pure degen. Pulls the rug, locks liquidity.',
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const defName = i => `Player ${i + 1}`;

  // ---- persistent setup (remembered between visits) ----
  // Page 1 (match setup): per team a number of humans + bots (team size = humans + bots, 2-6), a bot skill, timer, map.
  // Page 2 (characters): each human (Player 1, 2, ... team 1 first) picks their own character, the host picks the bots'.
  const KEY = 'shillshock.setup.v2', OLD_KEY = 'memewar.setup.v1';
  const S = { view: '3d', world: 'random', turnTime: 45,
    teams: [{ h: 1, b: 2, level: 'medium' }, { h: 0, b: 3, level: 'medium' }],
    names: Array.from({ length: 12 }, (_, i) => defName(i)), hchars: Array.from({ length: 12 }, (_, i) => CHARS[i % 4]),
    botChars: [['random', 'random', 'random', 'random', 'random', 'random'], ['random', 'random', 'random', 'random', 'random', 'random']] };
  const okC = c => c === 'random' || CHARS.includes(c);
  const okTeam = t => t && Number.isInteger(t.h) && Number.isInteger(t.b) && t.h >= 0 && t.b >= 0 && t.h + t.b >= 2 && t.h + t.b <= 6;
  try {
    const v2 = JSON.parse(localStorage.getItem(KEY) || 'null'), v1 = v2 ? null : JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    const saved = v2 || v1;
    if (saved && typeof saved === 'object') {
      if (saved.view === '2d' || saved.view === '3d') S.view = saved.view;
      if (saved.world === 'random' || WORLDS[saved.world]) S.world = saved.world;
      if (Array.isArray(saved.names)) saved.names.slice(0, 12).forEach((n, i) => { if (typeof n === 'string' && n.trim()) S.names[i] = n.trim().slice(0, 12); });
    }
    if (v2) {
      if (Array.isArray(v2.teams) && v2.teams.length === 2 && v2.teams.every(okTeam)) S.teams = v2.teams.map(t => ({ h: t.h, b: t.b, level: LEVELS.includes(t.level) ? t.level : 'medium' }));
      if (Array.isArray(v2.hchars)) v2.hchars.slice(0, 12).forEach((c, i) => { if (CHARS.includes(c)) S.hchars[i] = c; });
      if (Array.isArray(v2.botChars) && v2.botChars.length === 2) v2.botChars.forEach((t, k) => { if (Array.isArray(t)) t.slice(0, 6).forEach((c, j) => { if (okC(c)) S.botChars[k][j] = c; }); });
      if ([15, 30, 45, 60, 90].includes(v2.turnTime)) S.turnTime = v2.turnTime;
    } else if (v1 && typeof v1 === 'object') {
      // migrate the old dashboard (whole team = one human or one CPU, per-slot characters): a human team keeps
      // its player on unit 1 with bots on the other slots; a CPU team becomes all bots with its old skill
      const hum = Math.max(0, Math.min(2, v1.humans | 0)), sizes = Array.isArray(v1.teamSizes) && v1.teamSizes.length === 2 ? v1.teamSizes : [3, 3];
      const slots = Array.isArray(v1.slots) && v1.slots.length === 2 ? v1.slots : null, cpuSlots = Array.isArray(v1.cpuSlots) ? v1.cpuSlots : [];
      [0, 1].forEach(t => {
        const n = clamp(sizes[t] | 0 || 3, 2, 6), isHum = t < hum, lvl = !isHum && cpuSlots[t - hum] && LEVELS.includes(cpuSlots[t - hum].level) ? cpuSlots[t - hum].level : 'medium';
        S.teams[t] = { h: isHum ? 1 : 0, b: isHum ? n - 1 : n, level: lvl };
        const sl = slots && Array.isArray(slots[t]) ? slots[t].filter(okC) : [];
        if (isHum && CHARS.includes(sl[0])) S.hchars[t] = sl[0];
        sl.slice(isHum ? 1 : 0).forEach((c, j) => { if (j < 6) S.botChars[t][j] = c; });
      });
      if (hum === 2) S.names[1] = v1.names && typeof v1.names[1] === 'string' && v1.names[1].trim() ? v1.names[1].trim().slice(0, 12) : defName(1);
    }
  } catch (e) { /* storage unavailable: defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  const size = t => S.teams[t].h + S.teams[t].b;
  const humansList = () => { const out = []; [0, 1].forEach(t => { for (let k = 0; k < S.teams[t].h; k++) out.push({ t, k, gi: out.length }); }); return out; };
  const totalHumans = () => S.teams[0].h + S.teams[1].h;

  // flow state
  let step = 'title', cur = 0, focusChar = 0, lobbyRow = 0, botField = 0;
  let lineup = null;     // resolved teams [{ controller, player, chars, units }]
  window.menuFlow = { get step() { return step; }, get lineup() { return lineup; }, get focusChar() { return focusChar; }, get botField() { return botField; }, get player() { return cur; }, get lobbyRow() { return lobbyRow; }, setup: S };

  // ---- renderer: 2.5D Three.js (default) or classic 2D canvas; falls back to 2D without WebGL ----
  const urlView = (location.search.match(/[?&]view=(2d|3d)/) || [])[1];
  if (urlView) S.view = urlView;
  let r3d = null;
  try { if (window.THREE && typeof Renderer3D === 'function') { r3d = new Renderer3D(game, $('game3d')); if (!r3d.ok) r3d = null; } } catch (e) { console.info('3D init failed, using classic 2D', e && e.message); r3d = null; }
  game.r3d = r3d;
  function applyView(toast) {
    const want3d = S.view !== '2d' && !!r3d && r3d.ok;
    if (r3d) r3d.setActive(want3d); else $('game3d').style.display = 'none';
    document.querySelectorAll('#viewSeg .sbtn, #titleViewSeg .sbtn').forEach(b => { b.classList.toggle('sel', b.dataset.v === (want3d ? '3d' : '2d')); if (b.dataset.v === '3d') b.disabled = !r3d; });
    $('viewMsg').textContent = r3d ? '' : '3D needs WebGL (not available here), using classic 2D.';
  }
  // the view is a pre-game setting (title screen / page 1, saved with the other settings); there is no in-battle toggle
  window.setView = v => { S.view = v === '2d' ? '2d' : '3d'; save(); applyView(); };
  document.querySelectorAll('#viewSeg .sbtn').forEach(b => b.addEventListener('click', () => { SFX.select(); lobbyRow = 7; window.setView(b.dataset.v); refreshLobby(); }));
  document.querySelectorAll('#titleViewSeg .sbtn').forEach(b => b.addEventListener('click', () => { if (b.disabled || game.state === 'play') return; SFX.select(); window.setView(b.dataset.v); }));

  function show(name) {
    step = name;
    document.querySelectorAll('#menu .screen').forEach(el => el.classList.toggle('hidden', el.dataset.step !== name));
  }

  // ================= 1. TITLE =================
  $('playBtn').addEventListener('click', () => { SFX.unlock(); SFX.select(); goLobby(); });

  // ================= 2. LOBBY =================
  // ---- world / map picker ----
  const MAP_OPTS = [{ id: 'random', name: 'Random', team: null, tagline: 'One of the 4 themed worlds' }, ...WORLD_ORDER.map(id => WORLDS[id]), WORLDS.classic];
  const mapRow = document.getElementById('mapRow');
  const mapLabel = document.createElement('p'); mapLabel.className = 'maplabel'; mapRow.after(mapLabel);
  const thumbs = {};
  function thumb(id) { // small preview: real generated terrain + sky + hazard for that world
    if (thumbs[id]) return thumbs[id];
    const c = document.createElement('canvas'); c.width = 232; c.height = 116;
    const g = c.getContext('2d');
    if (id === 'random') {
      WORLD_ORDER.forEach((wid, i) => g.drawImage(thumb(wid), (i % 2) * 116, (i >> 1) * 58, 116, 58, (i % 2) * 116, (i >> 1) * 58, 116, 58));
      g.fillStyle = 'rgba(10,6,30,0.45)'; g.fillRect(0, 0, 232, 116);
      g.font = 'bold 64px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffd84a'; g.strokeStyle = '#000'; g.lineWidth = 5;
      g.strokeText('?', 116, 82); g.fillText('?', 116, 82);
    } else {
      const T = new Terrain(1234 + id.length * 77, MAP_W, id), L = WORLDS[id].water;
      g.drawImage(makeBackground(7 + id.length * 31, id), 0, 0, MAP_W, H, 0, 0, 232, 116);
      g.drawImage(T.canvas, 0, 0, MAP_W, H, 0, 0, 232, 116);
      const gr = g.createLinearGradient(0, WATER_Y * 116 / H, 0, 116); gr.addColorStop(0, L.top); gr.addColorStop(1, L.bottom);
      g.fillStyle = gr; g.fillRect(0, WATER_Y * 116 / H, 232, 116); g.fillStyle = L.line; g.fillRect(0, WATER_Y * 116 / H, 232, 1.5);
    }
    return (thumbs[id] = c);
  }
  MAP_OPTS.forEach(o => {
    const b = document.createElement('button'); b.className = 'mapbtn'; b.dataset.w = o.id;
    b.title = o.tagline + (o.twist ? ' Twist: ' + o.twist : '');
    const c = document.createElement('canvas'); c.width = 232; c.height = 116; c.getContext('2d').drawImage(thumb(o.id), 0, 0);
    const tm = TEAM_DEFS.find(d => d.id === o.team);
    b.append(c);
    b.insertAdjacentHTML('beforeend', `<span class="mn">${o.name}</span><span class="mt" style="color:${tm ? tm.color : '#c9c2ea'}">${o.id === 'random' ? 'surprise me' : o.id === 'classic' ? 'original map' : tm.name + ' world'}</span>`);
    b.addEventListener('click', () => { S.world = o.id; refreshMaps(true); refreshLobby(); SFX.unlock(); SFX.select(); });
    mapRow.append(b);
  });
  function refreshMaps(preview) {
    document.querySelectorAll('.mapbtn').forEach(x => x.classList.toggle('sel', x.dataset.w === S.world));
    const o = MAP_OPTS.find(m => m.id === S.world);
    mapLabel.innerHTML = `<b style="color:${o.color || '#ffd84a'}">${o.name}</b> — ${o.tagline}${o.twist && o.id !== 'classic' ? ` <i>Twist: ${o.twist}</i>` : ''} <span style="opacity:.7">(arenas, not team buffs)</span>`;
    if (preview && S.world !== 'random' && game.state === 'menu') { game.setWorld(S.world); game.terrain = new Terrain((Math.random() * 1e9) | 0, MAP_W, game.worldId); }
  }


  // ================= PAGE 1: MATCH SETUP =================
  const LEVEL_SHORT = LEVEL_NAME;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const teamTxt = t => `${plural(S.teams[t].h, 'player')} + ${plural(S.teams[t].b, 'bot')}`;
  function setTeam(t, dh, db) {
    const T = S.teams[t], h = T.h + dh, b = T.b + db;
    if (h < 0 || b < 0 || h + b < 2 || h + b > 6) return false;
    T.h = h; T.b = b; return true;
  }
  function refreshLobby() {
    [0, 1].forEach(t => {
      const T = S.teams[t], ts = TEAM_STYLE[t], n = size(t);
      $(`hum${t}Val`).textContent = T.h; $(`bot${t}Val`).textContent = T.b;
      $(`hum${t}Minus`).disabled = T.h <= 0 || n <= 2; $(`bot${t}Minus`).disabled = T.b <= 0 || n <= 2;
      $(`hum${t}Plus`).disabled = n >= 6; $(`bot${t}Plus`).disabled = n >= 6;
      $(`teamBox${t}`).style.setProperty('--tc', ts.color); $(`teamTag${t}`).style.background = ts.color;
      $(`tsize${t}`).textContent = `${n} units`;
      document.querySelectorAll(`#lvlSeg${t} .sbtn`).forEach(x => { x.classList.toggle('sel', x.dataset.v === T.level); x.disabled = T.b === 0; });
    });
    document.querySelectorAll('#timerSeg .sbtn').forEach(x => x.classList.toggle('sel', +x.dataset.v === S.turnTime));
    document.querySelectorAll('#scrLobby .lrow').forEach(x => x.classList.toggle('focus', +x.dataset.row === lobbyRow));
    const hum = totalHumans(), msg = $('lobbyMsg');
    msg.textContent = hum === 0 ? 'Spectate mode: bots only - you just watch.' : hum === 1 ? '1 human player' + (S.teams[0].b + S.teams[1].b ? ' with bots' : '') : `${hum} human players, hot-seat: each controls their own unit (pass the keyboard)`;
    msg.classList.remove('err');
    $('lobbyNext').disabled = false;
    const o = MAP_OPTS.find(x => x.id === S.world);
    let h = `<h4>MATCH SUMMARY</h4>`;
    [0, 1].forEach(t => { h += `<div class="sl">${t ? '<b style="opacity:.6;margin-right:6px">vs</b>' : ''}<span class="teamtag" style="background:${TEAM_STYLE[t].color}">TEAM ${t + 1}</span> ${teamTxt(t)}${S.teams[t].b ? ` <small style="opacity:.75">(${LEVEL_SHORT[S.teams[t].level]})</small>` : ''}</div>`; });
    h += `<div class="sl sumline" id="sumLine">Team 1: ${teamTxt(0)} vs Team 2: ${teamTxt(1)}</div>`;
    h += `<div class="sl">Units: <b>${size(0)}v${size(1)}</b>${size(0) !== size(1) ? ' <small style="opacity:.7">(uneven: one turn per unit per round)</small>' : ''}</div>`;
    h += `<div class="sl">World: <b style="color:${o.color || '#ffd84a'}">${o.name}</b> · Turn timer <b>${S.turnTime}s</b></div>`;
    h += `<div class="sl" style="opacity:.7;font-size:12px">Next: ${hum ? 'each player picks a character, then ' : ''}the host picks the bots' characters → start</div>`;
    $('lobbySummary').innerHTML = h;
    save();
  }
  const bump = (t, dh, db) => { if (setTeam(t, dh, db)) { SFX.select(); refreshLobby(); } };
  [0, 1].forEach(t => {
    $(`hum${t}Minus`).addEventListener('click', () => { lobbyRow = t * 3; bump(t, -1, 0); });
    $(`hum${t}Plus`).addEventListener('click', () => { lobbyRow = t * 3; bump(t, 1, 0); });
    $(`bot${t}Minus`).addEventListener('click', () => { lobbyRow = t * 3 + 1; bump(t, 0, -1); });
    $(`bot${t}Plus`).addEventListener('click', () => { lobbyRow = t * 3 + 1; bump(t, 0, 1); });
    document.querySelectorAll(`#lvlSeg${t} .sbtn`).forEach(b => b.addEventListener('click', () => { S.teams[t].level = b.dataset.v; lobbyRow = t * 3 + 2; SFX.select(); refreshLobby(); }));
  });
  document.querySelectorAll('#timerSeg .sbtn').forEach(b => b.addEventListener('click', () => { S.turnTime = +b.dataset.v; lobbyRow = 6; SFX.select(); refreshLobby(); }));
  $('lobbyBack').addEventListener('click', () => { SFX.select(); show('title'); });
  $('lobbyNext').addEventListener('click', () => { SFX.select(); enterChar(0); });
  $('quickBtn').addEventListener('click', () => { // you (unit 1 of team 1) + Medium bots vs Medium bots, current team sizes
    SFX.unlock(); const n0 = size(0), n1 = size(1);
    S.teams = [{ h: 1, b: n0 - 1, level: 'medium' }, { h: 0, b: n1, level: 'medium' }]; refreshLobby();
    buildLineup(); launch();
  });
  $('spectBtn').addEventListener('click', () => {
    SFX.unlock(); const n0 = size(0), n1 = size(1);
    S.teams = [{ h: 0, b: n0, level: 'pro' }, { h: 0, b: n1, level: 'hard' }]; refreshLobby();
    buildLineup(); launch();
  });
  function goLobby() { show('lobby'); refreshMaps(false); refreshLobby(); }
  // resolved line-up: per team, its humans' units first, then its bots; 'random' bot picks resolved now
  function buildLineup() {
    const hl = humansList();
    lineup = [0, 1].map(t => {
      const T = S.teams[t], hs = hl.filter(x => x.t === t);
      const units = hs.map(x => ({ ctrl: 'human', player: S.names[x.gi] || defName(x.gi) })).concat(Array.from({ length: T.b }, () => ({ ctrl: T.level })));
      const bc = S.botChars[t].slice(0, T.b);
      const chars = hs.map(x => S.hchars[x.gi]).concat(bc.map(c => c === 'random' ? CHARS[Math.floor(Math.random() * CHARS.length)] : c));
      return { controller: T.h ? 'human' : T.level, player: T.h ? units[0].player : null, units, chars, size: T.h + T.b, humans: hs.map(x => S.names[x.gi]), bots: T.b, level: T.level, wasRandom: bc.includes('random') };
    });
    return lineup;
  }

  // ================= PAGE 2: CHARACTERS =================
  // cur = index into humansList(); cur === number of humans -> the host is picking the bots' characters
  const cardsEl = $('charCards'), nameInput = $('nameInput'), cardCanvases = [], stripEl = $('playerStrip'), botEl = $('botPick');
  let stripCanvases = [], botCanvases = [];
  TEAM_DEFS.forEach((d, i) => {
    const c = document.createElement('div'); c.className = 'ccard'; c.dataset.id = d.id; c.style.setProperty('--tc', d.color);
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 128; cardCanvases.push(cv);
    const A = WEAPONS[d.sig], D = WEAPONS[d.sigDef];
    c.append(cv);
    c.insertAdjacentHTML('beforeend', `<div class="cn" style="color:${d.color}">${d.name}</div><div class="cf">${FLAVOR[d.id]}</div>
      <div class="cm a"><b>ATK ★ ${A.name}</b>${A.desc}</div><div class="cm d"><b>DEF ★ ${D.name}</b>${D.desc}</div><span class="owner hidden"></span>`);
    c.addEventListener('click', () => { if (cur >= totalHumans()) return; focusChar = i; pickChar(); });
    c.addEventListener('mouseenter', () => { if (cur >= totalHumans()) return; focusChar = i; refreshChar(); });
    cardsEl.append(c);
  });
  const charOpts = (sel, withRandom) => (withRandom ? [['random', 'Random']] : []).concat(CHARS.map(c => [c, c])).map(([v, n]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${n}</option>`).join('');
  const botSlots = () => { const out = []; [0, 1].forEach(t => { for (let j = 0; j < S.teams[t].b; j++) out.push({ t, j }); }); return out; };
  function enterChar(idx) {
    const H = totalHumans(); cur = clamp(idx, 0, H); botField = 0;
    if (cur < H) { nameInput.value = S.names[cur] || defName(cur); nameInput.placeholder = defName(cur); focusChar = Math.max(0, CHARS.indexOf(S.hchars[cur])); }
    show('char'); refreshChar();
  }
  function refreshChar() {
    const hl = humansList(), H = hl.length, me = hl[cur], humanPhase = cur < H;
    if (humanPhase) {
      const ts = TEAM_STYLE[me.t];
      $('charTitle').textContent = `PLAYER ${cur + 1}, PICK YOUR CHARACTER`;
      $('charSub').innerHTML = `<span class="teamtag" style="background:${ts.color}">${ts.name.toUpperCase()}</span> ${H > 1 ? `Player ${cur + 1} of ${H} · pass the keyboard` : 'your unit'} · cards show each ★ special attack and defense`;
    } else {
      $('charTitle').textContent = botSlots().length ? "HOST: PICK THE BOTS' CHARACTERS" : 'READY';
      $('charSub').textContent = botSlots().length ? 'Per bot slot, or Randomize / All same per team · then START' : 'All players picked · press START';
    }
    $('scrChar').style.setProperty('--tc', humanPhase ? TEAM_STYLE[me.t].color : '#ffd84a');
    $('humanPick').classList.toggle('hidden', !H);
    $('humanPick').classList.toggle('dim', !humanPhase);
    $('charPick').classList.toggle('hidden', !humanPhase);
    $('charHint').textContent = humanPhase ? '← → choose · Enter pick (then the next player) · click a card to pick · Esc back' : '↑ ↓ choose bot slot · ← → change character · Enter START · Esc back to the last player';
    // player strip: every human (team colour + current pick) and the bots step
    stripEl.innerHTML = ''; stripCanvases = [];
    hl.forEach(x => {
      const ts = TEAM_STYLE[x.t], el = document.createElement('div'); el.className = 'pchip' + (x.gi === cur ? ' cur' : '') + (x.gi < cur ? ' done' : ''); el.dataset.p = x.gi; el.style.setProperty('--tc', ts.color);
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 60; stripCanvases.push({ cv, c: S.hchars[x.gi], j: x.gi }); el.append(cv);
      el.insertAdjacentHTML('beforeend', `<div><b>P${x.gi + 1}</b> ${esc(S.names[x.gi] || defName(x.gi))}<br><span class="teamtag" style="background:${ts.color}">T${x.t + 1}</span> ${x.gi < cur || x.gi === cur ? S.hchars[x.gi] : '…'}</div>`);
      el.addEventListener('click', () => { SFX.select(); if (cur < H) commitName(); enterChar(x.gi); });
      stripEl.append(el);
    });
    if (botSlots().length) { const el = document.createElement('div'); el.className = 'pchip bots' + (!humanPhase ? ' cur' : ''); el.innerHTML = `<div><b>BOTS</b><br>${botSlots().length} slots</div>`; el.addEventListener('click', () => { if (cur < H) commitName(); SFX.select(); enterChar(H); }); stripEl.append(el); }
    document.querySelectorAll('.ccard').forEach((c, i) => { c.classList.remove('taken'); c.classList.toggle('focus', humanPhase && i === focusChar); c.querySelector('.owner').classList.add('hidden'); });
    buildBots();
  }
  function buildBots() {
    botEl.innerHTML = ''; botCanvases = [];
    const slots = botSlots(), H = totalHumans(), active = cur >= H;
    botEl.classList.toggle('hidden', !slots.length); botEl.classList.toggle('active', active);
    let f = 0;
    [0, 1].forEach(t => {
      const T = S.teams[t]; if (!T.b) return;
      const ts = TEAM_STYLE[t], row = document.createElement('div'); row.className = 'botrow';
      row.insertAdjacentHTML('beforeend', `<div class="cl"><span class="teamtag" style="background:${ts.color}">${ts.name.toUpperCase()}</span> ${plural(T.b, 'bot')} · ${LEVEL_NAME[T.level]}</div>`);
      const sl = document.createElement('div'); sl.className = 'slotsel';
      for (let j = 0; j < T.b; j++, f++) {
        const c = S.botChars[t][j], box = document.createElement('div'); box.className = 'bslot' + (active && f === botField ? ' fcs' : '');
        const cv = document.createElement('canvas'); cv.width = 72; cv.height = 60; botCanvases.push({ cv, c, j }); box.append(cv);
        box.insertAdjacentHTML('beforeend', `<select data-k="bot" data-t="${t}" data-s="${j}" title="bot ${j + 1}">${charOpts(c, true)}</select>`);
        sl.append(box);
      }
      sl.insertAdjacentHTML('beforeend', `<div class="bctl"><button class="qbtn" data-rand="${t}">Randomize</button><select data-same="${t}" title="All same"><option value="" selected>All same…</option>${charOpts('', true)}</select></div>`);
      row.append(sl); botEl.append(row);
    });
    botEl.querySelectorAll('select[data-k="bot"]').forEach(sel => sel.addEventListener('change', () => { S.botChars[+sel.dataset.t][+sel.dataset.s] = sel.value; SFX.select(); save(); buildBots(); }));
    botEl.querySelectorAll('select[data-same]').forEach(sel => sel.addEventListener('change', () => { if (!sel.value) return; S.botChars[+sel.dataset.same].fill(sel.value); SFX.select(); save(); buildBots(); }));
    botEl.querySelectorAll('button[data-rand]').forEach(b => b.addEventListener('click', () => { const t = +b.dataset.rand; for (let j = 0; j < 6; j++) S.botChars[t][j] = CHARS[Math.floor(Math.random() * CHARS.length)]; SFX.select(); save(); buildBots(); }));
  }
  function moveChar(d) { focusChar = (focusChar + d + 4) % 4; SFX.select(); refreshChar(); }
  function commitName() { if (cur < totalHumans()) S.names[cur] = nameInput.value.trim().slice(0, 12) || defName(cur); }
  function pickChar() { // the current player takes the focused character, then the next player (or the bots step)
    const id = CHARS[focusChar]; if (!id || cur >= totalHumans()) return;
    commitName(); S.hchars[cur] = id; save(); SFX.select(); nameInput.blur();
    enterChar(cur + 1);
  }
  function botChange(d) {
    const bs = botSlots()[botField]; if (!bs) return;
    const opts = ['random', ...CHARS], j = opts.indexOf(S.botChars[bs.t][bs.j]); S.botChars[bs.t][bs.j] = opts[(j + d + opts.length) % opts.length];
    SFX.select(); save(); buildBots();
  }
  $('charPick').addEventListener('click', pickChar);
  $('charBack').addEventListener('click', () => { SFX.select(); commitName(); save(); goLobby(); }); // back to page 1, settings kept
  function charBackKey() { SFX.select(); commitName(); save(); if (cur > 0) enterChar(cur - 1); else goLobby(); }
  $('startBtn').addEventListener('click', () => { commitName(); save(); buildLineup(); launch(); });

  // ================= launch / victory =================
  function launch() {
    if (!lineup || lineup.length < 2) return;
    SFX.unlock(); save();
    menu.classList.add('hidden'); victory.classList.add('hidden');
    // per-unit controllers: every human controls their own unit (hot-seat), bots their own units
    game.start({ chars: lineup.map(t => t.chars), controllers: lineup.map(t => t.controller), players: lineup.map(t => t.player), units: lineup.map(t => t.units), world: S.world, turnTime: S.turnTime });
    canvas.focus();
  }
  $('rematchBtn').addEventListener('click', () => launch()); // same setup
  $('menuBtn').addEventListener('click', () => {
    victory.classList.add('hidden'); menu.classList.remove('hidden');
    game.state = 'menu'; game.terrain = new Terrain((Math.random() * 1e9) | 0, MAP_W, game.worldId);
    goLobby();
  });

  let winner = null;
  game.onGameOver = (w) => {
    winner = w;
    const hum = w ? w.units.filter(u => u.ctrl === 'human').map(u => u.player) : [], bots = w ? w.units.filter(u => u.ctrl && u.ctrl !== 'human').length : 0;
    $('winTitle').textContent = w ? (hum.length === 1 ? `${hum[0]} WINS!` : `${w.name.toUpperCase()} WINS!`) : 'DRAW';
    $('winTitle').style.color = w ? w.color : '#ffd84a';
    $('winSub').textContent = w ? `${w.name} · ${hum.length ? hum.join(' + ') + (bots ? ` + ${plural(bots, 'bot')}` : '') : `${plural(bots || w.units.length, 'bot')} · ${LEVEL_NAME[(w.units.find(u => u.ctrl) || {}).ctrl] || LEVEL_NAME[w.controller] || ''}`} · ${w.chars.join(' · ')}` : '';
    $('winQuip').textContent = w
      ? pick(['WAGMI (well, just us)', 'Diamond hands prevail.', 'To the moon!', 'Few understand. We understood.', 'Generational wealth (of craters).'])
      : 'Everyone got rugged. ngmi.';
    victory.classList.remove('hidden');
  };

  // ================= keyboard =================
  window.addEventListener('keydown', e => {
    if (window.Online && Online.active) return; // online screens / games handle their own keys (js/online.js)
    if (!victory.classList.contains('hidden')) { if (e.key === 'Enter') { e.preventDefault(); launch(); } return; }
    if (game.state !== 'menu' || menu.classList.contains('hidden')) return;
    if (!({ title: 1, lobby: 1, char: 1 })[step]) return;
    const k = e.key, inInput = e.target === nameInput;
    if (step === 'title') { if (k === 'Enter' || k === ' ') { e.preventDefault(); SFX.unlock(); goLobby(); } return; }
    if (k === 'Escape') { e.preventDefault(); if (step === 'lobby') show('title'); else charBackKey(); return; }
    if (step === 'lobby') {
      if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); lobbyRow = clamp(lobbyRow + (k === 'ArrowUp' ? -1 : 1), 0, 8); refreshLobby(); }
      else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault(); const d = k === 'ArrowLeft' ? -1 : 1;
        if (lobbyRow < 6) { const t = lobbyRow < 3 ? 0 : 1, r = lobbyRow % 3;
          if (r === 0) bump(t, d, 0); else if (r === 1) bump(t, 0, d);
          else if (S.teams[t].b) { S.teams[t].level = LEVELS[clamp(LEVELS.indexOf(S.teams[t].level) + d, 0, 3)]; SFX.select(); refreshLobby(); } }
        else if (lobbyRow === 6) { const v = [15, 30, 45, 60, 90]; S.turnTime = v[clamp(v.indexOf(S.turnTime) + d, 0, 4)]; SFX.select(); refreshLobby(); }
        else if (lobbyRow === 7) { SFX.select(); window.setView(d < 0 ? '3d' : '2d'); }
        else { const ids = MAP_OPTS.map(o => o.id); S.world = ids[(ids.indexOf(S.world) + d + ids.length) % ids.length]; SFX.select(); refreshMaps(true); refreshLobby(); }
      } else if (k === 'Enter') { e.preventDefault(); enterChar(0); }
    } else if (step === 'char') {
      const H = totalHumans();
      if (cur < H) {
        if (k === 'Enter') { e.preventDefault(); pickChar(); }
        else if ((!inInput && (k === 'ArrowLeft' || k === 'ArrowRight')) || k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); moveChar(k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1); }
      } else {
        if (k === 'Enter') { e.preventDefault(); $('startBtn').click(); }
        else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); botField = clamp(botField + (k === 'ArrowUp' ? -1 : 1), 0, Math.max(0, botSlots().length - 1)); SFX.select(); buildBots(); }
        else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); botChange(k === 'ArrowLeft' ? -1 : 1); }
      }
    }
  });

  // ================= animated art =================
  // menus use the pre-rendered 3D mascot portraits in 3D mode, the 2D drawings otherwise
  function mascotArt(ctx, id, x, y, facing, scale, t, opts) {
    const pc = game.r3d && game.r3d.active ? game.r3d.portrait(id) : null;
    if (!pc) { drawMascot(ctx, id, x, y, facing, scale, t, opts); return; }
    const blink = ((t || 0) + ((opts && opts.phase) || 0)) % 3.7 < 0.12, k = scale / 5;
    ctx.save(); ctx.translate(x, y); ctx.scale(facing * k, k); ctx.drawImage(pc[blink ? 1 : 0], -128, -236); ctx.restore();
  }
  function drawMenuArt(t) {
    mctx.clearRect(0, 0, menuArt.width, menuArt.height);
    TEAM_DEFS.forEach((d, i) => {
      const x = 105 + i * 210, y = 112;
      mctx.fillStyle = 'rgba(255,255,255,0.06)';
      mctx.beginPath(); mctx.ellipse(x, y + 4, 60, 12, 0, 0, Math.PI * 2); mctx.fill();
      const hop = Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 10;
      mascotArt(mctx, d.id, x - 5, y - hop, i % 2 ? -1 : 1, 2.3, t, { phase: i });
      mctx.textAlign = 'center';
      mctx.font = `bold 24px ${FONT}`; mctx.fillStyle = d.color; mctx.fillText(d.name, x, y + 36);
      mctx.font = `bold 13px ${FONT}`; mctx.fillStyle = '#ffb27a'; mctx.fillText('ATK ★ ' + WEAPONS[d.sig].name, x, y + 52);
      mctx.fillStyle = '#9fd3ff'; mctx.fillText('DEF ★ ' + WEAPONS[d.sigDef].name, x, y + 69);
    });
  }
  function drawPortrait(cv, id, t, i, scale, active) {
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    const d = TEAM_DEFS.find(x => x.id === id); if (!d) return;
    const cx = cv.width / 2, by = cv.height - 12;
    g.fillStyle = d.color; g.globalAlpha = 0.16; g.beginPath(); g.ellipse(cx, by - cv.height * 0.32, cv.width * 0.36, cv.height * 0.42, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(cx, by + 2, 46 * scale / 2.2, 9, 0, 0, Math.PI * 2); g.fill();
    const hop = active ? Math.abs(Math.sin(t * 4 + i)) * 8 : 0;
    mascotArt(g, id, cx - 4, by - hop, i % 2 ? -1 : 1, scale, t, { phase: i });
  }
  function drawFlowArt(t) {
    if (step === 'title') drawMenuArt(t);
    else if (step === 'char') {
      cardCanvases.forEach((cv, i) => drawPortrait(cv, CHARS[i], t, i, 2.2, cur < totalHumans() && i === focusChar));
      stripCanvases.forEach(({ cv, c, j }) => drawPortrait(cv, c, t, j, 1.05, j === cur));
      botCanvases.forEach(({ cv, c, j }) => c === 'random' ? qmark(cv) : drawPortrait(cv, c, t, j, 1.05, false));
    }
    else if (window.Online && Online.drawArt) Online.drawArt(step, t);
  }
  function qmark(cv) { const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); g.font = `bold ${cv.height * 0.6}px Arial Black, Impact, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#ffd84a'; g.fillText('?', cv.width / 2, cv.height * 0.72); }
  function drawWinArt(t) {
    wctx.clearRect(0, 0, winArt.width, winArt.height);
    if (!winner) { drawGrave(wctx, 180, 170, '#888'); return; }
    wctx.fillStyle = 'rgba(255,216,74,0.18)';
    wctx.beginPath(); wctx.arc(180, 110, 85 + Math.sin(t * 3) * 5, 0, Math.PI * 2); wctx.fill();
    const hop = Math.abs(Math.sin(t * 4)) * 14;
    mascotArt(wctx, (winner.units.find(u => !u.dead) || winner.units[0]).char, 175, 180 - hop, 1, 3.8, t);
    // little crown
    wctx.fillStyle = '#ffd84a'; wctx.strokeStyle = '#a8761a'; wctx.lineWidth = 2;
    const cy = 180 - hop - 165;
    wctx.beginPath(); wctx.moveTo(150, cy + 20); wctx.lineTo(150, cy); wctx.lineTo(162, cy + 10); wctx.lineTo(175, cy - 6); wctx.lineTo(188, cy + 10); wctx.lineTo(200, cy); wctx.lineTo(200, cy + 20); wctx.closePath(); wctx.fill(); wctx.stroke();
  }


  // used by js/online.js (online lobbies reuse the menu screens, art and view settings)
  window.MenuAPI = { game, show, get step() { return step; }, setup: S, save, applyView, drawPortrait, mascotArt, esc, MAP_OPTS, LEVEL_NAME,
    hideMenu() { menu.classList.add('hidden'); victory.classList.add('hidden'); },
    showMenu(name) { victory.classList.add('hidden'); menu.classList.remove('hidden'); show(name); },
    menuBackdrop() { game.state = 'menu'; game.mirror = false; game.terrain = new Terrain((Math.random() * 1e9) | 0, MAP_W, game.worldId); } };

  // menu backdrop: a random themed world
  game.setWorld('random'); game.terrain = new Terrain((Math.random() * 1e9) | 0, MAP_W, game.worldId);
  show('title');
  applyView();

  // ---- how-to-play overlay: Got it / X / click outside / Don't show again; '?' button reopens it (local only, nothing sent online) ----
  const helpCtl = $('helpCtl'), helpBtn = $('helpBtn');
  const closeHelp = () => { game.closeHelp($('helpNever').checked); SFX.select(); canvas.focus(); };
  $('helpOk').addEventListener('click', closeHelp);
  $('helpX').addEventListener('click', closeHelp);
  helpCtl.addEventListener('mousedown', e => { if (!$('helpPanel').contains(e.target)) closeHelp(); });
  helpBtn.addEventListener('click', () => { game.showHelp = !game.showHelp; if (game.showHelp) $('helpNever').checked = Game.helpHidden(); SFX.select(); helpBtn.blur(); });
  function syncHelp() {
    const playing = game.state === 'play' && menu.classList.contains('hidden');
    helpCtl.classList.toggle('hidden', !(playing && game.showHelp)); helpBtn.classList.toggle('hidden', !playing);
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(1 / 30, (now - last) / 1000)); last = Math.max(last, now);
    try {
      if (!game.externalStep) game.update(dt);
      game.render();
      syncHelp();
      if (!menu.classList.contains('hidden')) drawFlowArt(game.t);
      if (!victory.classList.contains('hidden')) drawWinArt(game.t);
    } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
