import {
  mountTurnPage,
  type TurnGame,
  type TurnPage,
} from "@/games/turnPage.ts";
import type { Role } from "@/games/turn.ts";
import {
  BLASTS,
  checksum,
  COLUMNS,
  initialState,
  MAX_MOVE,
  outcome,
  play,
  reachable,
  RIG_HALF_WIDTH,
  RIG_HEIGHT,
  type Side,
  type State,
  turn,
  type Weapon,
  WEAPONS,
} from "./logic.ts";
import { decodeMove, encodeMove } from "./codec.ts";

const VIEW_HEIGHT = 128;
const BLOCK = 4;
const MS_PER_TICK = 8;
const BLAST_MS = 1100;
const MUZZLE_MS = 140;
const SHAKE_MS = 320;
const WRECK_DELAY_MS = 260;
const DEBRIS = 28;
const GRAVITY = 90;
const BARREL = 5;
const POWER_PER_UNIT = 2;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const field = $<HTMLCanvasElement>("field");
const waiting = $("waiting");
const desync = $("desync");
const angleInput = $<HTMLInputElement>("angle");
const powerInput = $<HTMLInputElement>("power");
const leftButton = $<HTMLButtonElement>("left");
const rightButton = $<HTMLButtonElement>("right");
const fireButton = $<HTMLButtonElement>("fire");
const stillMotion = matchMedia("(prefers-reduced-motion: reduce)");

const weaponButtons = WEAPONS.map((weapon) => {
  const button = document.createElement("button");
  button.onclick = () => {
    selected = weapon;
    refresh();
  };
  $("weapons").append(button);
  return button;
});

let page: TurnPage<State> | undefined = undefined;
let view: Role = "host";
let shown: State | undefined;
let before: State | undefined;
let animationStart = 0;
let frame = 0;
let dx = 0;
let selected: Weapon = "packet";
let hudTimer = 0;
const START_AIM: Record<Side, number> = { host: 45, guest: 135 };
const aim: Record<Side, number> = { ...START_AIM };

interface Boom {
  x: number;
  y: number;
  r: number;
  at: number;
  side: Side;
}

const noise = (n: number) => {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
};

function colors() {
  const css = getComputedStyle(document.body);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    host: token("--x"),
    guest: token("--o"),
    ground: token("--line"),
    top: token("--dim"),
    seam: token("--surface"),
    path: token("--fg"),
    debris: token("--muted"),
    hostCore: token("--x-core"),
    guestCore: token("--o-core"),
    mono: token("--font-mono"),
  };
}

function shotDuration(state: State): number {
  const ticks = Math.max(
    0,
    ...(state.lastShot?.paths ?? []).map((p) => p.length),
  );
  return ticks * MS_PER_TICK;
}

const shooterOf = (state: State): Side =>
  state.moves % 2 === 1 ? "host" : "guest";

/** Every explosion the last shot sets off: one per blast at impact, then a bigger one for each rig it destroyed. */
function explosions(state: State, flight: number): Boom[] {
  const shot = state.lastShot;
  if (!shot) return [];
  const side = shooterOf(state);
  const r = Math.max(5, BLASTS[shot.weapon].reach);
  const booms = shot.blasts.map((b) => ({ ...b, r, at: flight, side }));
  for (const victim of ["host", "guest"] as const) {
    const rig = state.rigs[victim];
    if (rig.hp > 0 || !before || before.rigs[victim].hp <= 0) continue;
    booms.push({
      x: rig.column,
      y: state.heights[rig.column] + RIG_HEIGHT / 2,
      r: 14,
      at: flight + WRECK_DELAY_MS,
      side: victim,
    });
  }
  return booms;
}

