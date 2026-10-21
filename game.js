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

// Golden halo and twinkling stars while Pauli shines; it blinks in the last 2 s of the flight.
function drawGlow(cx, cy) {
  const t = performance.now() / 1000;
  const r = 52 + Math.sin(t * 9) * 5;
  const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, r);
  g.addColorStop(0, 'rgba(255, 244, 150, 0.85)');
  g.addColorStop(0.5, 'rgba(255, 214, 60, 0.4)');
  g.addColorStop(1, 'rgba(255, 214, 60, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6b0';
  for (let i = 0; i < 6; i++) {
    const a = t * 2 + (i * Math.PI) / 3;
    const d = 34 + ((i * 7) % 3) * 6 + Math.sin(t * 5 + i) * 4;
    const sx = cx + Math.cos(a) * d;
    const sy = cy + Math.sin(a) * d;
    const sz = 3 + ((i + Math.floor(t * 6)) % 3);
    ctx.beginPath();
    ctx.moveTo(sx, sy - sz * 1.6);
    ctx.lineTo(sx + sz * 0.5, sy - sz * 0.5);
    ctx.lineTo(sx + sz * 1.6, sy);
    ctx.lineTo(sx + sz * 0.5, sy + sz * 0.5);
    ctx.lineTo(sx, sy + sz * 1.6);
    ctx.lineTo(sx - sz * 0.5, sy + sz * 0.5);
    ctx.lineTo(sx - sz * 1.6, sy);
    ctx.lineTo(sx - sz * 0.5, sy - sz * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPlayer() {
  const x = L.PLAYER.x;
  const top = L.GROUND_Y - state.y - L.PLAYER.h;
  if (state.glow) {
    drawGlow(x + L.PLAYER.w / 2, top + L.PLAYER.h / 2);
    if (state.flyLeft > 0 && state.flyLeft < 2 && Math.floor(performance.now() / 120) % 2) ctx.globalAlpha = 0.5;
  }
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
  ctx.globalAlpha = 1;
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

// ---- the Holiday club ----

const CLUB_PALETTE = {
  R: '#d9382b', Y: '#f0b92a', T: '#3aa89a', K: '#1a1a1a', P: '#f1a5a0', M: '#b7dccb', B: '#1d4aa0',
};
// Harlequin door: two rows of zigzag triangles (up-pointing, down-pointing), 'S' = black/white stripes.
const DOOR_ROWS = [
  { up: 'STRYS', down: 'MYKRYM' },
  { up: 'RPKYB', down: 'TSMPST' },
];

function stripeFill(x, y, w, h) {
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#111';
  for (let yy = y; yy < y + h; yy += 3.4) ctx.fillRect(x, yy, w, 1.7);
}

function drawDoor(x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const B = w / 5;
  const rh = h / DOOR_ROWS.length;
  DOOR_ROWS.forEach((row, r) => {
    const top = y + r * rh;
    const paint = (code, path) => {
      ctx.save();
      ctx.beginPath();
      path();
      ctx.clip();
      if (code === 'S') stripeFill(x, top, w, rh);
      else {
        ctx.fillStyle = CLUB_PALETTE[code];
        ctx.fillRect(x, top, w, rh);
      }
      ctx.restore();
    };
    for (let k = 0; k < row.up.length; k++) {
      const a = x + k * B;
      paint(row.up[k], () => {
        ctx.moveTo(a, top + rh);
        ctx.lineTo(a + B / 2, top);
        ctx.lineTo(a + B, top + rh);
      });
    }
    for (let k = 0; k < row.down.length; k++) {
      const a = x + (k - 0.5) * B;
      paint(row.down[k], () => {
        ctx.moveTo(a, top);
        ctx.lineTo(a + B, top);
        ctx.lineTo(a + B / 2, top + rh);
      });
    }
  });
  // Door leaf seams and handle.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(x + (w * i) / 4, y);
    ctx.lineTo(x + (w * i) / 4, y + h);
  }
  ctx.stroke();
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(x + (w * 3) / 4 + 6, y + h * 0.52, 8, 2.5);
  ctx.restore();
}

// "Holiday" in fat white 3D letters following the arch of the steel canopy.
function drawClubSign(x, w, top) {
  const letters = 'Holiday';
  const cx = x + w / 2;
  const arch = 16; // how much the sign rises in the middle
  const half = w / 2 - 22;
  ctx.save();
  ctx.font = '900 54px "Arial Black", "Helvetica Neue", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const widths = [...letters].map((ch) => ctx.measureText(ch).width * 0.92);
  const total = widths.reduce((a, b) => a + b, 0);
  let pen = cx - total / 2;
  [...letters].forEach((ch, i) => {
    const mid = pen + widths[i] / 2;
    pen += widths[i];
    const u = (mid - cx) / half;
    const base = top + 86 - arch * (1 - u * u);
    const angle = Math.atan(2 * arch * u / half);
    ctx.save();
    ctx.translate(mid, base);
    ctx.rotate(angle);
    // extrusion (grey body going down-right), then the white face
    ctx.fillStyle = '#8d949c';
    for (let d = 5; d >= 1; d--) ctx.fillText(ch, d * 0.8, d * 0.8);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#6f757c';
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = '#fbfbfb';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function drawClub(c) {
  const x = c.x;
  const w = c.w;
  const h = L.CLUB.h;
  const top = L.GROUND_Y - h;
  const pillar = 36;

  // brick wall of the building above the sign
  ctx.fillStyle = '#c79b75';
  ctx.fillRect(x, top, w, 112);
  ctx.strokeStyle = 'rgba(90, 50, 30, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 0; r < 112; r += 8) {
    ctx.moveTo(x, top + r);
    ctx.lineTo(x + w, top + r);
    for (let bx = (r / 8) % 2 ? 0 : 14; bx < w; bx += 28) {
      ctx.moveTo(x + bx, top + r);
      ctx.lineTo(x + bx, top + r + 8);
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#e8e2d4'; // balcony slab at the very top
  ctx.fillRect(x - 6, top - 6, w + 12, 10);

  // dark speckled granite facade
  ctx.fillStyle = '#262d3a';
  ctx.fillRect(x, top + 112, w, h - 112);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(160, 170, 190, 0.5)' : 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(x + ((i * 53) % w), top + 112 + ((i * 37) % (h - 112)), 1.6, 1.6);
  }
  ctx.fillStyle = '#d9d2c3'; // cream pilaster on the left
  ctx.fillRect(x, top + 112, 10, h - 112);

  drawDoor(x + pillar, top + 124, w - pillar * 2, h - 124 - 4);

  // vertical letters engraved on the right granite pillar, as in the photo
  ctx.fillStyle = '#b9c0cc';
  ctx.font = 'bold 13px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  [...'HOLIDAY'].forEach((ch, i) => ctx.fillText(ch, x + w - pillar / 2, top + 148 + i * 16));

  // curved stainless-steel canopy carrying the sign
  const g = ctx.createLinearGradient(0, top + 30, 0, top + 124);
  g.addColorStop(0, '#f3f5f7');
  g.addColorStop(0.5, '#aeb4ba');
  g.addColorStop(1, '#e4e7ea');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + 6, top + 118);
  ctx.quadraticCurveTo(x + 6, top + 46, x + w / 2, top + 40);
  ctx.quadraticCurveTo(x + w - 6, top + 46, x + w - 6, top + 118);
  ctx.quadraticCurveTo(x + w / 2, top + 108, x + 6, top + 118);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7b8189';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawClubSign(x, w, top);
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
  for (const c of state.clubs) drawClub(c); // in front of Pauli: she walks in behind it
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
