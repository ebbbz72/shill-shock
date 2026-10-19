# Shill Shock — Memecoin Artillery
Turn-based Worms-style artillery prototype. Plain HTML5 Canvas + JS, no build, no network.

## Run
Open `index.html` in any modern browser (double-click works; file:// is fine),
or serve the folder: `python3 -m http.server 8000` → http://localhost:8000

## 3D view (2.5D) and Classic 2D
The game is drawn in **3D by default** (Three.js r149, vendored in `js/vendor/three.min.js`, so it still runs from file://).
The simulation is unchanged: terrain mask, physics, bots, rules, moves and worlds are the same 2D code, and only the rendering differs.
- **Switch:** lobby row **View (V toggles)** → **3D** / **Classic 2D**, or press **V** at any time (also mid-game).
  The choice is remembered. URL override: `index.html?view=2d` or `?view=3d`.
- **Fallback:** without WebGL the 3D button is disabled with a note, and the game runs in Classic 2D.
- **What is 3D:** extruded, beveled terrain with smooth remeshing after every crater (marching squares on the
  2D mask; only the touched 128px chunks are rebuilt). There are grass, snow and pebble tufts and 3D world decorations.
  Mascots are modeled with expressive faces and have idle, walk, aim, hit-flash, hop, death (topple → X-eyes → grave),
  drown and victory animations. Each weapon has its own 3D projectile (rocket with flame, grenade, winged fly, wagging fish, rolling rug).
  Defenses are visible: HODL gold orbit and glow, 3D ice-wall block, bubble shield, brace hex aura, frog hop arc.
  Explosions have a light flash, shockwave rings, fireball, smoke, embers, bouncing terrain-colored debris and camera shake.
  There is a shader water surface (waves, fresnel, sun glints, shore foam) and per-world sky, fog, lighting, soft shadows,
  parallax background props and ambient particles (fireflies, snow, moon dust, aurora, candle charts).
  The camera follows the action, zooms in slightly on special shots and runs a short kill cam when a unit dies.
  Menu mascots are 3D portraits.
- **2D overlays:** HUD, menus, setup flow, names, HP and aim indicators stay as crisp 2D overlays on top
  (projected onto the 3D units, so they stay readable).
- **Quality:** the renderer starts at *high* (soft shadows 2048, pixel ratio up to 2) and drops automatically to
  *medium* (PCF 1024, ratio ≤1.25) and then *low* (no shadows, ratio 0.75) if frames average over ~24 ms.
  Lock a level with `index.html?quality=high|medium|low`. Parameters combine, e.g. `?view=3d&quality=low`.
- **Performance:** static scenery and mascot parts are merged into vertex-coloured meshes, projectiles are pooled
  and terrain rebuilds are capped at 6 chunks per frame. A 20-unit battle is about 75–330 draw calls and 70–250k
  triangles depending on the world, and game-side JS costs about 4–7 ms per frame. On any real GPU that fits a 60 fps budget.
  Headless SwiftShader (CPU-only software GL, no GPU) can't reach 60 fps; it is used only for relative measurements.
  If an old machine struggles, use `?quality=low` or press **V** for Classic 2D.
- **Known limits:** the 3D labels/aim are a 2D overlay (always on top, never occluded). Terrain is a single extruded
  slab (no tunnels in depth). Minimap and HUD are 2D in both modes.

## Pre-game flow (2 pages, hot-seat players + bots)
Every screen has a **Back** button (or **Esc**) and works with keyboard or mouse.
1. **Title** — SHILL SHOCK, press **Enter** / click **PLAY**.
2. **Page 1 / 2: Match setup** — always **2 teams**. Per team: **Players** (humans, hot-seat) and **Bots** steppers;
   team size = players + bots, **2–6 per team** (the steppers lock at the limits). Each team's **Bot skill**
   (Easy / Medium / Hard / Pro), the **turn timer** (15–90 s), the view and the **World** picker. A summary line reads
   e.g. "Team 1: 2 players + 1 bot vs Team 2: 0 players + 4 bots". 0 players in total = **spectate**.
   No character pickers here. **NEXT: CHARACTERS**. Shortcuts: **Quick Match: Me + bots** (you + Medium bots vs Medium bots,
   current team sizes) and **Spectate: bots only** (Pro vs Hard bots). Keys: ↑ ↓ row · ← → change · Enter next · Esc back.
3. **Page 2 / 2: Characters** — each human in order (Player 1, Player 2, … with their team colour) picks their own
   character from big portrait cards that show the ★ special attack and defense, with an optional name (default
   "Player N"). Then the host picks the bots' characters per slot (or Random), with **Randomize** / **All same** per
   team. The player strip at the top jumps to any player. **Back** returns to page 1 with everything kept (Esc steps
   back one player first); **START** (Enter in the bots step) begins.
   Keys: ← → / ↑ ↓ choose · Enter pick (next player) · bots step: ↑ ↓ slot, ← → character, Enter start.

**Hot-seat:** several humans can share a team; each controls only their own unit, and the turn banner names them
("Player 2's turn (Team 1)"). Bots control their own units on the same team.
**Team colors:** Team 1 is orange, Team 2 is teal. The color is on name tags, HP bars, the HUD, turn banners
("Eric's turn (Team 1)", sub-line "Chonk · DOGE"), ground rings under every unit (2D and 3D) and the victory screen,
so the same character on both sides is easy to tell apart. Each unit brings its own character's model, sounds,
names and ★ specials.
The victory screen names the winning player (a team with one human) or the team, plus its players and bots.
**Play Again** replays the same line-up; **Main Menu** returns to page 1 with the previous settings (saved in
localStorage: players/bots per team, skills, timer, world, names, characters; older v1 saves are migrated).

## Online multiplayer (up to 12 people, 6 v 6)
**PLAY ONLINE** on the title screen. It needs the small server in `server/`: run `cd server && npm install && npm start`
and open <http://localhost:8080>, or deploy it for free (see **DEPLOY.md**). If you open `index.html` straight from
the file system, the button explains this; local play still works offline as before.
- **Host:** enter a name, **CREATE LOBBY**, and share the 4-letter room code or the link (`…/?room=ABCD`).
- **Others:** open the link (or PLAY ONLINE, then enter the code), type a name, **JOIN**.
- **Lobby:** always 2 teams. The host sets **Team 1 units** and **Team 2 units** separately (2 to 6 each, so up to
  12 humans in a 6 v 6; uneven like 6 v 4 works too), the map, and the turn
  timer (15 to 90 s, default 45 s). Every human controls one unit. The host can move players between teams (or to
  spectator), remove players, and set each empty slot's bot difficulty (Easy to Pro). Teams are colors, not mascots:
  each player picks their own character under **YOUR CHARACTER** (duplicates allowed) and can **Join Team N** if it has
  room; the host picks each bot slot's character (or **All same** / **Randomize**), validated by the server. Players press **READY**; the host presses **START**.
  Includes a lobby and in-game chat (press **T** in game).
- **In game:** the turn bar shows whose turn it is by name, and only that player's keys control the active unit.
  Nobody can pause online. When a player drops, a Medium bot plays their unit until they rejoin with the same name or
  link. When the host drops, the next player takes over hosting and the game continues; the turn in progress is skipped.
- **Netcode (host-authoritative):** the host's browser runs the normal 2D simulation and all bots. The active player's
  key presses are relayed to the host, and the host streams 20 Hz snapshots plus an ordered log of terrain edits and
  effects to everyone else. The sim uses `Math.random`, a variable frame time, and floating-point math that can differ
  between browsers, so lockstep would drift. Streaming the host's results keeps every client identical (the online
  tests check the final HP, positions, winner and terrain hash on every client).

## Big maps
Maps are **3,600–3,900 × 720 px** (3,080 + 70 px per unit, clamped; about 30 % narrower than the previous 5,120–5,600,
still ~2.8x the original 1,280–1,400). The width is generated, not stretched, and packed with geography: dense
260–560 px zones on a slow swell, each one feature — **mesas/plateaus** (some tunnelled through), **peaks**,
saw-tooth **ridges**, **valleys**, **cliff steps with an overhang** under the lip, **craters**, small **water pits /
lakes** (capped at 1–2 per map), **arches** (walk-through tunnels), **gorges spanned by a bridge** — plus extra
**floating ledges**, the world's islands and more caves. Each world weights them to fit its theme:

| World | Geography |
|---|---|
| Classic Hills | every kind, up to 2 water pits |
| Doge Moon Base | crater fields (zone craters + raised-rim impact craters), jagged ridges, cliffs, one void pit |
| Rare Pepe Bayou | mud bridges over the murky channels, raised mounds and mesas, extra floating rafts and ledges |
| Iceberg Arctic | ice cliffs with overhangs, ice arches/tunnels, jagged ridges, big ice caves, channels |
| Degen Pump Lab | easy to walk: wide candle bars (56–96 px) whose tops differ by ≤ 22 px from their neighbours, every bar edge bevelled into a ramp of ≤ 2 px rise per px (walking climbs up to 7 px), so you can walk the whole map; one big "pump" summit (green run up, red dump down) and one "crash" valley; 1–3 high neon platforms; no tunnels, lakes, caves or clutter |

Every world keeps at least ~45 % of its width as gentle, dry, walkable ground (checked over many seeds).
**Spawns:** all units of both teams are placed at random across the whole map, mixed together, new every game: dry
solid ground, no overlap, head room, at least ~30 px between any two units and more between enemies.
The camera follows the active unit; zoom out to see the whole map. **Range:** a full-power shot reaches about
1,570 px on flat ground (≈ 40–44 % of the map; wind ±100 % shifts it to ≈ 1,190–1,950 px), so no cross-map
one-shots. Walking: 90 px/s. Bots walk and jump toward the nearest enemy when nobody is in range.
3D terrain is built in chunks with frustum culling; 2D draws only the visible slice.

## Worlds (map picker)
Pick a world on the lobby dashboard (thumbnails), or **Random** (one of the 4 themed worlds) or **Classic Hills**
(the original map). Every world is still procedurally generated each game; the world name shows on the
turn banner ("Welcome to …" on turn 1) and top-right in the HUD. Worlds are arenas, not team buffs:
every team keeps the same moves and stats on every map, and each twist applies to everyone.

| World | Theme | Terrain profile | Hazard | Ambience | Twist (same for all teams) |
|---|---|---|---|---|---|
| **Doge Moon Base** (DOGE) | grey lunar regolith, starfield, nebula, Earth + ringed planet, WOW flags, dishes, lamps; buried bones & coins | taller peaks, raised-rim impact craters, flat-topped floating moon rocks | the Void (dark violet, starry, glowing cyan rim) | shooting stars, drifting moon dust | taller peaks & deep craters (normal gravity) |
| **Rare Pepe Bayou** (FROG) | mossy mud, misty dusk, cypress silhouettes with hanging moss, reeds/cattails, glowing mushrooms, stumps; roots in the mud | flatter, lower land cut into islands by murky channels, extra floating mud rafts | murky green bog with lily pads | fireflies, bog bubbles, low mist | more islands |
| **Iceberg Arctic** (PENGU) | snow-capped ice, aurora, moonlit snowy peaks, igloos, snowmen, ice crystals, icicles in ice caves; frozen fish bones | pointy icebergs split by a channel, more and bigger ice caves | freezing water with drifting ice floes | snowfall that drifts with the wind | gustier wind: up to ±130 % (normally ±100 %) |
| **Degen Pump Lab** (PILL) | clean trading floor: green/red candlestick pillars with wicks over a calm dark base; plain dark sky with a faint grid and one soft distant chart line | wide walkable candle bars with bevelled steps, a pump summit + crash valley, 1–3 high platforms | plain red liquidation pool | none (kept calm for readability) | walkable end to end |
| Classic Hills | original grassy dusk hills | original | water | clouds | none |

## Moves (same budget for every team)
Each unit has **5 moves**: two shared basic attacks, one shared basic defense, and the ★ special attack +
★ special defense of its own character (2 uses each per match, per unit). Mixed teams mix kits.

| Slot | Shared by all | DOGE | FROG | PENGU | PILL |
|---|---|---|---|---|---|
| 1 | Bazooka (∞) | | | | |
| 2 | Grenade (∞) | | | | |
| 3 ★ attack | | Moon Rocket | Rare Fly Grenade | Ice Fish | Rug Pull |
| 4 | Brace (∞) | | | | |
| 5 ★ defense | | HODL | Hop Away | Ice Wall | Liquidity Lock |

- **Bazooka** – explodes on impact, wind pushes it. **Grenade** – 3 s fuse, bounces, ignores wind.
- **Moon Rocket (DOGE)** – bigger blast and knockback, only half affected by wind.
- **Rare Fly Grenade (FROG)** – very bouncy; small crater-free mini-blasts on bounces (never hurt FROGs), then a big blast.
- **Ice Fish (PENGU)** – small blast, then 5 fishlets rain down in a fan. Great vs clusters.
- **Rug Pull (PILL)** – carves a deep pit under the impact; units in it take extra damage and fall (into the water if the pit reaches it).
- **Brace** – -40 % damage, -60 % knockback until your team's next turn.
- **HODL (DOGE)** – -10 % damage, and the first lethal hit leaves you at 1 HP (not vs drowning).
- **Hop Away (FROG)** – leap to the safest dry spot within 450 px, then -35 % damage.
- **Ice Wall (PENGU)** – raises a tough ice wall on the side you face (turn with ← → first), -25 % damage; melts when it expires.
- **Liquidity Lock (PILL)** – bubble absorbs 16 damage and saves you from the water once ("SAFU" rescue).

**Jumping (hold to charge):** press and hold **ENTER** to charge a jump — a small meter appears next to the unit
(and the POWER bar on the HUD turns into a JUMP bar) while it crouches; release to jump forward. A quick tap is a
small hop (~30 px high, ~75 px forward); holding ~0.9 s to max gives one big jump (~145 px high, ~345 px forward).
Hold **BACKSPACE** instead for a charged **backflip** (higher, slightly backward). **One jump per turn** (forward or
backflip); the HUD chip shows **JUMP READY** / **JUMP USED**. ← → only turn you while charging. Jumps use the real
terrain collision, so you land on top of ledges and can't clip into rock; the usual fall damage applies to big
drops, and water is deadly unless PILL's Liquidity Lock saves you. The bigger the jump, the bigger the dust and the
landing squash (2D and 3D). You can't jump while charging a shot or after firing. Online, ENTER/BACKSPACE key down
and key up go through the input relay and the host times the hold. Bots pick the strength by simulating the jump
(to cross gaps or climb) and only take jumps with a dry landing and no fall damage.

**Turn order (rounds):** in each round every living character gets exactly **one turn**. Turns alternate between
the teams one character at a time, each team in its slot order; when one team has nobody left who hasn't played this
round, the other team plays its remaining characters back to back, then a new round starts with the team that did
**not** take the last turn. Equal teams simply alternate; 6 v 3 goes T1, T2, T1, T2, T1, T2, T1, T1, T1; 1 v 4 goes
T1a, T2a, T2b, T2c, T2d, then T1a again. Characters that die before their turn in the round lose it. Wind changes
every turn and the turn timer applies per character turn (also online). The banner reads "Round 3 — Team 2: Rare
Kek" (or "Round 3 — Eric's turn (Team 1)") with "Team 2 turn 2 of 4 this round", and a **NEXT** strip under the
team bars lists who is still to play this round, in order.

**Turn economy:** one action per turn. Walk freely (plus one charged jump), then either fire an attack *or* use a defense —
using a defense ends your turn. A defense protects the active unit until your team's next turn.
Full numbers: see "Move stat sheet" below.

## Supply crates, walk budget, jump landings

- 2 memecoin supply crates parachute in every round (2D, 3D and minimap). Walk or jump into one to get Laser Eyes, Shill Spray (machine gun), Airdrop Cluster, Whale Missile (homing), Gas Fee, FUD Bomb, L2 Bridge (teleport), Diamond Hands (defense), Hopium (+35 HP) or a Moon Scope. Crate weapons sit in a per-character CRATE ITEMS row with use counts. Explosions pop crates. Bots grab and use them; online, the host decides. Full table in MOVES.md.
- Walking is limited to 450 px (about 5 s) per turn; the STEPS meter shows what's left. Jumps don't count against it.
- Landing from your own charged jump or backflip deals half fall damage. Other falls are unchanged.

## Controls
| Key | Action |
|---|---|
| ← → | Walk (also sets facing, e.g. for Ice Wall) |
| ↑ ↓ | Aim angle |
| Hold SPACE | Charge power, release to fire (with a defense selected: SPACE uses it) |
| Hold ENTER, release | Charged jump forward: tap = small hop, hold ~0.9 s = big jump (1 jump per turn) |
| Hold BACKSPACE, release | Charged backflip: higher, slightly backward (uses the turn's jump) |
| 1 2 3 | Attacks: Bazooka, Grenade, ★ special attack |
| 4 5 | Defenses: Brace, ★ special defense |
| Q E | Cycle moves (skips moves with no uses left) |
| A D, mouse drag, screen edge (or ← → ↑ ↓ when not aiming / during bot turns) | Pan the camera |
| Mouse wheel, + / − , 0 | Zoom in / out (2D and 3D), 0 resets · C recenters on the active unit |
| Minimap (top centre) | Click or drag to pan there; shows terrain, units in team colours and the view box |
| P | Pause · H or the **?** HUD button: help (lists the active unit's specials; close with **Got it**, X, Esc, Enter or a click outside, **Don't show again** is remembered) · M mute |
| V | Toggle 3D / Classic 2D view |

During bot turns the keyboard is ignored (except P/H/M/V/camera) — just watch.

## Mobile / touch controls
On phones and tablets the touch UI turns on by itself. It is detected by `(pointer: coarse)` or the first touch. Use `?touch=1` to force it on (for example for testing on a desktop browser) and `?touch=0` to force it off. On a desktop with a mouse nothing changes: the touch UI is never built, and the desktop layout, keys and help are the same as before (checked by `tests/desktop-unchanged-test.js`).

| Touch | Action |
|---|---|
| ◀ ▶ (hold) | Walk. Uses the STEPS budget, same as the arrow keys |
| AIM pad: hold or slide on ▲ / ▼ | Aim angle |
| Hold FIRE, lift | Charge power and fire. With a defense selected, FIRE uses it |
| Hold JUMP / FLIP, lift | Charged jump / backflip |
| ARMS, or tap the weapon bar | Weapon picker: attacks, defenses and CRATE ITEMS with uses left |
| 1-finger drag on the map · pinch | Pan · zoom. Tap the minimap to look there. ◎ recenters |
| ⏸ · ? · 3D/2D · 💬 | Menu (resume / pause / help / quit) · help · view · chat (online: opens the phone keyboard) |

Every button sends the same key events as the keyboard (for example ENTER down and up for the jump charge), so the game rules, the walk budget and the online relay to the host work the same way. The setup pages, the online lobby and the help fit on phone screens and scroll if needed. Landscape is best: in portrait the battlefield sits at the top with the controls below it, and a dismissable hint suggests rotating the phone. The canvas uses `touch-action: none`, and page scroll and double-tap zoom are blocked during play. Tap targets are at least 44 px, controls keep the HUD clear, and safe areas (notch / home bar) are respected.

## Bots
Bots work on every world. If nobody has taken damage for 12 turns in a row (6 per team), bots stop defending (Medium and up also walk toward the enemy when they have no shot) so games can't stall. On the big maps every bot first checks which enemies its full-power reach covers; with nobody in range it walks (hopping steps and gaps, avoiding water and bad falls) toward the nearest enemy and only searches shots once someone is in range.
Bots search angle × power × weapon by simulating shots with the game's real projectile physics
(gravity, wind, terrain, unit hits) and score landing spots by expected damage, kills, friendly fire
and self-damage. They visibly rotate their aim and charge power, show "thinking...", and always
fire before the turn timer runs out.
- **Easy:** coarse search, ignores wind, basic weapons only, often picks a random target, big aim/power error.
- **Medium:** focuses the nearest enemies, half-accounts for wind, sometimes uses its specials, moderate error.
- **Hard:** considers all enemies, mostly accounts for wind, uses specials and defenses smartly, avoids self/friendly damage, small error.
- **Pro:** fine search + refinement, full wind, best weapon (Rug Pull on anything it can drop into the water,
  Ice Fish on clusters, knock-backs near water), strong friendly-fire avoidance, repositions when it has no shot,
  near-zero error.

## Move stat sheet
| Move | Owner | Type | Uses | Damage | Radius (blast = 1.5×) | Effects |
|---|---|---|---|---|---|---|
| Bazooka | all | basic attack | ∞ | 45 | 36 | knockback ×1, wind ×1 |
| Grenade | all | basic attack | ∞ | 45 | 40 | knockback ×1, wind ×0, fuse 3s, bounce 0.42 |
| Moon Rocket | DOGE | ★ special attack | 2 | 50 | 48 | knockback ×1.3, wind ×0.5; gravity ×0.85 |
| Rare Fly Grenade | FROG | ★ special attack | 2 | 70 | 52 | knockback ×1.1, wind ×0.3, fuse 3s, bounce 0.75; mini-blasts 12 dmg / r16 on up to 6 bounces (no crater, spare own team) |
| Ice Fish | PENGU | ★ special attack | 2 | 28 | 26 | knockback ×0.6, wind ×0.8; then 5 fishlets × 14 dmg / r22 in a fixed fan |
| Rug Pull | PILL | ★ special attack | 2 | 15 | 22 | knockback ×0.5, wind ×0.6; carves a 48px-wide pit 125px deep below impact; units in it take +12 and fall (drown if the pit reaches water) |
| Brace | all | basic defense | ∞ | — | — | damage ×0.6, knockback ×0.4; nothing else |
| HODL | DOGE | ★ special defense | 2 | — | — | damage ×0.9, knockback ×0.6; first lethal hit leaves you at 1 HP (not vs drowning) |
| Hop Away | FROG | ★ special defense | 2 | — | — | damage ×0.65, knockback ×1; leap to the safest dry spot within 450px |
| Ice Wall | PENGU | ★ special defense | 2 | — | — | damage ×0.75, knockback ×0.8; 22×66px ice wall 22px in front; ice only carved within 0.5× blast radius; melts when it expires |
| Liquidity Lock | PILL | ★ special defense | 2 | — | — | damage ×1, knockback ×0.6; absorbs 16 damage (pops when used up); saves you from the water once |


Balance check (Hard bots, 3v3, 60 games per pairing, sides rotated): every team 45–56 % overall, no pairing worse than 43/57; 4-team FFA roughly even. Details in MOVES.md.

## Tests (optional; needs Node + Chrome)
`npm i playwright-core`, then:
- `node tests/headless-test.js` — basic play, all weapons, victory/restart, screenshots
- `node tests/bot-sim.js` — all-bot / mixed games to completion + win-rate matchups
- `node tests/jump-test.js [--no-shot]` — charged jumps (tap vs full hold, backflip, one per turn, water, bots) + 37-charge-jump-3d.png
- `node tests/pump-walk-test.js [seeds=8]` — Pump walkability: ground step heights vs the 7 px climb limit, platform count, spawns, and a unit walking across the whole map both ways with the real movement code
- `node tests/mobile-touch-test.js [--shots] [--no-online]` — touch controls in Playwright iPhone 13 emulation (landscape + portrait). It taps through setup, then hold-walks against the STEPS budget, uses the aim pad, charges a jump, picks a crate weapon in the touch picker, fires, pans, pinch-zooms, taps the minimap and checks help/menu, 44 px targets and that the HUD stays clear. Online part (server needed): the phone joins a lobby, chats, and its touch walk and fire are relayed to a desktop host
- `node tests/desktop-unchanged-test.js [refDir] [--shot]` — renders seeded desktop scenes (title, page 1, page 2, 2D battle, help, 3D battle) after the same keyboard input and compares the pixels with a pre-touch copy (default `memecoin-artillery.v16bak`)
- `node tests/crates-test.js` — 2 crates per round, landing, pickup, every crate item, crate blasts, online snapshot of crates/inventory
- `node tests/crates-bots-check.js` — bots at every level pick up crates and use each crate item
- `node tests/walk-jump-test.js` — 450 px walk budget (multiple walks, jumps free, out-of-steps, refill, snapshot) and ×0.5 own-jump fall damage vs the same drop / walk-off / knockback
- `node tests/turn-order-test.js` — round turn order: 1 v 4, 3 v 3 alternation, 6 v 3 / 3 v 6, mid-round deaths, round starter, wind per turn, quiet-turn counter, brace expiry, online snapshot
- `node tests/rounds3d-smoke.js [world]` — 3D bot game (2 v 4) to game over, checking the round order live (`HP_CAP=60` for a shorter game)
- `node tests/bigmap-test.js` — big maps (2D): map size, geography per world, walkable ground over many seeds, mixed random spawns, camera/zoom/minimap input, range, render cost, short bot game
- `node tests/bot-screenshots.js` — bot screenshots + 20-unit spawn check
- `node tests/flow-test.js [--shots]` — walks the whole pre-game flow by keyboard and by mouse 2-page setup by keyboard and mouse (incl. 2 humans + 1 bot vs 3 bots hot-seat, 6 humans vs 3 + 3 bots, spectate), per-unit controllers/characters/names, turn banner, constraints, Back/Esc, Play Again, remembered settings, v1 migration, help overlay
- `node tests/render3d-test.js [worlds=classic,moon,swamp,arctic,pump] [outDir] [extras=1]` — 3D renderer: init, 4×5 all-bot games per world rendered in 3D at low quality (draw calls, geometry-leak check, kills/kill cam), a high-quality 20-unit perf measurement, V toggle, and the no-WebGL fallback (SwiftShader flags included)
- `node tests/moves3d-test.js` — every attack (6) and defense (5) through the real game code in 3D, checks each 3D projectile/defense visual appears
- Every test accepts `MW_QUERY`, e.g. `MW_QUERY='?view=2d' node tests/bot-sim.js` or `MW_QUERY='?quality=low' node tests/flow-test.js`
- `node tests/online-test.js two|ten|migrate [--shots]`: online multiplayer (start the server first:
  `cd server && PORT=8099 node server.js`). `two`: 2 humans, lobby/link/ready, turn timer, disconnect → bot →
  rejoin, final states agree. `ten`: 10 humans in a 5v5 (4 browsers + 6 headless WebSocket players). `migrate`: the host
  quits mid-game and hosting moves to another player.
- `FLOW_MODES=keys node tests/flow-test.js` runs one part of the flow test (keys, clicks, or constraints)
- `node tests/world-test.js [seeds]` — every map from the menu (keyboard turn), spawn sanity across seeds × sizes per world, one all-bot 4×5 game per world
(Scripts assume Chrome at /usr/bin/google-chrome and the game at /workspace/memecoin-artillery.)

Parody game; all characters are original procedural drawings. Not financial advice.
