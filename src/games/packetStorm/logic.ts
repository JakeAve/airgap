import { crc8 } from "@/lib/bits/mod.ts";

export const COLUMNS = 160;
export const MAX_MOVE = 20;
export const MAX_STEP = 6;

export const WEAPONS = ["packet", "burst", "drill", "firewall"] as const;
export type Weapon = typeof WEAPONS[number];

export type Side = "host" | "guest";

/** Packet ammo is always 0: it is unlimited and never counted. */
export interface Rig {
  column: number;
  hp: number;
  ammo: Record<Weapon, number>;
}

/** Paths and blasts are in terrain units: x a column, y a height. */
export interface Shot {
  weapon: Weapon;
  /** The angle it was fired at, so a screen can point the barrel without guessing. */
  angle: number;
  paths: { x: number; y: number }[][];
  blasts: { x: number; y: number }[];
}

export interface State {
  seed: number;
  heights: number[];
  rigs: Record<Side, Rig>;
  wind: number;
  moves: number;
  lastShot: Shot | null;
}

/** angle 0 points right, 90 up, 180 left, for both sides. */
export interface Move {
  dx: number;
  angle: number;
  power: number;
  weapon: Weapon;
}

export const MAX_HEIGHT = 120;
export const RIG_HEIGHT = 3;
export const RIG_HALF_WIDTH = 2;
const START_HP = 100;
const START_AMMO = 2;
const SPAWN_INSET = 16;
const SPAWN_FLAT = 2;
const SPAWN_RAMP = 6;
const MAX_WIND = 5;

const FP_SHIFT = 8;
const FP = 1 << FP_SHIFT;
const GRAVITY = 8;
const SPEED_PER_POWER = 6;
const WIND_EVERY = 4;
const MAX_TICKS = 1000;
const BURST_SPREAD = 8;

/** Rounded sin(degrees) * 1024 for 0..90, fixed so every engine agrees. */
const SIN = [
  0,
  18,
  36,
  54,
  71,
  89,
  107,
  125,
  143,
  160,
  178,
  195,
  213,
  230,
  248,
  265,
  282,
  299,
  316,
  333,
  350,
  367,
  384,
  400,
  416,
  433,
  449,
  465,
  481,
  496,
  512,
  527,
  543,
  558,
  573,
  587,
  602,
  616,
  630,
  644,
  658,
  672,
  685,
  698,
  711,
  724,
  737,
  749,
  761,
  773,
  784,
  796,
  807,
  818,
  828,
  839,
  849,
  859,
  868,
  878,
  887,
  896,
  904,
  912,
  920,
  928,
  935,
  943,
  949,
  956,
  962,
  968,
  974,
  979,
  984,
  989,
  994,
  998,
  1002,
  1005,
  1008,
  1011,
  1014,
  1016,
  1018,
  1020,
  1022,
  1023,
  1023,
  1024,
  1024,
];

interface Blast {
  rx: number;
  ry: number;
  raise: boolean;
  damage: number;
  reach: number;
}

export const BLASTS: Record<Weapon, Blast> = {
  packet: { rx: 6, ry: 6, raise: false, damage: 40, reach: 9 },
  burst: { rx: 5, ry: 5, raise: false, damage: 30, reach: 8 },
  drill: { rx: 2, ry: 14, raise: false, damage: 60, reach: 7 },
  firewall: { rx: 6, ry: 10, raise: true, damage: 0, reach: 0 },
};

function sin(angle: number): number {
  return angle <= 90 ? SIN[angle] : SIN[180 - angle];
}

function cos(angle: number): number {
  return angle <= 90 ? SIN[90 - angle] : -SIN[angle - 90];
}

function rng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

function windFor(seed: number, moves: number): number {
  const next = rng(
    Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(moves + 1, 0x85ebca6b),
  );
  next();
  return (next() % (MAX_WIND * 2 + 1)) - MAX_WIND;
}

const CONTROL_SPACING = 10;
const MIN_RIDGE = 20;
const RIDGE_SPAN = 61;

function ridge(seed: number): number[] {
  const next = rng(Math.imul(seed + 1, 0x2c1b3c6d));
  const points = Array.from(
    { length: COLUMNS / CONTROL_SPACING + 1 },
    () => MIN_RIDGE + (next() % RIDGE_SPAN),
  );
  let heights = Array.from({ length: COLUMNS }, (_, c) => {
    const i = Math.trunc(c / CONTROL_SPACING);
    const a = points[i];
    const b = points[i + 1];
    return a + Math.trunc(((b - a) * (c % CONTROL_SPACING)) / CONTROL_SPACING);
  });
  for (let pass = 0; pass < 3; pass++) {
    heights = heights.map((h, c) => {
      const left = heights[Math.max(0, c - 1)];
      const right = heights[Math.min(COLUMNS - 1, c + 1)];
      return Math.trunc((left + 2 * h + right) / 4);
    });
  }
  return heights;
}

