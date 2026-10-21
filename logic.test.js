import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRTIME,
  CHAINS_FROM_SCORE,
  HIGH_H,
  CHAIN_PITCH_MIN,
  CHAIN_WINDOW,
  PLATFORM_POST,
  PLATFORM_PRE,
  CHAIN_PITCH_RANDOM,
  CHAIN_PLATFORM_W,
  airtimeTo,
  GRAVITY,
  JUMP_V,
  MAX_DT,
  MAX_LIVES,
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
  SPAWN_X,
  START_SPEED,
  collides,
  hitBottles,
  createState,
  getScore,
  jump,
  spawn,
  spawnChain,
  spawnHole,
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

test('hitting a bottle with the last heart ends the game and freezes the world', () => {
  const s = runningState();
  s.lives = 1;
  s.obstacles = [
    { x: PLAYER.x + 30, w: 24, h: 56 },
    { x: PLAYER.x + 400, w: 24, h: 56 }, // far away: shows the world standing still
  ];
  step(s, 0.05);
  assert.equal(s.phase, 'gameover');
  const { distance } = s;
  const x = s.obstacles[0].x;
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
  s.lives = 1;
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
  assert.equal(s.lives, MAX_LIVES);
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
  const chains = new Set();
  for (let seed = 10; seed < 30; seed++) {
    const s = createState(mulberry32(seed));
    start(s);
    for (let i = 0; i < 120 * 60; i++) {
      botJump(s);
      const before = s.pits.length ? s.pits[0] : null;
      step(s, 1 / 60);
      if (before && !s.pits.includes(before)) holesCleared++;
      if (s.platforms.some((p) => p.h === HIGH_H)) chains.add(s.pits[s.pits.length - 1]);
      assert.equal(s.phase, 'running', `seed ${seed} died at t=${s.time.toFixed(1)} speed=${s.speed.toFixed(0)}`);
    }
  }
  assert.ok(holesCleared > 50, `bot only met ${holesCleared} holes`);
  assert.ok(chains.size > 20, `bot only met ${chains.size} chains`);
});

