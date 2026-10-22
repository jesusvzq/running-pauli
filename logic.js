// Pure game logic: no DOM, no timers. All distances are logical px (canvas is W x H),
// all times are seconds. `y` is the player's height above the ground (up is positive).

export const W = 800;
// Room above the ground for the highest jump (off the high platform: 140 + 133 + 60 body) and below it for a fall into a hole.
export const H = 420;
export const GROUND_Y = 360;

export const GRAVITY = 2400;
export const JUMP_V = 800;
export const AIRTIME = (2 * JUMP_V) / GRAVITY;

export const START_SPEED = 300;
export const MAX_SPEED = 750;
export const ACCEL = 8;

export const MAX_LIVES = 5;

// Cats are the score: each one collected is worth CAT_POINTS. They float at random heights (a ground cat is
// picked up by running into it) and come singly or in small groups.
export const CAT = { w: 36, h: 26, air: 95 }; // air: fallback height of a cat that would sit on crowded ground
export const CAT_POINTS = 10;
export const CAT_MAX_BOTTOM = 160; // highest cat while running: a jump peaks at 133 and the body is 60 tall; above the high platforms (140)
export const CAT_GROUND_BELOW = 30; // a cat this low needs free ground around its spawn point
export const CAT_CLEAR = 150; // free ground needed on each side of a ground cat
export const CAT_FIRST = 600; // distance to the first spawn check
export const CAT_MIN = 1000; // distance between spawn checks
export const CAT_RANDOM = 1000;
export const CAT_GROUP_CHANCE = 0.3;
export const CAT_GROUP_MAX = 3;
export const CAT_GROUP_SPACING = 70;
// Behind the club and while shining Pauli is a magnet: cats this close (centre to centre) are pulled in and
// absorbed, and a swarm of cats over the whole height of the canvas keeps coming during the flight.
export const ABSORB_RADIUS = 200;
export const ABSORB_SPEED = 900;
export const CAT_FLY_MIN = 250;
export const CAT_FLY_RANDOM = 200;

// The Holiday club: every CLUB_EVERY of progress (distance * SCORE_PER_PX) a building scrolls in. Pauli passes behind it, then flies
// (and shines, immune to bottles and lava) for FLY_TIME seconds before falling back to the ground.
// Entering it is the only way to get all the hearts back.
export const CLUB_EVERY = 1000; // progress between clubs
export const CLUB = { w: 380, h: 250 };
export const FLY_TIME = 10;
export const NO_LAVA_AFTER = 800; // px of lava-free ground ahead once the shine ends
// While flying she is a flappy bird: gravity pulls her down, each tap flaps her up, the top of the canvas is the ceiling.
export const FLY_GRAVITY = 1500;
export const FLAP_V = 480;
export const FLY_MAX_FALL = 700;
export const MAX_DT = 0.05;
export const RESTART_LOCKOUT = 0.4;
export const SCORE_PER_PX = 0.04;

export const PLAYER = { x: 70, w: 40, h: 60 };
export const FLY_CEILING = GROUND_Y - PLAYER.h; // y at which her head touches the top of the canvas
export const HIT_PLAYER = { insetX: 7 };
export const HIT_BOTTLE = { insetX: 3, insetTop: 4 };

export const BOTTLE_TYPES = [
  { w: 22, h: 44 },
  { w: 24, h: 56 },
  { w: 26, h: 68 },
];
export const BOTTLE_SPACING = 4;

// Holes and flying platforms appear from this progress on (distance * SCORE_PER_PX; the shown score counts cats).
export const PITS_FROM_SCORE = 300;
export const PIT_CHANCE = 0.35;
export const PLATFORM_H = 75; // top of a platform above the ground; the jump peaks at 133
export const PLATFORM_PRE = 50; // ground before the hole that a platform may overhang
export const PLATFORM_POST = 60; // ground past the hole that a platform may overhang
export const HOLE_MARGIN = 120; // extra hole width beyond the ground-jump distance
export const HOLE_RANDOM = 100;
export const FALL_DEPTH = 50; // depth of a hole: feet this far below the ground = fallen out of the pit = dead
// Chains of 2-4 platforms over a hole, crossed hop by hop. The first is reachable from the ground; the
// others alternate between the low and the high height (a ground jump peaks at 133, so it cannot reach
// the high one; the screen has no room for more heights). Platforms are one-way.
export const CHAINS_FROM_SCORE = 600;
export const CHAIN_CHANCE = 0.5; // of the holes, once chains are on
export const CHAIN_MIN = 2;
export const CHAIN_MAX = 4;
export const CHAIN_PLATFORM_W = 120; // minimum width of every platform but the last one
// Platforms are also at least this many seconds long at the current speed, so after landing there is
// time to tap again.
export const MIN_PLATFORM_TIME = 0.35;
export const LAST_MIN = 160; // minimum length of the last platform (it is the only long one in a chain)
export const LAST_RANDOM = 100;
export const HIGH_H = 140;
// Distance from one platform's start to the next one's is what a jump covers (speed * airtime) plus a
// random offset in this range. Slightly short means the player lands a bit deeper on each platform,
// slightly long means taking off from deeper on the previous one, and both stay possible.
export const CHAIN_PITCH_MIN = -20;
export const CHAIN_PITCH_RANDOM = 60;
export const CHAIN_HOLE_MARGIN = 40;
export const CHAIN_WINDOW = 60; // a jump from the extreme takeoff spot still lands this far inside the target

