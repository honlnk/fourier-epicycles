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
  // 经典心形曲线（取负让心尖朝下，符合屏幕 y 轴向下）
  const pts = [];
  for (let t = 0; t < TAU; t += 0.01) {
    pts.push({
      x: 16 * Math.pow(Math.sin(t), 3),
      y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
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

/* ==================== honlnk 花体签名预设 ==================== */

// "honlnk" 签名轮廓路径（Great Vibes 字体，SIL OFL 1.1，
// 由 tools/font2path/gen.js 从字体轮廓生成 SVG 路径数据）
const SIGNATURE_PATH_D = 'M-3.8 0.8L-3.8 0.8Q0.4 -7.8 5 -17.2Q9.5 -26.7 14.3 -36.3Q19.1 -45.9 23.8 -54.6L23.8 -54.6Q25.5 -57.6 27 -59.3Q28.4 -61 30.8 -61L30.8 -61Q31.7 -61 32.9 -60.7Q34.1 -60.4 35.2 -60.6L35.2 -60.6Q33.9 -59.2 31.7 -55.7Q29.4 -52.2 26.7 -47.3Q23.9 -42.4 20.9 -36.7Q17.8 -31.1 14.9 -25.3Q11.9 -19.6 9.4 -14.6L9.4 -14.6Q11.4 -17.2 13.5 -19.5Q15.6 -21.8 17.6 -23.5L17.6 -23.5Q19.8 -25.5 23.2 -27.7Q26.5 -29.9 29.9 -31.5Q33.2 -33.1 35.2 -33.1L35.2 -33.1Q35.9 -33.1 36.2 -33L36.2 -33Q36.2 -33 35.1 -31Q34 -29 32.4 -25.9Q30.7 -22.8 29 -19.2Q27.2 -15.6 25.9 -12.4Q24.6 -9.1 24.2 -7L24.2 -7Q23.9 -5.4 23.9 -4.3L23.9 -4.3Q23.9 -2.7 24.5 -2.1Q25.1 -1.6 25.8 -1.6L25.8 -1.6Q27.5 -1.6 29.5 -3.3Q31.4 -5.1 33.3 -7.8Q35.2 -10.5 36.9 -13.5Q38.5 -16.6 39.5 -19.3L39.5 -19.3Q40.7 -19.3 40.7 -18.4L40.7 -18.4Q39.6 -15.7 38 -12.5Q36.3 -9.2 34.2 -6.3Q32.1 -3.4 29.6 -1.5Q27.1 0.4 24.3 0.4L24.3 0.4Q22.3 0.4 20.2 -1Q18.1 -2.4 18.1 -6.1L18.1 -6.1Q18.1 -7.2 18.3 -8.5Q18.5 -9.7 19 -11.3L19 -11.3Q19.6 -13.3 21 -15.7Q22.4 -18.2 24.6 -21.9L24.6 -21.9Q25.6 -23.6 25.6 -24.6L25.6 -24.6Q25.6 -25.8 24.4 -25.8L24.4 -25.8Q23.4 -25.8 21.7 -24.8Q20 -23.8 17.4 -21.3L17.4 -21.3Q14.9 -18.9 11.2 -14.3Q7.5 -9.7 3.3 -1.4L3.3 -1.4Q2.6 -0.1 1.8 0Q0.9 0 -0.5 0.1L-0.5 0.1Q-1.4 0.2 -2.3 0.3Q-3.2 0.3 -3.8 0.8M45.5 0L45.5 0Q41.4 0 39.5 -2.9Q37.5 -5.9 37.5 -10.1L37.5 -10.1Q37.5 -14 39 -18.2L39 -18.2Q40.6 -22.8 43.5 -26.6Q46.3 -30.4 49.8 -32.7Q53.2 -35.1 56.6 -35.1L56.6 -35.1Q60.7 -35.1 62.7 -32.3Q64.6 -29.5 64.6 -25.2L64.6 -25.2Q64.6 -22.2 63.6 -18.9Q62.6 -15.6 60.9 -12.4L60.9 -12.4Q62.2 -11.1 64.6 -11.1L64.6 -11.1Q67.4 -11.1 69.4 -12.9Q71.4 -14.7 73.3 -19.3L73.3 -19.3Q74.5 -19.3 74.5 -18.4L74.5 -18.4Q72.6 -13.8 70.2 -11.6Q67.7 -9.5 63.9 -9.6L63.9 -9.6Q61.6 -9.6 60.1 -10.9L60.1 -10.9Q57.3 -6.3 53.5 -3.2Q49.6 0 45.5 0M46.9 -2.2L46.9 -2.2Q49.2 -2.2 51.5 -4.1Q53.8 -6.1 55.7 -8.6Q57.6 -11.1 58.4 -12.9L58.4 -12.9Q56.8 -15.8 56.6 -17.2Q56.3 -18.7 56.3 -19.4L56.3 -19.4Q56.3 -21.3 57.3 -22.3Q58.3 -23.3 59.3 -23.3L59.3 -23.3Q60.7 -23.3 61.7 -22.1L61.7 -22.1Q61.9 -23.2 62 -24.2Q62.1 -25.1 62.1 -26L62.1 -26Q62.1 -28.6 61.2 -30.2Q60.2 -31.9 58.2 -31.9L58.2 -31.9Q56.1 -31.9 53.8 -30.1Q51.5 -28.3 49.5 -25.3Q47.4 -22.3 45.9 -18.6L45.9 -18.6Q44.6 -15.5 43.9 -12.7Q43.2 -10 43.2 -7.7L43.2 -7.7Q43.2 -5.2 44.1 -3.7Q45 -2.2 46.9 -2.2M63.7 0.8L63.7 0.8Q67.3 -6.5 70.6 -13.6Q73.9 -20.8 77.4 -27.3L77.4 -27.3Q79.4 -30.9 80.8 -32.3Q82.2 -33.8 84.5 -33.8L84.5 -33.8Q85.3 -33.8 86.2 -33.6Q87.1 -33.3 88 -33.3L88 -33.3Q88.6 -33.3 88.9 -33.4L88.9 -33.4Q87.5 -32.6 85.3 -29.4Q83 -26.3 80.7 -22.2Q78.4 -18.1 76.6 -14.5L76.6 -14.5Q78.5 -16.8 80.6 -19.1Q82.7 -21.4 85.2 -23.5L85.2 -23.5Q87.6 -25.6 91 -27.8Q94.3 -30.1 97.5 -31.6Q100.7 -33.1 102.6 -33.1L102.6 -33.1Q103.3 -33.1 103.6 -33L103.6 -33Q103.6 -33 102.5 -31Q101.4 -29.1 99.8 -25.9Q98.1 -22.8 96.4 -19.2Q94.7 -15.7 93.4 -12.5Q92 -9.2 91.6 -7L91.6 -7Q91.3 -5.7 91.3 -4.6L91.3 -4.6Q91.3 -3 91.9 -2.5Q92.5 -2 93.2 -2L93.2 -2Q95.1 -2 97.1 -3.7Q99.1 -5.4 101 -8Q102.8 -10.7 104.4 -13.7Q106 -16.7 107.1 -19.3L107.1 -19.3Q108.3 -19.3 108.3 -18.4L108.3 -18.4Q107.2 -15.7 105.6 -12.5Q103.9 -9.2 101.9 -6.3Q99.8 -3.4 97.3 -1.5Q94.8 0.4 91.9 0.4L91.9 0.4Q89.9 0.4 87.8 -1Q85.6 -2.4 85.6 -6.2L85.6 -6.2Q85.6 -7.3 85.8 -8.5Q86 -9.8 86.5 -11.3L86.5 -11.3Q87.3 -13.3 88.4 -15.6Q89.5 -17.9 92 -21.9L92 -21.9Q92.7 -23 92.9 -23.6Q93 -24.2 93 -24.6L93 -24.6Q93 -25.8 91.9 -25.8L91.9 -25.8Q91 -25.8 89.3 -24.8Q87.5 -23.8 84.9 -21.3L84.9 -21.3Q82.4 -18.9 79 -14.5Q75.5 -10.1 71 -1.5L71 -1.5Q70.3 -0.2 69.5 -0.1Q68.6 0 67.1 0.1L67.1 0.1Q66.1 0.2 65.2 0.3Q64.3 0.3 63.7 0.8M111.8 0.3L111.8 0.3Q108.1 0.3 106.4 -1.9Q104.6 -4.2 104.6 -7.3L104.6 -7.3Q104.6 -10.5 105.5 -13.9Q106.4 -17.3 107.1 -19.6L107.1 -19.6Q108.7 -25.2 111.2 -31.5Q113.6 -37.9 116.6 -44.1Q119.5 -50.2 122.4 -55.1L122.4 -55.1Q124.7 -59 127.4 -60.9Q130 -62.9 132 -62.9L132 -62.9Q133.6 -62.9 134.6 -61.7Q135.5 -60.6 135.5 -58.3L135.5 -58.3Q135.5 -56.7 135 -54.5Q134.4 -52.3 133.1 -49.5L133.1 -49.5Q129.6 -41.7 124.8 -33.9Q119.9 -26.1 112.5 -19.3L112.5 -19.3Q111.3 -16.5 110.5 -13.3Q109.7 -10.1 109.7 -8.1L109.7 -8.1Q109.7 -1.9 113.9 -1.9L113.9 -1.9Q117.1 -1.9 121 -6.5Q124.9 -11.2 128.4 -19.3L128.4 -19.3Q128.8 -19.3 129.2 -19.2Q129.6 -19 129.6 -18.4L129.6 -18.4Q128.5 -15.7 126.9 -12.5Q125.2 -9.2 123.1 -6.3Q120.9 -3.4 118.1 -1.5Q115.3 0.3 111.8 0.3M113.3 -22.5L113.3 -22.5Q116.9 -26.2 120.3 -31Q123.7 -35.9 126.7 -41.2Q129.6 -46.4 131.6 -51.1L131.6 -51.1Q132.3 -52.6 132.8 -54.4Q133.2 -56.2 133.2 -57.4L133.2 -57.4Q133.2 -58.8 132.5 -58.8L132.5 -58.8Q132.1 -58.8 131.3 -58Q130.5 -57.3 129.2 -55.5L129.2 -55.5Q127.3 -53 125.1 -48.7Q122.8 -44.4 120.5 -39.5Q118.2 -34.6 116.3 -30Q114.4 -25.5 113.3 -22.5M118.8 0.8L118.8 0.8Q122.4 -6.5 125.7 -13.6Q129 -20.8 132.5 -27.3L132.5 -27.3Q134.5 -30.9 135.9 -32.3Q137.3 -33.8 139.6 -33.8L139.6 -33.8Q140.4 -33.8 141.3 -33.6Q142.2 -33.3 143.1 -33.3L143.1 -33.3Q143.7 -33.3 144 -33.4L144 -33.4Q142.6 -32.6 140.4 -29.4Q138.1 -26.3 135.8 -22.2Q133.5 -18.1 131.7 -14.5L131.7 -14.5Q133.6 -16.8 135.7 -19.1Q137.8 -21.4 140.3 -23.5L140.3 -23.5Q142.7 -25.6 146.1 -27.8Q149.4 -30.1 152.6 -31.6Q155.8 -33.1 157.7 -33.1L157.7 -33.1Q158.4 -33.1 158.7 -33L158.7 -33Q158.7 -33 157.6 -31Q156.5 -29.1 154.9 -25.9Q153.2 -22.8 151.5 -19.2Q149.8 -15.7 148.5 -12.5Q147.1 -9.2 146.7 -7L146.7 -7Q146.4 -5.7 146.4 -4.6L146.4 -4.6Q146.4 -3 147 -2.5Q147.6 -2 148.3 -2L148.3 -2Q150.2 -2 152.2 -3.7Q154.2 -5.4 156.1 -8Q157.9 -10.7 159.5 -13.7Q161.1 -16.7 162.2 -19.3L162.2 -19.3Q163.4 -19.3 163.4 -18.4L163.4 -18.4Q162.3 -15.7 160.7 -12.5Q159 -9.2 157 -6.3Q154.9 -3.4 152.4 -1.5Q149.9 0.4 147 0.4L147 0.4Q145 0.4 142.9 -1Q140.7 -2.4 140.7 -6.2L140.7 -6.2Q140.7 -7.3 140.9 -8.5Q141.1 -9.8 141.6 -11.3L141.6 -11.3Q142.4 -13.3 143.5 -15.6Q144.6 -17.9 147.1 -21.9L147.1 -21.9Q147.8 -23 148 -23.6Q148.1 -24.2 148.1 -24.6L148.1 -24.6Q148.1 -25.8 147 -25.8L147 -25.8Q146.1 -25.8 144.4 -24.8Q142.6 -23.8 140 -21.3L140 -21.3Q137.5 -18.9 134.1 -14.5Q130.6 -10.1 126.1 -1.5L126.1 -1.5Q125.4 -0.2 124.6 -0.1Q123.7 0 122.2 0.1L122.2 0.1Q121.2 0.2 120.3 0.3Q119.4 0.3 118.8 0.8M179.6 0.7L179.6 0.7Q176.8 0.4 175 -1.5Q173.2 -3.3 172.4 -5.8Q171.6 -8.3 171.6 -10.4L171.6 -10.4Q171.6 -14.4 173.4 -16.8Q175.2 -19.3 176.7 -19.4L176.7 -19.4Q178.3 -19.3 180.6 -20.2Q182.9 -21 184.6 -22.5L184.6 -22.5Q187.5 -24.8 187.5 -27.2L187.5 -27.2Q187.5 -29.7 184.6 -29.7L184.6 -29.7Q183 -29.7 180.6 -28.6Q178.1 -27.5 174.9 -24.8L174.9 -24.8Q170.9 -21.4 166.6 -15.7L166.6 -15.7Q166 -14.4 165.2 -11.9Q164.4 -9.3 163.9 -6.6Q163.3 -3.9 163.3 -2L163.3 -2Q163.3 -0.5 163.8 0L163.8 0L157.5 0Q156.4 0 156.4 -0.9L156.4 -0.9Q156.4 -1.2 156.5 -1.4Q156.6 -1.6 156.7 -2.2L156.7 -2.2Q158.1 -7.4 160.1 -11.4Q162 -15.4 163.3 -18.4L163.3 -18.4Q162.4 -18.1 162.3 -18.5Q162.2 -19 162.2 -19.3L162.2 -19.3Q162.9 -20.9 164.6 -24.5Q166.2 -28 168.5 -32.6Q170.7 -37.3 173.3 -42.4Q175.9 -47.5 178.5 -52.2L178.5 -52.2Q181.1 -57 182.8 -59Q184.4 -61 186.8 -61L186.8 -61Q187.7 -61 189 -60.7Q190.2 -60.4 191.2 -60.6L191.2 -60.6Q189 -58.7 185.7 -53.6Q182.4 -48.6 178.7 -41.9Q175 -35.2 171.6 -28.2L171.6 -28.2Q170.6 -26.2 169.7 -24Q168.8 -21.8 168 -19.6L168 -19.6Q170.1 -22.2 172.8 -25Q175.5 -27.8 178.5 -30.1Q181.4 -32.5 184.3 -33.6L184.3 -33.6Q187.6 -34.8 189.8 -34.8L189.8 -34.8Q192.1 -34.8 193.2 -33.7Q194.2 -32.6 194.2 -30.9L194.2 -30.9Q194.2 -29 192.7 -26.3Q191.2 -23.7 188.6 -21.8L188.6 -21.8Q186.4 -20.3 184 -19.2Q181.6 -18.1 178.3 -17.8L178.3 -17.8Q177.7 -16.4 177.5 -14.9Q177.2 -13.5 177.2 -12.1L177.2 -12.1Q177.2 -8.2 179 -5.2Q180.8 -2.3 183.7 -2.3L183.7 -2.3Q185.1 -2.3 186.8 -3.1Q188.4 -3.9 190.2 -5.8L190.2 -5.8Q192.2 -7.8 194.2 -11.4Q196.2 -14.9 198.2 -19.3L198.2 -19.3Q199.4 -19.3 199.4 -18.4L199.4 -18.4Q195.8 -9.7 192.4 -5.5Q189 -1.3 185.9 -0.2Q182.7 1 179.6 0.7';

/** 解析 SVG 路径数据（M/L/Q/C/Z，绝对坐标）→ 密集采样的轮廓点集 */
function parsePathData(d) {
  const contours = [];
  let cur = null;
  const cmdRe = /([MLQCZ])([^MLQCZ]*)/g;
  const numRe = /-?\d*\.?\d+(?:e[-+]?\d+)?/g;
  let m;
  while ((m = cmdRe.exec(d))) {
    const nm = m[2].match(numRe);
    const nums = nm ? nm.map(Number) : [];
    if (m[1] === 'M') {
      cur = [{ x: nums[0], y: nums[1] }];
      contours.push(cur);
    } else if (m[1] === 'Z') {
      if (cur && cur.length) cur.push({ x: cur[0].x, y: cur[0].y });
    } else if (cur) {
      if (m[1] === 'L') {
        for (let i = 0; i + 1 < nums.length; i += 2) cur.push({ x: nums[i], y: nums[i + 1] });
      } else if (m[1] === 'Q') {
        for (let i = 0; i + 3 < nums.length; i += 4) {
          const p0 = cur[cur.length - 1];
          for (let s = 1; s <= 8; s++) {
            const t = s / 8, u = 1 - t;
            cur.push({
              x: u * u * p0.x + 2 * u * t * nums[i] + t * t * nums[i + 2],
              y: u * u * p0.y + 2 * u * t * nums[i + 1] + t * t * nums[i + 3],
            });
          }
        }
      } else if (m[1] === 'C') {
        for (let i = 0; i + 5 < nums.length; i += 6) {
          const p0 = cur[cur.length - 1];
          for (let s = 1; s <= 12; s++) {
            const t = s / 12, u = 1 - t;
            cur.push({
              x: u * u * u * p0.x + 3 * u * u * t * nums[i] + 3 * u * t * t * nums[i + 2] + t * t * t * nums[i + 4],
              y: u * u * u * p0.y + 3 * u * u * t * nums[i + 1] + 3 * u * t * t * nums[i + 3] + t * t * t * nums[i + 5],
            });
          }
        }
      }
    }
  }
  return contours;
}

function presetSignature() {
  const pts = [];
  for (const c of parsePathData(SIGNATURE_PATH_D)) pts.push(...c);
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
  count: 200,
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

$('btn-signature').addEventListener('click', () => setPath(presetSignature()));
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
setPath(presetSignature());
requestAnimationFrame(t => { last = t; frame(t); });
