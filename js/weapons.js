'use strict';
// Weapon definitions. kind: 'impact' explodes on contact, 'bounce' bounces until its fuse runs out.
// Every team has the same shared kit (Bazooka, Grenade, Brace) plus one special attack and one
// special defense. Specials share the same budget: SPECIAL_USES per team per match.
const SPECIAL_USES = { attack: 2, defense: 2 };
const WEAPONS = {
  // ---- shared basic attacks ----
  bazooka: { id: 'bazooka', name: 'Bazooka', kind: 'impact', radius: 36, damage: 45, knock: 1, wind: 1, grav: 1, ammo: Infinity, desc: 'Basic attack. Explodes on impact; wind pushes it.' },
  grenade: { id: 'grenade', name: 'Grenade', kind: 'bounce', radius: 40, damage: 45, knock: 1, wind: 0, grav: 1, fuse: 3, bounce: 0.42, ammo: Infinity, desc: 'Basic attack. 3s fuse, bounces, ignores wind.' },
  // ---- special attacks (one per team) ----
  moon:    { id: 'moon', name: 'Moon Rocket', kind: 'impact', radius: 48, damage: 50, knock: 1.3, wind: 0.5, grav: 0.85, ammo: SPECIAL_USES.attack, special: 'attack', team: 'DOGE', desc: 'Big blast, big knockback, half wind. Much boom.' },
  fly:     { id: 'fly', name: 'Rare Fly Grenade', kind: 'bounce', radius: 52, damage: 70, knock: 1.1, wind: 0.3, grav: 1, fuse: 3, bounce: 0.75, miniR: 16, miniD: 12, ammo: SPECIAL_USES.attack, special: 'attack', team: 'FROG', desc: 'Super bouncy; crater-free mini-blasts on bounces (spare your team), then a big one.' },
  fish:    { id: 'fish', name: 'Ice Fish', kind: 'impact', radius: 26, damage: 28, knock: 0.6, wind: 0.8, grav: 1, splits: 5, splitSpeed: 150, splitSpread: 0.28, ammo: SPECIAL_USES.attack, special: 'attack', team: 'PENGU', desc: 'Small blast, then 5 fishlets rain down. Great vs clusters.' },
  fishlet: { id: 'fishlet', name: 'Fishlet', kind: 'impact', radius: 22, damage: 14, knock: 0.7, wind: 0.4, grav: 1, ammo: 0 },
  rug:     { id: 'rug', name: 'Rug Pull', kind: 'impact', radius: 22, damage: 15, knock: 0.5, wind: 0.6, grav: 1, colW: 48, colDepth: 125, colDmg: 12, ammo: SPECIAL_USES.attack, special: 'attack', team: 'PILL', desc: 'Pulls a 125px-deep pit out from under them (+12 dmg).' },
  // ---- shared basic defense ----
  brace:   { id: 'brace', name: 'Brace', kind: 'defense', dmgMul: 0.6, knockMul: 0.4, ammo: Infinity, desc: 'Defense: -40% damage, -60% knockback until your team\'s next turn.' },
  // ---- special defenses (one per team) ----
  hodl:    { id: 'hodl', name: 'HODL', kind: 'defense', dmgMul: 0.9, knockMul: 0.6, lethalSave: true, ammo: SPECIAL_USES.defense, special: 'defense', team: 'DOGE', desc: 'Diamond hands: -10% dmg, and a lethal hit leaves you at 1 HP (once).' },
  hop:     { id: 'hop', name: 'Hop Away', kind: 'defense', dmgMul: 0.65, knockMul: 1, range: 450, ammo: SPECIAL_USES.defense, special: 'defense', team: 'FROG', desc: 'Leap to the safest dry spot within 450px, then -35% dmg.' },
  icewall: { id: 'icewall', name: 'Ice Wall', kind: 'defense', dmgMul: 0.75, knockMul: 0.8, wallW: 22, wallH: 66, gap: 22, ammo: SPECIAL_USES.defense, special: 'defense', team: 'PENGU', desc: 'Tough ice wall on the side you face (←/→ first), -25% dmg.' },
  bubble:  { id: 'bubble', name: 'Liquidity Lock', kind: 'defense', dmgMul: 1, knockMul: 0.6, absorb: 16, waterSave: true, ammo: SPECIAL_USES.defense, special: 'defense', team: 'PILL', desc: 'Bubble absorbs 16 dmg and saves you from water once.' },
};
const DEF_STYLE = {
  brace: { color: '#9fd3ff', icon: 'shield' }, hodl: { color: '#ffd84a', icon: 'diamond' },
  hop: { color: '#7dff6a', icon: 'wing' }, icewall: { color: '#bfefff', icon: 'ice' }, bubble: { color: '#ff8fd0', icon: 'bubble' },
};

