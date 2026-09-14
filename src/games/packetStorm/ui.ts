import {
  mountTurnPage,
  type TurnGame,
  type TurnPage,
} from "@/games/turnPage.ts";
import type { Role } from "@/games/turn.ts";
import {
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
const BLAST_MS = 450;
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
  };
}

function shotDuration(state: State): number {
  const ticks = Math.max(
    0,
    ...(state.lastShot?.paths ?? []).map((p) => p.length),
  );
  return ticks * MS_PER_TICK;
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
  ctx.clearRect(0, 0, width, height);
  if (view === "guest" && state.moves === 0) return;

  const sx = width / COLUMNS;
  const sy = height / VIEW_HEIGHT;
  const px = (x: number) => x * sx;
  const py = (y: number) => height - y * sy;
  const palette = colors();

  const elapsed = now - animationStart;
  const flight = shotDuration(state);
  const animating = !!state.lastShot && !stillMotion.matches &&
    elapsed < flight + BLAST_MS;
  const ground = animating && before && elapsed < flight ? before : state;

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
    ctx.fillStyle = color;
    ctx.fillRect(
      px(column - RIG_HALF_WIDTH),
      py(base + RIG_HEIGHT),
      (RIG_HALF_WIDTH * 2 + 1) * sx,
      RIG_HEIGHT * sy,
    );
    if (side === local) {
      const radians = (Number(angleInput.value) * Math.PI) / 180;
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
      const tip = py(base + RIG_HEIGHT + BARREL + 3);
      ctx.beginPath();
      ctx.moveTo(x0 - 2 * sx, tip - 3 * sy);
      ctx.lineTo(x0 + 2 * sx, tip - 3 * sy);
      ctx.lineTo(x0, tip);
      ctx.fill();
    }
  }

  if (!animating || !state.lastShot) return;
  const shooter: Side = state.moves % 2 === 1 ? "host" : "guest";
  const shotColor = palette[shooter];
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
      ctx.fillRect(px(head.x) - sx, py(head.y) - sy, 3 * sx, 2 * sy);
    }
  }
  if (elapsed >= flight) {
    const t = (elapsed - flight) / BLAST_MS;
    ctx.strokeStyle = shotColor;
    ctx.lineWidth = Math.max(1, 2 * dpr);
    ctx.globalAlpha = 1 - t;
    for (const blast of state.lastShot.blasts) {
      ctx.beginPath();
      ctx.arc(
        px(blast.x + 0.5),
        py(blast.y),
        (2 + 10 * t) * sx,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  frame = requestAnimationFrame(draw);
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
    dx = 0;
    animationStart = performance.now();
  }
  renderHud(state);
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
