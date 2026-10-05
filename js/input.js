'use strict';

// Управление мышью, касаниями и клавиатурой.
// game: { G, toLogical(e), shoot(power), canAim(), updateHud() }
function setupInput(canvas, game) {
  const { G } = game;
  let mode = null, start = null;
  let lastTap = { n: -1, t: 0 };

  // «Американка»: шар под указателем, который можно сделать битком.
  function ballAt(p) {
    let best = null, bd = TABLE.R * 1.8;
    for (const b of G.match.balls) {
      if (!b.on) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function setPicking(on) {
    G.selecting = on;
    document.body.classList.toggle('picking', on);
    game.updateHud();
  }

  function pickStriker(b) {
    G.match.striker = b.n;
    setPicking(false);
  }

  function setAimTo(p) {
    const cue = G.match.cue;
    const dx = p.x - cue.x, dy = p.y - cue.y;
    if (Math.hypot(dx, dy) > TABLE.R * 0.8) G.aim = Math.atan2(dy, dx);
  }

  function moveCue(p) {
    const m = G.match, cue = m.cue;
    const { W, H, R } = TABLE;
    const x = Math.max(R, Math.min(m.headString ? W / 4 : W - R, p.x));
    const y = Math.max(R, Math.min(H - R, p.y));
    if (m.canPlaceCue(x, y)) { cue.x = x; cue.y = y; }
  }

  canvas.addEventListener('pointerdown', e => {
    Sound.init();
    if (!game.canAim()) return;
    e.preventDefault();
    const p = game.toLogical(e);
    const m = G.match, cue = m.cue;
    if (m.kind === 'russian' && !m.ballInHand) {
      const b = ballAt(p);
      const now = performance.now();
      const dbl = b && lastTap.n === b.n && now - lastTap.t < 350;
      lastTap = { n: b ? b.n : -1, t: now };
      if (b && (G.selecting || dbl) && b !== cue) { pickStriker(b); return; }
      if (G.selecting) return;
    }
    canvas.setPointerCapture(e.pointerId);
    if (m.ballInHand && Math.hypot(p.x - cue.x, p.y - cue.y) < TABLE.R * 3.5) {
      mode = 'drag';
    } else if (e.pointerType === 'mouse') {
      mode = 'pull';
      start = p;
      G.power = 0;
    } else {
      mode = 'aim';
      setAimTo(p);
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!game.canAim()) return;
    const p = game.toLogical(e);
    if (mode === 'drag') moveCue(p);
    else if (mode === 'pull') {
      const proj = (start.x - p.x) * Math.cos(G.aim) + (start.y - p.y) * Math.sin(G.aim);
      G.power = Math.max(0, Math.min(1, proj / 220));
    } else if (mode === 'aim' || (mode === null && e.pointerType === 'mouse')) {
      setAimTo(p);
    }
  });

  function end() {
    if (mode === 'pull' && G.power > 0.02 && game.canAim()) game.shoot(G.power);
    else if (mode === 'pull') G.power = 0;
    mode = null;
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { mode = null; G.power = 0; });

  // Полоса силы удара: тянуть вдоль полосы, отпустить — удар.
  const bar = document.getElementById('power');
  let barStart = null;
  bar.addEventListener('pointerdown', e => {
    Sound.init();
    if (!game.canAim()) return;
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    barStart = { x: e.clientX, y: e.clientY };
    G.power = 0;
  });
  bar.addEventListener('pointermove', e => {
    if (!barStart || !game.canAim()) return;
    const vertical = bar.clientHeight >= bar.clientWidth;
    const len = (vertical ? bar.clientHeight : bar.clientWidth) * 0.85;
    const d = vertical ? e.clientY - barStart.y : e.clientX - barStart.x;
    G.power = Math.max(0, Math.min(1, Math.abs(d) / len));
  });
  bar.addEventListener('pointerup', () => {
    if (barStart && G.power > 0.02 && game.canAim()) game.shoot(G.power);
    else G.power = 0;
    barStart = null;
  });
  bar.addEventListener('pointercancel', () => { barStart = null; G.power = 0; });

  // Кнопки точного прицеливания (удержание — непрерывный поворот).
  function holdRotate(btn, dir) {
    let timer = null, t0 = 0;
    const stop = () => { clearInterval(timer); timer = null; };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!game.canAim()) return;
      t0 = performance.now();
      G.aim += dir * 0.002;
      stop();
      timer = setInterval(() => {
        if (!game.canAim()) return stop();
        const held = (performance.now() - t0) / 1000;
        G.aim += dir * (held < 0.6 ? 0.002 : held < 1.5 ? 0.006 : 0.02);
      }, 30);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  }
  document.getElementById('pickBtn').addEventListener('click', () => {
    if (game.canAim() && G.match.kind === 'russian' && !G.match.ballInHand) setPicking(!G.selecting);
  });

  holdRotate(document.getElementById('rotL'), -1);
  holdRotate(document.getElementById('rotR'), 1);

  window.addEventListener('keydown', e => {
    if (!game.canAim()) return;
    const fine = e.shiftKey ? 0.002 : 0.01;
    if (e.key === 'ArrowLeft') G.aim -= fine;
    else if (e.key === 'ArrowRight') G.aim += fine;
    else if (e.key === 'ArrowUp') G.power = Math.min(1, G.power + 0.05);
    else if (e.key === 'ArrowDown') G.power = Math.max(0, G.power - 0.05);
    else if ((e.key === ' ' || e.key === 'Enter') && G.power > 0.02) game.shoot(G.power);
    else return;
    e.preventDefault();
  });
}
