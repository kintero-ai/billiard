'use strict';

const Sound = {
  ctx: null,
  last: 0,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  play(freq, vol, dur, type = 'triangle') {
    if (!this.ctx || vol < 0.03) return;
    const now = this.ctx.currentTime;
    if (now - this.last < 0.015) return;
    this.last = now;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(Math.min(vol, 1) * 0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  },
};

const G = {
  phase: 'menu', // menu | aim | moving | ai-think | ai-aim | over
  mode: null,
  match: null,
  aim: 0,
  power: 0,
  ai: null,
  moveTime: 0,
};

const canvas = document.getElementById('table');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
let view = new DOMMatrix(), inv = new DOMMatrix(), dpr = 1;

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const TW = TABLE.W + 2 * TABLE.RAIL, TH = TABLE.H + 2 * TABLE.RAIL;
  const portrait = h > w * 1.05;
  const s = portrait ? Math.min(w / TH, h / TW) : Math.min(w / TW, h / TH);
  Render.rot = portrait ? Math.PI / 2 : 0;
  view = new DOMMatrix()
    .translateSelf(w / 2, h / 2)
    .rotateSelf(portrait ? 90 : 0)
    .scaleSelf(s)
    .translateSelf(-TABLE.W / 2, -TABLE.H / 2);
  inv = view.inverse();
}

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return inv.transformPoint(new DOMPoint(e.clientX - r.left, e.clientY - r.top));
}

function canAim() {
  return G.phase === 'aim' && G.match && !G.match.over;
}

const physEvents = {
  hit(a, b, v) {
    G.match.onHit(a, b);
    Sound.play(1500 + Math.random() * 300, v / 1500, 0.05);
  },
  rail(b, v) { Sound.play(220, v / 2500, 0.07, 'sine'); },
  pocket(b) {
    G.match.onPocket(b);
    Sound.play(120, 0.6, 0.25, 'sine');
  },
};

function shoot(power) {
  const m = G.match, cue = m.balls[0];
  if (m.ballInHand && !m.canPlaceCue(cue.x, cue.y)) return;
  if (!isFinite(G.aim) || !isFinite(power)) return;
  Sound.init();
  m.beginShot();
  const sp = PHYS.maxSpeed * Math.pow(power, 1.4);
  cue.vx = Math.cos(G.aim) * sp;
  cue.vy = Math.sin(G.aim) * sp;
  Sound.play(900, 0.3 + power * 0.7, 0.04);
  tipEl.classList.add('hidden');
  G.power = 0;
  G.phase = 'moving';
  G.moveTime = 0;
  updateHud();
}

function endShot() {
  const m = G.match;
  m.evaluate();
  const cue = m.balls[0];
  if (!m.over && (!cue.on || !isFinite(cue.x) || !isFinite(cue.y))) {
    m.spot(cue, TABLE.W / 4, TABLE.H / 2);
    m.ballInHand = true;
  }
  nextTurn();
}

