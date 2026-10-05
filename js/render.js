'use strict';

const BALL_COLORS = {
  1: '#f4c20d', 2: '#1d4fd8', 3: '#d62828', 4: '#6b2fa3',
  5: '#f77f00', 6: '#138a36', 7: '#7d1d1d', 8: '#151515',
};

function ballColor(n) {
  if (n === 0) return '#f7f4ea';
  return BALL_COLORS[n > 8 ? n - 8 : n];
}

const Render = {
  rot: 0, // поворот вида (рад), чтобы номера и блики шаров смотрели вверх на экране

  table(ctx) {
    const { W, H, RAIL } = TABLE;
    // Деревянная рама
    const wood = ctx.createLinearGradient(0, -RAIL, 0, H + RAIL);
    wood.addColorStop(0, '#6b3a1c');
    wood.addColorStop(0.5, '#4a2410');
    wood.addColorStop(1, '#6b3a1c');
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.roundRect(-RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 24);
    ctx.fill();

    // Борта
    ctx.fillStyle = '#0a5a30';
    ctx.fillRect(-15, -15, W + 30, H + 30);

    // Сукно
    const cloth = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.6);
    cloth.addColorStop(0, '#1d9654');
    cloth.addColorStop(1, '#0f6b39');
    ctx.fillStyle = cloth;
    ctx.fillRect(0, 0, W, H);

    // Линия разбивки и точки
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 4, 0);
    ctx.lineTo(W / 4, H);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (const x of [W / 4, W * 0.75]) {
      ctx.beginPath();
      ctx.arc(x, H / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Метки на раме
    ctx.fillStyle = '#e8d9b0';
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      for (const y of [-RAIL / 2 - 7, H + RAIL / 2 + 7]) {
        ctx.beginPath();
        ctx.arc(W * i / 8, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 1; i < 4; i++) {
      for (const x of [-RAIL / 2 - 7, W + RAIL / 2 + 7]) {
        ctx.beginPath();
        ctx.arc(x, H * i / 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Лузы
    for (const p of POCKETS) {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
      g.addColorStop(0, '#000');
      g.addColorStop(0.8, '#050505');
      g.addColorStop(1, '#2a2a2a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  ball(ctx, b, alpha = 1) {
    const R = TABLE.R;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x, b.y);
    ctx.rotate(-this.rot);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(2, 3, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    if (TABLE.kind === 'russian') {
      // Русский бильярд: все шары цвета слоновой кости, номер прямо на шаре.
      ctx.fillStyle = '#f1e6c8';
      ctx.fillRect(-R, -R, 2 * R, 2 * R);
      if (b.n > 0) {
        ctx.fillStyle = '#2a1d10';
        ctx.font = `bold ${R * 0.95}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.n), 0, R * 0.06);
      }
    } else if (b.n > 8) {
      ctx.fillStyle = '#f7f4ea';
      ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.fillStyle = ballColor(b.n);
      ctx.fillRect(-R, -R * 0.55, 2 * R, R * 1.1);
    } else {
      ctx.fillStyle = ballColor(b.n);
      ctx.fillRect(-R, -R, 2 * R, 2 * R);
    }
    if (b.n > 0 && TABLE.kind !== 'russian') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = `bold ${R * 0.62}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.n), 0, R * 0.04);
    }
    const shade = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
    shade.addColorStop(0, 'rgba(255,255,255,0.55)');
    shade.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = shade;
    ctx.fillRect(-R, -R, 2 * R, 2 * R);
    ctx.restore();
    ctx.restore();
  },

  // Линия прицела с «призрачным» шаром и направлениями после удара.
  aim(ctx, balls, cue, angle) {
    const { R, W, H } = TABLE;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let tMin = Infinity, hit = null;
    for (const b of balls) {
      if (!b.on || b === cue) continue;
      const fx = cue.x - b.x, fy = cue.y - b.y;
      const bq = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - 4 * R * R;
      const disc = bq * bq - c;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < tMin) { tMin = t; hit = b; }
    }
    const tx = dx > 0 ? (W - R - cue.x) / dx : dx < 0 ? (R - cue.x) / dx : Infinity;
    const ty = dy > 0 ? (H - R - cue.y) / dy : dy < 0 ? (R - cue.y) / dy : Infinity;
    const tRail = Math.min(tx, ty);
    if (tRail < tMin) { tMin = tRail; hit = null; }

    const ex = cue.x + dx * tMin, ey = cue.y + dy * tMin;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    if (hit) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(ex, ey, R, 0, Math.PI * 2);
      ctx.stroke();
      const nx = (hit.x - ex) / (2 * R), ny = (hit.y - ey) / (2 * R);
      const dot = dx * nx + dy * ny;
      ctx.strokeStyle = 'rgba(255,240,150,0.9)';
      ctx.beginPath();
      ctx.moveTo(hit.x, hit.y);
      ctx.lineTo(hit.x + nx * (40 + 80 * dot), hit.y + ny * (40 + 80 * dot));
      ctx.stroke();
      const tgx = dx - dot * nx, tgy = dy - dot * ny;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + tgx * 60, ey + tgy * 60);
      ctx.stroke();
    } else {
      const rx = tx <= ty ? -dx : dx, ry = tx <= ty ? dy : -dy;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + rx * 120, ey + ry * 120);
      ctx.stroke();
    }
    ctx.restore();
  },

  cue(ctx, cueBall, angle, pull) {
    const R = TABLE.R;
    const s = R + 4 + pull, L = 400;
    ctx.save();
    ctx.translate(cueBall.x, cueBall.y);
    ctx.rotate(angle + Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(s + 3, 4);
    ctx.lineTo(s + L + 3, 8);
    ctx.lineTo(s + L + 3, -2);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(s, 0, s + L, 0);
    g.addColorStop(0, '#5a7fa8');
    g.addColorStop(0.015, '#5a7fa8');
    g.addColorStop(0.016, '#f3eee0');
    g.addColorStop(0.04, '#f3eee0');
    g.addColorStop(0.041, '#e2c08d');
    g.addColorStop(0.65, '#c99a5b');
    g.addColorStop(0.66, '#2b1a0e');
    g.addColorStop(0.7, '#2b1a0e');
    g.addColorStop(0.71, '#7a3b16');
    g.addColorStop(1, '#3a1a08');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s, -2.4);
    ctx.lineTo(s + L, -5.5);
    ctx.lineTo(s + L, 5.5);
    ctx.lineTo(s, 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  handRing(ctx, cueBall, ok) {
    ctx.save();
    ctx.strokeStyle = ok ? 'rgba(255,255,255,0.75)' : 'rgba(255,80,80,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(cueBall.x, cueBall.y, TABLE.R * 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  // Выбранный шар-биток в «Американке».
  strikerRing(ctx, b) {
    ctx.save();
    ctx.strokeStyle = 'rgba(244,194,13,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, TABLE.R + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  // Шары, которые можно выбрать битком.
  pickRing(ctx, b) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    ctx.save();
    ctx.strokeStyle = `rgba(120,200,255,${0.4 + 0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, TABLE.R + 3 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  headLine(ctx) {
    const { W, H } = TABLE;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W / 4, H);
    ctx.restore();
  },
};