// Jumps so the whole bottle group passes through the middle of the airtime window.
function botJump(s) {
  if (!s.onGround) return;
  if (botJumpToPlatform(s) || s.y > 0) return;
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

// The bot crosses a hole hop by hop, aiming to land 40px inside each target:
// - on the ground: the first platform over the next hole (only if the hole is still ahead);
// - on a platform: the next platform of the same hole, or, from the last one, the ground past the hole.
function botJumpToPlatform(s) {
  const left = PLAYER.x + 7;
  const pRight = PLAYER.x + PLAYER.w - 7;
  const hole = s.pits.find((p) => p.x + p.w > pRight);
  if (!hole) return false;
  const holeEnd = hole.x + hole.w;
  const target = s.platforms.find(
    (p) => p.x < holeEnd && p.x + p.w > Math.max(left, hole.x) && p.h - s.y < 110 && (s.y === 0 || p.x > pRight),
  );
  if (target) {
    // Bottles in front of the platform are handled by the bottle logic.
    if (s.y === 0 && s.obstacles.some((o) => o.x + o.w > left && o.x < target.x)) return false;
    if (target.x - pRight <= s.speed * airtimeTo(target.h - s.y) - 40) jump(s);
    return true;
  }
  if (s.y > 0) {
    if (pRight + s.speed * airtimeTo(-s.y) >= holeEnd + 40) jump(s); // last platform: hop to the ground
    return true;
  }
  return false;
}

// A state just before the hard part: one hole (with `count` platforms) ahead, nothing else. Like the
// real spawner it leaves room for a run-up of more than a jump.
function pitState(seed = 1, count = 1, speed = 450) {
  const s = runningState(seed);
  s.speed = speed;
  s.distance = (count > 1 ? CHAINS_FROM_SCORE : PITS_FROM_SCORE) / SCORE_PER_PX;
  spawnHole(s, count);
  const dx = s.pits[0].x - (PLAYER.x + 250 + speed);
  for (const o of [...s.pits, ...s.platforms]) o.x -= dx;
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

test('running into a hole without jumping ends the game', () => {
  const s = pitState();
  advance(s, 3);
  assert.equal(s.phase, 'gameover');
  assert.ok(s.y < -FALL_DEPTH);
});

test('platforms are one-way: walking under one on the ground is fine', () => {
  const s = pitState();
  s.pits[0].x = 5000; // hole far away, platform start still overhead
  s.platforms[0].x = PLAYER.x - 20;
  s.platforms[0].w = 400;
  step(s, 1 / 60);
  assert.equal(s.phase, 'running');
  assert.equal(s.y, 0);
});

test('jumping up through a platform from below is not blocked', () => {
  const s = pitState();
  s.pits[0].x = 5000;
  s.platforms[0].x = PLAYER.x - 20;
  s.platforms[0].w = 400;
  jump(s);
  let peak = 0;
  for (let i = 0; i < 20; i++) {
    step(s, 1 / 60);
    peak = Math.max(peak, s.y);
  }
  assert.ok(peak > PLATFORM_H + 20, `peak ${peak}`);
});

test('chains only appear from their score, and only on some holes', () => {
  const at = (score, seed) => {
    const a = createState(mulberry32(seed));
    a.distance = score / SCORE_PER_PX;
    for (let i = 0; i < 30; i++) {
      a.platforms = [];
      a.pits = [];
      spawn(a);
      if (a.platforms.length >= 2) return true;
    }
    return false;
  };
  for (let seed = 1; seed <= 20; seed++) assert.equal(at(CHAINS_FROM_SCORE - 1, seed), false);
  let withChain = 0;
  for (let seed = 1; seed <= 20; seed++) if (at(CHAINS_FROM_SCORE, seed)) withChain++;
  assert.equal(withChain, 20);
});

test('chains have 2 to 4 platforms, all of those lengths occur, never more than 4', () => {
  const counts = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const s = createState(mulberry32(seed));
    s.speed = 600;
    spawnChain(s);
    counts.add(s.platforms.length);
  }
  assert.deepEqual([...counts].sort(), [2, 3, 4]);
});

test('hole geometry holds for 1 to 4 platforms at every speed', () => {
  assert.ok(HIGH_H > (JUMP_V * JUMP_V) / (2 * GRAVITY), 'a ground jump must not reach the high height');
  const feet = PLAYER.w - 14;
  for (const speed of [START_SPEED, 450, 575, MAX_SPEED]) {
    for (const count of [1, 2, 3, 4]) {
      for (let seed = 1; seed <= 200; seed++) {
        const s = createState(mulberry32(seed));
        s.speed = speed;
        spawnHole(s, count);
        const [hole] = s.pits;
        const holeEnd = hole.x + hole.w;
        const plats = s.platforms;
        const first = plats[0];
        const last = plats[count - 1];
        const tag = `speed ${speed} count ${count} seed ${seed}`;
        assert.equal(plats.length, count, tag);
        assert.equal(s.obstacles.length, 0, 'no bottles on or around the platforms');
        assert.ok(hole.w >= speed * AIRTIME + HOLE_MARGIN, `a ground jump could clear the hole: ${tag}`);
        assert.equal(first.h, PLATFORM_H, tag);
        for (const p of plats) {
          assert.ok(p.w >= speed * 0.3, `platform shorter than 0.3 s, too short to tap again on it: ${tag}`); // fixed on purpose: not tied to the constant
          assert.ok(p.w >= CHAIN_PLATFORM_W, tag);
          assert.ok(p.h === PLATFORM_H || p.h === HIGH_H, tag);
          if (count > 1) assert.ok(p.w < hole.w, `a platform spans the hole alone: ${tag}`);
        }
        // Ground edge -> first platform: it starts at most PLATFORM_PRE before the hole, and not so far
        // in that a jump from the ground edge would fall short of it.
        assert.ok(first.x >= hole.x - PLATFORM_PRE - 1e-9, tag);
        assert.ok(first.x >= SPAWN_X + speed * airtimeTo(PLATFORM_H) - 1e-9, `no run-up before the first platform: ${tag}`);
        assert.ok(first.x - hole.x <= speed * airtimeTo(PLATFORM_H) - CHAIN_WINDOW + 1e-9, `first platform out of reach: ${tag}`);
        // Between platforms: a gap to hop, one jump long.
        for (let i = 1; i < count; i++) {
          const gap = plats[i].x - (plats[i - 1].x + plats[i - 1].w);
          assert.ok(gap > 0, `there is a gap to hop: ${tag}`);
          const reach = speed * airtimeTo(plats[i].h - plats[i - 1].h);
          const offset = plats[i].x - plats[i - 1].x - reach;
          assert.ok(offset >= CHAIN_PITCH_MIN - 1e-9 && offset <= CHAIN_PITCH_MIN + CHAIN_PITCH_RANDOM, `hop ${i}: ${tag}`);
        }
        // Last platform -> ground: ends at most PLATFORM_POST past the hole, and not so far short that a
        // jump from its end would land in the hole.
        const lastEnd = last.x + last.w;
        assert.ok(lastEnd <= holeEnd + PLATFORM_POST + 1e-9, tag);
        assert.ok(lastEnd + speed * airtimeTo(-last.h) >= holeEnd + CHAIN_WINDOW, `last platform too short of the far edge: ${tag}`);
        // With a chain, the first platform alone cannot clear the hole.
        if (count > 1) assert.ok(first.x + first.w + speed * PLATFORM_AIRTIME < holeEnd + feet, tag);
        const extent = Math.max(lastEnd, holeEnd);
        assert.ok(s.untilSpawn - (extent - first.x) >= speed * airtimeTo(-last.h), `no room after: ${tag}`);
      }
    }
  }
});

test('both ends of a hole vary: overhang or a jumpable gap', () => {
  let gapIn = 0;
  let overhangIn = 0;
  let gapOut = 0;
  let overhangOut = 0;
  for (const count of [1, 2, 3, 4]) {
    for (let seed = 1; seed <= 200; seed++) {
      const s = createState(mulberry32(seed));
      s.speed = 575;
      spawnHole(s, count);
      const [hole] = s.pits;
      const last = s.platforms[count - 1];
      if (s.platforms[0].x > hole.x) gapIn++;
      else overhangIn++;
      if (last.x + last.w < hole.x + hole.w) gapOut++;
      else overhangOut++;
    }
  }
  assert.ok(gapIn > 100 && overhangIn > 100, `ground->first: gap ${gapIn}, overhang ${overhangIn}`);
  assert.ok(gapOut > 100 && overhangOut > 100, `last->ground: gap ${gapOut}, overhang ${overhangOut}`);
});

for (const count of [1, 2, 3, 4]) {
  test(`hole with ${count} platform(s): the bot steps on every platform, then lands on the ground past the hole`, () => {
    for (const speed of [450, 750]) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = pitState(seed, count, speed);
        const chain = [...s.platforms];
        const holeEndWorld = s.pits[0].x + s.pits[0].w + s.distance;
        const visited = new Set();
        let landed = false;
        for (let i = 0; i < 12 * 60 && !landed; i++) {
          botJump(s);
          step(s, 1 / 60);
          const tag = `speed ${speed} seed ${seed} i=${i} y=${s.y}`;
          assert.equal(s.phase, 'running', `died: ${tag}`);
          for (const p of chain) {
            if (s.onGround && s.y === p.h && PLAYER.x + PLAYER.w - 7 > p.x && PLAYER.x + 7 < p.x + p.w) visited.add(p);
          }
          landed = visited.size === count && s.onGround && s.y === 0;
        }
        assert.ok(landed, `speed ${speed} seed ${seed}: stood on ${visited.size} of ${count}, never landed`);
        assert.ok(PLAYER.x + 7 + s.distance > holeEndWorld);
      }
    }
  });
}

