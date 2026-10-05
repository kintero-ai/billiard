'use strict';

const AI = {
  aimError: 0.012,

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

  // Лучший удар в лузу для текущего положения битка.
  bestShot(match, targets) {
    const { R, W, H } = TABLE;
    const balls = match.balls, cue = balls[0];
    let best = null;
    for (const t of targets) {
      const tb = balls[t];
      for (const p of POCKETS) {
        const dx = p.ax - tb.x, dy = p.ay - tb.y;
        const d2 = Math.hypot(dx, dy);
        const ux = dx / d2, uy = dy / d2;
        if (p.side && Math.abs(uy) < 0.55) continue;
        const gx = tb.x - ux * 2 * R, gy = tb.y - uy * 2 * R;
        if (gx < R - 2 || gx > W - R + 2 || gy < R - 2 || gy > H - R + 2) continue;
        const cx = gx - cue.x, cy = gy - cue.y;
        const d1 = Math.hypot(cx, cy);
        if (d1 < 1) continue;
        const cos = (cx * ux + cy * uy) / d1;
        if (cos < 0.25) continue;
        if (!this.pathClear(balls, cue.x, cue.y, gx, gy, [0, t])) continue;
        if (!this.pathClear(balls, tb.x, tb.y, p.ax, p.ay, [0, t])) continue;

        const vt = speedNeeded(d2, 150);
        const vc = vt / (cos * (1 + PHYS.ballE) / 2);
        let v0 = speedNeeded(d1, vc) * 1.1;
        let score = cos * cos * cos / (1 + (d1 + d2 * 1.5) / 700);
        if (p.side) score *= 0.85;
        if (v0 > PHYS.maxSpeed) { score *= 0.4; v0 = PHYS.maxSpeed; }
        if (!best || score > best.score) {
          best = { score, angle: Math.atan2(cy, cx), speed: v0 };
        }
      }
    }
    return best;
  },

  // Возвращает { angle, power, place? }
  plan(match) {
    const { R, W, H } = TABLE;
    const cue = match.balls[0];
    const targets = match.targetsFor(match.cur);

    if (match.isBreak) {
      const y = H / 2 + (Math.random() - 0.5) * 60;
      const apex = match.balls[1];
      return {
        place: { x: W / 4, y },
        angle: Math.atan2(apex.y - y, apex.x - W / 4) + (Math.random() - 0.5) * 0.01,
        power: 1,
      };
    }

    let shot = null, place = null;
    if (match.ballInHand) {
      const ox = cue.x, oy = cue.y;
      for (let x = R * 2; x <= W - R * 2; x += 40) {
        for (let y = R * 2; y <= H - R * 2; y += 40) {
          if (!match.canPlaceCue(x, y)) continue;
          cue.x = x; cue.y = y;
          const s = this.bestShot(match, targets);
          if (s && (!shot || s.score > shot.score)) { shot = s; place = { x, y }; }
        }
      }
      cue.x = ox; cue.y = oy;
      if (place) { cue.x = place.x; cue.y = place.y; }
    } else {
      shot = this.bestShot(match, targets);
    }

    if (shot) {
      const power = Math.pow(shot.speed / PHYS.maxSpeed, 1 / 1.4);
      return {
        place,
        angle: shot.angle + (Math.random() - 0.5) * 2 * this.aimError,
        power: Math.min(1, Math.max(0.08, power * (1 + (Math.random() - 0.5) * 0.08))),
      };
    }

    // Нет удара в лузу — бьём прямо в ближайший свой шар.
    const balls = match.balls;
    const direct = targets
      .map(n => balls[n])
      .filter(b => this.pathClear(balls, cue.x, cue.y, b.x, b.y, [0, b.n]))
      .sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y));
    const tgt = direct[0] || balls[targets[Math.floor(Math.random() * targets.length)]];
    return {
      place,
      angle: Math.atan2(tgt.y - cue.y, tgt.x - cue.x) + (direct[0] ? 0 : (Math.random() - 0.5) * 0.3),
      power: direct[0] ? 0.55 : 0.75,
    };
  },
};