function newRig(column: number): Rig {
  return {
    column,
    hp: START_HP,
    ammo: {
      packet: 0,
      burst: START_AMMO,
      drill: START_AMMO,
      firewall: START_AMMO,
    },
  };
}

export function initialState(seed: number): State {
  const heights = ridge(seed);
  const host = SPAWN_INSET;
  const guest = COLUMNS - 1 - SPAWN_INSET;
  for (const column of [host, guest]) {
    const base = heights[column];
    for (
      let dx = -SPAWN_FLAT - SPAWN_RAMP;
      dx <= SPAWN_FLAT + SPAWN_RAMP;
      dx++
    ) {
      const c = column + dx;
      const blend = Math.max(0, Math.abs(dx) - SPAWN_FLAT);
      heights[c] = base +
        Math.trunc(((heights[c] - base) * blend) / SPAWN_RAMP);
    }
  }
  return {
    seed,
    heights,
    rigs: { host: newRig(host), guest: newRig(guest) },
    wind: windFor(seed, 0),
    moves: 0,
    lastShot: null,
  };
}

export function turn(state: State): Side {
  return state.moves % 2 === 0 ? "host" : "guest";
}

function other(side: Side): Side {
  return side === "host" ? "guest" : "host";
}

/** A rig may not climb a step taller than MAX_STEP, leave the map, or reach the other rig. */
export function reachable(state: State, dx: number): boolean {
  if (!Number.isInteger(dx) || Math.abs(dx) > MAX_MOVE) return false;
  const side = turn(state);
  const from = state.rigs[side].column;
  const to = from + dx;
  if (to < 0 || to >= COLUMNS) return false;
  const blocker = state.rigs[other(side)].column;
  const step = dx < 0 ? -1 : 1;
  for (let c = from; c !== to; c += step) {
    if (c + step === blocker) return false;
    if (Math.abs(state.heights[c + step] - state.heights[c]) > MAX_STEP) {
      return false;
    }
  }
  return true;
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

function fly(
  heights: number[],
  rigs: Record<Side, Rig>,
  shooter: Side,
  angle: number,
  power: number,
  wind: number,
): {
  path: { x: number; y: number }[];
  blast: { x: number; y: number } | null;
} {
  const start = rigs[shooter].column;
  const speed = power * SPEED_PER_POWER;
  let x = start * FP + (FP >> 1);
  let y = (heights[start] + RIG_HEIGHT) * FP;
  let vx = Math.trunc((speed * cos(angle)) / 1024);
  let vy = Math.trunc((speed * sin(angle)) / 1024);
  let armed = false;
  const path = [{ x: start, y: y >> FP_SHIFT }];
  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    vy -= GRAVITY;
    if (tick % WIND_EVERY === 0) vx += wind;
    const fromX = x;
    const fromY = y;
    // A fast shell crosses more than one column a tick, so walk the tick in
    // sub-column steps: sampling only its end would let it pass through a wall
    // or blow up at the top of one it clipped low down. The last step lands on
    // vx and vy exactly, so an uninterrupted flight is unchanged.
    const steps = (Math.max(Math.abs(vx), Math.abs(vy)) >> FP_SHIFT) + 1;
    for (let step = 1; step <= steps; step++) {
      x = fromX + Math.trunc((vx * step) / steps);
      y = fromY + Math.trunc((vy * step) / steps);
      if (x < 0 || x >= COLUMNS * FP) return { path, blast: null };
      const col = x >> FP_SHIFT;
      const row = y >> FP_SHIFT;
      const here = { x: col, y: row };
      if (step === steps) path.push(here);
      for (const side of ["host", "guest"] as const) {
        const rig = rigs[side];
        const base = heights[rig.column];
        const inside = Math.abs(col - rig.column) <= RIG_HALF_WIDTH &&
          row >= base && row < base + RIG_HEIGHT;
        if (side === shooter && !armed) {
          if (!inside) armed = true;
          continue;
        }
        if (inside) {
          if (step !== steps) path.push(here);
          return { path, blast: here };
        }
      }
      if (row < heights[col]) {
        if (step !== steps) path.push(here);
        return { path, blast: { x: col, y: Math.max(0, row) } };
      }
    }
  }
  return { path, blast: null };
}

/** Largest s >= 0 with (dx/rx)^2 + (s/ry)^2 <= 1, or -1 outside the ellipse. */
function halfHeight(dx: number, rx: number, ry: number): number {
  const budget = rx * rx * ry * ry - dx * dx * ry * ry;
  if (budget < 0) return -1;
  let s = 0;
  while ((s + 1) * (s + 1) * rx * rx <= budget) s++;
  return s;
}

