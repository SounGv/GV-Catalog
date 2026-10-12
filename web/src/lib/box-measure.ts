/**
 * Finds a product box lying on the blue cutting mat and measures it from the
 * mat's printed 10 mm grid. Pure functions on ImageData, safe for the browser.
 *
 * Rules the photo has to follow (shown to staff on screen):
 * - the camera looks straight down at the mat,
 * - the box is surrounded by mat on every side (it is found as a "hole" in the mat).
 */

export type Point = { x: number; y: number };

export type BoxDetection = {
  /** Corners in analysed-image pixels, clockwise from top-left. */
  corners: [Point, Point, Point, Point];
  /** Sides of the tightest rectangle around the box, in analysed-image pixels. */
  longPx: number;
  shortPx: number;
  /** Mat grid spacing (10 mm) in analysed-image pixels. */
  gridPx: number;
  /** Sides in cm, measured at mat level (not yet corrected for the box's own height). */
  longCm: number;
  shortCm: number;
};

export type DetectFailure = { reason: "no-mat" | "no-box" | "no-grid" };

/** Mat grid: printed lines every 10 mm. */
const GRID_MM = 10;

function isMatBlue(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 80 || max !== b) return false;
  const sat = (max - min) / max;
  if (sat < 0.24) return false;
  // hue between cyan and blue (≈180°–225°)
  const hue = g >= r ? 240 - (60 * (g - r)) / (max - min) : 240 + (60 * (r - g)) / (max - min);
  return hue >= 180 && hue <= 225;
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // separable max filter (square kernel)
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = src[y * w + k];
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

function invert(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] ? 0 : 1;
  return out;
}

const erode = (src: Uint8Array, w: number, h: number, r: number) => invert(dilate(invert(src), w, h, r));
const close = (src: Uint8Array, w: number, h: number, r: number) => erode(dilate(src, w, h, r), w, h, r);
const open = (src: Uint8Array, w: number, h: number, r: number) => dilate(erode(src, w, h, r), w, h, r);

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}


/** Four corners of a convex hull: orientation from the hull edge giving the smallest bounding box, corners as the extreme hull points on its diagonals. */
function quadFromHull(hull: Point[]): { corners: [Point, Point, Point, Point]; sides: [number, number] } {
  let bestAngle = 0;
  let bestArea = Infinity;
  let bestSides: [number, number] = [0, 0];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of hull) {
      const x = p.x * c - p.y * s;
      const y = p.x * s + p.y * c;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea) {
      bestArea = area;
      bestAngle = angle;
      bestSides = [maxX - minX + 1, maxY - minY + 1];
    }
  }
  // Keep the frame close to the image axes so "top-left" means what staff see.
  while (bestAngle > Math.PI / 4) bestAngle -= Math.PI / 2;
  while (bestAngle < -Math.PI / 4) bestAngle += Math.PI / 2;
  const c = Math.cos(-bestAngle);
  const s = Math.sin(-bestAngle);
  const rot = (p: Point) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  const pick = (score: (q: Point) => number) => hull.reduce((best, p) => (score(rot(p)) > score(rot(best)) ? p : best), hull[0]);
  const tl = pick((q) => -q.x - q.y);
  const tr = pick((q) => q.x - q.y);
  const br = pick((q) => q.x + q.y);
  const bl = pick((q) => -q.x + q.y);
  return { corners: [tl, tr, br, bl], sides: bestSides };
}

/** Spacing of the printed grid, from the autocorrelation of fine detail along rows and columns of mat pixels. */
function gridPeriod(gray: Float32Array, mask: Uint8Array, w: number, h: number): number | null {
  // high-pass: pixel minus its 13×13 box mean (integral image)
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const R = 6;
  const hp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      hp[y * w + x] = gray[y * w + x] - sum / ((x1 - x0) * (y1 - y0));
    }
  }
  const maxLag = Math.min(150, Math.floor(Math.min(w, h) / 2));
  const acc = new Float64Array(maxLag + 1);
  const add = (get: (i: number) => number, ok: (i: number) => boolean, n: number) => {
    let zero = 0;
    for (let i = 0; i < n; i++) if (ok(i)) zero += get(i) * get(i);
    if (zero <= 0) return;
    for (let lag = 1; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) if (ok(i) && ok(i + lag)) s += get(i) * get(i + lag);
      acc[lag] += s / zero;
    }
  };
  for (let y = 0; y < h; y += 2) add((x) => hp[y * w + x], (x) => mask[y * w + x] === 1, w);
  for (let x = 0; x < w; x += 2) add((y) => hp[y * w + x], (y) => mask[y * w + x] === 1, h);
  // Grid lines are thin, so the true spacing c gives narrow, sharp peaks at c, 2c and 3c.
  // Score each candidate by its weakest of those three peaks (half the spacing fails at
  // 1.5c, which falls between lines); then take the smallest spacing that scores nearly
  // as well as the best (whole multiples of the spacing also score well).
  const at = (lag: number) => {
    const i = Math.floor(lag);
    const f = lag - i;
    return i + 1 > maxLag ? -Infinity : acc[i] * (1 - f) + acc[i + 1] * f;
  };
  const sharp = (lag: number) => at(lag) - (at(lag - 2) + at(lag + 2)) / 2;
  const scored: { lag: number; score: number }[] = [];
  for (let lag = 5; lag * 3 + 3 <= maxLag; lag += 0.1) {
    scored.push({ lag, score: Math.min(sharp(lag), sharp(lag * 2), sharp(lag * 3)) });
  }
  const top = Math.max(0, ...scored.map((c) => c.score));
  let best = 0;
  if (top > 0) {
    const first = scored.find((c) => c.score >= top * 0.7)!;
    // refine to the local best around the first good candidate
    best = scored
      .filter((c) => Math.abs(c.lag - first.lag) <= 1)
      .reduce((a, c) => (c.score > a.score ? c : a), first).lag;
  }
  if (!best) return null;
  return Math.round(best * 10) / 10;
}

