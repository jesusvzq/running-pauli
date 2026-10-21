import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRTIME,
  GRAVITY,
  JUMP_V,
  MAX_DT,
  FALL_DEPTH,
  HOLE_MARGIN,
  MAX_SPEED,
  PIT_CHANCE,
  PITS_FROM_SCORE,
  PLATFORM_AIRTIME,
  PLATFORM_H,
  PLAYER,
  SCORE_PER_PX,
  RESTART_LOCKOUT,
  START_SPEED,
  collides,
  createState,
  getScore,
  jump,
  spawn,
  spawnGroup,
  spawnPit,
  start,
  step,
  tap,
} from './logic.js';

// Deterministic rng so failures are reproducible.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// step() clamps dt, so advance time in frame-sized steps like the real loop does.
function advance(s, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) step(s, 1 / 60);
}

function runningState(seed = 1) {
  const s = createState(mulberry32(seed));
  start(s);
  s.untilSpawn = Infinity; // no obstacles unless the test adds them
  return s;
}

test('jump works only when running and grounded', () => {
  const ready = createState(mulberry32(1));
  assert.equal(jump(ready), false);

  const s = runningState();
  assert.equal(jump(s), true);
  assert.equal(s.onGround, false);
  assert.equal(s.vy, JUMP_V);
});

test('no double-jump while airborne', () => {
  const s = runningState();
  jump(s);
  step(s, 0.1);
  const vy = s.vy;
  assert.equal(jump(s), false);
  assert.equal(s.vy, vy);
});

test('jump peaks at v^2/2g and lands after AIRTIME', () => {
  const s = runningState();
  jump(s);
  let peak = 0;
  let t = 0;
  while (!s.onGround && t < 2) {
    step(s, 1 / 60);
    t += 1 / 60;
    peak = Math.max(peak, s.y);
  }
  assert.ok(s.onGround);
  assert.equal(s.y, 0);
  const expectedPeak = (JUMP_V * JUMP_V) / (2 * GRAVITY);
  assert.ok(Math.abs(peak - expectedPeak) < 3, `peak ${peak} vs ${expectedPeak}`);
  assert.ok(Math.abs(t - AIRTIME) < 2 / 60, `airtime ${t} vs ${AIRTIME}`);
});

test('jump height does not depend on frame rate', () => {
  const peakAt = (dt) => {
    const s = runningState();
    jump(s);
    let peak = 0;
    while (!s.onGround) {
      step(s, dt);
      peak = Math.max(peak, s.y);
    }
    return peak;
  };
  assert.ok(Math.abs(peakAt(1 / 30) - peakAt(1 / 240)) < 2);
});

test('step clamps dt so a long pause cannot teleport obstacles', () => {
  const s = runningState();
  step(s, 5);
  assert.ok(s.distance <= (START_SPEED + 20) * MAX_DT);
});

test('collision: bottle on the player hits, jumping over or being far away misses', () => {
  const s = runningState();
  s.obstacles = [{ x: PLAYER.x, w: 24, h: 56 }];
  assert.equal(collides(s), true);

  s.y = 100; // well above a 56px bottle
  assert.equal(collides(s), false);

  s.y = 0;
  s.obstacles = [{ x: PLAYER.x + 200, w: 24, h: 56 }];
  assert.equal(collides(s), false);
});

test('hitting a bottle ends the game and freezes the world', () => {
  const s = runningState();
  s.obstacles = [{ x: PLAYER.x + 30, w: 24, h: 56 }];
  step(s, 0.05);
  assert.equal(s.phase, 'gameover');
  const { distance, obstacles } = s;
  const x = obstacles[0].x;
  step(s, 0.05);
  assert.equal(s.distance, distance);
  assert.equal(s.obstacles[0].x, x);
});

test('tap: starts from ready (and jumps), jumps while running', () => {
  const s = createState(mulberry32(1));
  tap(s);
  assert.equal(s.phase, 'running');
  assert.equal(s.onGround, false);
});

test('restart is locked out briefly after game over, then resets', () => {
  const s = runningState();
  s.obstacles = [{ x: PLAYER.x, w: 24, h: 56 }];
  step(s, 0.01);
  assert.equal(s.phase, 'gameover');

  tap(s); // immediate double-tap
  assert.equal(s.phase, 'gameover');

  advance(s, RESTART_LOCKOUT / 2);
  tap(s);
  assert.equal(s.phase, 'gameover');

  advance(s, RESTART_LOCKOUT);
  tap(s);
  assert.equal(s.phase, 'running');
  assert.equal(s.distance, 0);
  assert.equal(s.speed, START_SPEED);
  assert.deepEqual(s.obstacles, []);
});

