# Shill Shock — move stat sheet

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


One action per turn: firing an attack or using a defense ends the turn. Defenses protect the active unit until your team's next turn. Specials: 2 uses each per team per match. Blast damage falls off with distance; the damage figure is at the center.

Moves and stats are identical on every world (worlds are arenas, not team buffs). The only world twist that touches moves is Iceberg Arctic's gustier wind (up to ±130 %), which affects every wind-sensitive shot for every team equally.

## Movement per turn

- **Walk budget:** 450 px of horizontal walking per turn (about 5 s), split over as many walks as you like. A STEPS meter next to JUMP READY shows what's left; at 0 you get "Out of steps". Charged jumps/backflips don't use it, and Hop Away is unchanged. The budget refills on your next turn. Bots stick to it, and online the host enforces it.
- **Jump fall damage:** landing from your own charged jump or backflip deals ×0.5 fall damage (fall damage = (speed − 470) × 0.09). Walking off a ledge, being knocked back, and Rug Pull drops still do full damage; any knockback mid-jump removes the discount.

## Supply crates (memecoin airdrops)

2 crates parachute down onto random dry, walkable spots at the start of every round. You open one by walking, jumping or landing into it. Explosions destroy crates: a weapon crate goes off (r30, 20 dmg) and the others just break. Weapons go into that character's own inventory (the CRATE ITEMS row above the bar, keys 6+) with limited uses and disappear once used up. Instant items apply on pickup. Drop weights are relative.

| Item | Weight | Type | Uses | Damage | Radius | Effect |
|---|---|---|---|---|---|---|
| Laser Eyes | 12 | beam | 1 | 38 per unit | — | instant straight beam along your aim, no power or wind; hits everyone in line until it hits ground (carves r14), knockback ×0.45 |
| Shill Spray | 12 | machine gun | 2 | 8 × 10 | 15 | 8 rapid bullets with a small spread, low gravity, wind ×0.2 |
| Airdrop Cluster | 12 | cluster bomb | 1 | 25 + 6 × 16 | 28 / 24 | splits into 6 bomblets on impact |
| Whale Missile | 9 | homing | 1 | 50 | 44 | steers toward the nearest enemy after 0.45 s |
| Gas Fee | 9 | bouncing gas | 1 | 20 + 3 × 10 | 28 (gas 120) | 2.5 s fuse; anyone in the gas loses 10 HP at the start of each of their next 3 turns |
| FUD Bomb | 7 | debuff | 2 | 30 | 32 | enemies hit deal −40 % on their next attack |
| L2 Bridge | 6 | teleport | 1 | — | — | throw a beacon and teleport to a safe dry spot where it lands |
| Diamond Hands | 10 | special defense | 1 | — | — | damage ×0.5, knockback ×0.3 until your team's next turn |
| Hopium | 14 | instant heal | — | +35 HP | — | heals on pickup, up to 100 |
| Moon Scope | 10 | weapon attachment | 3 shots | +25 % | — | long, exact trajectory preview (laser sight for the beam) and +25 % damage on your next 3 attacks |

## Balance (Hard vs Hard bots, 3v3, 60 games per pairing, turn order rotated) — run r14
| Pairing | Result |
|---|---|
| DOGE vs FROG | 34–26 (57/43) |
| DOGE vs PENGU | 33–27 (55/45) |
| DOGE vs PILL | 33–27 (55/45) |
| FROG vs PENGU | 31–29 (52/48) |
| FROG vs PILL | 33–27 (55/45) |
| PENGU vs PILL | 26–34 (43/57) |

Overall duel win %: DOGE 55.6, FROG 50.0, PENGU 45.6, PILL 48.9 (±~3.7 % noise at 180 games each).
FFA (4 teams × 2, 60 games): DOGE 11, FROG 18, PENGU 13, PILL 18.