/** Runs on a downscaled frame (≈480 px long side is plenty). */
export function detectBox(image: ImageData): BoxDetection | DetectFailure {
  const { width: w, height: h, data } = image;
  const blue = new Uint8Array(w * h);
  const gray = new Float32Array(w * h);
  let blueCount = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    if (isMatBlue(r, g, b)) {
      blue[i] = 1;
      blueCount++;
    }
  }
  if (blueCount < w * h * 0.15) return { reason: "no-mat" };

  const unit = Math.max(1, Math.round(Math.max(w, h) / 320));
  const mat = close(blue, w, h, 2 * unit); // grid lines are thin and whitish: fill them in
  // not-mat, without thin bits; a wider opening also cuts off hanging tabs and labels sticking out
  const object = open(open(invert(mat), w, h, 2 * unit), w, h, 5 * unit);

  // connected components of the object mask; keep holes (not touching the border)
  const label = new Int32Array(w * h).fill(-1);
  let best: { pixels: number[]; area: number; centre: number } | null = null;
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!object[start] || label[start] !== -1) continue;
    let head = 0, tail = 0, touches = false;
    queue[tail++] = start;
    label[start] = start;
    const pixels: number[] = [];
    let sx = 0, sy = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w, y = (i - x) / w;
      pixels.push(i);
      sx += x; sy += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of next) {
        if (j >= 0 && object[j] && label[j] === -1) {
          label[j] = start;
          queue[tail++] = j;
        }
      }
    }
    if (touches || pixels.length < w * h * 0.02) continue;
    const cx = sx / pixels.length - w / 2, cy = sy / pixels.length - h / 2;
    const centre = Math.hypot(cx, cy);
    // prefer the biggest hole, nearer the centre on ties
    if (!best || pixels.length > best.area * 1.2 || (pixels.length > best.area * 0.8 && centre < best.centre)) {
      best = { pixels, area: pixels.length, centre };
    }
  }
  if (!best) return { reason: "no-box" };

  // boundary pixels only, for the hull
  const edge: Point[] = [];
  for (const i of best.pixels) {
    const x = i % w, y = (i - x) / w;
    if (!object[i - 1] || !object[i + 1] || !object[i - w] || !object[i + w]) edge.push({ x, y });
  }
  const { corners, sides } = quadFromHull(convexHull(edge));

  // grid spacing from mat pixels away from the box
  const near = dilate(object, w, h, 4 * unit);
  const matOnly = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) matOnly[i] = mat[i] && !near[i] ? 1 : 0;
  const gridPx = gridPeriod(gray, matOnly, w, h);
  if (!gridPx) return { reason: "no-grid" };

  // Sides from the tightest rectangle around the box: the corners are slightly rounded
  // by the clean-up above, which would make corner-to-corner distances a little short.
  const longPx = Math.max(...sides);
  const shortPx = Math.min(...sides);
  const pxPerCm = (gridPx * 10) / GRID_MM;
  return { corners, longPx, shortPx, gridPx, longCm: longPx / pxPerCm, shortCm: shortPx / pxPerCm };
}

/**
 * Top-down shots see the box's top face, which is closer to the camera than the
 * mat, so it looks bigger. With the camera height above the mat (cm) and the
 * height of the face being photographed (cm), scale back to true size.
 */
export function correctForHeight(cmAtMat: number, faceHeightCm: number, cameraHeightCm: number): number {
  if (!cameraHeightCm || cameraHeightCm <= faceHeightCm) return cmAtMat;
  return (cmAtMat * (cameraHeightCm - faceHeightCm)) / cameraHeightCm;
}

/**
 * Two top-down shots: lying flat (shows width × length), then standing on its
 * side (shows height × one of the other sides). Solves the true width, length
 * and height, correcting each shot for how far its top face sits above the mat.
 */
export function solveBoxSize(
  flat: { longCm: number; shortCm: number },
  side: { longCm: number; shortCm: number },
  cameraHeightCm: number,
): { lengthCm: number; widthCm: number; heightCm: number } {
  // The side shot's long edge is either the box's length or its width: take whichever matches better.
  const sideMatchesLong = Math.abs(side.longCm - flat.longCm) <= Math.abs(side.longCm - flat.shortCm);
  let length = flat.longCm, width = flat.shortCm, height = side.shortCm;
  for (let i = 0; i < 6; i++) {
    const raisedSide = sideMatchesLong ? width : length; // the side shot stands on the other edge
    height = correctForHeight(side.shortCm, raisedSide, cameraHeightCm);
    length = correctForHeight(flat.longCm, height, cameraHeightCm);
    width = correctForHeight(flat.shortCm, height, cameraHeightCm);
  }
  return { lengthCm: length, widthCm: width, heightCm: height };
}
