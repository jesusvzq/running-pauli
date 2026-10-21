// Pure game logic: no DOM, no timers. All distances are logical px (canvas is W x H),
// all times are seconds. `y` is the player's height above the ground (up is positive).

export const W = 800;
export const H = 340; // 300 of playfield + a strip under the ground for the hearts
export const GROUND_Y = 250;

export const GRAVITY = 2400;
export const JUMP_V = 800;
export const AIRTIME = (2 * JUMP_V) / GRAVITY;

export const START_SPEED = 300;
export const MAX_SPEED = 750;
export const ACCEL = 8;

export const MAX_LIVES = 5;

export const MAX_DT = 0.05;
export const RESTART_LOCKOUT = 0.4;
export const SCORE_PER_PX = 0.04;

export const PLAYER = { x: 70, w: 40, h: 60 };
export const HIT_PLAYER = { insetX: 7 };
export const HIT_BOTTLE = { insetX: 3, insetTop: 4 };

export const BOTTLE_TYPES = [
  { w: 22, h: 44 },
  { w: 24, h: 56 },
  { w: 26, h: 68 },
];
export const BOTTLE_SPACING = 4;

// Holes and flying platforms appear from this score on.
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
    y: 0,
    vy: 0,
    onGround: true,
    lives: MAX_LIVES,
    obstacles: [],
    pits: [],
    platforms: [],
    untilSpawn: FIRST_OBSTACLE_AT,
  };
}

export function start(state) {
  Object.assign(state, {
    phase: 'running',
    speed: START_SPEED,
    distance: 0,
    y: 0,
    vy: 0,
    onGround: true,
    lives: MAX_LIVES,
    obstacles: [],
    pits: [],
    platforms: [],
    untilSpawn: FIRST_OBSTACLE_AT,
  });
}

export function jump(state) {
  if (state.phase !== 'running' || !state.onGround) return false;
  state.vy = JUMP_V;
  state.onGround = false;
  return true;
}

// Single entry point for tap / click / key press.
export function tap(state) {
  if (state.phase === 'ready') {
    start(state);
    jump(state);
  } else if (state.phase === 'running') {
    jump(state);
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

export function spawn(state) {
  const pitsOn = state.distance >= PITS_FROM_SCORE / SCORE_PER_PX;
  if (!pitsOn || state.rng() >= PIT_CHANCE) return spawnGroup(state);
  const chainsOn = state.distance >= CHAINS_FROM_SCORE / SCORE_PER_PX;
  if (chainsOn && state.rng() < CHAIN_CHANCE) spawnChain(state);
  else spawnPit(state);
}

function feetRange() {
  return [PLAYER.x + HIT_PLAYER.insetX, PLAYER.x + PLAYER.w - HIT_PLAYER.insetX];
}

// Height of the highest surface the player can stand on, coming from height `fromY`.
// Ground counts unless the whole foot is over a hole (and once below ground level you keep falling);
// platforms are one-way: they only count if the feet were at or above their top.
export function supportHeight(state, fromY) {
  const [left, right] = feetRange();
  let floor = -Infinity;
  if (fromY >= -EPS && !state.pits.some((p) => left >= p.x && right <= p.x + p.w)) floor = 0;
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

  // Standing on something that has scrolled away: start falling.
  if (state.onGround && state.y > supportHeight(state, state.y) + EPS) {
    state.onGround = false;
    state.vy = 0;
  }
  if (!state.onGround) {
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

  state.untilSpawn -= dx;
  if (state.untilSpawn <= 0) spawn(state);

  // A bottle that hits shatters and costs a heart, so every bottle in a group costs one.
  const hit = hitBottles(state);
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
  return Math.floor(state.distance * SCORE_PER_PX);
}
