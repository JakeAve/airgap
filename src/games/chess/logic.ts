export type Side = "white" | "black";
export type Kind = "k" | "q" | "r" | "b" | "n" | "p";

export interface Piece {
  side: Side;
  kind: Kind;
}

/** 64 squares, rank * 8 + file: a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
export type Board = (Piece | null)[];

export interface Move {
  from: number;
  to: number;
  promotion?: Kind;
}

export type Order =
  | { kind: "move"; move: Move; offer: boolean }
  | { kind: "draw" }
  | { kind: "resign" };

export type Outcome =
  | { kind: "checkmate"; winner: Side }
  | { kind: "resigned"; winner: Side }
  | {
    kind: "draw";
    reason: "stalemate" | "material" | "repetition" | "moves" | "agreed";
  };

export interface State {
  board: Board;
  /** Every order sent or received; the turn is messages % 2. */
  messages: number;
  /** Bits 1 K, 2 Q, 4 k, 8 q. */
  castling: number;
  /** The square a pawn may capture on, this ply only. */
  enPassant: number | null;
  /** Plies since a capture or pawn move. */
  halfmove: number;
  /**
   * positionKey of every position since the last capture or pawn move, newest
   * last; the current position is included.
   */
  history: string[];
  /** The last move carried a draw offer. */
  offered: boolean;
  /** Only ever resigned or agreed; everything else is derived. */
  ended: Outcome | null;
}

const SQUARES = 64;
const FILES = 8;
const RANKS = 8;
const BACK_RANK = "rnbqkbnr";
const PROMOTIONS: Kind[] = ["q", "r", "b", "n"];

const CASTLE_KING: Record<Side, number> = { white: 1, black: 4 };
const CASTLE_QUEEN: Record<Side, number> = { white: 2, black: 8 };
const ROOK_RIGHT = new Map<number, number>([[0, 2], [7, 1], [56, 8], [63, 4]]);
const HOME_RANK: Record<Side, number> = { white: 0, black: 7 };
const PAWN_DIR: Record<Side, number> = { white: 1, black: -1 };

