import * as L from './logic.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Set to the path of the friend's face image (e.g. 'assets/face.png') to replace the placeholder smiley.
const FACE_SRC = null;

const COLORS = {
  bg: '#a8d8f0',
  ink: '#535353',
  skin: '#f5c9a0',
  shirt: '#3b6fd8',
  legs: '#333333',
  glass: '#9a5a12',
  cap: '#e0b020',
  label: '#f3e3b0',
  cloud: '#ffffff',
  lavaTop: '#ffd23a',
  lavaMid: '#ff6a1a',
  lavaDeep: '#b81400',
  ground: '#a6e3a1',
  shine: '#dcdcdc',
  cat: '#f0a050',
  catDark: '#b8702a',
};

const HI_KEY = 'running-pauli:hi';

function loadHi() {
  try {
    return Number(localStorage.getItem(HI_KEY)) || 0;
  } catch {
    return 0; // storage blocked (private mode etc.): the game still works, just without a saved high score
  }
}

function saveHi(value) {
  try {
    localStorage.setItem(HI_KEY, String(value));
  } catch {
    // storage blocked: see loadHi
  }
}

let faceImg = null;
if (FACE_SRC) {
  faceImg = new Image();
  faceImg.src = FACE_SRC;
}

const state = L.createState();
let hi = loadHi();

// ---- canvas sizing ----

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(canvas.width / L.W, 0, 0, canvas.height / L.H, 0, 0);
}

// ---- drawing ----

const mod = (n, m) => ((n % m) + m) % m;

