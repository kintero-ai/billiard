'use strict';

const AI = {
  aimError: { pool: 0.012, russian: 0.014 },

  // Расстояние от точки до отрезка.
  segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  },

  pathClear(balls, ax, ay, bx, by, skip) {
    const lim = 2 * TABLE.R - 0.5;
    return balls.every(b => !b.on || skip.includes(b.n) || this.segDist(b.x, b.y, ax, ay, bx, by) >= lim);
  },

  // Каким шаром можно бить: в пуле — только битком, в «Американке» — любым.
  strikers(match) {
    return match.kind === 'russian' ? match.balls.filter(b => b.on).map(b => b.n) : [0];
  },

  targets(match, s) {
    return match.kind === 'russian'
      ? match.balls.filter(b => b.on && b.n !== s).map(b => b.n)
      : match.targetsFor(match.cur);
  },

  // Лучший удар в лузу при текущей расстановке.
  bestShot(match, strikers) {
    const { R, W, H } = TABLE;
    const balls = match.balls;
    const sideMin = match.kind === 'russian' ? 0.7 : 0.55;
    let best = null;
    for (const s of strikers) {
      const cue = balls[s];
      for (const t of this.targets(match, s)) {
        const tb = balls[t];
        for (const p of POCKETS) {
          const dx = p.ax - tb.x, dy = p.ay - tb.y;
          const d2 = Math.hypot(dx, dy);
          const ux = dx / d2, uy = dy / d2;
          if (p.side && Math.abs(uy) < sideMin) continue;
          const gx = tb.x - ux * 2 * R, gy = tb.y - uy * 2 * R;
          if (gx < R - 2 || gx > W - R + 2 || gy < R - 2 || gy > H - R + 2) continue;
          const cx = gx - cue.x, cy = gy - cue.y;
          const d1 = Math.hypot(cx, cy);
          if (d1 < 1) continue;
          const cos = (cx * ux + cy * uy) / d1;
          if (cos < 0.25) continue;
          if (!this.pathClear(balls, cue.x, cue.y, gx, gy, [s, t])) continue;
          if (!this.pathClear(balls, tb.x, tb.y, p.ax, p.ay, [s, t])) continue;

          const vt = speedNeeded(d2, 150);
          const vc = vt / (cos * (1 + PHYS.ballE) / 2);
          let v0 = speedNeeded(d1, vc) * 1.1;
          let score = cos * cos * cos / (1 + (d1 + d2 * 1.5) / 700);
          if (p.side) score *= 0.85;
          if (v0 > PHYS.maxSpeed) { score *= 0.4; v0 = PHYS.maxSpeed; }
          if (!best || score > best.score) {
            best = { score, striker: s, angle: Math.atan2(cy, cx), speed: v0 };
          }
        }
      }
    }
    return best;
  },

  // Возвращает { striker, angle, power, place? }
  plan(match) {
    const { R, W, H } = TABLE;
    const err = this.aimError[match.kind] || 0.012;

    if (match.isBreak) {
      const y = H / 2 + (Math.random() - 0.5) * 60;
      let apex = null;
      for (const b of match.balls) if (b.on && b.n !== match.striker && (!apex || b.x < apex.x)) apex = b;
      return {
        striker: match.striker,
        place: { x: W / 4, y },
        angle: Math.atan2(apex.y - y, apex.x - W / 4) + (Math.random() - 0.5) * 0.01,
        power: 1,
      };
    }

    let shot = null, place = null;
    if (match.ballInHand) {
      const cue = match.cue;
      const ox = cue.x, oy = cue.y;
      for (let x = R * 2; x <= W - R * 2; x += 40) {
        for (let y = R * 2; y <= H - R * 2; y += 40) {
          if (!match.canPlaceCue(x, y)) continue;
          cue.x = x; cue.y = y;
          const s = this.bestShot(match, [match.striker]);
          if (s && (!shot || s.score > shot.score)) { shot = s; place = { x, y }; }
        }
      }
      cue.x = ox; cue.y = oy;
      if (place) { cue.x = place.x; cue.y = place.y; }
    } else {
      shot = this.bestShot(match, this.strikers(match));
    }

    if (shot) {
      const power = Math.pow(shot.speed / PHYS.maxSpeed, 1 / 1.4);
      return {
        striker: shot.striker,
        place,
        angle: shot.angle + (Math.random() - 0.5) * 2 * err,
        power: Math.min(1, Math.max(0.08, power * (1 + (Math.random() - 0.5) * 0.08))),
      };
    }

    // Нет удара в лузу — бьём прямо в ближайший разрешённый шар.
    const balls = match.balls;
    let pair = null, pd = Infinity;
    for (const s of (match.ballInHand ? [match.striker] : this.strikers(match))) {
      const sb = balls[s];
      for (const t of this.targets(match, s)) {
        const tb = balls[t];
        const d = Math.hypot(tb.x - sb.x, tb.y - sb.y);
        if (d < pd && this.pathClear(balls, sb.x, sb.y, tb.x, tb.y, [s, t])) { pd = d; pair = [sb, tb]; }
      }
    }
    if (!pair) {
      const sb = match.cue;
      const ts = this.targets(match, sb.n);
      pair = [sb, balls[ts[Math.floor(Math.random() * ts.length)]]];
    }
    const [sb, tb] = pair;
    return {
      striker: sb.n,
      place,
      angle: Math.atan2(tb.y - sb.y, tb.x - sb.x) + (pd < Infinity ? 0 : (Math.random() - 0.5) * 0.3),
      power: pd < Infinity ? 0.55 : 0.75,
    };
  },
};
