import {
  mountTurnPage,
  type TurnGame,
  type TurnPage,
} from "@/games/turnPage.ts";
import type { Role } from "@/games/turn.ts";
import {
  apply,
  direction,
  findMove,
  type Hex,
  hexOf,
  initialState,
  key,
  type Kind,
  kindOf,
  legalMoves,
  MARKS,
  type Move,
  neighbour,
  type Options,
  outcome,
  parse,
  type Side,
  sideOf,
  SLOTS,
  type State,
  surrounded,
  topOf,
  tray,
  turn,
} from "./logic.ts";
import { decodeMove, describeMove, encodeMove } from "./codec.ts";

const NAMES: Record<Kind, string> = {
  motherboard: "Motherboard",
  clock: "Clock",
  heatsink: "Heatsink",
  jumper: "Jumper",
  packet: "Packet",
  fpga: "FPGA",
  probe: "Probe",
  crane: "Crane",
};

const KINDS = [...new Set(SLOTS)];
const OPTION_KEYS = ["fpga", "probe", "crane"] as const;
const SVG = "http://www.w3.org/2000/svg";
const HEX_INSET = 0.94;
const HEX_PATH = "M" +
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i;
    return `${(HEX_INSET * Math.cos(angle)).toFixed(3)} ${
      (HEX_INSET * Math.sin(angle)).toFixed(3)
    }`;
  }).join("L") + "Z";

const boardEl = document.getElementById("board") as HTMLElement;
const rules = document.getElementById("rules") as HTMLElement;
const trayEl = document.getElementById("tray") as HTMLElement;
const theirsEl = document.getElementById("theirs") as HTMLElement;
const optionInputs = Object.fromEntries(
  OPTION_KEYS.map((k) => [k, document.getElementById(k) as HTMLInputElement]),
) as Record<keyof Options, HTMLInputElement>;

const RULES_KEY = "airgap.swarm";
const savedOptions = JSON.parse(localStorage.getItem(RULES_KEY) ?? "{}");
for (const k of OPTION_KEYS) {
  optionInputs[k].checked = savedOptions[k] ?? true;
  optionInputs[k].onchange = () => {
    localStorage.setItem(RULES_KEY, JSON.stringify(readOptions()));
    if (page?.state.moves === 0) page.restart();
  };
}

const readOptions = (): Options => ({
  fpga: optionInputs.fpga.checked,
  probe: optionInputs.probe.checked,
  crane: optionInputs.crane.checked,
});

const optionsText = (options: Options) => {
  const on = OPTION_KEYS.filter((k) => options[k]).map((k) => NAMES[k]);
  return on.length > 0 ? `with ${on.join(", ")}` : "with base pieces only";
};

const svg = document.createElementNS(SVG, "svg");
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
boardEl.append(svg);

const centre = (hex: Hex) => ({
  x: 1.5 * hex.q,
  y: Math.sqrt(3) * (hex.r + hex.q / 2),
});

const adjacent = (a: Hex | null, b: Hex | null) =>
  a !== null && b !== null && direction(a, b) !== null;

let page: TurnPage<State> | undefined = undefined;
let selected: number | null = null;
let pickup: number | null = null;
/** The state the selection was built on: any other state invalidates it. */
let selectionState: State | undefined;

function trayByKind(state: State, side: Side): Map<Kind, number[]> {
  const out = new Map<Kind, number[]>();
  for (const piece of tray(state, side)) {
    const kind = kindOf(piece);
    out.set(kind, [...(out.get(kind) ?? []), piece]);
  }
  return out;
}

/** The hub the selection throws from, when it is a Crane or an FPGA on the board. */
function hub(state: State): Hex | null {
  if (selected === null) return null;
  const kind = kindOf(selected);
  return kind === "crane" || kind === "fpga" ? hexOf(state, selected) : null;
}

