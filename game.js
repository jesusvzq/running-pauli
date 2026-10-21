import * as L from './logic.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Set to the path of the friend's face image (e.g. 'assets/face.png') to replace the placeholder smiley.
const FACE_SRC = null;

const COLORS = {
  bg: '#f7f7f7',
  ink: '#535353',
  skin: '#f5c9a0',
  shirt: '#3b6fd8',
  legs: '#333333',
  glass: '#9a5a12',
  cap: '#e0b020',
  label: '#f3e3b0',
  cloud: '#e4e4e4',
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

function drawGround() {
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, L.GROUND_Y + 1);
  ctx.lineTo(L.W, L.GROUND_Y + 1);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  for (let i = 0; i < 36; i++) {
    const x = mod(i * 83 - state.distance, L.W + 20) - 10;
    const y = L.GROUND_Y + 10 + ((i * 37) % 28);
    ctx.fillRect(x, y, 2 + (i % 3) * 2, 2);
  }
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

const pad = (n) => String(n).padStart(5, '0');

function drawHud() {
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(`HI ${pad(hi)}  ${pad(L.getScore(state))}`, L.W - 16, 28);
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
  for (const o of state.obstacles) drawBottle(o);
  drawPlayer();
  drawHud();
  if (state.phase === 'ready') drawMessage('RUNNING PAULI', START_HINT);
  if (state.phase === 'gameover') drawMessage('GAME OVER', RESTART_HINT);
}

// ---- loop ----

let last = null;
let prevPhase = state.phase;

function frame(ts) {
  if (last !== null) L.step(state, (ts - last) / 1000);
  last = ts;

  if (prevPhase !== 'gameover' && state.phase === 'gameover') {
    const score = L.getScore(state);
    if (score > hi) {
      hi = score;
      saveHi(hi);
    }
  }
  prevPhase = state.phase;

  draw();
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
