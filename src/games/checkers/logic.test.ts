import { assertEquals } from "@std/assert";
import {
  apply,
  type Board,
  direction,
  findMove,
  hop,
  initialState,
  legalMoves,
  outcome,
  type State,
  turn,
} from "./logic.ts";

function position(
  pieces: Record<number, "d" | "dk" | "l" | "lk">,
  moves = 0,
  mustJump = true,
): State {
  const board: Board = new Array(32).fill(null);
  for (const [square, code] of Object.entries(pieces)) {
    board[Number(square)] = {
      side: code[0] === "d" ? "dark" : "light",
      king: code.length === 2,
    };
  }
  return { board, moves, mustJump };
}

function count(state: State, side: "dark" | "light"): number {
  return state.board.filter((piece) => piece?.side === side).length;
}

Deno.test("the initial state has twelve men a side and dark to move", () => {
  const state = initialState();
  assertEquals(count(state, "dark"), 12);
  assertEquals(count(state, "light"), 12);
  assertEquals(state.board.every((piece) => !piece?.king), true);
  assertEquals(
    state.board.slice(12, 20).every((piece) => piece === null),
    true,
  );
  assertEquals(turn(state), "dark");
  assertEquals(turn(apply(state, findMove(state, [8, 12])!)), "light");
});

Deno.test("a step is not offered when a jump exists", () => {
  const state = position({ 12: "d", 13: "d", 16: "l" });
  const moves = legalMoves(state);
  assertEquals(moves.every((move) => move.captures.length > 0), true);
  assertEquals(findMove(state, [13, 17]), null);
  assertEquals(findMove(state, [12, 21])?.captures, [16]);
});

Deno.test("a step is offered beside a jump when captures are optional", () => {
  const state = position({ 12: "d", 13: "d", 16: "l" }, 0, false);
  assertEquals(findMove(state, [13, 17])?.captures, []);
  assertEquals(findMove(state, [12, 21])?.captures, [16]);
  assertEquals(apply(state, findMove(state, [13, 17])!).mustJump, false);
});

Deno.test("a double jump is one move and the single jump is absent", () => {
  const state = position({ 8: "d", 13: "l", 22: "l" });
  assertEquals(legalMoves(state), [{ path: [8, 17, 26], captures: [13, 22] }]);
  assertEquals(findMove(state, [8, 17]), null);

  const next = apply(state, findMove(state, [8, 17, 26])!);
  assertEquals(next.board[26], { side: "dark", king: false });
  assertEquals(next.board[8], null);
  assertEquals(count(next, "light"), 0);
  assertEquals(next.moves, 1);
});

Deno.test("a man does not capture backward", () => {
  const state = position({ 21: "d", 16: "l" });
  assertEquals(
    legalMoves(state).every((move) => move.captures.length === 0),
    true,
  );
  assertEquals(findMove(state, [21, 12]), null);
  assertEquals(findMove(state, [21, 24])?.captures, []);
});

Deno.test("a king captures backward", () => {
  const state = position({ 21: "dk", 16: "l" });
  assertEquals(legalMoves(state), [{ path: [21, 12], captures: [16] }]);
  assertEquals(apply(state, findMove(state, [21, 12])!).board[16], null);
});

Deno.test("crowning ends a sequence that could otherwise continue", () => {
  const man = position({ 22: "d", 25: "l", 24: "l" });
  assertEquals(legalMoves(man), [{ path: [22, 29], captures: [25] }]);
  assertEquals(apply(man, findMove(man, [22, 29])!).board[29], {
    side: "dark",
    king: true,
  });

  const king = position({ 22: "dk", 25: "l", 24: "l" });
  assertEquals(legalMoves(king), [{ path: [22, 29, 20], captures: [25, 24] }]);
});

Deno.test("a jumped piece leaves the board only after the whole move", () => {
  const state = position({ 22: "dk", 25: "l", 24: "l" });
  const next = apply(state, findMove(state, [22, 29, 20])!);
  assertEquals(count(next, "light"), 0);
  assertEquals(next.board[20], { side: "dark", king: true });
});

Deno.test("outcome names the winner when the mover has pieces but no move", () => {
  const blocked = position({ 12: "d", 16: "l", 21: "l" });
  assertEquals(legalMoves(blocked), []);
  assertEquals(outcome(blocked), "light");
  assertEquals(outcome({ ...blocked, moves: 1 }), null);

  assertEquals(outcome(position({ 20: "l" })), "light");
  assertEquals(outcome(initialState()), null);
});

Deno.test("direction inverts hop for every square, direction, and distance", () => {
  let seen = 0;
  for (let square = 0; square < 32; square++) {
    for (let dir = 0; dir < 4; dir++) {
      for (const distance of [1, 2] as const) {
        const to = hop(square, dir, distance);
        if (to === null) continue;
        seen++;
        assertEquals(direction(square, to), { dir, distance });
      }
    }
  }
  assertEquals(seen > 0, true);
  assertEquals(direction(0, 0), null);
  assertEquals(direction(0, 31), null);
});
