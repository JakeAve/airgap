import { assertEquals, assertThrows } from "@std/assert";
import {
  accepts,
  allSunk,
  canPlace,
  cells,
  fire,
  type Fleet,
  type Game,
  isLegalShot,
  lastResult,
  myTurn,
  newGame,
  outcome,
  randomFleet,
  receiveShot,
  SHIPS,
  shipsLeft,
  shoot,
} from "./logic.ts";
import { REVEAL, SHOT } from "./codec.ts";

/** Rows 0-4, one ship each: 0-4, 10-13, 20-22, 30-32, 40-41. */
const MINE: Fleet = [
  { bow: 0, vertical: false },
  { bow: 10, vertical: false },
  { bow: 20, vertical: false },
  { bow: 30, vertical: false },
  { bow: 40, vertical: false },
];

/** Columns 0-4, one ship each. */
const THEIRS: Fleet = [
  { bow: 0, vertical: true },
  { bow: 1, vertical: true },
  { bow: 2, vertical: true },
  { bow: 3, vertical: true },
  { bow: 4, vertical: true },
];

const fleetCells = (fleet: Fleet) => fleet.flatMap((p, i) => cells(i, p));

Deno.test("cells walks right or down from the bow", () => {
  assertEquals(cells(0, { bow: 0, vertical: false }), [0, 1, 2, 3, 4]);
  assertEquals(cells(0, { bow: 0, vertical: true }), [0, 10, 20, 30, 40]);
  assertEquals(cells(4, { bow: 99, vertical: false }), []);
});

Deno.test("cells is empty when a ship leaves the grid or wraps a row", () => {
  assertEquals(cells(0, { bow: 7, vertical: false }), []);
  assertEquals(cells(0, { bow: 95, vertical: false }), [95, 96, 97, 98, 99]);
  assertEquals(cells(0, { bow: 60, vertical: true }), []);
  assertEquals(cells(0, { bow: 50, vertical: true }), [50, 60, 70, 80, 90]);
  assertEquals(cells(0, { bow: -1, vertical: false }), []);
  assertEquals(cells(0, { bow: 1.5, vertical: false }), []);
});

Deno.test("canPlace rejects overlaps but allows a neighbouring row", () => {
  const fleet = [MINE[0], null, null, null, null];
  assertEquals(canPlace(fleet, 1, { bow: 4, vertical: true }), false);
  assertEquals(canPlace(fleet, 1, { bow: 10, vertical: false }), true);
  assertEquals(canPlace(fleet, 0, MINE[0]), true);
});

Deno.test("randomFleet places every ship legally", () => {
  let seed = 0;
  const random = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) /
    2147483648;
  for (let round = 0; round < 20; round++) {
    const fleet = randomFleet(random);
    assertEquals(fleet.length, SHIPS.length);
    fleet.forEach((p, i) => assertEquals(canPlace(fleet, i, p), true));
    assertEquals(
      new Set(fleetCells(fleet)).size,
      SHIPS.reduce((n, s) => n + s.length, 0),
    );
  }
});

Deno.test("fire reports miss, hit, and sunk with the ship only when sunk", () => {
  assertEquals(fire(MINE, [], 99), { outcome: "miss", ship: null });
  assertEquals(fire(MINE, [], 40), { outcome: "hit", ship: null });
  assertEquals(fire(MINE, [40], 41), { outcome: "sunk", ship: 4 });
  assertEquals(fire(MINE, [30, 31], 32), { outcome: "sunk", ship: 3 });
});

Deno.test("allSunk needs every cell of every ship", () => {
  const all = fleetCells(MINE);
  assertEquals(allSunk(MINE, all), true);
  assertEquals(allSunk(MINE, all.slice(1)), false);
});

Deno.test("the host shoots on an even count", () => {
  const game = newGame(MINE);
  assertEquals(myTurn(game, "host"), true);
  assertEquals(myTurn(game, "guest"), false);
  assertEquals(myTurn(shoot(game, 0), "host"), false);
  assertEquals(myTurn(shoot(game, 0), "guest"), true);
});