function draw(now: number) {
  frame = 0;
  const state = shown;
  if (!state) return;
  const dpr = devicePixelRatio || 1;
  const width = Math.round(field.clientWidth * dpr);
  const height = Math.round(field.clientHeight * dpr);
  if (field.width !== width) field.width = width;
  if (field.height !== height) field.height = height;
  const ctx = field.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (view === "guest" && state.moves === 0) return;

  const sx = width / COLUMNS;
  const sy = height / VIEW_HEIGHT;
  const px = (x: number) => x * sx;
  const py = (y: number) => height - y * sy;
  const palette = colors();

  const elapsed = now - animationStart;
  const flight = shotDuration(state);
  const booms = explosions(state, flight);
  const end = Math.max(flight, ...booms.map((b) => b.at + BLAST_MS));
  const animating = !!state.lastShot && !stillMotion.matches && elapsed < end;
  const ground = animating && before && elapsed < flight ? before : state;
  const sinceImpact = elapsed - flight;

  if (
    animating && sinceImpact >= 0 && sinceImpact < SHAKE_MS &&
    state.lastShot?.weapon !== "firewall"
  ) {
    const quake = 1.5 * (1 - sinceImpact / SHAKE_MS);
    ctx.setTransform(
      1,
      0,
      0,
      1,
      Math.sin(elapsed * 0.9) * quake * sx,
      Math.cos(elapsed * 1.3) * quake * sy,
    );
  }

  ctx.fillStyle = palette.ground;
  ground.heights.forEach((h, c) =>
    ctx.fillRect(px(c), py(h), sx + 0.5, h * sy)
  );
  ctx.fillStyle = palette.top;
  ground.heights.forEach((h, c) => ctx.fillRect(px(c), py(h), sx + 0.5, sy));
  ctx.strokeStyle = palette.seam;
  ctx.lineWidth = Math.max(1, dpr * 0.75);
  ctx.beginPath();
  for (let c = BLOCK; c < COLUMNS; c += BLOCK) {
    ctx.moveTo(px(c), height);
    ctx.lineTo(px(c), 0);
  }
  for (let y = BLOCK; y < VIEW_HEIGHT; y += BLOCK) {
    ctx.moveTo(0, py(y));
    ctx.lineTo(width, py(y));
  }
  ctx.stroke();

  const local: Side = view;
  const aiming = page?.canMove() && turn(state) === local;
  for (const side of ["host", "guest"] as const) {
    const column = ground.rigs[side].column +
      (aiming && side === local ? dx : 0);
    const base = ground.heights[column];
    const color = palette[side];
    const hit = animating && !!before &&
      state.rigs[side].hp < before.rigs[side].hp &&
      sinceImpact >= 0 && sinceImpact % 180 < 90 && sinceImpact < 360;
    ctx.globalAlpha = ground.rigs[side].hp <= 0 ? 0.3 : 1;
    ctx.fillStyle = hit ? palette.path : color;
    ctx.fillRect(
      px(column - RIG_HALF_WIDTH),
      py(base + RIG_HEIGHT),
      (RIG_HALF_WIDTH * 2 + 1) * sx,
      RIG_HEIGHT * sy,
    );
    const radians =
      ((side === local ? Number(angleInput.value) : aim[side]) * Math.PI) / 180;
    const x0 = px(column + 0.5);
    const y0 = py(base + RIG_HEIGHT);
    ctx.strokeStyle = color;
    ctx.lineWidth = sy;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(
      x0 + Math.cos(radians) * BARREL * sx,
      y0 - Math.sin(radians) * BARREL * sy,
    );
    ctx.stroke();
    if (side === local) {
      const tip = py(base + RIG_HEIGHT + BARREL + 3);
      ctx.beginPath();
      ctx.moveTo(x0 - 2 * sx, tip - 3 * sy);
      ctx.lineTo(x0 + 2 * sx, tip - 3 * sy);
      ctx.lineTo(x0, tip);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (!animating || !state.lastShot) return;
  const shooter = shooterOf(state);
  const shotColor = palette[shooter];
  const muzzle = state.lastShot.paths[0]?.[0];
  if (muzzle && elapsed < MUZZLE_MS) {
    ctx.globalAlpha = 1 - elapsed / MUZZLE_MS;
    ctx.fillStyle = palette[`${shooter}Core`];
    ctx.shadowColor = shotColor;
    ctx.shadowBlur = 12 * dpr;
    ctx.beginPath();
    ctx.arc(px(muzzle.x + 0.5), py(muzzle.y), 3 * sx, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  const ticks = Math.floor(elapsed / MS_PER_TICK);
  ctx.strokeStyle = palette.path;
  ctx.fillStyle = shotColor;
  ctx.lineWidth = Math.max(1, dpr);
  for (const path of state.lastShot.paths) {
    const shownTicks = Math.min(path.length, ticks + 1);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    path.slice(0, shownTicks).forEach((p, i) =>
      i === 0
        ? ctx.moveTo(px(p.x + 0.5), py(p.y))
        : ctx.lineTo(px(p.x + 0.5), py(p.y))
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (elapsed < flight && shownTicks < path.length) {
      const head = path[shownTicks - 1];
      ctx.shadowColor = shotColor;
      ctx.shadowBlur = 8 * dpr;
      ctx.fillRect(px(head.x) - sx, py(head.y) - sy, 3 * sx, 2 * sy);
      ctx.shadowBlur = 0;
    }
  }
  for (const boom of booms) {
    const t = (elapsed - boom.at) / BLAST_MS;
    if (t >= 0 && t < 1) drawBoom(ctx, boom, t);
  }
  if (before && sinceImpact >= 0 && sinceImpact < BLAST_MS) {
    const t = sinceImpact / BLAST_MS;
    ctx.font = `600 ${Math.round(13 * dpr)}px ${palette.mono}`;
    ctx.textAlign = "center";
    ctx.globalAlpha = t < 0.6 ? 1 : (1 - t) / 0.4;
    for (const side of ["host", "guest"] as const) {
      const lost = before.rigs[side].hp - state.rigs[side].hp;
      if (lost <= 0) continue;
      const column = state.rigs[side].column;
      ctx.fillStyle = palette.path;
      ctx.shadowColor = palette[side];
      ctx.shadowBlur = 8 * dpr;
      ctx.fillText(
        `-${lost}`,
        px(column + 0.5),
        py(state.heights[column] + RIG_HEIGHT + 6 + 12 * t),
      );
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  frame = requestAnimationFrame(draw);

  /** One explosion at t from 0 to 1: a white-hot flash, a fireball, a shockwave ring, then ground chunks and sparks falling under gravity. */
  function drawBoom(ctx: CanvasRenderingContext2D, boom: Boom, t: number) {
    const cx = px(boom.x + 0.5);
    const cy = py(boom.y);
    const r = boom.r * sx;
    const color = palette[boom.side];
    const core = palette[`${boom.side}Core`];
    const circle = (radius: number) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    };

    const seconds = (t * BLAST_MS) / 1000;
    ctx.globalAlpha = 1 - t;
    for (let i = 0; i < DEBRIS; i++) {
      const seed = boom.x * 31 + boom.y * 17 + i * 7.1;
      const angle = Math.PI * (0.1 + 0.8 * noise(seed));
      const speed = boom.r * (3 + 6 * noise(seed + 3.3));
      const x = boom.x + 0.5 + Math.cos(angle) * speed * seconds;
      const y = boom.y + Math.sin(angle) * speed * seconds -
        (GRAVITY * seconds * seconds) / 2;
      const spark = i % 3 === 0;
      const size = spark ? 1.5 : 2;
      ctx.fillStyle = spark ? core : palette.debris;
      ctx.fillRect(px(x), py(y), size * sx, size * sy);
    }

    ctx.shadowColor = color;
    ctx.shadowBlur = 16 * dpr;
    if (t < 0.5) {
      ctx.globalAlpha = 0.8 * (1 - t / 0.5);
      ctx.fillStyle = color;
      circle(r * (0.5 + t));
      ctx.fill();
    }
    if (t < 0.22) {
      ctx.globalAlpha = 1 - t / 0.22;
      ctx.fillStyle = core;
      circle(r * (0.5 + 1.2 * t));
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = (1 - t) * (1 - t);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 2 * dpr);
    circle(r * (0.3 + 1.7 * (1 - (1 - t) ** 3)));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}

function refresh() {
  const state = shown;
  if (!state) return;
  const live = !!page?.canMove();
  if (selected !== "packet" && state.rigs[view].ammo[selected] <= 0) {
    selected = "packet";
  }
  weaponButtons.forEach((button, i) => {
    const weapon = WEAPONS[i];
    const mine = state.rigs[view].ammo[weapon];
    button.textContent = `${weapon} ${weapon === "packet" ? "∞" : mine}`;
    button.disabled = !live || (weapon !== "packet" && mine <= 0);
    button.setAttribute("aria-pressed", String(weapon === selected));
  });
  angleInput.disabled = !live;
  powerInput.disabled = !live;
  leftButton.disabled = !live || !reachable(state, dx - 1);
  rightButton.disabled = !live || !reachable(state, dx + 1);
  fireButton.disabled = !live;
  $("angle-value").textContent = `${angleInput.value}°`;
  $("power-value").textContent = powerInput.value;
  $("move-value").textContent = `move ${dx > 0 ? "+" : ""}${dx}`;
  schedule();
}

function renderHud(state: State) {
  const hidden = view === "guest" && state.moves === 0;
  waiting.hidden = !hidden;
  for (const side of ["host", "guest"] as const) {
    const hp = hidden ? 100 : state.rigs[side].hp;
    $(`${side}-bar`).style.setProperty("--hp", `${hp}%`);
    $(`${side}-hp`).textContent = String(hp);
    $(`${side}-you`).textContent = side === view ? "· you" : "";
  }
  const wind = state.wind;
  $("wind").textContent = hidden
    ? "–"
    : wind === 0
    ? "calm"
    : `${wind > 0 ? "→" : "←"} ${Math.abs(wind)}`;
}

function render(state: State, role: Role) {
  if (role !== view || state.moves === 0 && state !== shown) {
    angleInput.value = role === "host" ? "45" : "135";
  }
  view = role;
  if (state.moves === 0) desync.hidden = true;
  if (state !== shown) {
    before = state.moves === 1
      ? initialState(state.seed)
      : shown?.moves === state.moves - 1
      ? shown
      : undefined;
    shown = state;
    if (state.moves === 0) Object.assign(aim, START_AIM);
    if (state.lastShot) aim[shooterOf(state)] = state.lastShot.angle;
    dx = 0;
    animationStart = performance.now();
    clearTimeout(hudTimer);
    if (state.lastShot && !stillMotion.matches) {
      hudTimer = setTimeout(() => {
        hudTimer = 0;
        renderHud(state);
      }, shotDuration(state));
    } else {
      hudTimer = 0;
    }
  }
  if (!hudTimer) renderHud(state);
  refresh();
}

function aimAt(event: PointerEvent) {
  const state = shown;
  if (!state || !page?.canMove()) return;
  const rect = field.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * COLUMNS;
  const y = (1 - (event.clientY - rect.top) / rect.height) * VIEW_HEIGHT;
  const column = state.rigs[view].column + dx;
  const ox = x - (column + 0.5);
  const oy = y - (state.heights[column] + RIG_HEIGHT);
  const degrees = oy >= 0
    ? Math.round((Math.atan2(oy, ox) * 180) / Math.PI)
    : ox >= 0
    ? 0
    : 180;
  angleInput.value = String(degrees);
  powerInput.value = String(
    Math.min(100, Math.round(Math.hypot(ox, oy) * POWER_PER_UNIT)),
  );
  refresh();
}

field.onpointerdown = (event) => {
  if (!page?.canMove()) return;
  field.setPointerCapture(event.pointerId);
  aimAt(event);
};
field.onpointermove = (event) => {
  if (field.hasPointerCapture(event.pointerId)) aimAt(event);
};
angleInput.oninput = refresh;
powerInput.oninput = refresh;
leftButton.onclick = () => nudge(-1);
rightButton.onclick = () => nudge(1);
new ResizeObserver(schedule).observe(field);

function nudge(step: number) {
  const state = shown;
  if (state && Math.abs(dx + step) <= MAX_MOVE && reachable(state, dx + step)) {
    dx += step;
  }
  refresh();
}

fireButton.onclick = () => {
  const state = page?.state;
  if (!page || !state || !page.canMove()) return;
  page.move(
    encodeMove(
      {
        dx,
        angle: Number(angleInput.value),
        power: Number(powerInput.value),
        weapon: selected,
      },
      checksum(state),
      state.moves === 0 ? state.seed : undefined,
    ),
  );
};

const sideOf = (role: Role): Side => role;

const packetStorm: TurnGame<State> = {
  id: "packetstorm",
  initial: () => initialState(crypto.getRandomValues(new Uint8Array(1))[0]),
  moveCount: (state) => state.moves,
  turn: (state) => turn(state),
  over: (state) => outcome(state) !== null,
  play(state, payload) {
    const decoded = decodeMove(payload);
    if (decoded === null) return null;
    let base = state;
    if (state.moves === 0) {
      if (decoded.seed === undefined) return null;
      base = initialState(decoded.seed);
    }
    if (decoded.checksum !== checksum(base)) {
      desync.hidden = false;
      return null;
    }
    const next = play(base, decoded);
    if (next !== null) desync.hidden = true;
    return next;
  },
  describe(payload) {
    const move = decodeMove(payload);
    return move
      ? `${move.weapon} angle ${move.angle} power ${move.power} move ${move.dx}`
      : "unknown move";
  },
  render,
  result(state, role) {
    const winner = outcome(state);
    if (winner === "draw") return "draw";
    return `${winner} wins, you ${winner === sideOf(role) ? "win" : "lose"}`;
  },
  label: sideOf,
};

page = mountTurnPage(packetStorm);
render(page.state, page.role);
