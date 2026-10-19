'use strict';
// ============================================================================================
// Online multiplayer (needs server/server.js; see DEPLOY.md). Plain script, no modules.
//
// Netcode: HOST-AUTHORITATIVE. The host's browser runs the normal 2D simulation (game.js) exactly like local
// play, including all CPU bots. Every other browser is a "mirror": it never simulates, it only renders what
// the host sends. The game sim uses Math.random, a variable frame dt and browser-dependent float math, so
// lockstep across different browsers/devices would drift; streaming the host's results cannot.
//   - active player -> server -> host : key presses (only the player who owns the current unit is accepted)
//   - host -> server -> everyone      : 20 Hz snapshot (units, projectiles, turn, timer, wind, ammo...) plus an
//                                       ordered event log: terrain edits (applied in the same order, so every
//                                       client ends with the identical terrain mask), explosions/splashes (visual
//                                       only), floating texts, banners, sounds.
//   - the server keeps the terrain log + latest snapshot, so anyone can rejoin mid-game with the same name/link.
//   - host drops: the server picks a new host; that browser turns its mirror into the live sim (the turn in
//     progress is forfeited) and carries on. A dropped player's units are played by a Medium bot until they return.
// ============================================================================================
(function () {
  const M = window.MenuAPI; if (!M) return;
  const game = M.game, $ = id => document.getElementById(id), esc = M.esc;
  const CHARS = TEAM_DEFS.map(d => d.id), LEVELS = ['easy', 'medium', 'hard', 'pro'];
  const SNAP_MS = 50;
  const RELAY = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'q', 'e']);
  const NAME_KEY = 'shillshock.online.name';
  const isFile = location.protocol === 'file:';
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const proto = Game.prototype;

  const O = window.Online = {
    active: false, ws: null, pid: null, code: null, name: '', lobby: null, hostPid: null,
    inGame: false, isHost: false, start: null, gameId: null, lastDigest: null, hostDigest: null, snaps: 0, leaving: false,
  };

  // ---------------------------------------------------------------- connection
  let retry = 0, retryTimer = null, token = null;
  function wsUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host; }
  function send(m) { if (O.ws && O.ws.readyState === 1) O.ws.send(JSON.stringify(m)); }
  O.send = send;
  function connect(hello) {
    if (O.ws) { try { O.ws.onclose = null; O.ws.close(); } catch (e) { /* ignore */ } }
    let ws;
    try { ws = new WebSocket(wsUrl()); } catch (e) { olErr('Could not reach the server.'); return; }
    O.ws = ws; O.leaving = false;
    ws.onopen = () => { retry = 0; send(hello()); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } try { onMsg(m); } catch (e) { console.error('online msg', m.t, e); } };
    ws.onclose = () => {
      if (O.ws !== ws || O.leaving) return;
      if (!O.code) { olErr('Could not connect to the server.'); return; }
      // network blip: rejoin the same room with the same name/token
      if (retry++ < 30) {
        status('Connection lost, reconnecting…', true); localToast('connection lost, reconnecting…');
        retryTimer = setTimeout(() => connect(() => ({ t: 'hello', a: 'join', code: O.code, name: O.name, token })), Math.min(4000, 600 * retry));
      } else status('Disconnected from the server.', true);
    };
  }
  function leave(msg) {
    O.leaving = true; clearTimeout(retryTimer);
    if (O.ws) { send({ t: 'leave' }); try { O.ws.close(); } catch (e) { /* ignore */ } }
    O.ws = null; O.code = null; O.pid = null; O.lobby = null;
    if (O.inGame) endGame();
    O.active = false;
    if (!isFile && history.replaceState) history.replaceState(null, '', location.pathname);
    $('netbar').classList.add('hidden'); $('netchat').classList.add('hidden');
    M.menuBackdrop(); M.showMenu('online'); O.active = true; olErr(msg || '');
  }

  // ---------------------------------------------------------------- screens: create / join
  const urlRoom = (location.search.match(/[?&]room=([A-Za-z0-9]{4})/) || [])[1];
  function openOnline() {
    O.active = true; SFX.unlock();
    let nm = ''; try { nm = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* ignore */ }
    $('olName').value = nm || (M.setup.names[0] !== 'Player 1' ? M.setup.names[0] : '');
    if (urlRoom && !$('olCode').value) $('olCode').value = urlRoom.toUpperCase();
    $('olFileMsg').classList.toggle('hidden', !isFile);
    $('olCreate').disabled = $('olJoin').disabled = isFile;
    olErr(''); M.show('online');
    setTimeout(() => ($('olName').value ? (urlRoom ? $('olJoin') : $('olCreate')) : $('olName')).focus(), 30);
  }
  function olErr(t) { $('olErr').textContent = t || ''; }
  function myName() {
    const n = $('olName').value.trim().slice(0, 12);
    if (!n) { olErr('Enter your name first.'); $('olName').focus(); return null; }
    try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ }
    return n;
  }
  $('onlineBtn').addEventListener('click', () => { SFX.select(); openOnline(); });
  $('olBack').addEventListener('click', () => { SFX.select(); O.active = false; M.show('title'); });
  $('olCreate').addEventListener('click', () => {
    const n = myName(); if (!n) return; O.name = n; olErr('Connecting…');
    connect(() => ({ t: 'hello', a: 'create', name: n }));
  });
  $('olJoin').addEventListener('click', () => {
    const n = myName(); if (!n) return;
    const code = $('olCode').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { olErr('Enter the 4-letter room code.'); $('olCode').focus(); return; }
    O.name = n; olErr('Connecting…');
    let tok = null; try { tok = sessionStorage.getItem('shillshock.tok.' + code); } catch (e) { /* ignore */ }
    connect(() => ({ t: 'hello', a: 'join', code, name: n, token: tok }));
  });
  ['olName', 'olCode'].forEach(id => $(id).addEventListener('keydown', e => {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (id === 'olCode' || ($('olCode').value.trim() && urlRoom)) $('olJoin').click(); else $('olCreate').click();
  }));
  if (urlRoom) setTimeout(openOnline, 0); // opened a ?room=CODE link: straight to the join screen

  // ---------------------------------------------------------------- messages
  function onMsg(m) {
    switch (m.t) {
      case 'welcome':
        O.pid = m.pid; O.code = m.code; O.name = m.name; token = m.token;
        try { sessionStorage.setItem('shillshock.tok.' + m.code, m.token); } catch (e) { /* ignore */ }
        if (!isFile && history.replaceState) history.replaceState(null, '', location.pathname + '?room=' + m.code);
        olErr('');
        if (!O.inGame) { M.show('olobby'); status(''); }
        break;
      case 'error':
        if (M.step === 'online') olErr(m.msg); else if (O.inGame) localToast(m.msg); else status(m.msg, true);
        if (M.step === 'online') { O.leaving = true; if (O.ws) O.ws.close(); O.ws = null; }
        break;
      case 'kicked': leave('You were removed from the lobby by the host.'); break;
      case 'lobby':
        O.lobby = m; O.hostPid = m.hostPid;
        if (!O.inGame && M.step === 'olobby') renderLobby();
        if (O.inGame) updatePresence();
        break;
      case 'chat': addChat(m); break;
      case 'gamestart': startGame(m); break;
      case 'snap': if (O.inGame && game.mirror && m.gameId === O.gameId) applySnap(m.s, m.ev, false); break;
      case 'input': if (O.inGame && O.isHost) onInput(m); break;
      case 'presence': onPresence(m); break;
      case 'host':
        O.hostPid = m.pid;
        if (O.inGame && m.pid === O.pid && game.mirror) promote();
        break;
      case 'over': onOver(m); break;
    }
  }

  // ---------------------------------------------------------------- lobby UI
  let teamCanvases = [];
  const L = () => O.lobby;
  const amHost = () => O.lobby && O.lobby.hostPid === O.pid;
  const me = () => O.lobby && O.lobby.players.find(p => p.pid === O.pid);
  function act(a, extra) { SFX.select(); send(Object.assign({ t: 'lobby', a }, extra)); }
  let errUntil = 0;
  function status(t, err) {
    const s = $('olStatus'); if (!s) return;
    if (err) errUntil = Date.now() + 3000; else if (Date.now() < errUntil) return; // keep server errors readable for a moment
    s.textContent = t || ''; s.classList.toggle('err', !!err);
  }
  function startProblem(l) {
    const hs = l.players.filter(p => p.team >= 0 && p.team < l.numTeams);
    if (!hs.length) return 'Need at least one player on a team.';
    const nr = hs.filter(p => p.pid !== l.hostPid && !p.ready);
    if (nr.length) return 'Waiting for ' + nr.map(p => p.name).join(', ') + ' to press READY.';
    return null;
  }
  function renderLobby() {
    const l = L(); if (!l) return;
    const host = amHost(), mine = me();
    $('olRoomCode').textContent = l.code;
    $('olLink').value = isFile ? '' : location.origin + location.pathname + '?room=' + l.code;
    const dis = host ? '' : 'disabled';
    const sizes = l.sizes || [l.teamSize, l.teamSize];
    const seg = (key, vals, cur, label, extra) => `<div class="grp"><span class="optlbl">${label}</span>${vals.map(v => `<button class="opt${v[0] === cur ? ' sel' : ''}" data-a="${key}" data-v="${v[0]}" ${extra || ''} ${dis}>${v[1]}</button>`).join('')}</div>`;
    const sz = [2, 3, 4, 5, 6].map(n => [n, String(n)]);
    let h = seg('size', sz, sizes[0], 'TEAM 1 UNITS', 'data-team="0"') + seg('size', sz, sizes[1], 'TEAM 2 UNITS', 'data-team="1"');
    h += `<div class="grp"><span class="optlbl">MATCH</span><b class="olvs">${sizes[0]} v ${sizes[1]}</b></div>`;
    h += `<div class="grp"><span class="optlbl">MAP</span><select id="olWorld" ${dis}>${M.MAP_OPTS.map(o => `<option value="${o.id}"${o.id === l.world ? ' selected' : ''}>${o.name}</option>`).join('')}</select></div>`;
    h += `<div class="grp"><span class="optlbl">TURN TIMER</span><select id="olTurn" ${dis}>${[15, 30, 45, 60, 90].map(v => `<option value="${v}"${v === l.turnTime ? ' selected' : ''}>${v}s</option>`).join('')}</select></div>`;
    $('olSettings').innerHTML = h;
    $('olSettings').querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => act(b.dataset.a, b.dataset.team != null ? { team: +b.dataset.team, v: +b.dataset.v } : { v: +b.dataset.v })));
    $('olWorld').addEventListener('change', e => act('world', { v: e.target.value }));
    $('olTurn').addEventListener('change', e => act('turn', { v: +e.target.value }));

    // team cards
    const tEl = $('olTeams'); tEl.innerHTML = ''; teamCanvases = [];
    tEl.style.gridTemplateColumns = `repeat(${l.numTeams}, 1fr)`;
    const charSel = (attr, cur) => `<select ${attr}>${CHARS.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('')}</select>`;
    const chip = c => { const d = TEAM_DEFS.find(x => x.id === c); return `<b class="olch" style="color:${d.color}">${d.name}</b>`; };
    for (let ti = 0; ti < l.numTeams; ti++) {
      // team identity = team colour; every slot has its own character (mixed teams, duplicates allowed)
      const t = l.teams[ti], ts = TEAM_STYLE[ti], hs = l.players.filter(p => p.team === ti);
      const card = document.createElement('div'); card.className = 'olteam'; card.style.setProperty('--tc', ts.color);
      const head = document.createElement('div'); head.className = 'th';
      const joinBtn = mine && mine.team !== ti ? `<button class="qbtn oljoin" data-join="${ti}">Join ${ts.name}</button>` : '';
      head.insertAdjacentHTML('beforeend', `<div style="flex:1"><div class="tn">${ts.name.toUpperCase()}</div><div class="tk">${sizes[ti]} units · each unit brings its own character's ★ specials</div></div>${joinBtn}` +
        (host ? `<div class="olbotq"><span class="optlbl">BOTS</span>${charSel(`data-botall="${ti}" title="All bots on this team the same"`, '')}<button class="qbtn" data-botrand="${ti}">Randomize</button></div>` : ''));
      card.append(head);
      for (let s = 0; s < sizes[ti]; s++) {
        const p = hs[s], row = document.createElement('div');
        const c = p ? (p.char || 'DOGE') : (t.cpuChar[s] || 'DOGE');
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 52; cv.className = 'olpc'; teamCanvases.push({ cv, id: c, i: ti * 6 + s });
        if (p) {
          row.className = 'olslot' + (p.pid === O.pid ? ' me' : '') + (p.connected ? '' : ' off');
          const tags = (p.pid === l.hostPid ? '<span class="tag host">HOST</span>' : p.ready ? '<span class="tag">READY</span>' : '<span class="tag no">not ready</span>') + (p.connected ? '' : '<span class="tag no">offline</span>');
          const ctl = host ? `<select data-move="${p.pid}">${Array.from({ length: l.numTeams }, (_, j) => `<option value="${j}"${j === ti ? ' selected' : ''}>Team ${j + 1}</option>`).join('')}<option value="-2">Spectate</option></select>${p.pid !== O.pid ? `<button class="qbtn" data-kick="${p.pid}" title="remove">✕</button>` : ''}` : '';
          row.innerHTML = `<span class="nm">${esc(p.name)}${p.pid === O.pid ? ' (you)' : ''}</span>${chip(c)}${tags}${ctl}`;
        } else {
          row.className = 'olslot cpu';
          const lv = t.cpu[s] || 'medium';
          row.innerHTML = `<span class="tag cpu">CPU</span><span class="nm" style="opacity:.75">bot</span>` +
            (host ? charSel(`data-botchar="${ti}:${s}"`, c) + `<select data-cpu="${ti}:${s}">${LEVELS.map(v => `<option value="${v}"${v === lv ? ' selected' : ''}>${M.LEVEL_NAME[v]}</option>`).join('')}</select>` : `${chip(c)}<span>${M.LEVEL_NAME[lv]}</span>`);
        }
        row.prepend(cv);
        card.append(row);
      }
      tEl.append(card);
    }
    const spect = l.players.filter(p => p.team < 0 || p.team >= l.numTeams);
    if (spect.length) tEl.insertAdjacentHTML('beforeend', `<div class="olspect" style="grid-column:1/-1">Spectating: ${spect.map(p => esc(p.name) + (host ? ` <select data-move="${p.pid}"><option value="-2" selected>—</option>${Array.from({ length: l.numTeams }, (_, j) => `<option value="${j}">Team ${j + 1}</option>`).join('')}</select>` : '')).join(' · ')}</div>`);
    tEl.querySelectorAll('select[data-botchar]').forEach(s => s.addEventListener('change', () => { const [ti, si] = s.dataset.botchar.split(':'); act('botchar', { team: +ti, slot: +si, char: s.value }); }));
    tEl.querySelectorAll('select[data-botall]').forEach(s => { s.insertAdjacentHTML('afterbegin', '<option value="" selected>All same…</option>'); s.addEventListener('change', () => { if (s.value) act('botchars', { team: +s.dataset.botall, char: s.value }); }); });
    tEl.querySelectorAll('button[data-botrand]').forEach(b => b.addEventListener('click', () => act('botchars', { team: +b.dataset.botrand, char: 'random' })));
    tEl.querySelectorAll('button[data-join]').forEach(b => b.addEventListener('click', () => act('join', { team: +b.dataset.join })));
    tEl.querySelectorAll('select[data-move]').forEach(s => s.addEventListener('change', () => act('move', { pid: s.dataset.move, team: +s.value })));
    tEl.querySelectorAll('select[data-cpu]').forEach(s => s.addEventListener('change', () => { const [ti, si] = s.dataset.cpu.split(':'); act('cpu', { team: +ti, slot: +si, v: s.value }); }));
    tEl.querySelectorAll('button[data-kick]').forEach(b => b.addEventListener('click', () => act('kick', { pid: b.dataset.kick })));

    // my character = my own unit's character (any team, duplicates allowed)
    const myChar = mine ? mine.char : null;
    $('olPick').innerHTML = CHARS.map(c => { const d = TEAM_DEFS.find(x => x.id === c); return `<button class="opt${c === myChar ? ' sel' : ''}" data-c="${c}" style="${c === myChar ? '' : 'color:' + d.color}">${d.name}</button>`; }).join('');
    $('olPick').querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => act('pick', { char: b.dataset.c })));

    const prob = startProblem(l);
    $('olReady').classList.toggle('hidden', host);
    $('olReady').textContent = mine && mine.ready ? 'NOT READY' : 'READY';
    $('olStart').classList.toggle('hidden', !host);
    $('olStart').disabled = !!prob;
    const humans = l.players.filter(p => p.team >= 0 && p.team < l.numTeams).length, bots = sizes[0] + sizes[1] - humans;
    status(prob ? prob : host ? `Everyone's ready: ${humans} player${humans > 1 ? 's' : ''} + ${bots} bot${bots === 1 ? '' : 's'} (${sizes[0]} v ${sizes[1]}). Press START!` : 'Ready! Waiting for the host to start.');
  }
  $('olReady').addEventListener('click', () => { const m = me(); SFX.select(); send({ t: 'ready', v: !(m && m.ready) }); });
  $('olStart').addEventListener('click', () => { SFX.select(); send({ t: 'start' }); });
  $('olLeave').addEventListener('click', () => { SFX.select(); leave(''); });
  $('olCopy').addEventListener('click', () => {
    const v = $('olLink').value; if (!v) return;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => status('Link copied: send it to your friends!'), () => { $('olLink').select(); document.execCommand && document.execCommand('copy'); status('Link copied.'); });
  });
  O.drawArt = (step, t) => { if (step === 'olobby') teamCanvases.forEach(({ cv, id, i }) => M.drawPortrait(cv, id, t, i, 0.95, false)); };

  // ---------------------------------------------------------------- chat (lobby + in game)
  const chatLines = [];
  function chatBox(parent) {
    parent.innerHTML = '<div class="chatlog"></div><input maxlength="200" autocomplete="off" spellcheck="false" placeholder="Chat · Enter to send">';
    const inp = parent.querySelector('input'); hookChatInput(inp); return parent.querySelector('.chatlog');
  }
  function hookChatInput(inp) {
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = inp.value.trim(); if (v) send({ t: 'chat', text: v }); inp.value = ''; if (O.inGame) inp.blur(); }
      else if (e.key === 'Escape') inp.blur();
    });
  }
  const lobbyLog = chatBox($('olChatLobby'));
  hookChatInput($('chatInput'));
  function addChat(m) {
    chatLines.push(m); if (chatLines.length > 60) chatLines.shift();
    const html = x => x.sys ? `<div class="sys">${esc(x.text)}</div>` : `<div><b>${esc(x.name)}:</b> ${esc(x.text)}</div>`;
    lobbyLog.innerHTML = chatLines.slice(-30).map(html).join(''); lobbyLog.scrollTop = 1e6;
    $('chatLog').innerHTML = chatLines.slice(-6).map(html).join('');
    if (O.onChat) O.onChat(m); // touch chat panel (js/touch.js)
  }
  O.chatLines = chatLines;
  O.sendChat = text => { const v = String(text || '').trim().slice(0, 200); if (!v) return false; send({ t: 'chat', text: v }); return true; };
  window.addEventListener('keydown', e => {
    if (!O.inGame || e.target.tagName === 'INPUT') return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); $('chatInput').focus(); }
  });

  // ---------------------------------------------------------------- game start (host + mirrors)
  let hostTimer = null, worker = null, events = [], remoteKeys = {}, walls = new Map();
  let wallSeq = 0, projSeq = 0, hopSeq = 0, lastBanner = null, lastQuip = null, lastCur = null, inFx = 0, firstSnap = true;
  const mainOnOver = game.onGameOver;

  function startGame(m) {
    if (O.inGame) teardownGame();
    O.inGame = true; O.start = m.start; O.gameId = m.start.gameId; O.hostPid = m.hostPid; O.isHost = m.hostPid === O.pid;
    O.lastDigest = null; O.hostDigest = null; O.snaps = 0; O.overSent = false; firstSnap = true;
    events = []; remoteKeys = {}; walls = new Map(); wallSeq = 0; projSeq = 0; hopSeq = 0; lastBanner = lastQuip = lastCur = null;
    M.hideMenu(); SFX.unlock();
    $('olBackBtn').classList.add('hidden'); $('rematchBtn').classList.remove('hidden'); $('menuBtn').classList.remove('hidden');
    game.online = true; game.mirror = !O.isHost;
    game.netLocalAllowed = () => !game.mirror && !!game.cur && game.cur.pid === O.pid && !game.cur.away;
    game.netKeys = () => (game.cur && game.cur.pid === O.pid ? game.keys : remoteKeys);
    game.onGameOver = onlineGameOver;
    game.gameOver = function (w) { proto.gameOver.call(this, w); if (O.isHost && !this.mirror) hostGameOver(w); };
    const s = m.start;
    game.start({ seed: s.seed, world: s.world, teamSize: s.teamSize, teamSizes: s.teamSizes, chars: s.chars, teamIds: s.teamIds, controllers: s.controllers, units: s.units, turnTime: s.turnTime, noHelp: true });
    markAway();
    if (game.mirror) {
      for (const e of m.ops || []) applyEvent(e, true);
      if (m.snap) applySnap(m.snap, [], true);
      game.banner = null;
      if (m.rejoin) localToast('rejoined the game');
    } else hostSetup();
    $('netbar').classList.remove('hidden'); $('netchat').classList.remove('hidden');
    document.getElementById('game').focus();
  }

  function teardownGame() {
    O.inGame = false; O.isHost = false;
    clearInterval(hostTimer); hostTimer = null;
    if (worker) { worker.terminate(); worker = null; }
    for (const k of ['explodeFx', 'rugFx', 'deathFx', 'splash', 'jumpFx', 'landFx', 'crateFx', 'floatText', 'toast', 'gameOver']) delete game[k];
    game.online = false; game.mirror = false; game.netKeys = null; game.netLocalAllowed = null; game.onGameOver = mainOnOver;
    remoteKeys = {};
  }
  function endGame() {
    teardownGame();
    $('olBackBtn').classList.add('hidden'); $('rematchBtn').classList.remove('hidden'); $('menuBtn').classList.remove('hidden');
  }
  function localToast(t) { proto.toast.call(game, t); }

  // ---------------------------------------------------------------- host side
  function emit(e) { events.push(e); }
  function hostSetup() {
    hookTerrain(game.terrain);
    // instance-level wrappers: everything visual/audible that happens on the host is replayed by the mirrors
    const wrap = (name, code, fx) => { game[name] = function (...a) { if (O.inGame && O.isHost) emit([code, ...a]); if (fx) inFx++; try { return proto[name].apply(this, a); } finally { if (fx) inFx--; } }; };
    wrap('explodeFx', 'x', true); wrap('rugFx', 'g', true); wrap('deathFx', 'd', true); wrap('splash', 's', true);
    wrap('jumpFx', 'j', true); wrap('landFx', 'l', true); wrap('crateFx', 'cf', true); // crate drops, pickups, laser beams, gas, teleports
    wrap('floatText', 'ft', false);
    game.toast = function (t) { if (O.inGame && O.isHost && !/^(sound|3D view|classic 2D)/.test(t)) emit(['to', t]); return proto.toast.call(this, t); };
    startHostLoop();
  }
  function hookTerrain(T) {
    if (T._net) return; T._net = true;
    const c = T.carve, cr = T.carveRect, aw = T.addIceWall, mw = T.meltWall;
    T.carve = function (x, y, r) { if (O.isHost) emit(['t', 'c', x, y, r]); return c.call(this, x, y, r); };
    T.carveRect = function (x, y, w, h) { if (O.isHost) emit(['t', 'r', x, y, w, h]); return cr.call(this, x, y, w, h); };
    T.addIceWall = function (x0, top, w, mh) { const wall = aw.call(this, x0, top, w, mh); if (wall) { wall.netId = ++wallSeq; walls.set(wall.netId, wall); if (O.isHost) emit(['t', 'w', x0, top, w, mh, wall.netId]); } return wall; };
    T.meltWall = function (wall) { if (wall && wall.alive && wall.netId && O.isHost) emit(['t', 'm', wall.netId]); return mw.call(this, wall); };
  }
  function startHostLoop() {
    clearInterval(hostTimer); if (worker) { worker.terminate(); worker = null; }
    let last = 0;
    const tick = () => {
      if (!O.inGame || !O.isHost || O.overSent) return;
      // background tab: rAF stops, so keep the authoritative sim running from this timer
      if (document.hidden && !game.externalStep) game.update(SNAP_MS / 1000 * 0.66);
      const now = performance.now(); if (now - last >= SNAP_MS - 5) { last = now; sendSnap(); }
    };
    try { // worker timers are not throttled like page timers in background tabs
      worker = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},33)'], { type: 'text/javascript' })));
      worker.onmessage = tick;
    } catch (e) { worker = null; hostTimer = setInterval(tick, 33); }
  }
  // SFX that aren't part of an fx replay are forwarded as events
  ['shoot', 'bounce', 'ribbit', 'jump', 'select'].forEach(n => {
    const f = SFX[n].bind(SFX);
    SFX[n] = function (...a) { if (O.inGame && O.isHost && !inFx && game.state === 'play') emit(['sf', n]); return f(...a); };
  });

  O.buildSnap = buildSnap; // (exposed for tests)
  function buildSnap() {
    const g = game;
    if (g.banner && g.banner !== lastBanner) { lastBanner = g.banner; const b = g.banner; emit(['b', { text: b.text, sub: b.sub, color: b.color, t: b.t, world: b.world, wcol: b.wcol, first: b.first }]); }
    if (g.bigQuip && g.bigQuip !== lastQuip) { lastQuip = g.bigQuip; emit(['q', g.bigQuip.text, g.bigQuip.color]); }
    if (g.cur !== lastCur) { lastCur = g.cur; remoteKeys = {}; }
    return {
      st: g.state, ph: g.phase, tt: g.turnTeam, cu: g.units.indexOf(g.cur), ti: r1(g.timer), po: r2(g.power || 0), ch: g.charging ? 1 : 0, wi: g.wind, tc: g.turnCount,
      rd: g.round || 1, pl: g.played ? [...g.played].map(u => g.units.indexOf(u)) : [], // round + who already played it (HUD queue on the mirrors)
      wn: g.winner ? g.teams.indexOf(g.winner) : -1,
      T: g.teams.map(t => [t.weaponIdx, 0, 0, t.unitIdx, t.controller, t.player]), // special ammo is per unit now (U[12])
      U: g.units.map(u => [r1(u.x), r1(u.y), u.hp, (u.dead ? 1 : 0) | (u.drowned ? 2 : 0) | (u.onGround ? 4 : 0) | (u.away ? 8 : 0), u.facing, r1(u.aim),
        u.def ? [u.def.type, u.def.shield || 0, u.def.used ? 1 : 0, u.def.wall && u.def.wall.alive ? u.def.wall.netId || 0 : 0] : 0,
        u.hop ? [u.hop.x1, u.hop.y1, u.hop.dur, r2(u.hop.t), u.hop.nid || (u.hop.nid = ++hopSeq), u.hop.x0, u.hop.y0, u.hop.h] : 0, r1(u.vx || 0), r1(u.vy || 0), u.jumpId || 0, u.jumpK || 0,
        [u.char, u.ammo[u.def0.sig], u.ammo[u.def0.sigDef]], u.jumpP == null ? 0.5 : u.jumpP,
        u.weapons.slice(5).map(w => [w, u.ammo[w] || 0]), [u.scope || 0, u.fud ? 1 : 0, u.poison ? u.poison.turns : 0, u.poison ? u.poison.dmg : 0]]), // crate inventory + crate effects // per-unit character + its own special uses; last jump strength
      jl: g.jumpsLeft, wk: g.walkLeft == null ? null : Math.round(g.walkLeft), jc: g.jumpCharge ? [r2(g.jumpCharge.p), g.jumpCharge.back ? 1 : 0] : 0, // jump charge meter on the mirrors
      C: (g.crates || []).map(c => [c.id, r1(c.x), r1(c.y), c.para ? 1 : 0, c.landed ? 1 : 0]), // supply crates (contents stay on the host)
      P: g.projectiles.filter(p => !p.dead && !(p.delay > 0)).map(p => [p.nid || (p.nid = ++projSeq), p.w.id, r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), r2(p.spin || 0), r2(p.fuse || 0), p.owner ? g.units.indexOf(p.owner) : -1]),
    };
  }
  function sendSnap() {
    const s = buildSnap(), ev = events; events = [];
    send({ t: 'snap', gameId: O.gameId, ev, s });
    O.snaps++; O.lastSnap = s;
  }
  function onInput(m) {
    const g = game, u = g.cur;
    if (m.k === 'aim') { if (u && u.pid === m.pid && !u.away) g.setAim(+m.a, m.f); return; } // touch drag-aim of the active guest (host validates + clamps)
    if (!u || u.pid !== m.pid || u.away || g.state !== 'play' || !RELAY.has(m.k)) return;
    if (m.d) { remoteKeys[m.k] = true; g.actionKey(m.k); }
    else { remoteKeys[m.k] = false; if (m.k === ' ') g.releaseFire(); else if (m.k === 'Enter' || m.k === 'Backspace') g.releaseJump(m.k === 'Backspace'); } // the host times the jump hold
  }
  function hostGameOver(w) {
    sendSnap();
    O.hostDigest = O.lastDigest = digest(O.lastSnap);
    send({ t: 'over', winner: w ? game.teams.indexOf(w) : -1, digest: O.lastDigest });
    O.overSent = true;
  }

  // ---------------------------------------------------------------- presence / away / host migration
  function connectedPids() { return new Set((O.lobby ? O.lobby.players : []).filter(p => p.connected).map(p => p.pid)); }
  function markAway() { const on = connectedPids(); for (const u of game.units) if (u.ctrl === 'human') u.away = !on.has(u.pid); }
  function updatePresence() { if (O.inGame && O.isHost) { const on = connectedPids(); for (const u of game.units) if (u.ctrl === 'human') setAway(u, !on.has(u.pid)); } }
  function setAway(u, away) {
    if (!!u.away === away) return;
    u.away = away;
    const g = game;
    if (away && u === g.cur && g.state === 'play' && g.phase === 'aim' && !g.bot) {
      // their turn: a bot finishes it
      remoteKeys = {}; g.charging = false; g.power = 0;
      u.team.controller = 'medium'; u.team.player = null;
      g.bot = new BotTurn(g, 'medium');
    }
  }
  function onPresence(m) {
    if (m.pid === O.pid) return;
    localToast(m.connected ? `${m.name} is back` : `${m.name} disconnected: a bot plays for them`);
    if (O.inGame && O.isHost) for (const u of game.units) if (u.pid === m.pid) setAway(u, !m.connected);
  }
  function promote() {
    // the old host left: this browser takes over the authoritative simulation from its mirrored state
    const g = game;
    g.mirror = false; O.isHost = true;
    for (const u of g.units) {
      if (u._tx != null) { u.x = u._tx; u.y = u._ty; u._tx = u._ty = null; }
      u.vx = 0; u.vy = 0; u.hop = null; u.onGround = !u.dead;
    }
    g.projectiles = [];
    for (const id of walls.keys()) wallSeq = Math.max(wallSeq, id);
    projSeq += 100000; hopSeq += 100000;
    hookTerrain(g.terrain);
    const wrapNeeded = !Object.prototype.hasOwnProperty.call(g, 'explodeFx');
    if (wrapNeeded) hostSetup(); else startHostLoop();
    markAway();
    if (g.state === 'play') { g.bot = null; g.charging = false; g.beginSettle(0.8); } // the interrupted turn ends; next turn starts here
    localToast('the host left: you are hosting the game now');
  }

  // ---------------------------------------------------------------- mirror side
  function applyEvent(e, silent) {
    const g = game, k = e[0];
    if (k === 't') {
      const T = g.terrain;
      if (e[1] === 'c') T.carve(e[2], e[3], e[4]);
      else if (e[1] === 'r') T.carveRect(e[2], e[3], e[4], e[5]);
      else if (e[1] === 'w') { const w = T.addIceWall(e[2], e[3], e[4], e[5]); if (w) { w.netId = e[6]; walls.set(e[6], w); } }
      else if (e[1] === 'm') { const w = walls.get(e[2]); if (w) T.meltWall(w); }
      return;
    }
    if (silent) return;
    if (k === 'x') proto.explodeFx.call(g, e[1], e[2], e[3], e[4]);
    else if (k === 'g') proto.rugFx.call(g, e[1], e[2], e[3]);
    else if (k === 'd') proto.deathFx.call(g, e[1], e[2], e[3]);
    else if (k === 's') proto.splash.call(g, e[1], e[2], e[3]);
    else if (k === 'j') proto.jumpFx.call(g, e[1], e[2], e[3], e[4]);
    else if (k === 'l') proto.landFx.call(g, e[1], e[2], e[3]);
    else if (k === 'cf') proto.crateFx.call(g, e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
    else if (k === 'ft') proto.floatText.call(g, e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
    else if (k === 'to') proto.toast.call(g, e[1]);
    else if (k === 'b') g.banner = Object.assign({}, e[1]);
    else if (k === 'q') g.quip(e[1], e[2]);
    else if (k === 'sf' && SFX[e[1]]) SFX[e[1]]();
  }
  function applySnap(s, ev, silent) {
    const g = game;
    for (const e of ev || []) applyEvent(e, silent);
    if (!s) return;
    O.snaps++; O.lastSnap = s;
    if (g.state !== 'over') g.state = s.st === 'over' ? 'play' : s.st; // 'over' comes with the over message
    if (s.ph !== g.phase || Math.abs((g.timer || 0) - s.ti) > 0.35) g.timer = s.ti;
    g.phase = s.ph === 'over' ? 'settle' : s.ph; g.turnTeam = s.tt; g.cur = g.units[s.cu] || null;
    g.jumpsLeft = s.jl; if (s.wk != null) g.walkLeft = s.wk; g.jumpCharge = s.jc && g.cur ? { u: g.cur, back: !!s.jc[1], p: s.jc[0] } : null; g.power = s.po; g.charging = !!s.ch; g.wind = s.wi; g.turnCount = s.tc; if (s.rd) { g.round = s.rd; g.played = new Set((s.pl || []).map(k => g.units[k]).filter(Boolean)); }
    if (s.C) { // crates: keep the objects (the 3D view keys its meshes on them)
      const old = new Map((g.crates || []).map(c => [c.id, c]));
      g.crates = s.C.map(([id, x, y, para, landed]) => { const c = old.get(id) || { id, sway: (id * 1.7) % 6 }; c.x = x; c.y = y; c.para = !!para; c.landed = !!landed; return c; });
    }
    s.T.forEach((a, i) => { const t = g.teams[i]; if (!t) return; t.weaponIdx = a[0]; t.unitIdx = a[3]; const cu = t.units[a[3]]; if (cu) { t.weapons = cu.weapons; t.ammo = cu.ammo; } t.controller = a[4]; t.player = a[5]; });
    s.U.forEach((a, i) => {
      const u = g.units[i]; if (!u) return;
      const snapPos = firstSnap || silent || u._tx == null || Math.abs(a[0] - u.x) > 160 || Math.abs(a[1] - u.y) > 160;
      u._tx = a[0]; u._ty = a[1]; if (snapPos) { u.x = a[0]; u.y = a[1]; }
      u.hp = a[2]; u.dead = !!(a[3] & 1); u.drowned = !!(a[3] & 2); u.onGround = !!(a[3] & 4); u.away = !!(a[3] & 8);
      u.facing = a[4]; u.aim = a[5]; u.vx = a[8]; u.vy = a[9]; u.jumpId = a[10] || 0; u.jumpK = a[11] || 0; if (a[13] != null) u.jumpP = a[13];
      const ca = a[12];
      if (ca) {
        if (ca[0] !== u.char) { const cd = TEAM_DEFS.find(x => x.id === ca[0]); if (cd) { u.char = cd.id; u.def0 = cd; u.weapons = ['bazooka', 'grenade', cd.sig, 'brace', cd.sigDef]; u.ammo = { [cd.sig]: 0, [cd.sigDef]: 0 }; } }
        u.ammo[u.def0.sig] = ca[1]; u.ammo[u.def0.sigDef] = ca[2];
      }
      if (a[14]) { // crate inventory (in place: the team's weapon bar shares this array)
        const inv = a[14], base = u.weapons.slice(0, 5); u.weapons.length = 0; u.weapons.push(...base);
        for (const [w, n] of inv) if (WEAPONS[w]) { u.weapons.push(w); u.ammo[w] = n; }
      }
      if (a[15]) { u.scope = a[15][0]; u.fud = !!a[15][1]; u.poison = a[15][2] ? { turns: a[15][2], dmg: a[15][3] } : null; }
      const d = a[6];
      if (d) {
        const W8 = WEAPONS[d[0]] || {};
        if (!u.def || u.def.type !== d[0]) u.def = { type: d[0], dmgMul: W8.dmgMul, knockMul: W8.knockMul, shield: d[1], used: !!d[2] };
        u.def.shield = d[1]; u.def.used = !!d[2]; u.def.wall = d[3] ? walls.get(d[3]) || null : null;
      } else u.def = null;
      const h = a[7];
      if (h) { if (!u.hop || u.hop.nid !== h[4]) u.hop = { x1: h[0], y1: h[1], dur: h[2], t: h[3], nid: h[4], x0: h[5], y0: h[6], h: h[7] }; else u.hop.t = h[3]; }
      else u.hop = null;
    });
    const byId = new Map(g.projectiles.map(p => [p.nid, p])), next = [];
    for (const a of s.P) {
      let p = byId.get(a[0]);
      if (!p) p = { w: WEAPONS[a[1]], age: 0, bounces: 0, dead: false, trailT: 0, nid: a[0] };
      p.x = a[2]; p.y = a[3]; p.vx = a[4]; p.vy = a[5]; p.spin = a[6]; p.fuse = a[7]; p.owner = g.units[a[8]] || null;
      if (p.w) next.push(p);
    }
    g.projectiles = next;
    firstSnap = false;
  }
  // mirrors: purely cosmetic per-frame update (interpolation + particles); the host owns the rules
  proto.mirrorUpdate = function (dt) {
    this.t += dt;
    for (const c of this.clouds) { c.x += (this.wind * 40 + 6) * dt * c.s; if (c.x > W + 120) c.x = -120; if (c.x < -120) c.x = W + 120; }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    this.updateParticles(dt);
    if (this.state !== 'play' && this.state !== 'over') return;
    this.updateCamera(dt);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.bigQuip) { this.bigQuip.t -= dt; if (this.bigQuip.t <= 0) this.bigQuip = null; }
    const k = 1 - Math.exp(-dt * 18);
    for (const u of this.units) {
      if (u._tx == null) continue;
      const dx = u._tx - u.x; u.x += dx * k; u.y += (u._ty - u.y) * k;
      if (u.onGround && Math.abs(dx) > 0.05) u.walkAnim += dt * 12;
      if (u.hop) u.hop.t = Math.min(u.hop.dur, u.hop.t + dt);
    }
    for (const p of this.projectiles) {
      const w = p.w; p.age += dt;
      p.vx += this.wind * WIND_ACC * (w.wind || 0) * dt; p.vy += GRAV * (w.grav || 1) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (w.kind === 'bounce') { p.spin += p.vx * dt * 0.08; p.fuse -= dt; }
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = w.id === 'moon' ? 0.012 : 0.03;
        const fire = w.id === 'moon' || w.id === 'bazooka';
        this.particles.push({ x: p.x, y: p.y, vx: rand(-10, 10), vy: rand(-20, 0), life: fire ? 0.6 : 0.4, max: fire ? 0.6 : 0.4, size: w.id === 'moon' ? 5 : 3, color: w.id === 'fish' || w.id === 'fishlet' ? 'rgba(200,240,255,0.8)' : 'rgba(230,230,230,0.6)', type: 'smoke', grav: -0.05 });
      }
    }
    if (this.state === 'play' && this.phase === 'aim') {
      this.timer = Math.max(0, this.timer - dt);
      const sec = Math.ceil(this.timer);
      if (sec <= 5 && sec !== this.lastTick && sec > 0) { this.lastTick = sec; SFX.tick(); }
    }
  };

  // ---------------------------------------------------------------- game over
  function digest(s) { // same on every client: final units + winner + terrain mask hash
    if (!s) return null;
    const m = game.terrain.mask; let h = 2166136261;
    for (let i = 0; i < m.length; i += 7) { h ^= m[i] + (i & 255); h = Math.imul(h, 16777619); }
    return JSON.stringify({ w: s.wn, u: s.U.map(a => [a[0], a[1], a[2], a[3] & 3]), t: (h >>> 0).toString(16), walls: game.terrain.walls.length });
  }
  function onOver(m) {
    if (!O.inGame) return;
    O.hostDigest = m.digest;
    if (game.mirror) {
      if (O.lastSnap) O.lastSnap.wn = m.winner;
      O.lastDigest = digest(O.lastSnap);
      for (const u of game.units) if (u._tx != null) { u.x = u._tx; u.y = u._ty; }
      game.gameOver(m.winner >= 0 ? game.teams[m.winner] : null);
    }
  }
  function onlineGameOver(w) {
    mainOnOver(w);
    if (w) {
      const names = w.units.filter(u => u.ctrl === 'human').map(u => u.player);
      $('winTitle').textContent = `${w.name} WINS!`;
      $('winSub').textContent = names.length ? 'GG ' + names.join(', ') + (names.length < w.units.length ? ' + bots' : '') : `${w.name} bots win`;
    }
    $('rematchBtn').classList.add('hidden'); $('menuBtn').classList.add('hidden'); $('olBackBtn').classList.remove('hidden');
  }
  $('olBackBtn').addEventListener('click', () => {
    SFX.select(); endGame();
    $('netbar').classList.add('hidden'); $('netchat').classList.add('hidden');
    M.menuBackdrop();
    if (O.code) { M.showMenu('olobby'); renderLobby(); } else M.showMenu('online');
  });

  // ---------------------------------------------------------------- client key relay + turn bar
  const held = new Set();
  window.addEventListener('keydown', e => {
    if (!O.inGame || !game.mirror || e.target.tagName === 'INPUT' || e.repeat) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!RELAY.has(k) || !myTurn() || e.__ssConsumed) return; // a key that only closed the local help is never sent to the host
    held.add(k); send({ t: 'input', k, d: true });
  });
  window.addEventListener('keyup', e => {
    if (!O.inGame || !game.mirror) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (held.delete(k)) send({ t: 'input', k, d: false });
  });
  window.addEventListener('blur', () => { for (const k of held) send({ t: 'input', k, d: false }); held.clear(); });
  function myTurn() { const u = game.cur; return !!u && u.pid === O.pid && !u.away && game.state === 'play'; }
  O.myTurn = myTurn;
  let aimT = 0, aimLast = null;
  O.sendAim = (a, f) => { // touch guest: relay the aim angle (throttled); the host checks it's this player's turn
    if (!O.inGame || !game.mirror || !myTurn()) return false;
    const now = performance.now(), v = Math.round(a * 10) / 10;
    if (aimLast && aimLast[0] === v && aimLast[1] === f) return true;
    if (now - aimT < 45) { O._aimPending = [v, f]; return true; }
    aimT = now; aimLast = [v, f]; O._aimPending = null; send({ t: 'input', k: 'aim', d: true, a: v, f }); return true;
  };
  setInterval(() => { const p = O._aimPending; if (p) { O._aimPending = null; aimT = 0; O.sendAim(p[0], p[1]); } }, 60);
  setInterval(() => {
    if (!O.inGame) return;
    const g = game, u = g.cur, bar = $('netbar'); if (!u) return;
    const mine = myTurn() && g.phase === 'aim';
    let txt;
    txt = g.round ? `Round ${g.round} · ` : '';
    if (g.state === 'over') txt = 'Game over';
    else if (u.ctrl === 'human' && !u.away) txt += mine ? (window.TouchUI && TouchUI.on ? `YOUR TURN (${u.team.name}) · ◀ ▶ walk · hold JUMP / FLIP · AIM pad · hold FIRE` : `YOUR TURN (${u.team.name}) · ← → walk · hold ENTER jump / BKSP flip · ↑ ↓ aim · hold SPACE fire`) : `${u.player}'s turn (${u.team.name})`;
    else if (u.ctrl === 'human') txt += `${u.player} is away: a bot plays their turn (${u.team.name})`;
    else txt += `CPU ${M.LEVEL_NAME[u.ctrl] || ''} turn (${u.team.name})`;
    if (g.state === 'play' && g.phase === 'aim') txt += ` · ${Math.ceil(g.timer)}s`;
    txt += `  ·  room ${O.code || ''}${O.isHost ? ' · you host' : ''}`;
    bar.textContent = txt; bar.classList.toggle('mine', mine);
  }, 200);
})();