Deno.test("isLegalShot rejects repeats, out-of-range, and non-integer cells", () => {
  const game = shoot(newGame(MINE), 5);
  assertEquals(isLegalShot(game, 5), false);
  assertEquals(isLegalShot(game, -1), false);
  assertEquals(isLegalShot(game, 100), false);
  assertEquals(isLegalShot(game, 5.5), false);
  assertEquals(isLegalShot(game, 6), true);
  assertThrows(() => shoot(game, 5));
});

Deno.test("receiveShot resolves my pending shot and records theirs", () => {
  let game = shoot(newGame(MINE), 7);
  game = receiveShot(game, { outcome: "hit", ship: null }, 40);
  assertEquals(game.mine, [{
    cell: 7,
    result: { outcome: "hit", ship: null },
  }]);
  assertEquals(game.theirs, [
    { cell: 40, result: { outcome: "hit", ship: null } },
  ]);
  assertEquals(game.count, 2);
  assertEquals(lastResult(game), { outcome: "hit", ship: null });
});

Deno.test("a full game ends won once the fifth ship sinks", () => {
  let game = newGame(MINE);
  const targets = fleetCells(THEIRS);
  let theirCell = 99;
  for (const cell of targets) {
    assertEquals(myTurn(game, "host"), true);
    assertEquals(outcome(game), null);
    const before = game.mine.map((shot) => shot.cell);
    game = shoot(game, cell);
    game = receiveShot(game, fire(THEIRS, before, cell), theirCell--);
  }
  assertEquals(shipsLeft(game), 0);
  assertEquals(outcome(game), "won");
  assertEquals(game.count, targets.length * 2);
  assertEquals(isLegalShot(game, 50), false);
});

Deno.test("a game is lost once every one of my cells is shot", () => {
  let game: Game = newGame(MINE);
  for (const cell of fleetCells(MINE)) {
    game = receiveShot(game, null, cell);
  }
  assertEquals(outcome(game), "lost");
});

Deno.test("shipsLeft counts down with my sunk results", () => {
  let game = newGame(MINE);
  assertEquals(shipsLeft(game), 5);
  game = receiveShot(shoot(game, 4), { outcome: "sunk", ship: 4 }, 99);
  assertEquals(shipsLeft(game), 4);
});

Deno.test("accepts a shot or reveal whose seq and session match the count", () => {
  assertEquals(accepts(0, 7, { type: SHOT, seq: 0, session: 7 }), true);
  assertEquals(accepts(0, 7, { type: REVEAL, seq: 0, session: 7 }), true);
  assertEquals(accepts(1, 7, { type: SHOT, seq: 1, session: 7 }), true);
  assertEquals(accepts(4, 7, { type: SHOT, seq: 0, session: 7 }), true);
});

Deno.test("accepts rejects a stale seq, a foreign session, and a bad type", () => {
  assertEquals(accepts(1, 7, { type: SHOT, seq: 0, session: 7 }), false);
  assertEquals(accepts(0, 7, { type: SHOT, seq: 0, session: 9 }), false);
  assertEquals(accepts(0, 7, { type: REVEAL + 1, seq: 0, session: 7 }), false);
});

Deno.test("accepts any session at count 0 when ours is unknown", () => {
  assertEquals(
    accepts(0, undefined, { type: SHOT, seq: 0, session: 42 }),
    true,
  );
  assertEquals(
    accepts(1, undefined, { type: SHOT, seq: 1, session: 42 }),
    false,
  );
});

Deno.test("accepts ignores the previous game's session when joining a replay", () => {
  const leg = { type: SHOT, seq: 0, session: 42 };
  assertEquals(accepts(0, undefined, leg, 42), false);
  assertEquals(accepts(0, undefined, leg, 7), true);
});