function nextTurn() {
  const m = G.match;
  updateHud();
  if (m.over) {
    G.phase = 'over';
    setTimeout(showOver, 700);
    return;
  }
  if (m.player.ai) {
    G.phase = 'ai-think';
    G.ai = { timer: 0.7 };
  } else {
    G.phase = 'aim';
  }
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function updateAI(dt) {
  const ai = G.ai;
  ai.timer -= dt;
  if (G.phase === 'ai-think') {
    if (ai.timer > 0) return;
    const plan = AI.plan(G.match);
    if (plan.place) {
      G.match.balls[0].x = plan.place.x;
      G.match.balls[0].y = plan.place.y;
    }
    G.ai = { plan, from: G.aim, t: 0, timer: 0 };
    G.phase = 'ai-aim';
    return;
  }
  ai.t += dt;
  const turn = Math.min(1, ai.t / 0.7);
  const ease = turn * turn * (3 - 2 * turn);
  G.aim = ai.from + angleDiff(ai.from, ai.plan.angle) * ease;
  if (ai.t > 0.8) G.power = ai.plan.power * Math.min(1, (ai.t - 0.8) / 0.5);
  if (ai.t > 1.45) {
    G.aim = ai.plan.angle;
    G.phase = 'aim';
    shoot(ai.plan.power);
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(new DOMMatrix().scaleSelf(dpr).multiplySelf(view));
  Render.table(ctx);
  const m = G.match;
  if (!m) return;
  const cue = m.balls[0];
  const aiming = G.phase === 'aim' || G.phase === 'ai-aim';
  if (aiming && m.ballInHand && m.headString) Render.headLine(ctx);
  if (aiming && cue.on) Render.aim(ctx, m.balls, G.aim);
  for (const b of m.balls) if (b.on) Render.ball(ctx, b);
  if (aiming && cue.on) {
    if (m.ballInHand && G.phase === 'aim') Render.handRing(ctx, cue, m.canPlaceCue(cue.x, cue.y));
    Render.cue(ctx, cue, G.aim, G.power * 90);
  }
}

// ---------- HUD ----------
const hud = {
  p: [document.getElementById('p0'), document.getElementById('p1')],
  msg: document.getElementById('msg'),
  fill: document.getElementById('powerFill'),
};

function chip(n, gone) {
  const c = ballColor(n);
  const bg = n > 8
    ? `linear-gradient(#f7f4ea 0 26%, ${c} 26% 74%, #f7f4ea 74%)`
    : c;
  return `<span class="chip${gone ? ' gone' : ''}" style="background:${bg}"></span>`;
}

function updateHud() {
  const m = G.match;
  if (!m) return;
  m.players.forEach((p, i) => {
    const el = hud.p[i];
    el.classList.toggle('active', i === m.cur && !m.over);
    el.querySelector('.pname').textContent = p.name;
    let html = '';
    if (p.group) {
      const nums = p.group === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      html = nums.map(n => chip(n, !m.balls[n].on)).join('');
      if (m.remaining(p.group).length === 0) html += chip(8, false);
    } else {
      html = '<span class="open">группа не выбрана</span>';
    }
    el.querySelector('.chips').innerHTML = html;
  });
  let text = m.msg;
  if (!m.over && G.phase !== 'moving' && m.ballInHand && !m.player.ai) {
    text += m.isBreak ? ' — поставьте биток и ударьте' : ' (перетащите биток)';
  }
  hud.msg.textContent = text;
}

// ---------- Меню ----------
const tipEl = document.getElementById('tip');
const menuEl = document.getElementById('menu');
const overEl = document.getElementById('over');
const resumeBtn = document.getElementById('resumeBtn');

function startGame(mode) {
  G.mode = mode;
  G.match = new Match(mode);
  G.aim = 0;
  G.power = 0;
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  tipEl.classList.remove('hidden');
  nextTurn();
}

function showOver() {
  const m = G.match;
  const w = m.players[m.winner];
  document.getElementById('overTitle').textContent =
    m.mode === 'ai' ? (w.ai ? 'Вы проиграли' : 'Победа!') : `Победил ${w.name}`;
  document.getElementById('overText').textContent = m.msg;
  overEl.classList.remove('hidden');
}

document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => { Sound.init(); startGame(btn.dataset.mode); });
});
document.getElementById('menuBtn').addEventListener('click', () => {
  resumeBtn.classList.toggle('hidden', !G.match || G.match.over);
  menuEl.classList.remove('hidden');
});
resumeBtn.addEventListener('click', () => menuEl.classList.add('hidden'));
document.getElementById('againBtn').addEventListener('click', () => startGame(G.mode));
document.getElementById('toMenuBtn').addEventListener('click', () => {
  overEl.classList.add('hidden');
  resumeBtn.classList.add('hidden');
  menuEl.classList.remove('hidden');
});
document.getElementById('fsBtn').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await document.documentElement.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) { /* не поддерживается */ }
});

// ---------- Цикл ----------
let last = performance.now(), acc = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (G.phase === 'moving') {
    acc += dt;
    G.moveTime += dt;
    while (acc >= PHYS.step) {
      stepPhysics(G.match.balls, PHYS.step, physEvents);
      acc -= PHYS.step;
    }
    if (G.moveTime > 30) for (const b of G.match.balls) { b.vx = 0; b.vy = 0; }
    if (!anyMoving(G.match.balls)) { acc = 0; endShot(); }
  } else if (G.phase === 'ai-think' || G.phase === 'ai-aim') {
    updateAI(dt);
  }
  hud.fill.style.setProperty('--p', G.power.toFixed(3));
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(stage);
resize();
setupInput(canvas, { G, toLogical, shoot, canAim });
requestAnimationFrame(frame);