// Time between leaving the ground/a platform with a jump and being back at a surface `rise` px above
// the takeoff height (negative: below it), on the way down.
export function airtimeTo(rise) {
  return (JUMP_V + Math.sqrt(JUMP_V * JUMP_V - 2 * GRAVITY * rise)) / GRAVITY;
}
// Time to land on the ground again after jumping off a platform.
export const PLATFORM_AIRTIME = airtimeTo(-PLATFORM_H);

const EPS = 1e-6;

export const FIRST_OBSTACLE_AT = 400;
export const SPAWN_X = W + 20;
const GAP_MARGIN = 140;
const GAP_RANDOM = 250;

export function createState(rng = Math.random) {
  return {
    rng,
    phase: 'ready', // 'ready' | 'running' | 'gameover'
    time: 0,
    overAt: 0,
    speed: START_SPEED,
    distance: 0,
    score: 0,
    y: 0,
    vy: 0,
    onGround: true,
    lives: MAX_LIVES,
    obstacles: [],
    pits: [],
    platforms: [],
    cats: [],
    clubs: [],
    nextClub: CLUB_EVERY / SCORE_PER_PX, // distance at which the next club is due
    inside: false, // behind a club: hidden and immune
    flyLeft: 0, // seconds of flight left
    glow: false, // shining and immune: from leaving the club until landed on solid ground
    noPitUntil: 0, // distance before which no hole spawns (after the shine ends)
    untilCat: CAT_FIRST,
    untilSpawn: FIRST_OBSTACLE_AT,
  };
}

export function start(state) {
  Object.assign(state, {
    phase: 'running',
    speed: START_SPEED,
    distance: 0,
    score: 0,
    y: 0,
    vy: 0,
    onGround: true,
    lives: MAX_LIVES,
    obstacles: [],
    pits: [],
    platforms: [],
    cats: [],
    clubs: [],
    nextClub: CLUB_EVERY / SCORE_PER_PX,
    inside: false,
    flyLeft: 0,
    glow: false,
    noPitUntil: 0,
    untilCat: CAT_FIRST,
    untilSpawn: FIRST_OBSTACLE_AT,
  });
}

export function jump(state) {
  if (state.phase !== 'running' || !state.onGround || state.inside || state.flyLeft > 0) return false;
  state.vy = JUMP_V;
  state.onGround = false;
  return true;
}

// Single entry point for tap / click / key press.
export function flap(state) {
  if (state.phase !== 'running' || state.flyLeft <= 0) return false;
  state.vy = FLAP_V;
  return true;
}

export function tap(state) {
  if (state.phase === 'ready') {
    start(state);
    jump(state);
  } else if (state.phase === 'running') {
    if (!flap(state)) jump(state);
  } else if (state.time - state.overAt >= RESTART_LOCKOUT) {
    start(state);
  }
}

function maxGroupSize(distance) {
  if (distance < 1500) return 1;
  if (distance < 4000) return 2;
  return 3;
}

// Spawns a group of 1-3 bottles just off the right edge and schedules the next group.
// The gap after the group is always at least the jump distance at the current speed
// plus a margin, so every layout can be jumped.
export function spawnGroup(state) {
  const { rng } = state;
  const r = rng();
  const count = Math.min(maxGroupSize(state.distance), r < 0.6 ? 1 : r < 0.85 ? 2 : 3);
  let x = SPAWN_X;
  for (let i = 0; i < count; i++) {
    const type = BOTTLE_TYPES[Math.floor(rng() * BOTTLE_TYPES.length)];
    state.obstacles.push({ x, w: type.w, h: type.h });
    x += type.w + BOTTLE_SPACING;
  }
  const width = x - BOTTLE_SPACING - SPAWN_X;
  const gap = state.speed * AIRTIME + GAP_MARGIN + rng() * GAP_RANDOM;
  state.untilSpawn = width + gap;
}