test('first obstacles are single bottles; groups grow with distance', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = createState(mulberry32(seed));
    s.distance = 0;
    spawnGroup(s);
    assert.equal(s.obstacles.length, 1, `seed ${seed}`);
  }
  let max = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = createState(mulberry32(seed));
    s.distance = 10000;
    spawnGroup(s);
    max = Math.max(max, s.obstacles.length);
  }
  assert.equal(max, 3);
});

test('gap after a group is at least the jump distance at the current speed', () => {
  for (const speed of [START_SPEED, 500, MAX_SPEED]) {
    for (let seed = 1; seed <= 100; seed++) {
      const s = createState(mulberry32(seed));
      s.speed = speed;
      s.distance = 10000;
      spawnGroup(s);
      const last = s.obstacles[s.obstacles.length - 1];
      const width = last.x + last.w - s.obstacles[0].x;
      const gap = s.untilSpawn - width;
      assert.ok(gap >= speed * AIRTIME, `speed ${speed} seed ${seed} gap ${gap}`);
    }
  }
});

test('speed ramps up and is capped; score grows with distance; obstacle list stays bounded', () => {
  const s = createState(mulberry32(3));
  start(s);
  // A bot that jumps at the ideal moment. It must survive, and the speed must hit the cap.
  const dt = 1 / 60;
  let maxObstacles = 0;
  for (let i = 0; i < 120 * 60; i++) {
    botJump(s);
    step(s, dt);
    assert.equal(s.phase, 'running', `died at t=${s.time.toFixed(1)} speed=${s.speed.toFixed(0)}`);
    assert.ok(s.speed <= MAX_SPEED);
    maxObstacles = Math.max(maxObstacles, s.obstacles.length);
  }
  assert.equal(s.speed, MAX_SPEED);
  assert.ok(getScore(s) > 1000);
  assert.ok(maxObstacles < 12, `obstacles piled up: ${maxObstacles}`);
});

// Every layout the spawner can produce must be beatable by a well-timed jump.
test('beatability: an ideal bot survives 2 minutes on many seeds, holes included', () => {
  let holesCleared = 0;
  for (let seed = 10; seed < 30; seed++) {
    const s = createState(mulberry32(seed));
    start(s);
    for (let i = 0; i < 120 * 60; i++) {
      botJump(s);
      const before = s.pits.length ? s.pits[0] : null;
      step(s, 1 / 60);
      if (before && !s.pits.includes(before)) holesCleared++;
      assert.equal(s.phase, 'running', `seed ${seed} died at t=${s.time.toFixed(1)} speed=${s.speed.toFixed(0)}`);
    }
  }
  assert.ok(holesCleared > 50, `bot only met ${holesCleared} holes`);
});

// Jumps so the whole bottle group passes through the middle of the airtime window.
function botJump(s) {
  if (!s.onGround || s.y > 0) return; // on a platform the bot just runs off the end
  if (botJumpToPlatform(s)) return;
  const pRight = PLAYER.x + PLAYER.w - 7;
  const pWidth = PLAYER.w - 14;
  const ahead = s.obstacles.filter((o) => o.x + o.w - 3 > PLAYER.x + 7);
  if (ahead.length === 0) return;
  const first = ahead[0];
  let last = first;
  for (const o of ahead.slice(1)) {
    if (o.x - (last.x + last.w) < 20) last = o;
    else break;
  }
  const span = last.x + last.w - 3 - (first.x + 3);
  const d = first.x + 3 - pRight;
  if (d <= 0) return;
  const t0 = AIRTIME / 2 - (span + pWidth) / (2 * s.speed);
  if (d <= s.speed * t0) jump(s);
}

// Jumps so the feet land well inside the platform of the next hole.
const T_UP = (JUMP_V + Math.sqrt(JUMP_V * JUMP_V - 2 * GRAVITY * PLATFORM_H)) / GRAVITY;
function botJumpToPlatform(s) {
  const left = PLAYER.x + 7;
  const pRight = PLAYER.x + PLAYER.w - 7;
  const pit = s.pits.find((p) => p.x + p.w > left);
  if (!pit) return false;
  // Bottles in front of the pit are handled by the bottle logic.
  if (s.obstacles.some((o) => o.x + o.w > left && o.x < pit.px)) return false;
  if (pit.px - pRight <= s.speed * T_UP - 40) jump(s);
  return true;
}

