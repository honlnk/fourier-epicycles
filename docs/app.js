'use strict';

/* ==================== 数学部分 ==================== */

const TAU = Math.PI * 2;
const N = 1024;           // 重采样点数（2 的幂，供 FFT 使用）
const PERIOD = 16;        // 1× 速度下一圈耗时（秒）
const TRAIL_STEPS = 720;  // 每圈轨迹的采样点数

/** 原地基-2 FFT（Cooley–Tukey），re/im 为等长 Float64Array */
function fft(re, im) {
  const n = re.length;
  // 位反转置换
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j |= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  // 蝶形运算
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < half; j++) {
        const i0 = i + j, i1 = i0 + half;
        const uRe = re[i0], uIm = im[i0];
        const vRe = re[i1] * curRe - im[i1] * curIm;
        const vIm = re[i1] * curIm + im[i1] * curRe;
        re[i0] = uRe + vRe; im[i0] = uIm + vIm;
        re[i1] = uRe - vRe; im[i1] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

/** 把任意折线沿弧长均匀重采样为 n 个点 */
function resample(points, n) {
  const d = [0];
  for (let i = 1; i < points.length; i++) {
    d.push(d[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = d[d.length - 1];
  const out = [];
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const target = total * i / n;
    while (seg < points.length - 1 && d[seg] < target) seg++;
    const len = d[seg] - d[seg - 1];
    const t = len > 0 ? (target - d[seg - 1]) / len : 0;
    const a = points[seg - 1], b = points[seg];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/**
 * 闭合路径 → 傅里叶系数，按幅度降序。
 * 屏幕 y 轴向下，转复平面时取 im = -y，保证画出来的图形与原图方向一致。
 */
function computeCoeffs(samples) {
  // 质心平移到原点，让直流分量≈0（圆圈链从画布中心起笔）
  let mx = 0, my = 0;
  for (const p of samples) { mx += p.x; my += p.y; }
  mx /= samples.length; my /= samples.length;

  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    re[i] = samples[i].x - mx;
    im[i] = -(samples[i].y - my);
  }
  fft(re, im);

  const coeffs = [];
  for (let k = 0; k < N; k++) {
    const amp = Math.hypot(re[k], im[k]) / N;
    if (amp < 1e-9) continue;
    coeffs.push({
      amp,
      freq: k <= N / 2 ? k : k - N,
      phase: Math.atan2(im[k], re[k]),
    });
  }
  coeffs.sort((a, b) => b.amp - a.amp);
  return coeffs;
}

/* ==================== 预设图形 ==================== */

function presetStar() {
  const pts = [];
  const verts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? 1 : 0.382;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  for (let i = 0; i < 10; i++) {
    const a = verts[i], b = verts[(i + 1) % 10];
    for (let t = 0; t < 1; t += 0.02) {
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return pts;
}

function presetHeart() {
  const pts = [];
  for (let t = 0; t < TAU; t += 0.01) {
    pts.push({
      x: 16 * Math.pow(Math.sin(t), 3),
      y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    });
  }
  return pts;
}

function presetInfinity() {
  // 伯努利双纽线
  const pts = [];
  for (let t = 0; t < TAU; t += 0.005) {
    const den = 1 + Math.sin(t) * Math.sin(t);
    pts.push({
      x: Math.SQRT2 * Math.cos(t) / den,
      y: Math.SQRT2 * Math.sin(t) * Math.cos(t) / den,
    });
  }
  return pts;
}

/* ==================== DOM 与画布 ==================== */

const $ = id => document.getElementById(id);
const drawCanvas = $('canvas-draw'), epiCanvas = $('canvas-epi');
const drawCtx = drawCanvas.getContext('2d'), epiCtx = epiCanvas.getContext('2d');
const hint = $('draw-hint');
const statsEl = $('stats');
const rangeCircles = $('range-circles'), rangeSpeed = $('range-speed');
const labelCircles = $('label-circles'), labelSpeed = $('label-speed');
const btnToggle = $('btn-toggle');

function setupCanvas(canvas, ctx, onResize) {
  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (onResize) onResize();
  };
  resize();
  new ResizeObserver(resize).observe(canvas.parentElement);
}

/* ==================== 状态 ==================== */

const state = {
  samples: null,        // 重采样后的原路径（屏幕坐标）
  centroid: { x: 0, y: 0 },
  coeffs: [],           // 傅里叶系数（幅度降序）
  angle: 0,             // 当前相位 ∈ [0, TAU)
  trail: [],            // 笔尖轨迹（复平面坐标）
  playing: false,
  drawing: false,
  rawPoints: [],
  speed: 1,
  count: 120,
  showGhost: true,
  showCircles: true,
};

const effK = () => Math.min(state.count, state.coeffs.length);

/** 前 k 个圆之和的端点位置（复平面坐标） */
function tipAt(angle) {
  let re = 0, im = 0;
  const k = effK();
  for (let i = 0; i < k; i++) {
    const c = state.coeffs[i];
    const a = c.freq * angle + c.phase;
    re += c.amp * Math.cos(a);
    im += c.amp * Math.sin(a);
  }
  return { re, im };
}

/** 计算把 samples 铺满 (w,h) 的变换 */
function fitTransform(samples, w, h, pad) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of samples) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const dw = Math.max(maxX - minX, 1e-6);
  const dh = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((w - 2 * pad) / dw, (h - 2 * pad) / dh);
  return {
    scale,
    ox: (w - (minX + maxX) * scale) / 2,
    oy: (h - (minY + maxY) * scale) / 2,
  };
}

/* ==================== 路径设置与清空 ==================== */

function setPath(raw) {
  const samples = resample(raw, N);
  let mx = 0, my = 0;
  for (const p of samples) { mx += p.x; my += p.y; }
  state.samples = samples;
  state.centroid = { x: mx / samples.length, y: my / samples.length };
  state.coeffs = computeCoeffs(samples);
  state.angle = 0;
  state.trail = [tipAt(0)];
  state.playing = true;
  state.drawing = false;
  hint.classList.add('hidden');
  redrawDrawCanvas();
  updateStats();
  syncToggleLabel();
}

function clearAll() {
  state.samples = null;
  state.coeffs = [];
  state.trail = [];
  state.angle = 0;
  state.playing = false;
  state.drawing = false;
  state.rawPoints = [];
  hint.classList.remove('hidden');
  drawCtx.clearRect(0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
  updateStats();
  syncToggleLabel();
}

/* ==================== 左侧画板 ==================== */

function redrawDrawCanvas() {
  const w = drawCanvas.clientWidth, h = drawCanvas.clientHeight;
  drawCtx.clearRect(0, 0, w, h);
  if (!state.samples || state.drawing) return;
  const tf = fitTransform(state.samples, w, h, 30);
  drawCtx.beginPath();
  state.samples.forEach((p, i) => {
    const x = tf.ox + p.x * tf.scale, y = tf.oy + p.y * tf.scale;
    i ? drawCtx.lineTo(x, y) : drawCtx.moveTo(x, y);
  });
  drawCtx.closePath();
  drawCtx.strokeStyle = 'rgba(34, 211, 238, .85)';
  drawCtx.lineWidth = 2.5;
  drawCtx.lineJoin = 'round';
  drawCtx.lineCap = 'round';
  drawCtx.stroke();
}

function canvasPoint(e) {
  const r = drawCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function strokeSegment(a, b) {
  drawCtx.strokeStyle = 'rgba(34, 211, 238, .9)';
  drawCtx.lineWidth = 2.5;
  drawCtx.lineCap = 'round';
  drawCtx.beginPath();
  drawCtx.moveTo(a.x, a.y);
  drawCtx.lineTo(b.x, b.y);
  drawCtx.stroke();
}

drawCanvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  try { drawCanvas.setPointerCapture(e.pointerId); } catch (_) {}
  state.drawing = true;
  state.rawPoints = [canvasPoint(e)];
  state.samples = null;
  state.coeffs = [];
  state.trail = [];
  state.playing = false;
  drawCtx.clearRect(0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
  hint.classList.add('hidden');
  e.preventDefault();
});

drawCanvas.addEventListener('pointermove', e => {
  if (!state.drawing) return;
  const p = canvasPoint(e);
  const prev = state.rawPoints[state.rawPoints.length - 1];
  if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) return;
  state.rawPoints.push(p);
  strokeSegment(prev, p);
});

function endDraw() {
  if (!state.drawing) return;
  state.drawing = false;
  if (state.rawPoints.length >= 8) {
    setPath(state.rawPoints);
  } else {
    clearAll();
  }
}
drawCanvas.addEventListener('pointerup', endDraw);
drawCanvas.addEventListener('pointercancel', endDraw);

/* ==================== 右侧圆圈机器 ==================== */

function renderEpicycles() {
  const w = epiCanvas.clientWidth, h = epiCanvas.clientHeight;
  epiCtx.clearRect(0, 0, w, h);
  if (!state.samples || !state.coeffs.length) return;

  const tf = fitTransform(state.samples, w, h, 42);
  // 复平面原点（质心）对应的屏幕位置
  const cx = tf.ox + state.centroid.x * tf.scale;
  const cy = tf.oy + state.centroid.y * tf.scale;
  const toScreen = p => ({ x: cx + p.re * tf.scale, y: cy - p.im * tf.scale });

  // 原笔迹（灰色幽灵）
  if (state.showGhost) {
    epiCtx.beginPath();
    state.samples.forEach((p, i) => {
      const x = tf.ox + p.x * tf.scale, y = tf.oy + p.y * tf.scale;
      i ? epiCtx.lineTo(x, y) : epiCtx.moveTo(x, y);
    });
    epiCtx.closePath();
    epiCtx.strokeStyle = 'rgba(139, 150, 168, .35)';
    epiCtx.lineWidth = 1.5;
    epiCtx.stroke();
  }

  // 笔尖轨迹（青 → 紫）
  const tr = state.trail;
  if (tr.length > 1) {
    epiCtx.lineWidth = 2.2;
    epiCtx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const a = toScreen(tr[i - 1]), b = toScreen(tr[i]);
      epiCtx.strokeStyle = `hsla(${190 + 120 * i / TRAIL_STEPS}, 90%, 66%, .95)`;
      epiCtx.beginPath();
      epiCtx.moveTo(a.x, a.y);
      epiCtx.lineTo(b.x, b.y);
      epiCtx.stroke();
    }
  }

  // 圆圈链：每个系数一个圆，首尾相接
  let p = { re: 0, im: 0 };
  if (state.showCircles) {
    const k = effK();
    epiCtx.lineWidth = 1;
    for (let i = 0; i < k; i++) {
      const c = state.coeffs[i];
      const a = c.freq * state.angle + c.phase;
      const q = { re: p.re + c.amp * Math.cos(a), im: p.im + c.amp * Math.sin(a) };
      const sp = toScreen(p), sq = toScreen(q);
      epiCtx.strokeStyle = i === 0 ? 'rgba(34, 211, 238, .35)' : 'rgba(34, 211, 238, .18)';
      epiCtx.beginPath();
      epiCtx.arc(sp.x, sp.y, c.amp * tf.scale, 0, TAU);
      epiCtx.stroke();
      epiCtx.strokeStyle = 'rgba(221, 229, 242, .5)';
      epiCtx.beginPath();
      epiCtx.moveTo(sp.x, sp.y);
      epiCtx.lineTo(sq.x, sq.y);
      epiCtx.stroke();
      p = q;
    }
  } else {
    p = tipAt(state.angle);
  }

  // 笔尖亮点
  const s = toScreen(p);
  epiCtx.fillStyle = '#e879f9';
  epiCtx.beginPath();
  epiCtx.arc(s.x, s.y, 4, 0, TAU);
  epiCtx.fill();
  epiCtx.strokeStyle = 'rgba(232, 121, 249, .4)';
  epiCtx.beginPath();
  epiCtx.arc(s.x, s.y, 8, 0, TAU);
  epiCtx.stroke();
}

/** 推进相位并记录轨迹（固定角度步长，轨迹密度与帧率/速度无关） */
function advance(dt) {
  if (!state.coeffs.length) return;
  const step = TAU / TRAIL_STEPS;
  let target = state.angle + TAU * dt * state.speed / PERIOD;
  while (state.angle < target) {
    if (state.angle >= TAU - 1e-9) {
      // 画满一圈，从头再描
      state.angle -= TAU;
      target -= TAU;
      state.trail = [tipAt(state.angle)];
      continue;
    }
    const next = Math.min(state.angle + step, target, TAU);
    state.trail.push(tipAt(next));
    state.angle = next;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state.playing) advance(dt);
  renderEpicycles();
  requestAnimationFrame(frame);
}

/* ==================== 控件 ==================== */

$('btn-star').addEventListener('click', () => setPath(presetStar()));
$('btn-heart').addEventListener('click', () => setPath(presetHeart()));
$('btn-infinity').addEventListener('click', () => setPath(presetInfinity()));

rangeCircles.addEventListener('input', () => {
  state.count = +rangeCircles.value;
  labelCircles.textContent = state.count;
  state.trail = [];
  updateStats();
});

rangeSpeed.addEventListener('input', () => {
  state.speed = +rangeSpeed.value;
  labelSpeed.textContent = String(+(state.speed.toFixed(2))) + '×';
});

$('chk-ghost').addEventListener('change', e => { state.showGhost = e.target.checked; });
$('chk-circles').addEventListener('change', e => { state.showCircles = e.target.checked; });

function syncToggleLabel() {
  btnToggle.textContent = state.playing ? '暂停' : '播放';
}
btnToggle.addEventListener('click', () => {
  if (!state.samples) return;
  state.playing = !state.playing;
  syncToggleLabel();
});

$('btn-clear').addEventListener('click', clearAll);

function updateStats() {
  statsEl.textContent = state.coeffs.length
    ? `${effK()} / ${state.coeffs.length} 个分量`
    : '';
}

/* ==================== 启动 ==================== */

setupCanvas(drawCanvas, drawCtx, redrawDrawCanvas);
setupCanvas(epiCanvas, epiCtx);
setPath(presetStar());
requestAnimationFrame(t => { last = t; frame(t); });