function detonate(
  heights: number[],
  rigs: Record<Side, Rig>,
  weapon: Weapon,
  at: { x: number; y: number },
): void {
  const blast = BLASTS[weapon];
  const reach2 = blast.reach * blast.reach;
  for (const rig of Object.values(rigs)) {
    const dx = rig.column - at.x;
    const dy = heights[rig.column] + 1 - at.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= reach2) continue;
    const damage = Math.trunc((blast.damage * (reach2 - d2)) / reach2);
    rig.hp = Math.max(0, rig.hp - damage);
  }
  for (let dx = -blast.rx; dx <= blast.rx; dx++) {
    const c = at.x + dx;
    if (c < 0 || c >= COLUMNS) continue;
    const s = halfHeight(dx, blast.rx, blast.ry);
    if (s < 0) continue;
    const h = heights[c];
    if (blast.raise) {
      heights[c] = Math.min(MAX_HEIGHT, h + s);
    } else {
      const removed = Math.min(h, at.y + s + 1) - Math.max(0, at.y - s);
      heights[c] = h - Math.max(0, removed);
    }
  }
}

export function play(state: State, move: Move): State | null {
  const { dx, angle, power, weapon } = move;
  if (outcome(state) !== null) return null;
  if (!reachable(state, dx)) return null;
  if (!inRange(angle, 0, 180) || !inRange(power, 0, 100)) return null;
  if (!WEAPONS.includes(weapon)) return null;
  const side = turn(state);
  if (weapon !== "packet" && state.rigs[side].ammo[weapon] <= 0) return null;

  const heights = [...state.heights];
  const rigs: Record<Side, Rig> = {
    host: { ...state.rigs.host, ammo: { ...state.rigs.host.ammo } },
    guest: { ...state.rigs.guest, ammo: { ...state.rigs.guest.ammo } },
  };
  const shooter = rigs[side];
  shooter.column += dx;
  if (weapon !== "packet") shooter.ammo[weapon]--;

  const angles = weapon === "burst"
    ? [angle - BURST_SPREAD, angle, angle + BURST_SPREAD].map((a) =>
      Math.min(180, Math.max(0, a))
    )
    : [angle];
  const flights = angles.map((a) =>
    fly(heights, rigs, side, a, power, state.wind)
  );
  const blasts = flights.flatMap((f) => f.blast ? [f.blast] : []);
  for (const at of blasts) detonate(heights, rigs, weapon, at);

  const moves = state.moves + 1;
  return {
    seed: state.seed,
    heights,
    rigs,
    wind: windFor(state.seed, moves),
    moves,
    lastShot: { weapon, angle, paths: flights.map((f) => f.path), blasts },
  };
}

export function outcome(state: State): Side | "draw" | null {
  const hostDown = state.rigs.host.hp <= 0;
  const guestDown = state.rigs.guest.hp <= 0;
  if (hostDown && guestDown) return "draw";
  if (hostDown) return "guest";
  if (guestDown) return "host";
  return null;
}

export function checksum(state: State): number {
  const rig = (r: Rig) => [
    r.column,
    r.hp,
    r.ammo.burst,
    r.ammo.drill,
    r.ammo.firewall,
  ];
  return crc8(
    Uint8Array.from([
      ...state.heights,
      ...rig(state.rigs.host),
      ...rig(state.rigs.guest),
      state.wind & 0xff,
      state.moves & 0xff,
      (state.moves >> 8) & 0xff,
    ]),
  );
}

const GOLDEN_SEED = 173;
const GOLDEN_MOVES: Move[] = [
  { dx: 4, angle: 50, power: 70, weapon: "packet" },
  { dx: -3, angle: 130, power: 72, weapon: "burst" },
  { dx: 0, angle: 45, power: 78, weapon: "drill" },
  { dx: 6, angle: 125, power: 66, weapon: "firewall" },
  { dx: -5, angle: 60, power: 81, weapon: "burst" },
  { dx: 2, angle: 140, power: 75, weapon: "packet" },
  { dx: 1, angle: 38, power: 90, weapon: "firewall" },
  { dx: -8, angle: 118, power: 64, weapon: "drill" },
  { dx: 0, angle: 70, power: 97, weapon: "packet" },
  { dx: 0, angle: 90, power: 30, weapon: "packet" },
];

/** Final state of a fixed replay; its checksum must match in every browser engine. */
export function goldenState(): State {
  let state = initialState(GOLDEN_SEED);
  for (const move of GOLDEN_MOVES) {
    const next = play(state, move);
    if (!next) throw new Error(`golden move ${state.moves} was rejected`);
    state = next;
  }
  return state;
}

export function goldenChecksum(): number {
  return checksum(goldenState());
}
