export type Side = "host" | "guest";

export type Kind =
  | "motherboard"
  | "clock"
  | "heatsink"
  | "jumper"
  | "packet"
  | "fpga"
  | "probe"
  | "crane";

export const SLOTS: readonly Kind[] = [
  "motherboard",
  "clock",
  "clock",
  "heatsink",
  "heatsink",
  "jumper",
  "jumper",
  "jumper",
  "packet",
  "packet",
  "packet",
  "fpga",
  "probe",
  "crane",
];

export const PIECES_PER_SIDE = 14;

export function pieceId(side: Side, slot: number): number {
  return (side === "host" ? 0 : PIECES_PER_SIDE) + slot;
}

export function sideOf(piece: number): Side {
  return piece < PIECES_PER_SIDE ? "host" : "guest";
}

export function kindOf(piece: number): Kind {
  return SLOTS[piece % PIECES_PER_SIDE];
}

function other(side: Side): Side {
  return side === "host" ? "guest" : "host";
}

export interface Hex {
  q: number;
  r: number;
}

export function key(hex: Hex): string {
  return `${hex.q},${hex.r}`;
}

function parse(key: string): Hex {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/** Flat-top hexes, clockwise from the upper-right edge. */
const DIRS: readonly Hex[] = [
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
];

export function neighbour(hex: Hex, dir: number): Hex {
  const d = DIRS[dir];
  return { q: hex.q + d.q, r: hex.r + d.r };
}

/** Inverse of neighbour: null unless `to` is adjacent to `from`. */
export function direction(from: Hex, to: Hex): number | null {
  const dir = DIRS.findIndex((d) =>
    from.q + d.q === to.q && from.r + d.r === to.r
  );
  return dir === -1 ? null : dir;
}

export interface Options {
  fpga: boolean;
  probe: boolean;
  crane: boolean;
}

export interface State {
  options: Options;
  /** Hex key to the pieces there, bottom to top. */
  stacks: Map<string, number[]>;
  moves: number;
  toMove: Side;
  last: { piece: number; thrown: boolean } | null;
}

/** A placement moves a piece that is not yet in play. */
export interface Move {
  piece: number;
  to: Hex;
  thrown: boolean;
}

export function initialState(options: Options): State {
  return { options, stacks: new Map(), moves: 0, toMove: "host", last: null };
}

function stackAt(state: State, hex: Hex): number[] {
  return state.stacks.get(key(hex)) ?? [];
}

function topOf(state: State, hex: Hex): number | undefined {
  return stackAt(state, hex).at(-1);
}

export function hexOf(state: State, piece: number): Hex | null {
  for (const [k, stack] of state.stacks) {
    if (stack.includes(piece)) return parse(k);
  }
  return null;
}

export function inPlay(state: State, side: Side): number[] {
  const out: number[] = [];
  for (const stack of state.stacks.values()) {
    for (const piece of stack) if (sideOf(piece) === side) out.push(piece);
  }
  return out.sort((a, b) => a - b);
}

export function turn(state: State): Side {
  return state.toMove;
}

function enabled(options: Options, kind: Kind): boolean {
  return kind in options ? options[kind as keyof Options] : true;
}

function tray(state: State, side: Side): number[] {
  const placed = inPlay(state, side);
  return SLOTS.flatMap((kind, slot) => {
    const piece = pieceId(side, slot);
    return placed.includes(piece) || !enabled(state.options, kind)
      ? []
      : [piece];
  });
}

function placements(state: State, side: Side): Hex[] {
  if (state.stacks.size === 0) return [{ q: 0, r: 0 }];
  const first = inPlay(state, side).length === 0;
  const found = new Map<string, Hex>();
  for (const k of state.stacks.keys()) {
    for (let dir = 0; dir < 6; dir++) {
      const hex = neighbour(parse(k), dir);
      if (state.stacks.has(key(hex)) || found.has(key(hex))) continue;
      const touching = new Set<Side>();
      for (let d = 0; d < 6; d++) {
        const top = topOf(state, neighbour(hex, d));
        if (top !== undefined) touching.add(sideOf(top));
      }
      if (first || (touching.has(side) && !touching.has(other(side)))) {
        found.set(key(hex), hex);
      }
    }
  }
  return [...found.values()];
}

function connected(hexes: Set<string>): boolean {
  const [start] = hexes;
  if (start === undefined) return true;
  const seen = new Set([start]);
  const queue = [parse(start)];
  while (queue.length > 0) {
    const hex = queue.pop()!;
    for (let dir = 0; dir < 6; dir++) {
      const next = neighbour(hex, dir);
      if (hexes.has(key(next)) && !seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return seen.size === hexes.size;
}

/** One Hive: a piece on top of a stack always lifts; a bridge does not. */
function canLift(state: State, hex: Hex): boolean {
  if (stackAt(state, hex).length > 1) return true;
  const rest = new Set(state.stacks.keys());
  rest.delete(key(hex));
  return connected(rest);
}

/**
 * A ground slide needs exactly one of the two hexes beside the step occupied:
 * both is the gate, neither loses contact with the hive.
 */
function slides(ground: Set<string>, from: Hex, dir: number): boolean {
  if (ground.has(key(neighbour(from, dir)))) return false;
  const left = ground.has(key(neighbour(from, (dir + 5) % 6)));
  const right = ground.has(key(neighbour(from, (dir + 1) % 6)));
  return left !== right;
}

function groundSteps(ground: Set<string>, from: Hex): Hex[] {
  const out: Hex[] = [];
  for (let dir = 0; dir < 6; dir++) {
    if (slides(ground, from, dir)) out.push(neighbour(from, dir));
  }
  return out;
}

function packetMoves(ground: Set<string>, from: Hex): Hex[] {
  const seen = new Map<string, Hex>([[key(from), from]]);
  const queue = [from];
  while (queue.length > 0) {
    for (const next of groundSteps(ground, queue.pop()!)) {
      if (seen.has(key(next))) continue;
      seen.set(key(next), next);
      queue.push(next);
    }
  }
  seen.delete(key(from));
  return [...seen.values()];
}

function clockMoves(ground: Set<string>, from: Hex): Hex[] {
  const found = new Map<string, Hex>();
  const walk = (hex: Hex, path: Set<string>, left: number) => {
    if (left === 0) {
      found.set(key(hex), hex);
      return;
    }
    for (const next of groundSteps(ground, hex)) {
      if (path.has(key(next))) continue;
      walk(next, new Set(path).add(key(next)), left - 1);
    }
  };
  walk(from, new Set([key(from)]), 3);
  return [...found.values()];
}

function jumperMoves(ground: Set<string>, from: Hex): Hex[] {
  const out: Hex[] = [];
  for (let dir = 0; dir < 6; dir++) {
    let hex = neighbour(from, dir);
    if (!ground.has(key(hex))) continue;
    while (ground.has(key(hex))) hex = neighbour(hex, dir);
    out.push(hex);
  }
  return out;
}

function heatsinkMoves(state: State, from: Hex): Hex[] {
  const height = (hex: Hex) => stackAt(state, hex).length;
  const out: Hex[] = [];
  for (let dir = 0; dir < 6; dir++) {
    const to = neighbour(from, dir);
    const left = height(neighbour(from, (dir + 5) % 6));
    const right = height(neighbour(from, (dir + 1) % 6));
    const gated =
      Math.min(left, right) > Math.max(height(from) - 1, height(to));
    const adrift = height(from) === 1 && height(to) === 0 && left + right === 0;
    if (!gated && !adrift) out.push(to);
  }
  return out;
}

function destinations(state: State, piece: number, from: Hex): Hex[] {
  const kind = kindOf(piece);
  if (kind === "heatsink") return heatsinkMoves(state, from);
  const ground = new Set(state.stacks.keys());
  ground.delete(key(from));
  switch (kind) {
    case "motherboard":
      return groundSteps(ground, from);
    case "packet":
      return packetMoves(ground, from);
    case "clock":
      return clockMoves(ground, from);
    case "jumper":
      return jumperMoves(ground, from);
    default:
      return [];
  }
}

function movesFor(state: State, side: Side): Move[] {
  const out: Move[] = [];
  const mine = inPlay(state, side);
  const motherboardDown = mine.some((p) => kindOf(p) === "motherboard");
  const turnNumber = mine.length + 1;
  for (const to of placements(state, side)) {
    for (const piece of tray(state, side)) {
      const motherboard = kindOf(piece) === "motherboard";
      if (!motherboardDown && turnNumber === 1 && motherboard) continue;
      if (!motherboardDown && turnNumber >= 4 && !motherboard) continue;
      out.push({ piece, to, thrown: false });
    }
  }
  if (!motherboardDown) return out;
  for (const piece of mine) {
    const from = hexOf(state, piece)!;
    if (topOf(state, from) !== piece || !canLift(state, from)) continue;
    for (const to of destinations(state, piece, from)) {
      out.push({ piece, to, thrown: false });
    }
  }
  return out;
}

function surrounded(state: State, side: Side): boolean {
  const hex = hexOf(state, pieceId(side, 0));
  if (hex === null) return false;
  for (let dir = 0; dir < 6; dir++) {
    if (!state.stacks.has(key(neighbour(hex, dir)))) return false;
  }
  return true;
}

export function legalMoves(state: State): Move[] {
  if (surrounded(state, "host") || surrounded(state, "guest")) return [];
  return movesFor(state, state.toMove);
}

export function findMove(state: State, move: Move): Move | null {
  return legalMoves(state).find((m) =>
    m.piece === move.piece && m.thrown === move.thrown &&
    m.to.q === move.to.q && m.to.r === move.to.r
  ) ?? null;
}

export function apply(state: State, move: Move): State {
  const stacks = new Map(state.stacks);
  const from = hexOf(state, move.piece);
  if (from !== null) {
    const rest = stackAt(state, from).filter((p) => p !== move.piece);
    if (rest.length > 0) stacks.set(key(from), rest);
    else stacks.delete(key(from));
  }
  stacks.set(key(move.to), [...(stacks.get(key(move.to)) ?? []), move.piece]);
  const next: State = {
    ...state,
    stacks,
    moves: state.moves + 1,
    toMove: other(state.toMove),
    last: { piece: move.piece, thrown: move.thrown },
  };
  return legalMoves(next).length > 0 ? next : { ...next, toMove: state.toMove };
}

/**
 * The side whose opponent's Motherboard is surrounded; "draw" when both are,
 * or when neither side has a move.
 */
export function outcome(state: State): Side | "draw" | null {
  const hostLost = surrounded(state, "host");
  const guestLost = surrounded(state, "guest");
  if (hostLost && guestLost) return "draw";
  if (hostLost) return "guest";
  if (guestLost) return "host";
  if (
    movesFor(state, "host").length === 0 &&
    movesFor(state, "guest").length === 0
  ) return "draw";
  return null;
}
