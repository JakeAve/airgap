export type Side = "dark" | "light";

export interface Piece {
  side: Side;
  king: boolean;
}

export type Board = (Piece | null)[];

export interface State {
  board: Board;
  moves: number;
}

/**
 * path[0] is the moving piece's square; captures are the jumped squares, empty
 * for a step.
 */
export interface Move {
  path: number[];
  captures: number[];
}

const SQUARES = 32;
const SIDE_LENGTH = 8;
const MEN = 12;

const KING_DIRS = [0, 1, 2, 3];
const MAN_DIRS: Record<Side, number[]> = { dark: [2, 3], light: [0, 1] };
const CROWN_ROW: Record<Side, number> = { dark: 7, light: 0 };

function row(square: number): number {
  return square >> 2;
}

function column(square: number): number {
  return ((square & 3) << 1) + (row(square) % 2 === 0 ? 1 : 0);
}

function onBoard(square: number): boolean {
  return Number.isInteger(square) && square >= 0 && square < SQUARES;
}

export function initialState(): State {
  const board: Board = new Array(SQUARES).fill(null);
  for (let i = 0; i < MEN; i++) board[i] = { side: "dark", king: false };
  for (let i = SQUARES - MEN; i < SQUARES; i++) {
    board[i] = { side: "light", king: false };
  }
  return { board, moves: 0 };
}

export function turn(state: State): Side {
  return state.moves % 2 === 0 ? "dark" : "light";
}

/**
 * dir 0..3 = up-left, up-right, down-left, down-right with row 0 at the top;
 * null off the board.
 */
export function hop(
  square: number,
  dir: number,
  distance: 1 | 2,
): number | null {
  if (!onBoard(square) || !Number.isInteger(dir) || dir < 0 || dir > 3) {
    return null;
  }
  const r = row(square) + (dir < 2 ? -distance : distance);
  const c = column(square) + (dir % 2 === 0 ? -distance : distance);
  if (r < 0 || r >= SIDE_LENGTH || c < 0 || c >= SIDE_LENGTH) return null;
  return r * 4 + (c >> 1);
}

/** Inverse of hop: null unless `to` is one diagonal step or jump from `from`. */
export function direction(
  from: number,
  to: number,
): { dir: number; distance: 1 | 2 } | null {
  if (!onBoard(from) || !onBoard(to)) return null;
  const dr = row(to) - row(from);
  const dc = column(to) - column(from);
  const distance = Math.abs(dr);
  if (distance !== Math.abs(dc) || (distance !== 1 && distance !== 2)) {
    return null;
  }
  return { dir: (dr < 0 ? 0 : 2) + (dc < 0 ? 0 : 1), distance };
}

function dirsFor(piece: Piece): number[] {
  return piece.king ? KING_DIRS : MAN_DIRS[piece.side];
}

function crowns(piece: Piece, square: number): boolean {
  return !piece.king && row(square) === CROWN_ROW[piece.side];
}

function extend(
  board: Board,
  piece: Piece,
  path: number[],
  captures: number[],
  out: Move[],
): void {
  const square = path[path.length - 1];
  let extended = false;
  for (const dir of dirsFor(piece)) {
    const over = hop(square, dir, 1);
    const landing = hop(square, dir, 2);
    if (over === null || landing === null) continue;
    const victim = board[over];
    if (!victim || victim.side === piece.side) continue;
    if (captures.includes(over)) continue;
    if (board[landing] !== null && landing !== path[0]) continue;
    extended = true;
    path.push(landing);
    captures.push(over);
    if (crowns(piece, landing)) {
      out.push({ path: [...path], captures: [...captures] });
    } else {
      extend(board, piece, path, captures, out);
    }
    path.pop();
    captures.pop();
  }
  if (!extended && captures.length > 0) {
    out.push({ path: [...path], captures: [...captures] });
  }
}

export function legalMoves(state: State): Move[] {
  const side = turn(state);
  const jumps: Move[] = [];
  const steps: Move[] = [];
  for (let square = 0; square < SQUARES; square++) {
    const piece = state.board[square];
    if (!piece || piece.side !== side) continue;
    extend(state.board, piece, [square], [], jumps);
    if (jumps.length > 0) continue;
    for (const dir of dirsFor(piece)) {
      const landing = hop(square, dir, 1);
      if (landing === null || state.board[landing] !== null) continue;
      steps.push({ path: [square, landing], captures: [] });
    }
  }
  return jumps.length > 0 ? jumps : steps;
}

/** The legal move whose path is exactly this one, else null. */
export function findMove(state: State, path: number[]): Move | null {
  return legalMoves(state).find((move) =>
    move.path.length === path.length &&
    move.path.every((square, i) => square === path[i])
  ) ?? null;
}

export function apply(state: State, move: Move): State {
  const board = state.board.slice();
  const from = move.path[0];
  const to = move.path[move.path.length - 1];
  const piece = board[from]!;
  board[from] = null;
  for (const square of move.captures) board[square] = null;
  board[to] = crowns(piece, to) ? { side: piece.side, king: true } : piece;
  return { board, moves: state.moves + 1 };
}

/**
 * The winner once the side to move has no legal move (which covers no pieces),
 * else null.
 */
export function outcome(state: State): Side | null {
  if (legalMoves(state).length > 0) return null;
  return turn(state) === "dark" ? "light" : "dark";
}
