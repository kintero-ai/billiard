'use strict';

function groupOf(n) {
  if (n === 0) return 'cue';
  if (n === 8) return 'eight';
  return n < 8 ? 'solid' : 'stripe';
}

const GROUP_NAMES = { solid: 'сплошные', stripe: 'полосатые' };

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Треугольник: 1 — на вершине, 8 — в центре, в задних углах — сплошной и полосатый.
function createRack() {
  const { W, H, R } = TABLE;
  const solids = shuffle([2, 3, 4, 5, 6, 7]);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);
  const cornerSolid = solids.pop();
  const cornerStripe = stripes.pop();
  const rest = shuffle(solids.concat(stripes));
  const order = [];
  for (let k = 0; k < 15; k++) {
    if (k === 0) order.push(1);
    else if (k === 4) order.push(8);
    else if (k === 10) order.push(cornerSolid);
    else if (k === 14) order.push(cornerStripe);
    else order.push(rest.pop());
  }
  const balls = [];
  balls[0] = new Ball(0, W / 4, H / 2);
  const ax = W * 0.73, dx = R * Math.sqrt(3) + 0.3;
  let k = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      const n = order[k++];
      balls[n] = new Ball(n, ax + i * dx, H / 2 + (j - i / 2) * (2 * R + 0.3));
    }
  }
  return balls;
}

// «Вы забили» / «Компьютер забивает».
function scores(p) {
  return p.name === 'Вы' ? 'Вы забили' : `${p.name} забивает`;
}

function makePlayers(mode, extra) {
  const list = mode === 'ai'
    ? [{ name: 'Вы', ai: false }, { name: 'Компьютер', ai: true }]
    : [{ name: 'Игрок 1', ai: false }, { name: 'Игрок 2', ai: false }];
  return list.map(p => Object.assign(p, extra()));
}

// Общее для всех видов игры. cue — шар, которым бьёт игрок (striker).
class BaseMatch {
  constructor(mode, balls, players) {
    this.mode = mode;
    this.players = players;
    this.cur = 0;
    this.balls = balls;
    this.striker = 0;
    this.ballInHand = true;
    this.headString = true;
    this.isBreak = true;
    this.over = false;
    this.winner = null;
    this.msg = `Разбивка: ${this.players[0].name}`;
    this.resetShot();
  }

  get player() { return this.players[this.cur]; }
  get cue() { return this.balls[this.striker]; }

  resetShot() {
    this.shot = { firstHit: null, pocketed: [] };
  }

  beginShot() {
    this.resetShot();
    this.ballInHand = false;
  }

  onHit(a, b) {
    if (this.shot.firstHit !== null) return;
    if (a.n === this.striker) this.shot.firstHit = b.n;
    else if (b.n === this.striker) this.shot.firstHit = a.n;
  }

  onPocket(b) {
    this.shot.pocketed.push(b.n);
  }

  canPlaceCue(x, y) {
    const { W, H, R } = TABLE;
    if (x < R || x > W - R || y < R || y > H - R) return false;
    if (this.headString && x > W / 4) return false;
    return this.isFree(x, y, this.cue);
  }

  isFree(x, y, except) {
    return this.balls.every(b => b === except || !b.on || Math.hypot(b.x - x, b.y - y) >= 2 * TABLE.R + 0.5);
  }

  // Ставит шар на точку или ближайшую свободную позицию на линии.
  spot(ball, x, y) {
    const { W, R } = TABLE;
    for (let d = 0; d < W; d += 2) {
      for (const sx of [x + d, x - d]) {
        if (sx < R || sx > W - R) continue;
        if (this.isFree(sx, y, ball)) {
          ball.x = sx; ball.y = y; ball.vx = 0; ball.vy = 0; ball.on = true;
          return;
        }
      }
    }
  }
}

class Match extends BaseMatch {
  constructor(mode) {
    super(mode, createRack(), makePlayers(mode, () => ({ group: null })));
    this.kind = 'pool';
  }

  remaining(group) {
    return this.balls.filter(b => b.on && groupOf(b.n) === group).map(b => b.n);
  }

  // Шары, по которым игрок может бить первым.
  targetsFor(idx) {
    const p = this.players[idx];
    if (!p.group) return this.balls.filter(b => b.on && b.n !== 0 && b.n !== 8).map(b => b.n);
    const rest = this.remaining(p.group);
    return rest.length ? rest : [8];
  }

