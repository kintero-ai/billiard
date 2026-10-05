'use strict';

// Игровое поле в логических единицах: 1000 x 500 (сукно), шар радиуса 12.
const TABLE = { W: 1000, H: 500, R: 12, RAIL: 46, CG: 30, MG: 22 };
const PHYS = { decel: 200, damp: 0.5, ballE: 0.95, railE: 0.75, maxSpeed: 2300, step: 1 / 120 };

// Лузы: x,y,r — центр и радиус отверстия; ax,ay — точка прицеливания для ИИ.
const POCKETS = (() => {
  const { W, H } = TABLE;
  return [
    { x: -6, y: -6, r: 26, ax: 0, ay: 0 },
    { x: W / 2, y: -12, r: 22, ax: W / 2, ay: -4, side: true },
    { x: W + 6, y: -6, r: 26, ax: W, ay: 0 },
    { x: -6, y: H + 6, r: 26, ax: 0, ay: H },
    { x: W / 2, y: H + 12, r: 22, ax: W / 2, ay: H + 4, side: true },
    { x: W + 6, y: H + 6, r: 26, ax: W, ay: H },
  ];
})();

// Губки луз — точки, от которых шары отскакивают.
const JAWS = (() => {
  const { W, H, CG, MG } = TABLE;
  return [
    { x: CG, y: 0 }, { x: 0, y: CG }, { x: W - CG, y: 0 }, { x: W, y: CG },
    { x: CG, y: H }, { x: 0, y: H - CG }, { x: W - CG, y: H }, { x: W, y: H - CG },
    { x: W / 2 - MG, y: 0 }, { x: W / 2 + MG, y: 0 },
    { x: W / 2 - MG, y: H }, { x: W / 2 + MG, y: H },
  ];
})();

class Ball {
  constructor(n, x, y) {
    this.n = n;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.on = true;
  }
}

function inCornerGapX(x) { return x < TABLE.CG || x > TABLE.W - TABLE.CG; }
function inCornerGapY(y) { return y < TABLE.CG || y > TABLE.H - TABLE.CG; }
function inSideGap(x) { return Math.abs(x - TABLE.W / 2) < TABLE.MG; }

function anyMoving(balls) {
  return balls.some(b => b.on && (b.vx !== 0 || b.vy !== 0));
}

// Один шаг симуляции. ev: { hit(a, b, v), rail(b, v), pocket(b) }
function stepPhysics(balls, dt, ev) {
  const { R, W, H } = TABLE;
  let maxV = 0;
  for (const b of balls) if (b.on) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
  if (maxV === 0) return;
  const n = Math.max(1, Math.ceil(maxV * dt / (R * 0.25)));
  const h = dt / n;
  const e = PHYS.railE;

  for (let s = 0; s < n; s++) {
    for (const b of balls) {
      if (!b.on) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp === 0) continue;
      const ns = sp - (PHYS.decel + PHYS.damp * sp) * h;
      if (ns <= 0) { b.vx = 0; b.vy = 0; continue; }
      b.vx *= ns / sp;
      b.vy *= ns / sp;
      b.x += b.vx * h;
      b.y += b.vy * h;

      // Борта (кроме проёмов луз)
      if (b.y < R && b.y > -R * 0.3 && !inCornerGapX(b.x) && !inSideGap(b.x)) {
        b.y = R;
        if (b.vy < 0) { ev.rail(b, -b.vy); b.vy = -b.vy * e; b.vx *= 0.98; }
      } else if (b.y > H - R && b.y < H + R * 0.3 && !inCornerGapX(b.x) && !inSideGap(b.x)) {
        b.y = H - R;
        if (b.vy > 0) { ev.rail(b, b.vy); b.vy = -b.vy * e; b.vx *= 0.98; }
      }
      if (b.x < R && b.x > -R * 0.3 && !inCornerGapY(b.y)) {
        b.x = R;
        if (b.vx < 0) { ev.rail(b, -b.vx); b.vx = -b.vx * e; b.vy *= 0.98; }
      } else if (b.x > W - R && b.x < W + R * 0.3 && !inCornerGapY(b.y)) {
        b.x = W - R;
        if (b.vx > 0) { ev.rail(b, b.vx); b.vx = -b.vx * e; b.vy *= 0.98; }
      }

      // Губки луз
      for (const j of JAWS) {
        const dx = b.x - j.x, dy = b.y - j.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 1e-9) {
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          b.x = j.x + nx * R;
          b.y = j.y + ny * R;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            ev.rail(b, -vn);
            b.vx -= (1 + e) * vn * nx;
            b.vy -= (1 + e) * vn * ny;
          }
        }
      }
    }

    // Столкновения шаров
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let k = i + 1; k < balls.length; k++) {
        const b = balls[k];
        if (!b.on) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, ny = dy / d;
        const overlap = 2 * R - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn > 0) {
          const j = (1 + PHYS.ballE) / 2 * vn;
          a.vx -= j * nx; a.vy -= j * ny;
          b.vx += j * nx; b.vy += j * ny;
          ev.hit(a, b, vn);
        }
      }
    }

    // Лузы
    for (const b of balls) {
      if (!b.on) continue;
      let inPocket = b.x < 0 || b.x > W || b.y < 0 || b.y > H;
      if (!inPocket) {
        for (const p of POCKETS) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r * 0.75) { inPocket = true; break; }
        }
      }
      if (inPocket) {
        b.on = false;
        b.vx = 0;
        b.vy = 0;
        ev.pocket(b);
      }
    }
  }
}

// Расстояние, которое шар проходит, замедляясь от скорости v до u.
function rollDistance(v, u) {
  const a = PHYS.decel, k = PHYS.damp;
  return (v - u) / k - a / (k * k) * Math.log((a + k * v) / (a + k * u));
}

// Начальная скорость, нужная, чтобы пройти d и сохранить скорость u.
function speedNeeded(d, u) {
  let lo = u, hi = PHYS.maxSpeed * 3;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rollDistance(mid, u) < d) lo = mid; else hi = mid;
  }
  return hi;
}
