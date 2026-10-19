// Shill Shock — mobile touch controls.
// Only active on touch devices: (pointer: coarse), the first touchstart, or ?touch=1 (?touch=0 forces it off).
// Nothing here changes desktop input: every button synthesizes the SAME keyboard events the keyboard sends
// (keydown/keyup on window), so walking, the STEPS budget, jump charge, fire charge, weapon keys and the
// online relay all run through the existing handlers. Camera pan/pinch use the same camera calls as the mouse.
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
  let ui, picker, rotate, sheet;
  function build() {
    ui = document.createElement('div'); ui.id = 'touchUI'; ui.className = 'hidden'; document.body.appendChild(ui);
    const left = el('div', 'tu-cl tu-left'), right = el('div', 'tu-cl tu-right'), util = el('div', 'tu-util'), util2 = el('div', 'tu-util tu-util2');
    // aim pad: press / slide on the upper half = aim up, lower half = aim down (drag to aim)
    const aim = el('div', 'tu-btn tu-aim', '<span>▲</span><small>AIM</small><span>▼</span>', left); aim.dataset.tu = 'aim';
    const walk = el('div', 'tu-row', null, left);
    hold(el('button', 'tu-btn tu-walk', '◀', walk), 'ArrowLeft', 'walkL');
    hold(el('button', 'tu-btn tu-walk', '▶', walk), 'ArrowRight', 'walkR');
    const colB = el('div', 'tu-col', null, right), colA = el('div', 'tu-col', null, right);
    hold(el('button', 'tu-btn tu-flip', '↶<small>FLIP</small>', colB), 'Backspace', 'flip');
    hold(el('button', 'tu-btn tu-jump', '⤒<small>JUMP</small>', colB), 'Enter', 'jump');
    const arms = el('button', 'tu-btn tu-arms', '🎯<small>ARMS</small>', colA); arms.dataset.tu = 'arms';
    tap(arms, () => togglePicker());
    hold(el('button', 'tu-btn tu-fire', 'FIRE<small>hold</small>', colA), ' ', 'fire');
    // utility row: pause/menu, recenter, view, help, chat
    tap(el('button', 'tu-btn tu-sm', '⏸', util), () => openSheet()).dataset.tu = 'menu';
    tap(el('button', 'tu-btn tu-sm', '◎', util), () => tapKey('c')).dataset.tu = 'recenter';
    tap(el('button', 'tu-btn tu-sm', '?', util2), () => tapKey('h')).dataset.tu = 'help';
    tap(el('button', 'tu-btn tu-sm tu-txt', '3D/2D', util2), () => tapKey('v')).dataset.tu = 'view';
    const chat = el('button', 'tu-btn tu-sm tu-chat', '💬', util2); chat.dataset.tu = 'chat';
    chat.addEventListener('click', () => { const i = $('chatInput'); if (i) i.focus(); }); // focus inside the tap: the on-screen keyboard opens
    aimPad(aim);

    picker = el('div', 'tu-picker hidden', '', document.body); picker.id = 'touchPicker';
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
  function aimPad(pad) {
    let cur = null, pid = null;
    const set = k => { if (k === cur) return; if (cur) keyUp(cur); cur = k; if (k) keyDown(k); pad.classList.toggle('up', k === 'ArrowUp'); pad.classList.toggle('down', k === 'ArrowDown'); };
    const at = e => { const r = pad.getBoundingClientRect(), f = (e.clientY - r.top) / r.height; return f < 0.42 ? 'ArrowUp' : f > 0.58 ? 'ArrowDown' : null; };
    pad.addEventListener('pointerdown', e => { noDefault(e); blurInputs(); pid = e.pointerId; try { pad.setPointerCapture(pid); } catch (x) { /* ignore */ } set(at(e)); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === pid) set(at(e)); });
    const end = () => { pid = null; set(null); };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end);
  }

  // ---------------------------------------------------------------- weapon / crate item picker (feeds the number keys)
  function togglePicker(show) {
    show = show == null ? picker.classList.contains('hidden') : show;
    if (!show) { picker.classList.add('hidden'); return; }
    const g = game(); if (!g || !g.cur) return;
    const team = g.teams[g.turnTeam], ws = team.weapons, base = typeof BASE_SLOTS !== 'undefined' ? BASE_SLOTS : 5;
    let html = '<div class="tu-ph">ARMS <button class="tu-x" data-i="x">✕</button></div><div class="tu-plist">';
    ws.forEach((wid, i) => {
      const w = WEAPONS[wid] || {}, has = g.hasAmmo(team, wid), n = wid in team.ammo ? team.ammo[wid] : '∞';
      const tag = i >= base ? 'crate' : w.kind === 'defense' ? 'defense' : 'attack';
      if (i === base) html += '<div class="tu-psep">CRATE ITEMS</div>';
      html += `<button class="tu-pi ${tag}${i === team.weaponIdx ? ' sel' : ''}" data-i="${i}" ${has ? '' : 'disabled'}><b>${i < 9 ? i + 1 : '·'}</b> ${w.name || wid}<small>${tag} · ${n}</small></button>`;
    });
    picker.innerHTML = html + '</div>';
    picker.classList.remove('hidden');
  }
  function pickWeapon(i) {
    const g = game(); if (!g) return;
    const team = g.teams[g.turnTeam];
    T.stats.picks++;
    if (i < 9) { tapKey(String(i + 1)); return; }
    // slot 10+ (many crate items): step with E (same as the keyboard); cycleWeapon skips empty slots
    for (let n = 0; n < team.weapons.length && team.weaponIdx !== i; n++) tapKey('e');
  }
  function onPicker(e) {
    const b = e.target.closest('button'); if (!b) { return; }
    noDefault(e);
    if (b.dataset.i === 'x') { togglePicker(false); return; }
    if (b.disabled) return;
    pickWeapon(+b.dataset.i); togglePicker(false);
  }

  function openSheet() { sheet.classList.remove('hidden'); }

  // ---------------------------------------------------------------- canvas gestures: 1-finger pan, pinch zoom, minimap, weapon bar
  const touches = new Map();
  let gest = null;
  function toCanvas(t) { const r = cv.getBoundingClientRect(); return { x: (t.clientX - r.left) * W / (r.width || W), y: (t.clientY - r.top) * H / (r.height || H) }; }
  function onStart(e) {
    if (!T.on) enable('touchstart');
    const g = game(); if (!g) return;
    if (!playing()) return; // menus: let the browser handle taps (canvas is behind the menu anyway)
    noDefault(e); blurInputs();
    for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    const ts = [...touches.values()];
    if (ts.length >= 2) { // pinch
      const d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y);
      gest = { pinch: true, d }; return;
    }
    const t = e.changedTouches[0], p = toCanvas(t);
    if (g.state === 'play' && g.minimapAt(p.x, p.y)) { gest = { mini: true }; g.minimapPan(p.x); return; }
    gest = { x: t.clientX, y: t.clientY, cam: g.camX, camY: g.camY, moved: false, p };
  }
  function onMove(e) {
    const g = game(); if (!g || !gest) return;
    noDefault(e);
    for (const t of e.changedTouches) if (touches.has(t.identifier)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    const ts = [...touches.values()];
    if (gest.pinch) {
      if (ts.length < 2) return;
      const d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y);
      if (d > 10 && gest.d > 10 && Math.abs(d / gest.d - 1) > 0.01) {
        const mid = toCanvas({ clientX: (ts[0].x + ts[1].x) / 2, clientY: (ts[0].y + ts[1].y) / 2 });
        g.camHold = true; g.zoomBy(d / gest.d, mid); gest.d = d; T.stats.pinches++;
      }
      return;
    }
    const t = e.changedTouches[0];
    if (gest.mini) { g.minimapPan(toCanvas(t).x); return; }
    const r = cv.getBoundingClientRect(), scale = W / (r.width || W) / g.zoom;
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
    if (gest.pinch) { if (touches.size === 0) gest = null; return; }
    const g = game();
    // a tap (no drag) on the bottom weapon bar / crate row opens the picker
    if (!gest.mini && !gest.moved && g && g.state === 'play' && gest.p.y > H - 118 && gest.p.x > 100 && gest.p.x < 1180) togglePicker(true);
    if (touches.size === 0) gest = null;
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
    picker.addEventListener('click', onPicker);
    sync(); requestAnimationFrame(loop);
  }
  let wasPlaying = false;
  function sync() {
    const p = playing(), g = game();
    root.classList.toggle('tu-play', p);
    ui.classList.toggle('hidden', !p);
    if (!p) { if (wasPlaying) { releaseAll(); togglePicker(false); sheet.classList.add('hidden'); } wasPlaying = false; rotate.classList.add('hidden'); return; }
    wasPlaying = true;
    const mine = myTurn();
    ui.classList.toggle('tu-wait', !mine);
    if (!mine && held.size) releaseAll();
    if (!mine && !picker.classList.contains('hidden')) togglePicker(false);
    ui.classList.toggle('tu-online', !!online() && !$('netchat').classList.contains('hidden'));
    const portrait = innerHeight > innerWidth;
    rotate.classList.toggle('hidden', !portrait || !!T.rotateDismissed || !g || g.state !== 'play');
  }
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
