import type { Leg } from "@/lib/frames/frames.ts";

export const MOVE = 0;

export type Mark = "X" | "O";
export type Board = (Mark | null)[];

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Board {
  return new Array(9).fill(null);
}

export function moveCount(board: Board): number {
  return board.filter((mark) => mark !== null).length;
}

export function turn(board: Board): Mark {
  return moveCount(board) % 2 === 0 ? "X" : "O";
}

export function winningLine(board: Board): number[] | null {
  return WIN_LINES.find(([a, b, c]) =>
    board[a] && board[a] === board[b] && board[a] === board[c]
  ) ?? null;
}

export function outcome(board: Board): Mark | "draw" | null {
  const line = winningLine(board);
  if (line) return board[line[0]];
  return moveCount(board) === 9 ? "draw" : null;
}

export function isLegal(board: Board, cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < 9 &&
    board[cell] === null && outcome(board) === null;
}

export function play(board: Board, cell: number): Board {
  if (!isLegal(board, cell)) {
    throw new Error(`illegal move: ${cell}`);
  }
  const next = board.slice();
  next[cell] = turn(board);
  return next;
}

/**
 * `previous` is the last game's session: after a replay its final move can
 * still be in the air, and on an empty board it would pass for move 0.
 */
export function accepts(
  board: Board,
  session: number | undefined,
  leg: Leg,
  previous?: number,
): boolean {
  if (leg.type !== MOVE || leg.seq !== moveCount(board) % 4) return false;
  return session === undefined
    ? moveCount(board) === 0 && leg.session !== previous
    : leg.session === session;
}