function drawClouds() {
  ctx.fillStyle = COLORS.cloud;
  for (let i = 0; i < 4; i++) {
    const x = mod(i * 230 + 60 - state.distance * 0.15, L.W + 120) - 60;
    const y = 40 + ((i * 53) % 70);
    ctx.beginPath();
    ctx.ellipse(x, y, 34, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 18, y - 7, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Animated lava: a gradient, a wavy glowing surface, drifting hot blobs and rising bubbles.
function drawLava(a, b) {
  const t = performance.now() / 1000;
  const top = L.GROUND_Y + 1;
  const w = b - a;
  const grad = ctx.createLinearGradient(0, top, 0, top + L.FALL_DEPTH);
  grad.addColorStop(0, COLORS.lavaTop);
  grad.addColorStop(0.35, COLORS.lavaMid);
  grad.addColorStop(1, COLORS.lavaDeep);
  ctx.save();
  ctx.beginPath();
  ctx.rect(a, top, w, L.FALL_DEPTH);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(a, top, w, L.FALL_DEPTH);

  // Drifting hot blobs.
  ctx.fillStyle = 'rgba(255, 210, 60, 0.55)';
  for (let i = 0; i < Math.max(2, Math.floor(w / 40)); i++) {
    const bx = a + mod(i * 53 + t * (14 + (i % 3) * 6), w);
    const by = top + 14 + ((i * 17) % 28) + Math.sin(t * 1.5 + i) * 4;
    ctx.beginPath();
    ctx.ellipse(bx, by, 9 + (i % 3) * 3, 4 + (i % 2) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bubbles rising and popping at the surface.
  ctx.fillStyle = COLORS.lavaTop;
  for (let i = 0; i < Math.max(2, Math.floor(w / 50)); i++) {
    const phase = mod(t * 0.6 + i * 0.37, 1);
    const bx = a + 10 + mod(i * 71, Math.max(1, w - 20));
    const by = top + L.FALL_DEPTH - phase * (L.FALL_DEPTH + 2);
    ctx.beginPath();
    ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  // Wavy bright surface.
  ctx.beginPath();
  ctx.moveTo(a, top);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(a + x, top + 3 + Math.sin(x * 0.18 + t * 4) * 2);
  ctx.lineTo(b, top);
  ctx.closePath();
  ctx.fillStyle = COLORS.lavaTop;
  ctx.fill();
  ctx.restore();
}

function drawGround() {
  // Ground line in segments, with a gap (and a darker pit) wherever there is a hole.
  const holes = state.pits.map((p) => [p.x, p.x + p.w]).sort((a, b) => a[0] - b[0]);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, L.GROUND_Y + 1, L.W, L.H - L.GROUND_Y - 1);
  for (const [a, b] of holes) drawLava(a, b);

  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let x = 0;
  for (const [a, b] of holes) {
    if (a > x) {
      ctx.moveTo(x, L.GROUND_Y + 1);
      ctx.lineTo(Math.min(a, L.W), L.GROUND_Y + 1);
    }
    ctx.moveTo(a, L.GROUND_Y + 1);
    ctx.lineTo(a, L.GROUND_Y + L.FALL_DEPTH);
    ctx.moveTo(b, L.GROUND_Y + 1);
    ctx.lineTo(b, L.GROUND_Y + L.FALL_DEPTH);
    x = Math.max(x, b);
  }
  if (x < L.W) {
    ctx.moveTo(x, L.GROUND_Y + 1);
    ctx.lineTo(L.W, L.GROUND_Y + 1);
  }
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  for (let i = 0; i < 36; i++) {
    const sx = mod(i * 83 - state.distance, L.W + 20) - 10;
    if (holes.some(([a, b]) => sx + 6 > a && sx < b)) continue;
    const y = L.GROUND_Y + 10 + ((i * 37) % 28);
    ctx.fillRect(sx, y, 2 + (i % 3) * 2, 2);
  }
}

function drawPlatform(p) {
  const y = L.GROUND_Y - p.h;
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.roundRect(p.x, y, p.w, 8, 3);
  ctx.fill();
  ctx.fillStyle = COLORS.shine;
  ctx.fillRect(p.x + 4, y + 5, p.w - 8, 1.5);
}

// The face slot. Draws the friend's photo clipped to a circle once FACE_SRC is set and loaded,
// otherwise a placeholder smiley.
function drawFace(cx, cy, r, dead) {
  if (faceImg && faceImg.complete && faceImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(faceImg, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = COLORS.skin;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = COLORS.ink;
  const ex = r * 0.38;
  const ey = cy - r * 0.15;
  if (dead) {
    ctx.lineWidth = 1.6;
    for (const sx of [-ex, ex]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx - 2.5, ey - 2.5);
      ctx.lineTo(cx + sx + 2.5, ey + 2.5);
      ctx.moveTo(cx + sx + 2.5, ey - 2.5);
      ctx.lineTo(cx + sx - 2.5, ey + 2.5);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.45, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx - ex, ey, 1.8, 0, Math.PI * 2);
    ctx.arc(cx + ex, ey, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.1, r * 0.5, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
}

function drawPlayer() {
  const x = L.PLAYER.x;
  const top = L.GROUND_Y - state.y - L.PLAYER.h;
  const dead = state.phase === 'gameover';
  const running = state.phase === 'running' && state.onGround;
  const frame = running ? Math.floor(state.distance / 25) % 2 : 0;

  // legs
  ctx.strokeStyle = COLORS.legs;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const hipY = top + 48;
  const footY = top + L.PLAYER.h - 3;
  let left;
  let right;
  if (!running) {
    left = [x + 12, footY];
    right = [x + 28, footY - (state.onGround ? 0 : 6)];
  } else if (frame === 0) {
    left = [x + 14, footY];
    right = [x + 30, footY - 7];
  } else {
    left = [x + 10, footY - 7];
    right = [x + 26, footY];
  }
  ctx.beginPath();
  ctx.moveTo(x + 14, hipY);
  ctx.lineTo(left[0], left[1]);
  ctx.moveTo(x + 26, hipY);
  ctx.lineTo(right[0], right[1]);
  ctx.stroke();

  // arms
  ctx.strokeStyle = COLORS.shirt;
  ctx.lineWidth = 5;
  const armSwing = !state.onGround ? -8 : frame === 0 ? 6 : -6;
  ctx.beginPath();
  ctx.moveTo(x + 9, top + 32);
  ctx.lineTo(x + 3, top + 42 + armSwing);
  ctx.moveTo(x + 31, top + 32);
  ctx.lineTo(x + 37, top + 42 - armSwing);
  ctx.stroke();

  // torso
  ctx.fillStyle = COLORS.shirt;
  ctx.beginPath();
  ctx.roundRect(x + 8, top + 28, 24, 22, 5);
  ctx.fill();

  drawFace(x + 20, top + 14, 14, dead);
  ctx.lineCap = 'butt';
}

// Glass shards flying off a bottle that was hit.
let shards = [];

function shatter(o) {
  const y = L.GROUND_Y - o.h;
  for (let i = 0; i < 16; i++) {
    shards.push({
      x: o.x + Math.random() * o.w,
      y: y + Math.random() * o.h,
      vx: (Math.random() - 0.6) * 320,
      vy: -120 - Math.random() * 260,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 16,
      size: 3 + Math.random() * 5,
      life: 0.7 + Math.random() * 0.4,
      age: 0,
      light: i % 3 === 0,
    });
  }
}

function updateShards(dt) {
  for (const p of shards) {
    p.age += dt;
    p.vy += 900 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.y > L.GROUND_Y - 1 && p.vy > 0) {
      p.y = L.GROUND_Y - 1;
      p.vy *= -0.35;
      p.vx *= 0.6;
    }
  }
  shards = shards.filter((p) => p.age < p.life);
}

function drawShards() {
  for (const p of shards) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.light ? COLORS.label : COLORS.glass;
    ctx.beginPath();
    ctx.moveTo(-p.size, p.size * 0.6);
    ctx.lineTo(p.size, 0);
    ctx.lineTo(-p.size * 0.3, -p.size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawBottle(o) {
  const x = o.x;
  const y = L.GROUND_Y - o.h;
  const { w, h } = o;
  const nl = x + w * 0.34;
  const nr = x + w * 0.66;

  ctx.fillStyle = COLORS.glass;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h * 0.5);
  ctx.quadraticCurveTo(x, y + h * 0.3, nl, y + h * 0.28);
  ctx.lineTo(nl, y + h * 0.08);
  ctx.lineTo(nr, y + h * 0.08);
  ctx.lineTo(nr, y + h * 0.28);
  ctx.quadraticCurveTo(x + w, y + h * 0.3, x + w, y + h * 0.5);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COLORS.cap;
  ctx.fillRect(nl - 1, y, nr - nl + 2, h * 0.09);

  ctx.fillStyle = COLORS.label;
  ctx.fillRect(x, y + h * 0.6, w, h * 0.2);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(x + w * 0.18, y + h * 0.42, 2, h * 0.5);
}

function drawCat(c) {
  const x = c.x;
  const y = L.GROUND_Y - c.bottom - L.CAT.h;
  ctx.fillStyle = COLORS.cat;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); // body
  ctx.ellipse(x + 15, y + 17, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath(); // head with ears
  ctx.moveTo(x + 22, y + 12);
  ctx.lineTo(x + 23, y + 2);
  ctx.lineTo(x + 28, y + 7);
  ctx.lineTo(x + 32, y + 2);
  ctx.lineTo(x + 34, y + 12);
  ctx.quadraticCurveTo(x + 34, y + 20, x + 28, y + 20);
  ctx.quadraticCurveTo(x + 22, y + 20, x + 22, y + 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x + 25, y + 11, 2, 2);
  ctx.fillRect(x + 30, y + 11, 2, 2);
  ctx.strokeStyle = COLORS.catDark; // tail
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 17);
  ctx.quadraticCurveTo(x - 4, y + 12, x + 1, y + 6);
  ctx.stroke();
}

const pad = (n) => String(n).padStart(5, '0');

// Hearts and score live in an HTML bar above the canvas; only touch the DOM when the text changes.
const heartEls = [...document.querySelectorAll('#hearts .heart')];
const scoreEl = document.getElementById('score');
let shownLives = -1;
let shownScore = '';

function updateHud() {
  if (state.lives !== shownLives) {
    shownLives = state.lives;
    heartEls.forEach((el, i) => el.classList.toggle('lost', i >= state.lives));
  }
  const text = `HI ${pad(hi)}  ${pad(L.getScore(state))}`;
  if (text !== shownScore) {
    shownScore = text;
    scoreEl.textContent = text;
  }
}

function drawMessage(title, subtitle) {
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.ink;
  ctx.font = 'bold 28px "Courier New", monospace';
  ctx.fillText(title, L.W / 2, 120);
  ctx.font = '16px "Courier New", monospace';
  ctx.fillText(subtitle, L.W / 2, 148);
}

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const START_HINT = isMobile ? 'tap the screen to start and jump' : 'press SPACE or click to start and jump';
const RESTART_HINT = isMobile ? 'tap to restart' : 'press SPACE or click to restart';

function draw() {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, L.W, L.H);
  drawClouds();
  drawGround();
  for (const p of state.platforms) drawPlatform(p);
  for (const o of state.obstacles) drawBottle(o);
  for (const c of state.cats) drawCat(c);
  drawPlayer();
  drawShards();
  if (state.phase === 'ready') drawMessage('RUNNING PAULI', START_HINT);
  if (state.phase === 'gameover') drawMessage('GAME OVER', RESTART_HINT);
}

// ---- loop ----

let last = null;
let prevPhase = state.phase;

function frame(ts) {
  const bottlesBefore = state.obstacles;
  const dt = last === null ? 0 : (ts - last) / 1000;
  if (last !== null) L.step(state, dt);
  last = ts;

  // A bottle that vanished while still on screen was hit (off-screen ones are dropped further left).
  for (const o of bottlesBefore) {
    if (!state.obstacles.includes(o) && o.x > 0) shatter(o);
  }
  updateShards(dt);

  if (prevPhase !== 'gameover' && state.phase === 'gameover') {
    const score = L.getScore(state);
    if (score > hi) {
      hi = score;
      saveHi(hi);
    }
  }
  prevPhase = state.phase;

  draw();
  updateHud();
  requestAnimationFrame(frame);
}

// ---- input ----

window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  L.tap(state);
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    L.tap(state);
  }
});

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('resize', resize);
// rAF is paused while the tab is hidden; drop the stale timestamp so the first frame back has no huge dt.
document.addEventListener('visibilitychange', () => {
  last = null;
});

resize();
requestAnimationFrame(frame);
