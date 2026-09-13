import { assertEquals, assertThrows } from "@std/assert";
import {
  accepts,
  emptyBoard,
  isLegal,
  MOVE,
  moveCount,
  outcome,
  play,
  turn,
  winningLine,
} from "./logic.ts";

Deno.test("turn alternates starting with X", () => {
  let board = emptyBoard();
  assertEquals(turn(board), "X");
  board = play(board, 0);
  assertEquals(turn(board), "O");
  board = play(board, 1);
  assertEquals(turn(board), "X");
});

Deno.test("play fills the cell with the current turn's mark", () => {
  const board = play(emptyBoard(), 4);
  assertEquals(board[4], "X");
  assertEquals(moveCount(board), 1);
});

Deno.test("isLegal rejects occupied, out-of-range, and non-integer cells", () => {
  const board = play(emptyBoard(), 0);
  assertEquals(isLegal(board, 0), false);
  assertEquals(isLegal(board, -1), false);
  assertEquals(isLegal(board, 9), false);
  assertEquals(isLegal(board, 1.5), false);
  assertEquals(isLegal(board, 1), true);
});

Deno.test("play throws on an illegal move", () => {
  const board = play(emptyBoard(), 0);
  assertThrows(() => play(board, 0));
});

Deno.test("outcome detects a row, column, and diagonal win", () => {
  const row = ["X", "X", "X", null, "O", "O", null, null, null] as const;
  assertEquals(outcome(row.slice()), "X");

  const col = ["O", "X", null, "O", "X", null, "O", null, null] as const;
  assertEquals(outcome(col.slice()), "O");

  const diag = ["X", "O", "O", null, "X", null, null, null, "X"] as const;
  assertEquals(outcome(diag.slice()), "X");
});

Deno.test("winningLine names the three cells of the win, or null", () => {
  const anti = [null, "O", "X", "O", "X", null, "X", null, null] as const;
  assertEquals(winningLine(anti.slice()), [2, 4, 6]);
  assertEquals(winningLine(play(emptyBoard(), 4)), null);
});

Deno.test("outcome is a draw on a full board with no winner", () => {
  const board = ["X", "O", "X", "X", "O", "O", "O", "X", "X"] as const;
  assertEquals(outcome(board.slice()), "draw");
});

Deno.test("outcome is null mid-game, and isLegal is false once decided", () => {
  const board = emptyBoard();
  assertEquals(outcome(board), null);

  const won = ["X", "X", "X", null, "O", "O", null, null, null] as const;
  assertEquals(isLegal(won.slice(), 3), false);
});

Deno.test("accepts a move frame whose seq and session match the awaited move", () => {
  const board = emptyBoard();
  assertEquals(
    accepts(board, 7, { type: MOVE, seq: 0, session: 7 }),
    true,
  );
});

Deno.test("accepts rejects our own echo of the previous move", () => {
  const board = play(emptyBoard(), 0);
  assertEquals(
    accepts(board, 7, { type: MOVE, seq: 0, session: 7 }),
    false,
  );
  assertEquals(
    accepts(board, 7, { type: MOVE, seq: 1, session: 7 }),
    true,
  );
});

Deno.test("accepts rejects a frame from a different session", () => {
  const board = emptyBoard();
  assertEquals(
    accepts(board, 7, { type: MOVE, seq: 0, session: 9 }),
    false,
  );
});

Deno.test("accepts any session on an empty board when ours is unknown", () => {
  const board = emptyBoard();
  assertEquals(
    accepts(board, undefined, { type: MOVE, seq: 0, session: 42 }),
    true,
  );
});

Deno.test("accepts requires an unknown session's board to still be empty", () => {
  const board = play(emptyBoard(), 0);
  assertEquals(
    accepts(board, undefined, { type: MOVE, seq: 1, session: 42 }),
    false,
  );
});

Deno.test("accepts ignores the previous game's session when joining a replay", () => {
  const leg = { type: MOVE, seq: 0, session: 42 };
  assertEquals(accepts(emptyBoard(), undefined, leg, 42), false);
  assertEquals(accepts(emptyBoard(), undefined, leg, 7), true);
});

Deno.test("accepts rejects a non-move frame type", () => {
  const board = emptyBoard();
  assertEquals(
    accepts(board, 7, { type: MOVE + 1, seq: 0, session: 7 }),
    false,
  );
});