// Holes always come with one-way platforms floating over them: 1 platform from PITS_FROM_SCORE on,
// 2-4 (a chain) from CHAINS_FROM_SCORE. The hole is wider than a ground jump, so the only way across is
// hop by hop. Each end of the layout may have a jumpable gap: the first platform can start inside the
// hole (the player takes off from the ground edge) and the last one can end short of the hole's far
// edge (the player jumps from it to the ground). Gaps are bounded so a jump from the extreme takeoff
// spot still lands CHAIN_WINDOW px inside the target.
export function spawnHole(state, count) {
  const { rng, speed } = state;
  // Ground run-up: the first platform is at least one jump away from the spawn point, so a player who
  // just landed from the previous obstacle still has room to take off for it.
  const holeX = SPAWN_X + speed * airtimeTo(PLATFORM_H) + PLATFORM_PRE;
  const heights = [PLATFORM_H];
  for (let i = 1; i < count; i++) {
    const prev = heights[i - 1];
    heights.push(rng() < 0.7 ? (prev === PLATFORM_H ? HIGH_H : PLATFORM_H) : prev);
  }
  const lastH = heights[count - 1];
  const platW = Math.max(CHAIN_PLATFORM_W, Math.ceil(speed * MIN_PLATFORM_TIME));

  // First platform: from overhanging the hole start up to a full jump away from the ground edge.
  const maxIn = Math.max(-PLATFORM_PRE, speed * airtimeTo(PLATFORM_H) - CHAIN_WINDOW);
  const u = -PLATFORM_PRE + rng() * (maxIn + PLATFORM_PRE);
  const platforms = [{ x: holeX + u, w: platW, h: PLATFORM_H }];
  for (let i = 1; i < count; i++) {
    const pitch = speed * airtimeTo(heights[i] - heights[i - 1]) + CHAIN_PITCH_MIN + rng() * CHAIN_PITCH_RANDOM;
    platforms.push({ x: platforms[i - 1].x + pitch, w: platW, h: heights[i] });
  }
  const last = platforms[count - 1];
  const lastEnd0 = last.x + Math.max(LAST_MIN, platW) + rng() * LAST_RANDOM;

  // The hole is wider than a ground jump, and (for chains) than the first platform plus a jump from it.
  let need = speed * AIRTIME + HOLE_MARGIN;
  if (count > 1) need = Math.max(need, u + platW + speed * PLATFORM_AIRTIME + CHAIN_HOLE_MARGIN);
  const holeW = Math.max(need, lastEnd0 - PLATFORM_POST - holeX) + rng() * HOLE_RANDOM;
  const holeEnd = holeX + holeW;

  // Last platform: ends between "a full jump short of the hole's far edge" and a little past it.
  const maxOut = Math.max(0, speed * airtimeTo(-lastH) - CHAIN_WINDOW * 2);
  const lo = Math.max(lastEnd0, holeEnd - maxOut);
  const hi = holeEnd + PLATFORM_POST;
  const lastEnd = lo + rng() * (hi - lo);
  last.w = lastEnd - last.x;

  state.pits.push({ x: holeX, w: holeW });
  state.platforms.push(...platforms);
  const gap = speed * airtimeTo(-lastH) + GAP_MARGIN + rng() * GAP_RANDOM;
  state.untilSpawn = Math.max(lastEnd, holeEnd) - SPAWN_X + gap;
}

export const spawnPit = (state) => spawnHole(state, 1);
export function spawnChain(state, count = CHAIN_MIN + Math.floor(state.rng() * (CHAIN_MAX - CHAIN_MIN + 1))) {
  spawnHole(state, count);
}

// A club takes the place of the next obstacle; nothing else spawns until it has scrolled past.
export function spawnClub(state) {
  state.clubs.push({ x: SPAWN_X, w: CLUB.w });
  state.nextClub += CLUB_EVERY / SCORE_PER_PX;
  state.untilSpawn = CLUB.w + state.speed * AIRTIME + GAP_MARGIN + state.rng() * GAP_RANDOM;
}