/** Pieces the hub can lift this turn: beside it, dropping beside it. */
function throwable(state: State, hub: Hex): Set<number> {
  return new Set(
    legalMoves(state).filter((m) =>
      m.thrown && adjacent(hub, hexOf(state, m.piece)) && adjacent(hub, m.to)
    ).map((m) => m.piece),
  );
}

function visibleHexes(state: State): Hex[] {
  const seeds = state.stacks.size > 0
    ? [...state.stacks.keys()].map(parse)
    : [{ q: 0, r: 0 }];
  const found = new Map<string, Hex>();
  for (const hex of seeds) {
    found.set(key(hex), hex);
    for (let dir = 0; dir < 6; dir++) {
      const next = neighbour(hex, dir);
      found.set(key(next), next);
    }
  }
  return [...found.values()];
}

function fit(hexes: Hex[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const hex of hexes) {
    const { x, y } = centre(hex);
    minX = Math.min(minX, x - 1);
    maxX = Math.max(maxX, x + 1);
    minY = Math.min(minY, y - 0.87);
    maxY = Math.max(maxY, y + 0.87);
  }
  svg.setAttribute(
    "viewBox",
    `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
  );
}

function text(cls: string, content: string, x = 0, y = 0) {
  const el = document.createElementNS(SVG, "text");
  el.setAttribute("class", cls);
  el.setAttribute("x", `${x}`);
  el.setAttribute("y", `${y}`);
  el.textContent = content;
  return el;
}

function render(state: State, role: Role) {
  if (state !== selectionState) {
    selected = null;
    pickup = null;
  }
  const live = page?.canMove() ?? false;
  const moves = live ? legalMoves(state) : [];
  const from = hub(state);
  const mover = pickup ?? selected;
  const targets = new Set(
    moves.filter((m) =>
      m.piece === mover && m.thrown === (pickup !== null) &&
      (pickup === null || adjacent(from, m.to))
    ).map((m) => key(m.to)),
  );
  const picks = new Set(
    pickup !== null || from === null || !live
      ? []
      : [...throwable(state, from)].map((p) => key(hexOf(state, p)!)),
  );
  const wins = new Set(
    [surrounded(state, "host"), surrounded(state, "guest")].flatMap((hex) =>
      hex ? [key(hex)] : []
    ),
  );
  const hexes = visibleHexes(state);
  fit(hexes);
  svg.replaceChildren();
  for (const hex of hexes) {
    const k = key(hex);
    const stack = state.stacks.get(k) ?? [];
    const piece = stack.at(-1);
    const classes = ["hex"];
    const words: string[] = [];
    if (piece !== undefined) {
      const mine = sideOf(piece) === role;
      classes.push(mine ? "me" : "them");
      words.push(NAMES[kindOf(piece)], mine ? "yours" : "theirs");
      if (stack.length > 1) words.push(`${stack.length} high`);
    } else words.push("empty");
    if (piece !== undefined && piece === mover) classes.push("from");
    if (targets.has(k)) {
      classes.push("to");
      words.push("legal target");
    }
    if (picks.has(k)) {
      classes.push("pick");
      words.push("can be lifted");
    }
    if (wins.has(k)) classes.push("win");
    const tappable = targets.has(k) || picks.has(k) ||
      (piece !== undefined &&
        moves.some((m) => m.piece === piece && !m.thrown));
    const g = document.createElementNS(SVG, "g");
    const { x, y } = centre(hex);
    g.setAttribute("class", classes.join(" "));
    g.setAttribute("transform", `translate(${x} ${y})`);
    if (tappable) {
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
    }
    g.setAttribute("aria-label", words.join(", "));
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", HEX_PATH);
    g.append(path);
    if (piece !== undefined) g.append(text("mono", MARKS[kindOf(piece)]));
    if (stack.length > 1) {
      g.append(text("mono count", `${stack.length}`, 0.45, -0.45));
    }
    if (targets.has(k) && piece === undefined) {
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("class", "dot");
      dot.setAttribute("r", "0.22");
      g.append(dot);
    }
    g.onclick = () => tap(hex);
    g.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        tap(hex);
      }
    };
    svg.append(g);
  }

  const mine = trayByKind(state, role);
  trayEl.replaceChildren(...KINDS.flatMap((kind) => {
    const left = mine.get(kind);
    if (left === undefined) return [];
    const el = document.createElement("button");
    el.textContent = `${MARKS[kind]} ×${left.length}`;
    el.className = selected === left[0] ? "me from" : "me";
    el.disabled = !live || !moves.some((m) => m.piece === left[0]);
    el.setAttribute("aria-label", `${NAMES[kind]}, ${left.length} left`);
    el.onclick = () => trayTap(kind);
    return [el];
  }));
  const theirs = trayByKind(state, role === "host" ? "guest" : "host");
  theirsEl.textContent = KINDS.flatMap((kind) => {
    const left = theirs.get(kind);
    return left === undefined ? [] : [`${MARKS[kind]} ${left.length}`];
  }).join(" · ");

  const over = outcome(state) !== null;
  boardEl.classList.toggle("over", over);
  rules.hidden = state.moves > 0 && !over;
}

function tap(hex: Hex) {
  if (!page?.canMove()) return;
  const state = page.state;
  selectionState = state;
  const piece = topOf(state, hex);
  const mover = pickup ?? selected;
  if (mover !== null) {
    const move = findMove(state, {
      piece: mover,
      to: hex,
      thrown: pickup !== null,
    });
    if (move) {
      send(state, move);
      return;
    }
  }
  const from = hub(state);
  if (
    pickup === null && piece !== undefined && from !== null &&
    throwable(state, from).has(piece)
  ) {
    pickup = piece;
  } else {
    pickup = null;
    selected = piece !== undefined && piece !== selected &&
        legalMoves(state).some((m) => m.piece === piece && !m.thrown)
      ? piece
      : null;
  }
  render(page.state, page.role);
}

function trayTap(kind: Kind) {
  if (!page?.canMove()) return;
  const state = page.state;
  selectionState = state;
  const piece = trayByKind(state, page.role).get(kind)?.[0];
  pickup = null;
  selected = piece === selected ? null : piece ?? null;
  render(page.state, page.role);
}

function send(state: State, move: Move) {
  page?.move(encodeMove(state, move));
  selected = null;
  pickup = null;
  if (page) render(page.state, page.role);
}

const described = new Map<string, string>();
const payloadKey = (payload: Uint8Array) => Array.from(payload).join(",");

const hive: TurnGame<State> = {
  initial: () => initialState(readOptions()),
  moveCount: (state) => state.moves,
  turn: (state) => turn(state),
  over: (state) => outcome(state) !== null,
  play(state, payload) {
    const decoded = decodeMove(state, payload);
    if (decoded === null) return null;
    const suffix = decoded.options ? `, ${optionsText(decoded.options)}` : "";
    described.set(payloadKey(payload), describeMove(state, payload) + suffix);
    const base = decoded.options ? initialState(decoded.options) : state;
    const move = findMove(base, decoded.move);
    if (move === null) return null;
    if (decoded.options) {
      for (const k of OPTION_KEYS) optionInputs[k].checked = decoded.options[k];
    }
    return apply(base, move);
  },
  describe: (payload) => described.get(payloadKey(payload)) ?? "unknown",
  render,
  result(state, role) {
    const winner = outcome(state);
    if (winner === "draw") return "draw";
    return `${winner} wins, you ${winner === role ? "win" : "lose"}`;
  },
  prompt: (state) =>
    legalMoves(state).every((m) => kindOf(m.piece) === "motherboard")
      ? "place your motherboard"
      : "your move",
  label: (role) => role,
};

page = mountTurnPage(hive);
render(page.state, page.role);