function drawProjectile(ctx, p, t) {
  const a = Math.atan2(p.vy, p.vx);
  ctx.save(); ctx.translate(p.x, p.y);
  switch (p.w.id) {
    case 'bazooka':
      ctx.rotate(a);
      ctx.fillStyle = '#7d8b99'; ctx.fillRect(-7, -2.6, 12, 5.2);
      ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(5, -2.6); ctx.lineTo(10, 0); ctx.lineTo(5, 2.6); ctx.fill();
      ctx.fillStyle = '#444'; ctx.fillRect(-9, -4.5, 3, 9);
      break;
    case 'moon': {
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(255,170,40,0.9)'; ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(-18 - Math.random() * 6, 0); ctx.lineTo(-10, 3); ctx.fill();
      ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(7, -3.4); ctx.quadraticCurveTo(14, 0, 7, 3.4); ctx.fill();
      ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-12, -8); ctx.lineTo(-4, -3.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-12, 8); ctx.lineTo(-4, 3.5); ctx.fill();
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(1, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'grenade':
      ctx.rotate(p.spin || 0);
      ctx.fillStyle = '#3f6b2a'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1e3a12'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#999'; ctx.fillRect(-1.5, -7, 3, 3);
      break;
    case 'fly': {
      ctx.rotate(p.spin || 0);
      const flap = Math.sin(t * 60) * 0.6;
      ctx.fillStyle = 'rgba(220,240,255,0.75)';
      ctx.beginPath(); ctx.ellipse(-2, -4, 3, 5.5, -0.6 + flap, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2, -4, 3, 5.5, 0.6 - flap, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(-1.8, -3.5, 1.4, 0, 7); ctx.arc(1.8, -3.5, 1.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(-3, 0, 6, 1.2);
      break;
    }
    case 'fish': case 'fishlet': {
      const s = p.w.id === 'fish' ? 1.3 : 0.85;
      ctx.rotate(a); ctx.scale(s, s);
      ctx.fillStyle = '#9fe3ff'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2f7fb0'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#6cc6f0'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-12, -4.5); ctx.lineTo(-12, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#123'; ctx.beginPath(); ctx.arc(4.5, -1, 1.1, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-3, -2.5, 5, 1);
      break;
    }
    case 'rug':
      ctx.rotate(p.spin || 0);
      ctx.fillStyle = '#b3243b'; ctx.fillRect(-9, -4, 18, 8);
      ctx.fillStyle = '#ffd84a'; for (let i = -7; i < 8; i += 4) ctx.fillRect(i, -4, 1.5, 8);
      ctx.fillStyle = '#fff'; ctx.fillRect(-11, -4, 2, 8); ctx.fillRect(9, -4, 2, 8);
      break;
    // ---- crate weapons ----
    case 'shillbullet':
      ctx.rotate(a); ctx.fillStyle = '#ffd84a'; ctx.fillRect(-4, -1.6, 8, 3.2); ctx.fillStyle = 'rgba(255,176,46,0.5)'; ctx.fillRect(-10, -1, 6, 2);
      break;
    case 'airdrop': case 'bomblet': {
      const s = p.w.id === 'airdrop' ? 1.2 : 0.7; ctx.rotate(a); ctx.scale(s, s);
      ctx.fillStyle = '#6b3fd1'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#2a1260'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(-9, -3, 3, 6); ctx.beginPath(); ctx.arc(1, 0, 2, 0, 7); ctx.fill();
      break;
    }
    case 'whale':
      ctx.rotate(a); ctx.fillStyle = '#2f7fd8'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.ellipse(1, 2.5, 8, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f7fd8'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-16, -6); ctx.lineTo(-16, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(6, -1.5, 1.2, 0, 7); ctx.fill();
      break;
    case 'gasfee':
      ctx.rotate(p.spin || 0); ctx.fillStyle = '#3aa64a'; ctx.fillRect(-4, -6, 8, 12); ctx.fillStyle = '#7dff6a'; ctx.fillRect(-4, -2, 8, 3); ctx.fillStyle = '#999'; ctx.fillRect(-2, -8, 4, 2);
      break;
    case 'fud':
      ctx.fillStyle = '#5b6078'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('FUD', 0, 2);
      break;
    case 'bridge':
      ctx.rotate(t * 6); ctx.fillStyle = '#46f0ff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#b06bff'; ctx.lineWidth = 1.5; ctx.stroke();
      break;
  }
  ctx.restore();
}