type Step = [number, number];
const ORTHOGONAL: Step[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const DIAGONAL: Step[] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const KING_STEPS: Step[] = [...ORTHOGONAL, ...DIAGONAL];
const KNIGHT_STEPS: Step[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

function rank(square: number): number {
  return square >> 3;
}

function file(square: number): number {
  return square & 7;
}

function other(side: Side): Side {
  return side === "white" ? "black" : "white";
}

function step(square: number, dr: number, df: number): number | null {
  const r = rank(square) + dr;
  const f = file(square) + df;
  if (r < 0 || r >= RANKS || f < 0 || f >= FILES) return null;
  return r * FILES + f;
}

export function squareName(square: number): string {
  return "abcdefgh"[file(square)] + (rank(square) + 1);
}

export function initialState(): State {
  const board: Board = new Array(SQUARES).fill(null);
  for (let f = 0; f < FILES; f++) {
    const kind = BACK_RANK[f] as Kind;
    board[f] = { side: "white", kind };
    board[FILES + f] = { side: "white", kind: "p" };
    board[6 * FILES + f] = { side: "black", kind: "p" };
    board[7 * FILES + f] = { side: "black", kind };
  }
  const state: State = {
    board,
    messages: 0,
    castling: 15,
    enPassant: null,
    halfmove: 0,
    history: [],
    offered: false,
    ended: null,
  };
  return { ...state, history: [positionKey(state)] };
}

export function turn(state: State): Side {
  return state.messages % 2 === 0 ? "white" : "black";
}

export function positionKey(state: State): string {
  const squares = state.board.map((piece) =>
    piece === null
      ? "."
      : piece.side === "white"
      ? piece.kind.toUpperCase()
      : piece.kind
  ).join("");
  return `${squares} ${turn(state)[0]} ${state.castling} ${
    state.enPassant ?? "-"
  }`;
}

function holds(
  board: Board,
  square: number,
  side: Side,
  kinds: Kind[],
): boolean {
  const piece = board[square];
  return piece !== null && piece.side === side && kinds.includes(piece.kind);
}

function slidesTo(
  board: Board,
  square: number,
  steps: Step[],
  side: Side,
  kinds: Kind[],
): boolean {
  for (const [dr, df] of steps) {
    let from = step(square, dr, df);
    while (from !== null) {
      const piece = board[from];
      if (piece !== null) {
        if (piece.side === side && kinds.includes(piece.kind)) return true;
        break;
      }
      from = step(from, dr, df);
    }
  }
  return false;
}

function stepsTo(
  board: Board,
  square: number,
  steps: Step[],
  side: Side,
  kind: Kind,
): boolean {
  return steps.some(([dr, df]) => {
    const from = step(square, dr, df);
    return from !== null && holds(board, from, side, [kind]);
  });
}

function attacked(board: Board, square: number, by: Side): boolean {
  for (const df of [-1, 1]) {
    const from = step(square, -PAWN_DIR[by], df);
    if (from !== null && holds(board, from, by, ["p"])) return true;
  }
  return stepsTo(board, square, KNIGHT_STEPS, by, "n") ||
    stepsTo(board, square, KING_STEPS, by, "k") ||
    slidesTo(board, square, ORTHOGONAL, by, ["r", "q"]) ||
    slidesTo(board, square, DIAGONAL, by, ["b", "q"]);
}

function kingSquare(board: Board, side: Side): number {
  return board.findIndex((piece) =>
    piece !== null && piece.side === side && piece.kind === "k"
  );
}

function pawnMoves(state: State, side: Side, from: number, out: Move[]): void {
  const { board } = state;
  const dir = PAWN_DIR[side];
  const promotes = rank(from) + dir === HOME_RANK[other(side)];
  const push = (to: number) => {
    if (promotes) {
      for (const promotion of PROMOTIONS) out.push({ from, to, promotion });
    } else {
      out.push({ from, to });
    }
  };
  const one = step(from, dir, 0);
  if (one !== null && board[one] === null) {
    push(one);
    const two = step(one, dir, 0);
    if (
      rank(from) === HOME_RANK[side] + dir && two !== null &&
      board[two] === null
    ) {
      out.push({ from, to: two });
    }
  }
  for (const df of [-1, 1]) {
    const to = step(from, dir, df);
    if (to === null) continue;
    const target = board[to];
    if ((target !== null && target.side !== side) || to === state.enPassant) {
      push(to);
    }
  }
}

function stepMoves(
  board: Board,
  side: Side,
  from: number,
  steps: Step[],
  out: Move[],
): void {
  for (const [dr, df] of steps) {
    const to = step(from, dr, df);
    if (to === null) continue;
    const target = board[to];
    if (target === null || target.side !== side) out.push({ from, to });
  }
}

function slideMoves(
  board: Board,
  side: Side,
  from: number,
  steps: Step[],
  out: Move[],
): void {
  for (const [dr, df] of steps) {
    let to = step(from, dr, df);
    while (to !== null) {
      const target = board[to];
      if (target === null || target.side !== side) out.push({ from, to });
      if (target !== null) break;
      to = step(to, dr, df);
    }
  }
}

/** The landing square is checked like any other king move. */
function castlingMoves(
  state: State,
  side: Side,
  from: number,
  out: Move[],
): void {
  const { board } = state;
  const home = HOME_RANK[side] * FILES + 4;
  if (from !== home) return;
  const enemy = other(side);
  if (attacked(board, home, enemy)) return;
  if (
    state.castling & CASTLE_KING[side] &&
    holds(board, home + 3, side, ["r"]) &&
    board[home + 1] === null && board[home + 2] === null &&
    !attacked(board, home + 1, enemy)
  ) {
    out.push({ from, to: home + 2 });
  }
  if (
    state.castling & CASTLE_QUEEN[side] &&
    holds(board, home - 4, side, ["r"]) &&
    board[home - 1] === null && board[home - 2] === null &&
    board[home - 3] === null &&
    !attacked(board, home - 1, enemy)
  ) {
    out.push({ from, to: home - 2 });
  }
}

function pseudoMoves(state: State, side: Side): Move[] {
  const { board } = state;
  const out: Move[] = [];
  for (let from = 0; from < SQUARES; from++) {
    const piece = board[from];
    if (piece === null || piece.side !== side) continue;
    switch (piece.kind) {
      case "p":
        pawnMoves(state, side, from, out);
        break;
      case "n":
        stepMoves(board, side, from, KNIGHT_STEPS, out);
        break;
      case "b":
        slideMoves(board, side, from, DIAGONAL, out);
        break;
      case "r":
        slideMoves(board, side, from, ORTHOGONAL, out);
        break;
      case "q":
        slideMoves(board, side, from, KING_STEPS, out);
        break;
      case "k":
        stepMoves(board, side, from, KING_STEPS, out);
        castlingMoves(state, side, from, out);
        break;
    }
  }
  return out;
}

function play(board: Board, move: Move, enPassant: number | null): Board {
  const next = board.slice();
  const piece = next[move.from]!;
  next[move.from] = null;
  if (piece.kind === "p" && move.to === enPassant) {
    next[move.to - PAWN_DIR[piece.side] * FILES] = null;
  }
  if (piece.kind === "k" && Math.abs(move.to - move.from) === 2) {
    const kingside = move.to > move.from;
    const rookFrom = kingside ? move.to + 1 : move.to - 2;
    const rookTo = kingside ? move.to - 1 : move.to + 1;
    next[rookTo] = next[rookFrom];
    next[rookFrom] = null;
  }
  next[move.to] = move.promotion
    ? { side: piece.side, kind: move.promotion }
    : piece;
  return next;
}

export function legalMoves(state: State): Move[] {
  const side = turn(state);
  const enemy = other(side);
  return pseudoMoves(state, side).filter((move) => {
    const board = play(state.board, move, state.enPassant);
    const king = kingSquare(board, side);
    return king < 0 || !attacked(board, king, enemy);
  });
}

export function inCheck(state: State): boolean {
  const side = turn(state);
  const king = kingSquare(state.board, side);
  return king >= 0 && attacked(state.board, king, other(side));
}

function repetitions(state: State): number {
  const key = positionKey(state);
  return state.history.filter((seen) => seen === key).length;
}

export function claimable(state: State): boolean {
  return repetitions(state) >= 3 || state.halfmove >= 100;
}

function dead(board: Board): boolean {
  const kinds: Kind[] = [];
  const colours = new Set<number>();
  board.forEach((piece, square) => {
    if (piece === null || piece.kind === "k") return;
    kinds.push(piece.kind);
    colours.add((rank(square) + file(square)) & 1);
  });
  if (kinds.length === 0) return true;
  if (kinds.length === 1) return kinds[0] === "b" || kinds[0] === "n";
  return kinds.every((kind) => kind === "b") && colours.size === 1;
}

/** The canonical legal order matching this one, else null. */
export function findOrder(state: State, order: Order): Order | null {
  if (outcome(state) !== null) return null;
  switch (order.kind) {
    case "resign":
      return { kind: "resign" };
    case "draw":
      return state.offered || claimable(state) ? { kind: "draw" } : null;
    case "move": {
      const wanted = order.move;
      const move = legalMoves(state).find((legal) =>
        legal.from === wanted.from && legal.to === wanted.to &&
        (legal.promotion === undefined ||
          legal.promotion === wanted.promotion)
      );
      return move ? { kind: "move", move, offer: order.offer } : null;
    }
  }
}

export function apply(state: State, order: Order): State {
  const messages = state.messages + 1;
  if (order.kind === "draw") {
    return {
      ...state,
      messages,
      offered: false,
      ended: { kind: "draw", reason: "agreed" },
    };
  }
  if (order.kind === "resign") {
    return {
      ...state,
      messages,
      offered: false,
      ended: { kind: "resigned", winner: other(turn(state)) },
    };
  }
  const { move } = order;
  const piece = state.board[move.from]!;
  const pawn = piece.kind === "p";
  const capture = state.board[move.to] !== null ||
    (pawn && move.to === state.enPassant);
  const lost =
    (piece.kind === "k"
      ? CASTLE_KING[piece.side] | CASTLE_QUEEN[piece.side]
      : 0) |
    (ROOK_RIGHT.get(move.from) ?? 0) | (ROOK_RIGHT.get(move.to) ?? 0);
  const doublePush = pawn && Math.abs(move.to - move.from) === 2 * FILES;
  const reset = capture || pawn;
  const next: State = {
    board: play(state.board, move, state.enPassant),
    messages,
    castling: state.castling & ~lost,
    enPassant: doublePush ? move.from + PAWN_DIR[piece.side] * FILES : null,
    halfmove: reset ? 0 : state.halfmove + 1,
    history: state.history,
    offered: order.offer,
    ended: null,
  };
  const key = positionKey(next);
  return { ...next, history: reset ? [key] : [...state.history, key] };
}

export function outcome(state: State): Outcome | null {
  if (state.ended !== null) return state.ended;
  if (legalMoves(state).length === 0) {
    return inCheck(state)
      ? { kind: "checkmate", winner: other(turn(state)) }
      : { kind: "draw", reason: "stalemate" };
  }
  if (dead(state.board)) return { kind: "draw", reason: "material" };
  if (repetitions(state) >= 5) return { kind: "draw", reason: "repetition" };
  if (state.halfmove >= 150) return { kind: "draw", reason: "moves" };
  return null;
}
