// Shill Shock — mobile touch controls.
// Only active on touch devices: (pointer: coarse), the first touchstart, or ?touch=1 (?touch=0 forces it off).
// Nothing here changes desktop input: every button synthesizes the SAME keyboard events the keyboard sends
// (keydown/keyup on window), so walking, the STEPS budget, jump charge, fire charge, weapon keys and the
// online relay all run through the existing handlers. Camera pan/pinch use the same camera calls as the mouse.
// Gestures on the battlefield (canvas):
//   your turn: 1-finger drag = AIM (the shot points from your character toward your finger; drag farther away
//              for finer control; within ~40 px of the character nothing changes). Feeds u.aim / u.facing via
//              game.setAim (online guest: relayed to the host as an 'aim' input, which the host validates + clamps).
//   not your turn: 1-finger drag = pan the camera.   Any time: 2 fingers = pinch zoom + drag to pan.
//   minimap: tap / drag to look there.  Weapons: the 2-row bar at the bottom (tap to select).
(function () {
  'use strict';
  const qs = new URLSearchParams(location.search), force = qs.get('touch');
  const T = window.TouchUI = { on: false, stats: { keys: 0, pans: 0, pinches: 0, picks: 0 } };
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const cv = $('game');

  // ---------------------------------------------------------------- key synthesis (same input path as the keyboard)
  const held = new Map(); // key -> count of fingers holding it
  function keyDown(k) {
    const n = held.get(k) || 0; held.set(k, n + 1); if (n) return;
    T.stats.keys++;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }
  function keyUp(k) {
    const n = held.get(k) || 0; if (!n) return;
    if (n > 1) { held.set(k, n - 1); return; }
    held.delete(k);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
  }
  function tapKey(k) { keyDown(k); keyUp(k); }
  function releaseAll() { for (const k of [...held.keys()]) { held.set(k, 1); keyUp(k); } }
  T.keyDown = keyDown; T.keyUp = keyUp; T.tapKey = tapKey;

  const game = () => window.MenuAPI && window.MenuAPI.game;
  const online = () => window.Online && Online.inGame;
  function playing() {
    const g = game(); if (!g) return false;
    return (g.state === 'play' || g.state === 'over') && $('menu').classList.contains('hidden') && $('victory').classList.contains('hidden');
  }
  function myTurn() {
    const g = game(); if (!g || g.state !== 'play' || g.phase !== 'aim' || !g.cur || g.cur.dead) return false;
    if (online()) return !!(Online.myTurn && Online.myTurn());
    return !g.isBotTurn();
  }

  // ---------------------------------------------------------------- DOM
  function el(tag, cls, html, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || ui).appendChild(e); return e; }
  let ui, bar, rotate, sheet;
  function build() {
    ui = document.createElement('div'); ui.id = 'touchUI'; ui.className = 'hidden'; document.body.appendChild(ui);
    const left = el('div', 'tu-cl tu-left'), right = el('div', 'tu-cl tu-right'), util = el('div', 'tu-util'), util2 = el('div', 'tu-util tu-util2');
    const walk = el('div', 'tu-row', null, left);
    hold(el('button', 'tu-btn tu-walk', '◀', walk), 'ArrowLeft', 'walkL');
    hold(el('button', 'tu-btn tu-walk', '▶', walk), 'ArrowRight', 'walkR');
    const colB = el('div', 'tu-col', null, right), colA = el('div', 'tu-col', null, right);
    hold(el('button', 'tu-btn tu-flip', '↶<small>FLIP</small>', colB), 'Backspace', 'flip');
    hold(el('button', 'tu-btn tu-jump', '⤒<small>JUMP</small>', colB), 'Enter', 'jump');
    hold(el('button', 'tu-btn tu-fire', 'FIRE<small>hold</small>', colA), ' ', 'fire');
    // utility row: pause/menu, recenter, view, help, chat
    tap(el('button', 'tu-btn tu-sm', '⏸', util), () => openSheet()).dataset.tu = 'menu';
    tap(el('button', 'tu-btn tu-sm', '◎', util), () => tapKey('c')).dataset.tu = 'recenter';
    tap(el('button', 'tu-btn tu-sm', '?', util2), () => tapKey('h')).dataset.tu = 'help';
    tap(el('button', 'tu-btn tu-sm tu-txt', '3D/2D', util2), () => tapKey('v')).dataset.tu = 'view';
    const chat = el('button', 'tu-btn tu-sm tu-chat', '💬', util2); chat.dataset.tu = 'chat';
    if (FS.available()) tap(el('button', 'tu-btn tu-sm tu-fs', '⛶', util2), () => FS.toggle()).dataset.tu = 'fullscreen';
    T.util = util; T.util2 = util2;
    buildGameMode();
    chat.addEventListener('click', () => { const i = $('chatInput'); if (i) i.focus(); }); // focus inside the tap: the on-screen keyboard opens
    bar = el('div', 'tu-bar', '<div class="tu-brow tu-brow1"></div><div class="tu-brow tu-brow2"><div class="tu-info"></div><div class="tu-items"></div></div>');
    bar.id = 'tuBar'; bar.addEventListener('pointerdown', onBar); bar.addEventListener('contextmenu', noDefault);
    rotate = el('div', 'tu-rotate hidden', '<span>📱↻ Rotate your phone to landscape for a bigger battlefield</span><button aria-label="dismiss">✕</button>', document.body);
    rotate.querySelector('button').addEventListener('click', () => { T.rotateDismissed = true; rotate.classList.add('hidden'); });
    sheet = el('div', 'tu-sheet hidden', `<div class="tu-sheetcard"><h4>MENU</h4>
      <button class="big" data-s="resume">RESUME</button><button class="big alt" data-s="pause">PAUSE / UNPAUSE</button>
      <button class="big alt" data-s="help">HOW TO PLAY</button><button class="big alt" data-s="quit">QUIT TO TITLE</button></div>`, document.body);
    sheet.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b && e.target !== sheet) return;
      const s = b ? b.dataset.s : 'resume'; sheet.classList.add('hidden');
      if (s === 'pause') tapKey('p'); else if (s === 'help') tapKey('h');
      else if (s === 'quit') { if (confirm('Quit this game and go back to the title screen?')) location.reload(); }
    });
  }
  function noDefault(e) { if (e.cancelable) e.preventDefault(); }
  function blurInputs() { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) a.blur(); }
  function hold(b, key, name) {
    b.dataset.tu = name;
    b.addEventListener('pointerdown', e => { noDefault(e); blurInputs(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } b.classList.add('on'); keyDown(key); });
    const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); keyUp(key); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', noDefault);
    return b;
  }
  function tap(b, fn) { b.addEventListener('pointerdown', noDefault); b.addEventListener('click', e => { noDefault(e); fn(); }); b.addEventListener('contextmenu', noDefault); return b; }

  // ---------------------------------------------------------------- Game Mode: fullscreen API (Android, iPad, desktop browsers
  // with touch) or, on iPhone Safari (no element fullscreen), the Home Screen web app (manifest + apple meta tags)
  const FS = T.fs = {
    available() { const d = document, e = d.documentElement; return !!((d.fullscreenEnabled || d.webkitFullscreenEnabled) && (e.requestFullscreen || e.webkitRequestFullscreen)); },
    active() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
    async enter() {
      const e = document.documentElement;
      try { if (e.requestFullscreen) await e.requestFullscreen({ navigationUI: 'hide' }); else if (e.webkitRequestFullscreen) e.webkitRequestFullscreen(); } catch (x) { return false; }
      try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (x) { /* not allowed here: fine */ }
      return true;
    },
    exit() { const d = document; try { if (d.exitFullscreen) d.exitFullscreen(); else if (d.webkitExitFullscreen) d.webkitExitFullscreen(); } catch (x) { /* ignore */ } },
    toggle() { T.stats.fs = (T.stats.fs || 0) + 1; if (FS.active()) FS.exit(); else FS.enter(); },
  };
  const ua = navigator.userAgent || '';
  T.isIPhone = /iPhone|iPod/.test(ua);
  T.isIOS = T.isIPhone || /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  T.standalone = () => { try { return !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches); } catch (e) { return false; } };
  const TIP_KEY = 'shillshock.homeTip';
  function buildGameMode() { // title screen: fullscreen button where the API exists, else the one-time Add to Home Screen tip (iOS Safari tab)
    const title = $('scrTitle'); if (!title) return;
    const row = document.createElement('div'); row.className = 'tu-gm'; title.appendChild(row);
    if (FS.available()) {
      const b = document.createElement('button'); b.className = 'big alt tu-fsbig'; b.id = 'fsBtn'; b.textContent = '⛶ FULL SCREEN';
      b.addEventListener('click', () => FS.toggle()); row.appendChild(b);
      const upd = () => { b.textContent = FS.active() ? '✕ EXIT FULL SCREEN' : '⛶ FULL SCREEN'; root.classList.toggle('tu-fullscreen', FS.active()); setTimeout(layout, 60); };
      document.addEventListener('fullscreenchange', upd); document.addEventListener('webkitfullscreenchange', upd);
    } else if (T.isIOS && !T.standalone()) {
      let seen = false; try { seen = localStorage.getItem(TIP_KEY) === '1'; } catch (e) { /* private mode */ }
      if (!seen) {
        row.innerHTML = '<div class="tu-tip" id="homeTip"><span>📲 For full screen: tap <b>Share</b> <span class="tu-share">⬆</span>, then <b>Add to Home Screen</b></span><button aria-label="dismiss tip">✕</button></div>';
        row.querySelector('button').addEventListener('click', () => { row.innerHTML = ''; });
        try { localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* ignore */ } // one-time: shown once, then remembered
      }
    }
    if (T.standalone()) root.classList.add('tu-standalone');
  }

  // ---------------------------------------------------------------- fill the screen: canvas = safe area, view width = screen aspect
  let probe = null;
  function insets() {
    if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(probe); }
    const c = getComputedStyle(probe); return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 };
  }
  function layout() {
    if (!T.on) return;
    const g = game(), wrap = $('wrap'), vv = window.visualViewport;
    const vw = Math.round(vv ? vv.width : innerWidth), vh = Math.round(vv ? vv.height : innerHeight), ins = insets();
    const portrait = vh > vw;
    const aw = Math.max(200, vw - ins.l - ins.r), ah = Math.max(150, vh - (portrait ? 0 : ins.t + ins.b * 0.5));
    if (g && g.setViewWidth) g.setViewWidth(portrait ? MAP_W : viewWidthFor(aw, ah));
    const cw = Math.min(aw, ah * W / H), ch = cw * H / W;
    wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px'; wrap.style.aspectRatio = W + ' / ' + H;
    if (!portrait) { wrap.style.left = ins.l + 'px'; wrap.style.right = ins.r + 'px'; wrap.style.top = ins.t + 'px'; wrap.style.bottom = (ins.b * 0.5) + 'px'; }
    else { wrap.style.left = wrap.style.right = wrap.style.bottom = ''; wrap.style.top = ''; }
    T.view = { vw, vh, W, cw: Math.round(cw), ch: Math.round(ch), ins };
    placeUtil(portrait);
    placeBar(portrait);
  }
  // 2-row weapon bar between the thumb clusters (landscape) / under the canvas (portrait), then the view padding
  function placeBar(portrait) {
    if (!bar) return;
    const lc = ui.querySelector('.tu-left'), rc = ui.querySelector('.tu-right'), was = ui.classList.contains('hidden');
    if (was) ui.classList.remove('hidden');
    const lr = lc.getBoundingClientRect(), rr = rc.getBoundingClientRect(), r = cv.getBoundingClientRect();
    if (portrait) { bar.style.left = '6px'; bar.style.right = '6px'; bar.style.bottom = ''; bar.style.top = (r.bottom + 62) + 'px'; }
    else { bar.style.top = ''; bar.style.left = (lr.right + 8) + 'px'; bar.style.right = (innerWidth - rr.left + 8) + 'px'; bar.style.bottom = getComputedStyle(lc).bottom; }
    if (was) ui.classList.add('hidden');
    updatePad(portrait);
  }
  function updatePad(portrait) { // touch only: keep the playfield clear of the top HUD row and the bottom controls
    const g = game(); if (!g) return;
    g.touchBar = true; // the canvas bottom bar is replaced by the DOM bar
    if (portrait) { g.viewPad = null; return; }
    const r = cv.getBoundingClientRect(), s = r.height / H || 1;
    let top = 146; // team panel / timer / minimap / wind panel
    for (const u of [T.util, T.util2]) { if (!u || u.dataset.side) continue; const b = u.getBoundingClientRect(); if (b.height) top = Math.max(top, (b.bottom - r.top) / s + 4); }
    const was = ui.classList.contains('hidden'); if (was) ui.classList.remove('hidden');
    const bb = bar.getBoundingClientRect(); if (was) ui.classList.add('hidden');
    const bot = Math.max(0, (r.bottom - bb.top) / s + 4);
    g.viewPad = { top: Math.round(top), bot: Math.round(bot), shift: (top - bot) / 2 };
  }
  function placeUtil(portrait) {
    const u1 = T.util, u2 = T.util2; if (!u1) return;
    const r = cv.getBoundingClientRect(), s = r.width / W, n1 = u1.children.length, n2 = [...u2.children].filter(e => getComputedStyle(e).display !== 'none').length;
    const need = n => n * 46 + (n - 1) * 6;
    for (const u of [u1, u2]) { u.style.flexDirection = 'row'; u.style.left = u.style.right = u.style.top = u.style.width = u.style.flexWrap = u.style.justifyContent = ''; delete u.dataset.side; }
    if (portrait) { const top = r.bottom + 10; u1.style.top = u2.style.top = top + 'px'; u1.style.left = '6px'; u2.style.right = '6px'; return; }
    if (r.top >= 54) { // letterbox room above the canvas (e.g. iPad): put the buttons there
      u1.style.top = u2.style.top = (r.top - 52) + 'px'; u1.style.left = (r.left + 6) + 'px'; u2.style.right = (innerWidth - r.right + 6) + 'px'; return; }
    // full-screen canvas: the gaps in the top HUD row (between the team panel and the timer, between the minimap and the wind panel)
    const l0 = r.left + 308 * s, l1 = r.left + (W / 2 - 236) * s, r0 = r.left + (W / 2 + 236) * s, r1 = r.left + (W - 248) * s;
    if (l1 - l0 >= need(n1) && r1 - r0 >= need(n2)) {
      u1.style.top = u2.style.top = (r.top + 6 * s + 2) + 'px'; u1.style.left = l0 + 'px'; u2.style.right = (innerWidth - r1) + 'px';
    } else {
      // narrower screens: a column under the team panel and a 2-wide block under the wind panel (side edges, clear of the thumb clusters)
      u1.style.top = (r.top + 146 * s) + 'px'; u1.style.left = (r.left + 6) + 'px'; u1.style.flexDirection = 'column'; u1.dataset.side = '1';
      u2.style.top = (r.top + 102 * s) + 'px'; u2.style.right = (innerWidth - r.right + 6) + 'px'; u2.style.flexDirection = 'row'; u2.style.flexWrap = 'wrap'; u2.style.width = '98px'; u2.style.justifyContent = 'flex-end'; u2.dataset.side = '1';
      return;
    }
  }
  T.layout = layout;
  let lt = 0; const relayout = () => { cancelAnimationFrame(lt); lt = requestAnimationFrame(() => { layout(); setTimeout(layout, 250); }); };
  window.addEventListener('resize', relayout); window.addEventListener('orientationchange', relayout);
  if (window.visualViewport) visualViewport.addEventListener('resize', relayout);

  // ---------------------------------------------------------------- 2-row weapon bar (feeds the number keys / E, like the keyboard)
  // row 1: the base weapons (attacks + defenses + specials); row 2: angle / power / steps / jump info + crate items
  let barSig = '', infoSig = '';
  function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  function slotHtml(g, team, wid, i, base) {
    const w = WEAPONS[wid] || {}, has = g.hasAmmo(team, wid), sel = i === team.weaponIdx;
    const n = wid in team.ammo ? team.ammo[wid] : null, crate = i >= base;
    const kind = crate ? 'crate' : w.kind === 'defense' ? 'defense' : 'attack';
    const cnt = n == null ? '∞' : n + (crate ? '' : ' left');
    return `<button class="tu-ws ${kind}${w.special ? ' special' : ''}${sel ? ' sel' : ''}${has ? '' : ' empty'}" data-i="${i}"${has ? '' : ' aria-disabled="true"'}>` +
      `<span class="tu-wn"><b>${i < 9 ? i + 1 : '·'}</b> ${esc(w.name || wid)}</span><small>${crate ? '' : w.special ? '★ ' : ''}${cnt}</small></button>`;
  }
  function updateBar() {
    const g = game(); if (!g || !g.cur || !bar) return;
    const team = g.teams[g.turnTeam]; if (!team) return;
    const base = typeof BASE_SLOTS !== 'undefined' ? BASE_SLOTS : 5, ws = team.weapons;
    const sig = g.turnTeam + '|' + team.weaponIdx + '|' + ws.join(',') + '|' + ws.map(w => (w in team.ammo ? team.ammo[w] : '') + (g.hasAmmo(team, w) ? 'y' : 'n')).join(',');
    if (sig !== barSig) {
      barSig = sig;
      bar.querySelector('.tu-brow1').innerHTML = ws.slice(0, base).map((wid, i) => slotHtml(g, team, wid, i, base)).join('');
      const items = ws.slice(base);
      bar.querySelector('.tu-items').innerHTML = items.length ? items.map((wid, k) => slotHtml(g, team, wid, base + k, base)).join('')
        : '<span class="tu-noitems">CRATE ITEMS: walk into a supply crate</span>';
    }
    const u = g.cur, w = WEAPONS[ws[team.weaponIdx]] || {}, jc = g.jumpCharge;
    const pv = jc ? jc.p : g.charging ? g.power : g.phase === 'fire' ? g.firedPower || 0 : 0;
    const steps = g.walkLeft != null ? Math.max(0, Math.min(1, g.walkLeft / WALK_BUDGET)) : null;
    const tags = [u.scope > 0 ? 'SCOPE×' + u.scope : '', u.fud ? 'FUD' : '', u.poison ? 'GAS' : ''].filter(Boolean).join(' ');
    const isig = [w.kind, Math.round(u.aim), Math.round(pv * 50), jc ? (jc.back ? 'b' : 'j') : '', steps == null ? '' : Math.round(steps * 30), g.jumpsLeft, tags].join('|');
    if (isig !== infoSig) {
      infoSig = isig;
      const top = w.kind === 'defense' ? '<b class="tu-def">DEFENSE · FIRE uses it</b>' : `<b>${Math.round(u.aim)}°</b> <span>${jc ? (jc.back ? 'FLIP' : 'JUMP') : 'POWER'}</span>`;
      bar.querySelector('.tu-info').innerHTML = `<div class="tu-i1">${top}${g.jumpsLeft != null ? `<i class="${g.jumpsLeft > 0 ? 'ok' : ''}">${g.jumpsLeft > 0 ? 'JUMP✓' : 'JUMP✗'}</i>` : ''}${tags ? `<i class="ok">${tags}</i>` : ''}</div>` +
        `<div class="tu-pw"><div class="${jc ? 'j' : ''}" style="width:${Math.round(pv * 100)}%"></div></div>` +
        (steps != null ? `<div class="tu-st"><span>STEPS</span><div><div style="width:${Math.round(steps * 100)}%"></div></div></div>` : '');
    }
  }
  function pickWeapon(i) {
    const g = game(); if (!g) return;
    const team = g.teams[g.turnTeam];
    T.stats.picks++;
    if (i < 9) { tapKey(String(i + 1)); return; }
    // slot 10+ (many crate items): step with E (same as the keyboard); cycleWeapon skips empty slots
    for (let n = 0; n < team.weapons.length && team.weaponIdx !== i; n++) tapKey('e');
  }
  function onBar(e) {
    const b = e.target.closest('.tu-ws'); if (!b) return;
    noDefault(e); blurInputs();
    if (b.classList.contains('empty') || !myTurn()) return;
    pickWeapon(+b.dataset.i); updateBar();
  }

  function openSheet() { sheet.classList.remove('hidden'); }

  // ---------------------------------------------------------------- canvas gestures: drag-aim, pan, pinch zoom, minimap
  const touches = new Map();
  let gest = null;
  const AIM_DEAD = 40; // canvas px around the character where a finger doesn't change the aim
  function toCanvas(t) { const r = cv.getBoundingClientRect(); return { x: (t.clientX - r.left) * W / (r.width || W), y: (t.clientY - r.top) * H / (r.height || H) }; }
  function unitScreen(g, u) { // the character's (aim origin) position on the canvas, 2D or 3D
    if (g.r3d && g.r3d.active && g.r3d.project) { const p = g.r3d.project(u.x, u.y - 16); return { x: p.x, y: p.y }; }
    return { x: (u.x - g.camX) * g.zoom, y: (u.y - 16 - g.camY) * g.zoom };
  }
  function aimAt(g, p) {
    const u = g.cur; if (!u) return;
    const o = unitScreen(g, u), dx = p.x - o.x, dy = o.y - p.y, dist = Math.hypot(dx, dy);
    g.touchAim = { ux: o.x, uy: o.y, fx: p.x, fy: p.y, deg: u.aim, dead: dist < AIM_DEAD };
    if (dist < AIM_DEAD) return;
    const f = Math.abs(dx) < 2 ? u.facing : dx > 0 ? 1 : -1;
    const deg = Math.max(-88, Math.min(88, Math.atan2(dy, Math.max(Math.abs(dx), 0.0001)) * 180 / Math.PI));
    g.touchAim.deg = deg; T.stats.aims = (T.stats.aims || 0) + 1;
    if (g.mirror) { if (window.Online && Online.sendAim) Online.sendAim(deg, f); }
    else g.setAim(deg, f);
  }
  function two(ts) { return { d: Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y), mx: (ts[0].x + ts[1].x) / 2, my: (ts[0].y + ts[1].y) / 2 }; }
  function onStart(e) {
    if (!T.on) enable('touchstart');
    const g = game(); if (!g) return;
    if (!playing()) return; // menus: let the browser handle taps (canvas is behind the menu anyway)
    noDefault(e); blurInputs();
    for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    const ts = [...touches.values()];
    if (ts.length >= 2) { // pinch + 2-finger pan
      if (gest && gest.aim) { g.camHold = gest.hold0; if (performance.now() - gest.t0 < 300 && g.cur) { if (g.mirror) { if (window.Online && Online.sendAim) Online.sendAim(gest.aim0, gest.f0); } else g.setAim(gest.aim0, gest.f0); } } // 2nd finger landed right after: it was a pinch, not an aim
      const q = two(ts); g.touchAim = null; gest = { pinch: true, d: q.d, mx: q.mx, my: q.my }; return;
    }
    const t = e.changedTouches[0], p = toCanvas(t);
    if (g.state === 'play' && g.minimapAt(p.x, p.y)) { gest = { mini: true }; g.minimapPan(p.x); return; }
    if (myTurn() && !g.userPaused && (WEAPONS[g.teams[g.turnTeam].weapons[g.teams[g.turnTeam].weaponIdx]] || {}).kind !== 'defense') {
      gest = { aim: true, t0: performance.now(), aim0: g.cur.aim, f0: g.cur.facing, hold0: g.camHold };
      g.camHold = true; // the camera holds still while you aim, so the aim origin doesn't drift under your finger
      aimAt(g, p); return;
    }
    gest = { x: t.clientX, y: t.clientY, cam: g.camX, camY: g.camY, moved: false, p };
  }
  function onMove(e) {
    const g = game(); if (!g || !gest) return;
    noDefault(e);
    for (const t of e.changedTouches) if (touches.has(t.identifier)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    const ts = [...touches.values()];
    const r = cv.getBoundingClientRect(), scale = W / (r.width || W) / g.zoom;
    if (gest.pinch) {
      if (ts.length < 2) return;
      const q = two(ts);
      if (Math.abs(q.mx - gest.mx) + Math.abs(q.my - gest.my) > 0.5) { // two-finger drag pans
        g.camHold = true; g.camX = g.clampCam(g.camX - (q.mx - gest.mx) * scale); g.camY = g.clampCamY(g.camY - (q.my - gest.my) * scale);
        gest.mx = q.mx; gest.my = q.my; T.stats.pans++;
      }
      if (q.d > 10 && gest.d > 10 && Math.abs(q.d / gest.d - 1) > 0.01) {
        g.camHold = true; g.zoomBy(q.d / gest.d, toCanvas({ clientX: q.mx, clientY: q.my })); gest.d = q.d; T.stats.pinches++;
      }
      return;
    }
    const t = e.changedTouches[0];
    if (gest.aim) { if (myTurn()) aimAt(g, toCanvas(t)); else g.touchAim = null; return; }
    if (gest.mini) { g.minimapPan(toCanvas(t).x); return; }
    if (Math.abs(t.clientX - gest.x) > 6 || Math.abs(t.clientY - gest.y) > 6) gest.moved = true;
    if (gest.moved) {
      g.camHold = true; g.camX = g.clampCam(gest.cam - (t.clientX - gest.x) * scale);
      g.camY = g.clampCamY(gest.camY - (t.clientY - gest.y) * scale); T.stats.pans++;
    }
  }
  function onEnd(e) {
    for (const t of e.changedTouches) touches.delete(t.identifier);
    if (!gest) return;
    noDefault(e);
    const g = game();
    if (touches.size === 0) { if (gest.aim && g) g.camHold = gest.hold0; gest = null; if (g) g.touchAim = null; }
    else if (gest.pinch && touches.size === 1) { const t = [...touches.values()][0]; gest = { x: t.x, y: t.y, cam: g.camX, camY: g.camY, moved: true, p: { x: 0, y: 0 } }; } // lifting one finger: keep panning
  }
  cv.addEventListener('touchstart', onStart, { passive: false });
  cv.addEventListener('touchmove', onMove, { passive: false });
  cv.addEventListener('touchend', onEnd, { passive: false });
  cv.addEventListener('touchcancel', onEnd, { passive: false });

  // ---------------------------------------------------------------- enable + per-frame sync
  function enable(why) {
    if (T.on || force === '0') return;
    T.on = true; T.why = why; root.classList.add('touch');
    if (!ui) build();
    layout(); sync(); requestAnimationFrame(loop);
  }
  let wasPlaying = false, lastUnits = null; const TOUCH_ZOOM = 0.85;
  T.updateBar = () => updateBar();
  function sync() {
    const p = playing(), g = game();
    root.classList.toggle('tu-play', p);
    ui.classList.toggle('hidden', !p);
    if (!p) { if (wasPlaying) { releaseAll(); sheet.classList.add('hidden'); if (g) g.touchAim = null; } wasPlaying = false; rotate.classList.add('hidden'); return; }
    if (!wasPlaying || g.units !== lastUnits) { // a new battle: compact default zoom + padding for the HUD rows
      lastUnits = g.units; g.zoom = g.zoomT = Math.max(g.minZoom ? g.minZoom() : 0, TOUCH_ZOOM); placeBar(innerHeight > innerWidth);
    }
    wasPlaying = true;
    const mine = myTurn();
    ui.classList.toggle('tu-wait', !mine);
    if (!mine && held.size) releaseAll();
    if (!mine && g.touchAim) g.touchAim = null;
    ui.classList.toggle('tu-help', !!g.showHelp); // help card open: the weapon bar steps aside (GOT IT button)
    ui.classList.toggle('tu-def', !!(g.cur && (WEAPONS[(g.teams[g.turnTeam] || { weapons: [] }).weapons[(g.teams[g.turnTeam] || {}).weaponIdx]] || {}).kind === 'defense'));
    updateBar();
    const onl = !!online() && !$('netchat').classList.contains('hidden');
    if (onl !== ui.classList.contains('tu-online')) { ui.classList.toggle('tu-online', onl); placeUtil(innerHeight > innerWidth); }
    const portrait = innerHeight > innerWidth;
    rotate.classList.toggle('hidden', !portrait || !!T.rotateDismissed || !g || g.state !== 'play');
  }
  // drag-aim overlay (drawn by game.drawHUD in canvas pixels; only exists in touch mode)
  if (typeof Game !== 'undefined') Game.prototype.drawTouchAim = function (ctx) {
    const a = this.touchAim; if (!a || !this.cur) return;
    ctx.save(); ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.strokeStyle = a.dead ? 'rgba(255,255,255,0.35)' : 'rgba(255,216,74,0.85)';
    ctx.beginPath(); ctx.moveTo(a.ux, a.uy); ctx.lineTo(a.fx, a.fy); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(a.ux, a.uy, AIM_DEAD, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(a.fx, a.fy, 22, 0, Math.PI * 2); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.fx - 30, a.fy); ctx.lineTo(a.fx + 30, a.fy); ctx.moveTo(a.fx, a.fy - 30); ctx.lineTo(a.fx, a.fy + 30); ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#ffd84a';
    const t = Math.round(this.cur.aim) + '°', ty = a.fy - 34 < 30 ? a.fy + 56 : a.fy - 34;
    ctx.strokeText(t, a.fx, ty); ctx.fillText(t, a.fx, ty); ctx.restore();
  };
  function loop() { try { sync(); } catch (e) { console.error(e); } requestAnimationFrame(loop); }

  // new menu page: start it scrolled to the top on small screens
  let shownStep = null;
  const mo = new MutationObserver(() => { if (!T.on) return; const vis = document.querySelector('#menu .screen:not(.hidden)'); const id = vis && vis.id;
    if (id !== shownStep) { shownStep = id; $('menu').scrollTop = 0; } });
  document.querySelectorAll('#menu .screen').forEach(sc => mo.observe(sc, { attributes: true, attributeFilter: ['class'] }));

  if (force === '1') enable('query');
  else if (force !== '0') {
    let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) { /* old browser */ }
    if (coarse) enable('pointer-coarse');
    else window.addEventListener('touchstart', () => enable('touchstart'), { once: true, passive: true, capture: true });
  }
})();