  evaluate() {
    const p = this.player;
    const oppIdx = 1 - this.cur;
    const opp = this.players[oppIdx];
    const { firstHit, pocketed } = this.shot;
    const cueIn = pocketed.includes(0);
    const eightIn = pocketed.includes(8);
    const clearedBefore = p.group !== null &&
      this.remaining(p.group).length === 0 &&
      !pocketed.some(n => groupOf(n) === p.group);

    let foul = null;
    if (cueIn) foul = 'Биток в лузе';
    else if (firstHit === null) foul = 'Не задет ни один шар';
    else if (p.group) {
      if (clearedBefore ? firstHit !== 8 : groupOf(firstHit) !== p.group) foul = 'Первым задет чужой шар';
    } else if (firstHit === 8 && !this.isBreak) foul = 'Первой задета восьмёрка';

    if (eightIn) {
      if (this.isBreak) {
        this.spot(this.balls[8], TABLE.W * 0.75, TABLE.H / 2);
      } else {
        const win = !foul && clearedBefore;
        this.over = true;
        this.winner = win ? this.cur : oppIdx;
        this.msg = win
          ? `${scores(p)} восьмёрку!`
          : (foul ? `Фол при забитой восьмёрке (${foul.toLowerCase()})` : 'Восьмёрка забита раньше времени');
        return;
      }
    }

    let assigned = false;
    if (!p.group && !foul) {
      const obj = pocketed.filter(n => n !== 0 && n !== 8);
      if (obj.length) {
        p.group = groupOf(obj[0]);
        opp.group = p.group === 'solid' ? 'stripe' : 'solid';
        assigned = true;
      }
    }

    const keep = !foul && p.group !== null && pocketed.some(n => groupOf(n) === p.group);
    if (cueIn) this.spot(this.balls[0], TABLE.W / 4, TABLE.H / 2);
    this.isBreak = false;

    if (foul) {
      this.cur = oppIdx;
      this.ballInHand = true;
      this.headString = false;
      this.msg = `Фол: ${foul.toLowerCase()}. Шар в руке — ${opp.name}`;
    } else if (keep) {
      const g = assigned ? ` (${GROUP_NAMES[p.group]})` : '';
      this.msg = `${p.name}: забит${g}! Ещё удар`;
    } else {
      this.cur = oppIdx;
      this.msg = `Ход: ${opp.name}`;
    }
    this.headString = false;
  }
}

// ---------- Русский бильярд: «Американка» ----------
const RU_TARGET = 8;

// 15 шаров пирамидой, вершина — на задней отметке; 16-й (биток, без номера) — в «доме».
function createRussianRack() {
  const { W, H, R } = TABLE;
  const order = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  const balls = [];
  balls[0] = new Ball(0, W / 4, H / 2);
  const ax = W * 0.75, dx = R * Math.sqrt(3) + 0.3;
  let k = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      const n = order[k++];
      balls[n] = new Ball(n, ax + i * dx, H / 2 + (j - i / 2) * (2 * R + 0.3));
    }
  }
  return balls;
}

// Бить можно любым шаром по любому, засчитывается любой забитый шар (и биток-«свояк»).
// Промах (биток никого не задел) — фол: забитое в этом ударе возвращается,
// с нарушителя снимается один шар, ход переходит сопернику. Кто первым забил 8 — победил.
class RussianMatch extends BaseMatch {
  constructor(mode) {
    super(mode, createRussianRack(), makePlayers(mode, () => ({ score: 0, potted: [] })));
    this.kind = 'russian';
  }

  // Любой шар на столе, кроме битка.
  targetsFor() {
    return this.balls.filter(b => b.on && b.n !== this.striker).map(b => b.n);
  }

  ballName(n) {
    return n === 0 ? 'биток' : `шар ${n}`;
  }

  // Если выбранный биток ушёл в лузу — выбираем шар ближе всего к «дому».
  ensureStriker() {
    if (this.cue.on) return;
    let best = null, bd = Infinity;
    for (const b of this.balls) {
      if (!b.on) continue;
      const d = Math.hypot(b.x - TABLE.W / 4, b.y - TABLE.H / 2);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.striker = best.n;
  }

  evaluate() {
    const { W, H } = TABLE;
    const p = this.player;
    const oppIdx = 1 - this.cur;
    const opp = this.players[oppIdx];
    const { firstHit, pocketed } = this.shot;
    this.isBreak = false;
    this.headString = false;

    if (firstHit === null) {
      for (const n of pocketed) this.spot(this.balls[n], W * 0.75, H / 2);
      let pen = '';
      if (p.potted.length) {
        const n = p.potted.pop();
        p.score--;
        this.spot(this.balls[n], W * 0.75, H / 2);
        pen = ' Штрафной шар вернулся на стол.';
      }
      this.cur = oppIdx;
      this.msg = `Фол: ${this.ballName(this.striker)} никого не задел.${pen} Ход: ${opp.name}`;
    } else if (pocketed.length) {
      p.score += pocketed.length;
      p.potted.push(...pocketed);
      if (p.score >= RU_TARGET) {
        this.over = true;
        this.winner = this.cur;
        this.msg = `${scores(p)} ${RU_TARGET}-й шар!`;
        return;
      }
      const sv = pocketed.includes(this.striker) ? ' (свояк)' : '';
      this.msg = `${p.name}: +${pocketed.length}${sv}, всего ${p.score} из ${RU_TARGET}. Ещё удар`;
    } else {
      this.cur = oppIdx;
      this.msg = `Ход: ${opp.name}`;
    }
    this.ensureStriker();
  }
}
