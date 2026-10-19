'use strict';
// Original, procedurally drawn parody mascots. Each draws facing RIGHT with feet at (0,0).
// Roughly 40px tall at scale 1.

function _ell(ctx, x, y, rx, ry, fill, stroke, rot) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function _tri(ctx, a, b, c, d, e, f, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

const MASCOTS = {
  // Shiba-style dog: orange/tan with cream face, pointy ears, curled tail, judgemental side-eye.
  DOGE(ctx, t, blink) {
    const O = '#e9a04a', OD = '#b86f2a', C = '#fbe8c8', K = '#2a1a10', L = '#4a2a12';
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    // curled tail
    _ell(ctx, -11, -17, 5.5, 5.5, O, L);
    _ell(ctx, -11, -17, 2.6, 2.6, C);
    // legs
    _ell(ctx, -6, -2.5, 3.5, 3, OD, L); _ell(ctx, 6, -2.5, 3.5, 3, OD, L);
    // body
    _ell(ctx, 0, -10, 11, 8, O, L);
    _ell(ctx, 3, -8, 6.5, 5, C);
    // ears
    _tri(ctx, -4, -27, -3, -40, 4, -31, O, L); _tri(ctx, -2.5, -29, -2.2, -36.5, 2, -31, '#c4622e');
    _tri(ctx, 6, -31, 11, -41, 14, -27, O, L); _tri(ctx, 7.5, -31, 11, -38, 12.5, -29, '#c4622e');
    // head
    _ell(ctx, 4, -23, 10.5, 9, O, L);
    // cream lower face / cheeks
    _ell(ctx, 7.5, -19, 7.5, 5, C);
    _ell(ctx, 0, -19, 4, 3.2, C);
    // cream eyebrow dots
    _ell(ctx, 3, -28.3, 1.7, 1.1, C); _ell(ctx, 9.5, -28.3, 1.7, 1.1, C);
    // side-eye
    if (blink) { ctx.strokeStyle = K; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(2, -25); ctx.lineTo(6, -25); ctx.moveTo(8, -25); ctx.lineTo(11.5, -25); ctx.stroke(); }
    else {
      _ell(ctx, 4.2, -24.8, 1.9, 2.3, K); _ell(ctx, 10, -24.8, 1.7, 2.1, K);
      _ell(ctx, 4.9, -25.6, 0.6, 0.6, '#fff'); _ell(ctx, 10.6, -25.6, 0.55, 0.55, '#fff');
    }
    // nose + mouth
    _ell(ctx, 14.2, -21.2, 2.3, 1.7, K);
    ctx.strokeStyle = K; ctx.lineWidth = 1.1; ctx.beginPath();
    ctx.moveTo(14, -19.5); ctx.quadraticCurveTo(13, -16.8, 10, -17.3); ctx.stroke();
  },

  // Smug green frog with heavy-lidded eyes, wide lips and a gold chain.
  FROG(ctx, t, blink) {
    const G = '#5cb648', GD = '#2f7a28', B = '#d6eeb0', K = '#161616', L = '#a3473a';
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    _ell(ctx, -6, -2.5, 4.5, 2.8, GD, '#1d4d18'); _ell(ctx, 7, -2.5, 4.5, 2.8, GD, '#1d4d18');
    _ell(ctx, 0, -10, 10, 9, G, '#1d4d18');
    _ell(ctx, 2, -9, 6, 6.5, B);
    // gold chain (very rare)
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(2, -15, 6.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    _ell(ctx, 2, -8.3, 2.1, 2.1, '#ffd84a', '#a8761a');
    ctx.lineWidth = 1.5;
    // head
    _ell(ctx, 3, -21, 12.5, 8, G, '#1d4d18');
    // eye bulbs
    _ell(ctx, -2, -28, 5.6, 5.6, G, '#1d4d18'); _ell(ctx, 8.5, -28, 5.6, 5.6, G, '#1d4d18');
    _ell(ctx, -2, -28, 4.2, 3.8, '#fff'); _ell(ctx, 8.5, -28, 4.2, 3.8, '#fff');
    _ell(ctx, 0.3, -27.4, 1.9, 1.9, K); _ell(ctx, 10.8, -27.4, 1.9, 1.9, K);
    // heavy smug lids
    const lid = blink ? 0.0 : 0.35;
    [[-2, -28], [8.5, -28]].forEach(([ex, ey]) => {
      ctx.beginPath(); ctx.ellipse(ex, ey - 0.2, 4.6, 4.3, 0, Math.PI + lid * 0, Math.PI * 2 - 0);
      ctx.lineTo(ex + 4.6, ey + (blink ? 4 : 0.3)); ctx.lineTo(ex - 4.6, ey + (blink ? 4 : 0.3)); ctx.closePath();
      ctx.fillStyle = G; ctx.fill();
      ctx.strokeStyle = GD; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(ex - 4.4, ey + (blink ? 3.5 : 0.3)); ctx.lineTo(ex + 4.4, ey + (blink ? 3.5 : 0.3)); ctx.stroke();
    });
    // wide lips
    ctx.strokeStyle = L; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -19); ctx.quadraticCurveTo(4, -14.5, 15, -19.5); ctx.stroke();
    ctx.lineCap = 'butt';
    // nostrils
    _ell(ctx, 11, -23, 0.7, 0.5, GD); _ell(ctx, 13.5, -23, 0.7, 0.5, GD);
  },

  // Chubby penguin with a knit beanie and rosy cheeks.
  PENGU(ctx, t, blink) {
    const P = '#4f72a8', PD = '#2d4470', Wt = '#f6f8fc', Y = '#ffa733', K = '#141824', L = '#1e2a46';
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    _ell(ctx, -5, -1.8, 5, 2.4, Y, '#b8691a'); _ell(ctx, 6.5, -1.8, 5, 2.4, Y, '#b8691a');
    _ell(ctx, 0, -15, 13, 14.5, P, L);
    _ell(ctx, 3, -12, 8.8, 10.5, Wt);
    _ell(ctx, -10, -13, 3.4, 7.5, PD, L, 0.35);
    // cheeks
    _ell(ctx, 0.5, -18.5, 2.2, 1.6, 'rgba(255,120,150,0.75)'); _ell(ctx, 12, -18.5, 2.2, 1.6, 'rgba(255,120,150,0.75)');
    // eyes
    if (blink) { ctx.strokeStyle = K; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(1.5, -22); ctx.lineTo(5, -22); ctx.moveTo(7.5, -22); ctx.lineTo(11, -22); ctx.stroke(); }
    else {
      _ell(ctx, 3.3, -22, 2, 2.3, K); _ell(ctx, 9.3, -22, 2, 2.3, K);
      _ell(ctx, 3.9, -22.8, 0.7, 0.7, '#fff'); _ell(ctx, 9.9, -22.8, 0.7, 0.7, '#fff');
    }
    // beak
    _tri(ctx, 9, -19.5, 16.5, -18, 9, -16.5, Y, '#b8691a');
    // beanie
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0.5, -27, 9.5, 5.5, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = '#7fd0ff'; ctx.fill(); ctx.strokeStyle = '#2f6f9a'; ctx.stroke();
    ctx.fillStyle = '#4aa8e0'; ctx.fillRect(-9, -28.2, 19, 3);
    _ell(ctx, 0.5, -33, 2.8, 2.8, Wt, '#9ab');
  },

  // Green/white capsule pill with a cheeky face and stick legs.
  PILL(ctx, t, blink) {
    const Gr = '#4ade80', Wt = '#f5f5f2', OL = '#174d2f', K = '#111';
    ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // legs & shoes
    ctx.strokeStyle = K; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-5, -1.5); ctx.moveTo(4, -6); ctx.lineTo(5, -1.5); ctx.stroke();
    _ell(ctx, -5, -1.5, 3, 1.6, '#ff5fa2'); _ell(ctx, 6, -1.5, 3, 1.6, '#ff5fa2');
    ctx.save(); ctx.translate(0, -19); ctx.rotate(0.38);
    const rr = 8.5, hh = 7.5;
    const cap = () => { ctx.beginPath(); ctx.arc(0, -hh, rr, Math.PI, 0); ctx.lineTo(rr, hh); ctx.arc(0, hh, rr, 0, Math.PI); ctx.closePath(); };
    ctx.save(); cap(); ctx.clip();
    ctx.fillStyle = Gr; ctx.fillRect(-rr - 1, -hh - rr - 1, rr * 2 + 2, hh + rr + 1);
    ctx.fillStyle = Wt; ctx.fillRect(-rr - 1, 0, rr * 2 + 2, hh + rr + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-6, -12, 2.2, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(4, 0, 4.5, 15);
    ctx.restore();
    cap(); ctx.strokeStyle = OL; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rr, 0); ctx.lineTo(rr, 0); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    // face (unrotated so it stays readable): eyes on green, grin on white
    if (blink) { ctx.strokeStyle = K; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(3, -24); ctx.moveTo(6, -23); ctx.lineTo(9, -23); ctx.stroke(); }
    else {
      _ell(ctx, 1.5, -24, 1.9, 2.4, K); _ell(ctx, 7.5, -23, 1.9, 2.4, K);
      _ell(ctx, 2.1, -24.8, 0.6, 0.6, '#fff'); _ell(ctx, 8.1, -23.8, 0.6, 0.6, '#fff');
    }
    ctx.strokeStyle = K; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(3, -15.5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // arms
    ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(-10, -11); ctx.moveTo(11, -17); ctx.lineTo(14, -13); ctx.stroke();
    ctx.lineCap = 'butt';
  },
};

function drawMascot(ctx, id, x, y, facing, scale, t, opts) {
  opts = opts || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  const blink = ((t || 0) * 1.0 + (opts.phase || 0)) % 3.7 < 0.12;
  if (opts.squash) ctx.scale(1 + opts.squash, 1 - opts.squash);
  MASCOTS[id](ctx, t || 0, blink);
  ctx.restore();
}

function drawGrave(ctx, x, y, color) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#9aa0a8'; ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-8, -14); ctx.arc(0, -14, 8, Math.PI, 0); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.fillRect(-8, -4, 16, 3);
  ctx.fillStyle = '#3a3f48'; ctx.font = "bold 7px 'Trebuchet MS', Arial, sans-serif"; ctx.textAlign = 'center';
  ctx.fillText('RIP', 0, -11);
  ctx.restore();
}
