// Pure game logic: no DOM, no timers. All distances are logical px (canvas is W x H),
// all times are seconds. `y` is the player's height above the ground (up is positive).

export const W = 800;
export const H = 300;
export const GROUND_Y = 250;

export const GRAVITY = 2400;
export const JUMP_V = 800;
export const AIRTIME = (2 * JUMP_V) / GRAVITY;

export const START_SPEED = 300;
export const MAX_SPEED = 750;
export const ACCEL = 8;

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
export const PLATFORM_PRE = 50; // platform overhang before / after the hole
export const PLATFORM_POST = 60;
export const HOLE_MARGIN = 120; // extra hole width beyond the ground-jump distance
export const HOLE_RANDOM = 100;
export const FALL_DEPTH = H - GROUND_Y; // feet below the ground by this much = out of the screen = dead
// Time to land on the ground again after jumping off a platform.
export const PLATFORM_AIRTIME = (JUMP_V + Math.sqrt(JUMP_V * JUMP_V + 2 * GRAVITY * PLATFORM_H)) / GRAVITY;

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
    obstacles: [],
    pits: [],
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
    obstacles: [],
    pits: [],
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

// A hole {x, w} with a one-way platform {px, pw} (at PLATFORM_H) floating over it. The hole is
// wider than a ground jump, so the only way across is to land on the platform and jump off it.
export function spawnPit(state) {
  const { rng } = state;
  const w = state.speed * AIRTIME + HOLE_MARGIN + rng() * HOLE_RANDOM;
  const pw = PLATFORM_PRE + w + PLATFORM_POST;
  state.pits.push({ x: SPAWN_X + PLATFORM_PRE, w, px: SPAWN_X, pw });
  const gap = state.speed * PLATFORM_AIRTIME + GAP_MARGIN + rng() * GAP_RANDOM;
  state.untilSpawn = pw + gap;
}

export function spawn(state) {
  const pitsOn = state.distance >= PITS_FROM_SCORE / SCORE_PER_PX;
  if (pitsOn && state.rng() < PIT_CHANCE) spawnPit(state);
  else spawnGroup(state);
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
  if (fromY >= PLATFORM_H - EPS && state.pits.some((p) => right > p.px && left < p.px + p.pw)) floor = PLATFORM_H;
  return floor;
}

export function collides(state) {
  const left = PLAYER.x + HIT_PLAYER.insetX;
  const right = PLAYER.x + PLAYER.w - HIT_PLAYER.insetX;
  for (const o of state.obstacles) {
    const oLeft = o.x + HIT_BOTTLE.insetX;
    const oRight = o.x + o.w - HIT_BOTTLE.insetX;
    const oTop = o.h - HIT_BOTTLE.insetTop;
    if (right > oLeft && left < oRight && state.y < oTop) return true;
  }
  return false;
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
  for (const p of state.pits) {
    p.x -= dx;
    p.px -= dx;
  }
  state.pits = state.pits.filter((p) => p.px + p.pw > -20);

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

  if (collides(state) || state.y < -FALL_DEPTH) {
    state.phase = 'gameover';
    state.overAt = state.time;
  }
}

export function getScore(state) {
  return Math.floor(state.distance * SCORE_PER_PX);
}