test('a ground jump cannot land on a high platform', () => {
  const s = pitState();
  s.platforms = [{ x: PLAYER.x - 100, w: 600, h: HIGH_H }];
  s.pits[0].x = 5000;
  jump(s);
  let peak = 0;
  for (let i = 0; i < 60 && !s.onGround; i++) {
    step(s, 1 / 60);
    peak = Math.max(peak, s.y);
  }
  assert.ok(peak < HIGH_H, `peak ${peak}`);
  assert.equal(s.y, 0);
});

test('chain: skipping the hop (running off the ledge) falls into the hole', () => {
  const s = pitState(1, 2);
  let onLedge = false;
  for (let i = 0; i < 8 * 60 && s.phase === 'running'; i++) {
    if (!onGround75(s)) botJump(s); // jumps onto the ledge, then does nothing
    step(s, 1 / 60);
    if (onGround75(s)) onLedge = true;
  }
  assert.ok(onLedge);
  assert.equal(s.phase, 'gameover');
});

function onGround75(s) {
  return s.onGround && s.y === 75;
}

test('a run starts with 5 hearts', () => {
  assert.equal(MAX_LIVES, 5);
  assert.equal(createState(mulberry32(1)).lives, 5);
  assert.equal(runningState().lives, 5);
});

test('a bottle hit costs one heart, shatters the bottle and keeps the game going', () => {
  const s = runningState();
  s.obstacles = [{ x: PLAYER.x, w: 24, h: 56 }];
  step(s, 1 / 60);
  assert.equal(s.lives, MAX_LIVES - 1);
  assert.equal(s.phase, 'running');
  assert.equal(s.obstacles.length, 0);
});