// A state just before the hard part: one pit ahead, nothing else.
function pitState(seed = 1) {
  const s = runningState(seed);
  s.speed = 450;
  s.distance = PITS_FROM_SCORE / SCORE_PER_PX;
  spawnPit(s);
  const dx = s.pits[0].px - (PLAYER.x + 250);
  s.pits[0].px -= dx;
  s.pits[0].x -= dx;
  return s;
}

test('no holes before the score threshold, some after', () => {
  const before = PITS_FROM_SCORE / SCORE_PER_PX - 1;
  let pitsAfter = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = createState(mulberry32(seed));
    a.distance = before;
    spawn(a);
    assert.equal(a.pits.length, 0, `seed ${seed}`);
    const b = createState(mulberry32(seed));
    b.distance = before + 1;
    spawn(b);
    pitsAfter += b.pits.length;
  }
  assert.ok(pitsAfter > 200 * PIT_CHANCE * 0.5 && pitsAfter < 200, `pits after threshold: ${pitsAfter}`);
});

test('a hole is wider than a ground jump, and its platform has no bottles and overhangs both ends', () => {
  for (const speed of [START_SPEED, 500, MAX_SPEED]) {
    for (let seed = 1; seed <= 100; seed++) {
      const s = createState(mulberry32(seed));
      s.speed = speed;
      spawnPit(s);
      const [p] = s.pits;
      assert.ok(p.w >= speed * AIRTIME + HOLE_MARGIN, `speed ${speed} seed ${seed}`);
      assert.ok(p.px < p.x && p.px + p.pw > p.x + p.w);
      assert.equal(s.obstacles.length, 0);
      assert.ok(s.untilSpawn - p.pw >= speed * PLATFORM_AIRTIME, 'room to land after jumping off the platform');
    }
  }
});

test('running into a hole without jumping ends the game', () => {
  const s = pitState();
  advance(s, 3);
  assert.equal(s.phase, 'gameover');
  assert.ok(s.y < -FALL_DEPTH);
});

test('jump onto the platform, then run off the end: lands on the ground past the hole', () => {
  const s = pitState();
  const holeEndWorld = s.pits[0].x + s.pits[0].w + s.distance; // the pit scrolls off screen before we land
  let stood = false;
  for (let i = 0; i < 6 * 60 && !(stood && s.onGround && s.y === 0); i++) {
    botJump(s);
    step(s, 1 / 60);
    assert.equal(s.phase, 'running', `died at i=${i}`);
    if (s.onGround && s.y === PLATFORM_H) stood = true;
  }
  assert.ok(stood, 'never stood on the platform');
  assert.equal(s.y, 0);
  assert.ok(PLAYER.x + 7 + s.distance > holeEndWorld, 'back on the ground but still over the hole');
});

test('jump off the platform in the middle of the hole: still lands past the hole', () => {
  const s = pitState();
  let jumped = false;
  for (let i = 0; i < 6 * 60; i++) {
    botJump(s);
    if (s.onGround && s.y === PLATFORM_H && !jumped) {
      jumped = true;
      jump(s);
    }
    step(s, 1 / 60);
    assert.equal(s.phase, 'running', `died at i=${i}`);
    if (jumped && s.onGround && s.y === 0) break;
  }
  assert.ok(jumped && s.y === 0);
});

test('platforms are one-way: walking under one on the ground is fine', () => {
  const s = pitState();
  s.pits[0].x = 5000; // hole far away, platform start still overhead
  s.pits[0].px = PLAYER.x - 20;
  s.pits[0].pw = 400;
  step(s, 1 / 60);
  assert.equal(s.phase, 'running');
  assert.equal(s.y, 0);
});

test('jumping up through a platform from below is not blocked', () => {
  const s = pitState();
  s.pits[0].x = 5000;
  s.pits[0].px = PLAYER.x - 20;
  s.pits[0].pw = 400;
  jump(s);
  let peak = 0;
  for (let i = 0; i < 20; i++) {
    step(s, 1 / 60);
    peak = Math.max(peak, s.y);
  }
  assert.ok(peak > PLATFORM_H + 20, `peak ${peak}`);
});