export function spawn(state) {
  if (state.distance >= state.nextClub) return spawnClub(state);
  // No holes during the flight or right after it: she must not land into lava once mortal again.
  const shining = state.glow || state.inside || state.flyLeft > 0;
  const pitsOn = state.distance >= PITS_FROM_SCORE / SCORE_PER_PX && !shining && state.distance >= state.noPitUntil;
  if (!pitsOn || state.rng() >= PIT_CHANCE) return spawnGroup(state);
  const chainsOn = state.distance >= CHAINS_FROM_SCORE / SCORE_PER_PX;
  if (chainsOn && state.rng() < CHAIN_CHANCE) spawnChain(state);
  else spawnPit(state);
}

function feetRange() {
  return [PLAYER.x + HIT_PLAYER.insetX, PLAYER.x + PLAYER.w - HIT_PLAYER.insetX];
}

function overPit(state) {
  const [left, right] = feetRange();
  return state.pits.some((p) => left >= p.x && right <= p.x + p.w);
}

// Height of the highest surface the player can stand on, coming from height `fromY`.
// Ground counts unless the whole foot is over a hole (and once below ground level you keep falling);
// platforms are one-way: they only count if the feet were at or above their top.
export function supportHeight(state, fromY) {
  const [left, right] = feetRange();
  let floor = -Infinity;
  if (fromY >= -EPS && (state.glow || !overPit(state))) floor = 0;
  for (const p of state.platforms) {
    if (fromY >= p.h - EPS && right > p.x && left < p.x + p.w) floor = Math.max(floor, p.h);
  }
  return floor;
}

// The bottles the player is touching right now.
export function hitBottles(state) {
  const left = PLAYER.x + HIT_PLAYER.insetX;
  const right = PLAYER.x + PLAYER.w - HIT_PLAYER.insetX;
  return state.obstacles.filter((o) => {
    const oLeft = o.x + HIT_BOTTLE.insetX;
    const oRight = o.x + o.w - HIT_BOTTLE.insetX;
    const oTop = o.h - HIT_BOTTLE.insetTop;
    return right > oLeft && left < oRight && state.y < oTop;
  });
}

// Free of bottles, holes and platforms around the spawn point, and no spawn due right away.
function groundIsClear(state) {
  const lo = SPAWN_X - CAT_CLEAR;
  const hi = SPAWN_X + CAT.w + CAT_CLEAR;
  const free = (a) => a.x + a.w <= lo || a.x >= hi;
  return state.untilSpawn > CAT_CLEAR + CAT.w && [...state.obstacles, ...state.pits, ...state.platforms].every(free);
}

// A hole or one of its platforms is at this x.
function overHole(state, x) {
  return [...state.pits, ...state.platforms].some((a) => a.x < x + CAT.w && a.x + a.w > x);
}

// Spawns one cat or a small group off the right edge, at random heights. While shining the cats fill the
// whole height of the canvas, since she can fly up to them.
function spawnCats(state) {
  const { rng } = state;
  const flying = state.glow || state.flyLeft > 0;
  const top = flying ? GROUND_Y - CAT.h : CAT_MAX_BOTTOM;
  const count = rng() < CAT_GROUP_CHANCE ? 2 + Math.floor(rng() * (CAT_GROUP_MAX - 1)) : 1;
  let bottom = rng() * top;
  for (let i = 0; i < count; i++) {
    if (i > 0) bottom = Math.min(top, Math.max(0, bottom + (rng() - 0.5) * 60));
    const x = SPAWN_X + i * CAT_GROUP_SPACING;
    if (bottom < HIGH_H && overHole(state, x)) continue; // under a platform or over lava: nobody can get it
    const low = bottom < CAT_GROUND_BELOW && !flying && !groundIsClear(state);
    state.cats.push({ x, bottom: low ? CAT.air : bottom });
  }
}

// Cats near a magnet Pauli fly to her.
function pullCats(state, dt) {
  const px = PLAYER.x + PLAYER.w / 2;
  const py = state.y + PLAYER.h / 2;
  for (const c of state.cats) {
    const dx = px - (c.x + CAT.w / 2);
    const dy = py - (c.bottom + CAT.h / 2);
    const d = Math.hypot(dx, dy);
    if (d === 0 || d >= ABSORB_RADIUS) continue;
    const move = Math.min(d, ABSORB_SPEED * dt);
    c.x += (dx / d) * move;
    c.bottom += (dy / d) * move;
  }
}

function touchesCat(state, c) {
  const [left, right] = feetRange();
  return right > c.x && left < c.x + CAT.w && state.y + PLAYER.h > c.bottom && state.y < c.bottom + CAT.h;
}