test('each bottle touched costs a heart', () => {
  const s = runningState();
  s.obstacles = [
    { x: PLAYER.x + 8, w: 22, h: 44 },
    { x: PLAYER.x + 8 + 26, w: 24, h: 56 },
  ];
  step(s, 1 / 60);
  assert.equal(hitBottles(s).length, 0);
  assert.equal(s.lives, MAX_LIVES - 2);
});

test('running through a group costs one heart per bottle, one frame at a time', () => {
  const s = runningState();
  s.speed = 300;
  s.obstacles = [
    { x: PLAYER.x + 40, w: 22, h: 44 },
    { x: PLAYER.x + 40 + 26, w: 24, h: 56 },
    { x: PLAYER.x + 40 + 54, w: 26, h: 68 },
  ];
  advance(s, 1); // never jumps: walks through all three
  assert.equal(s.lives, MAX_LIVES - 3);
  assert.equal(s.phase, 'running');
  assert.equal(s.obstacles.length, 0);
});

test('a bottle costs exactly one heart however long the player overlaps it', () => {
  const s = runningState();
  s.obstacles = [{ x: PLAYER.x, w: 24, h: 56 }];
  advance(s, 0.5);
  assert.equal(s.lives, MAX_LIVES - 1);
});

test('losing the last heart ends the game; hearts never go negative', () => {
  const s = runningState();
  s.lives = 2;
  s.obstacles = [
    { x: PLAYER.x + 8, w: 22, h: 44 },
    { x: PLAYER.x + 8 + 26, w: 24, h: 56 },
    { x: PLAYER.x + 8 + 52, w: 24, h: 56 },
  ];
  step(s, 1 / 60);
  assert.equal(s.lives, 0);
  assert.equal(s.phase, 'gameover');
});

test('five hits in a row end the game on the fifth', () => {
  const s = runningState();
  for (let hit = 1; hit <= 5; hit++) {
    assert.equal(s.phase, 'running', `still alive before hit ${hit}`);
    s.obstacles = [{ x: PLAYER.x, w: 24, h: 56 }];
    step(s, 1 / 60);
    assert.equal(s.lives, 5 - hit);
  }
  assert.equal(s.phase, 'gameover');
});

test('falling into a hole kills whatever the hearts', () => {
  const s = pitState();
  assert.equal(s.lives, MAX_LIVES);
  advance(s, 3);
  assert.equal(s.phase, 'gameover');
  assert.equal(s.lives, MAX_LIVES, 'the hearts were not the cause');
});
