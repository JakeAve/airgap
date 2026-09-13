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

type Height = (hex: Hex) => number;

/** Stack heights with `moving` lifted out, so its own hex reads as the level it stands on. */
function heights(state: State, moving: number): Height {
  return (hex) => {
    const stack = stackAt(state, hex);
    return stack.includes(moving) ? stack.length - 1 : stack.length;
  };
}

/**
 * A climbing step is gated when both hexes beside it stand taller than the
 * step's start and end, and adrift when all four are ground level.
 */
function climbs(height: Height, from: Hex, dir: number): boolean {
  const to = height(neighbour(from, dir));
  const left = height(neighbour(from, (dir + 5) % 6));
  const right = height(neighbour(from, (dir + 1) % 6));
  const gated = Math.min(left, right) > Math.max(height(from), to);
  const adrift = height(from) + to + left + right === 0;
  return !gated && !adrift;
}

function heatsinkMoves(state: State, piece: number, from: Hex): Hex[] {
  const height = heights(state, piece);
  const out: Hex[] = [];
  for (let dir = 0; dir < 6; dir++) {
    if (climbs(height, from, dir)) out.push(neighbour(from, dir));
  }
  return out;
}

function probeMoves(state: State, piece: number, from: Hex): Hex[] {
  const height = heights(state, piece);
  const found = new Map<string, Hex>();
  for (let a = 0; a < 6; a++) {
    const one = neighbour(from, a);
    if (height(one) === 0 || !climbs(height, from, a)) continue;
    for (let b = 0; b < 6; b++) {
      const two = neighbour(one, b);
      if (height(two) === 0 || !climbs(height, one, b)) continue;
      for (let c = 0; c < 6; c++) {
        const to = neighbour(two, c);
        if (height(to) > 0 || key(to) === key(from)) continue;
        if (climbs(height, two, c)) found.set(key(to), to);
      }
    }
  }
  return [...found.values()];
}

function copiedKinds(state: State, from: Hex): Set<Kind> {
  const kinds = new Set<Kind>();
  for (let dir = 0; dir < 6; dir++) {
    const top = topOf(state, neighbour(from, dir));
    if (top !== undefined && kindOf(top) !== "fpga") kinds.add(kindOf(top));
  }
  return kinds;
}

function destinations(
  state: State,
  piece: number,
  from: Hex,
  kind: Kind,
): Hex[] {
  switch (kind) {
    case "heatsink":
      return heatsinkMoves(state, piece, from);
    case "probe":
      return probeMoves(state, piece, from);
    case "fpga": {
      if (stackAt(state, from).length > 1) {
        return heatsinkMoves(state, piece, from);
      }
      const found = new Map<string, Hex>();
      for (const copied of copiedKinds(state, from)) {
        for (const to of destinations(state, piece, from, copied)) {
          found.set(key(to), to);
        }
      }
      return [...found.values()];
    }
  }
  const ground = new Set(state.stacks.keys());
  ground.delete(key(from));
  switch (kind) {
    case "motherboard":
    case "crane":
      return groundSteps(ground, from);
    case "packet":
      return packetMoves(ground, from);
    case "clock":
      return clockMoves(ground, from);
    case "jumper":
      return jumperMoves(ground, from);
  }
}

function throwsFrom(state: State, piece: number, hub: Hex): boolean {
  if (stackAt(state, hub).length > 1) return false;
  const kind = kindOf(piece);
  return kind === "crane" ||
    (kind === "fpga" && copiedKinds(state, hub).has("crane"));
}

/** Lift an unstacked neighbour over the hub and drop it on an empty hex beside the hub. */
function throws(state: State, hub: Hex): Move[] {
  const out: Move[] = [];
  for (let dir = 0; dir < 6; dir++) {
    const at = neighbour(hub, dir);
    const stack = stackAt(state, at);
    if (stack.length !== 1) continue;
    const piece = stack[0];
    if (state.last?.piece === piece || !canLift(state, at)) continue;
    const height = heights(state, piece);
    if (!climbs(height, at, (dir + 3) % 6)) continue;
    for (let drop = 0; drop < 6; drop++) {
      const to = neighbour(hub, drop);
      if (height(to) > 0 || key(to) === key(at)) continue;
      if (climbs(height, hub, drop)) out.push({ piece, to, thrown: true });
    }
  }
  return out;
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
  const thrown = new Map<string, Move>();
  for (const piece of mine) {
    const from = hexOf(state, piece)!;
    if (topOf(state, from) !== piece) continue;
    const frozen = state.last?.thrown === true && state.last.piece === piece;
    if (!frozen && canLift(state, from)) {
      for (const to of destinations(state, piece, from, kindOf(piece))) {
        out.push({ piece, to, thrown: false });
      }
    }
    if (throwsFrom(state, piece, from)) {
      for (const m of throws(state, from)) {
        thrown.set(`${m.piece}@${key(m.to)}`, m);
      }
    }
  }
  return [...out, ...thrown.values()];
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