export function collides(state) {
  return hitBottles(state).length > 0;
}

export function step(state, rawDt) {
  const dt = Math.min(Math.max(rawDt, 0), MAX_DT);
  state.time += dt;
  if (state.phase !== 'running') return;

  state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * dt);
  const dx = state.speed * dt;
  state.distance += dx;

  for (const o of state.obstacles) o.x -= dx;
  state.obstacles = state.obstacles.filter((o) => o.x + o.w > -20);
  for (const p of state.pits) p.x -= dx;
  state.pits = state.pits.filter((p) => p.x + p.w > -20);
  for (const p of state.platforms) p.x -= dx;
  state.platforms = state.platforms.filter((p) => p.x + p.w > -20);
  for (const c of state.clubs) c.x -= dx;
  state.clubs = state.clubs.filter((c) => c.x + c.w > -20);

  // Behind a club Pauli is hidden and immune; leaving it launches the flight.
  const [feetL, feetR] = feetRange();
  const wasInside = state.inside;
  state.inside = state.clubs.some((c) => feetR > c.x && feetL < c.x + c.w);
  if (!wasInside && state.inside) state.lives = MAX_LIVES; // the club is the only place to get hearts back
  if (wasInside && !state.inside) {
    state.flyLeft = FLY_TIME;
    state.glow = true;
    state.onGround = false;
    state.vy = FLAP_V; // she bursts out of the club
    state.untilCat = 0; // the swarm starts right away
  }

  // Standing on something that has scrolled away: start falling.
  if (state.onGround && state.y > supportHeight(state, state.y) + EPS) {
    state.onGround = false;
    state.vy = 0;
  }
  if (state.flyLeft > 0) {
    state.flyLeft = Math.max(0, state.flyLeft - dt);
    state.y += state.vy * dt - 0.5 * FLY_GRAVITY * dt * dt;
    state.vy = Math.max(-FLY_MAX_FALL, state.vy - FLY_GRAVITY * dt);
    if (state.y >= FLY_CEILING) {
      state.y = FLY_CEILING;
      state.vy = Math.min(state.vy, 0);
    }
    if (state.y <= 0) {
      state.y = 0; // shining, she rests on the ground even over lava
      state.vy = 0;
    }
  } else if (!state.onGround) {
    const prevY = state.y;
    state.y += state.vy * dt - 0.5 * GRAVITY * dt * dt;
    state.vy -= GRAVITY * dt;
    const floor = supportHeight(state, prevY);
    if (state.vy <= 0 && state.y <= floor) {
      state.y = floor;
      state.vy = 0;
      state.onGround = true;
    }
  }

  for (const c of state.cats) c.x -= dx;
  state.cats = state.cats.filter((c) => c.x + CAT.w > -20);
  state.untilCat -= dx;
  // No new cats while a club is on screen; the check stays due and fires once it has gone.
  if (state.untilCat <= 0 && state.clubs.length === 0) {
    spawnCats(state);
    const flying = state.glow || state.flyLeft > 0;
    state.untilCat = flying ? CAT_FLY_MIN + state.rng() * CAT_FLY_RANDOM : CAT_MIN + state.rng() * CAT_RANDOM;
  }

  state.untilSpawn -= dx;
  if (state.untilSpawn <= 0) spawn(state);

  // Shine ends once she is back on solid ground.
  if (state.glow && state.flyLeft === 0 && state.onGround && !state.inside && !overPit(state)) {
    state.glow = false;
    state.noPitUntil = state.distance + NO_LAVA_AFTER;
  }

  if (state.inside || state.glow) pullCats(state, dt);
  const got = state.cats.filter((c) => touchesCat(state, c));
  if (got.length > 0) {
    state.score += got.length * CAT_POINTS;
    state.cats = state.cats.filter((c) => !got.includes(c));
  }

  // A bottle that hits shatters and costs a heart, so every bottle in a group costs one.
  const hit = state.glow || state.inside ? [] : hitBottles(state);
  if (hit.length > 0) {
    state.lives = Math.max(0, state.lives - hit.length);
    state.obstacles = state.obstacles.filter((o) => !hit.includes(o));
  }

  // Falling into a hole is fatal whatever the hearts.
  if (state.lives === 0 || state.y < -FALL_DEPTH) {
    state.phase = 'gameover';
    state.overAt = state.time;
  }
}

export function getScore(state) {
  return state.score;
}
