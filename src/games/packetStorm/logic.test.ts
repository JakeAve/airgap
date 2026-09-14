import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  checksum,
  COLUMNS,
  goldenChecksum,
  goldenState,
  initialState,
  MAX_MOVE,
  type Move,
  outcome,
  play,
  reachable,
  RIG_HALF_WIDTH,
  type State,
  turn,
} from "./logic.ts";

function flat(host = 20, guest = 139, height = 40): State {
  const ammo = { packet: 0, burst: 2, drill: 2, firewall: 2 };
  return {
    seed: 7,
    heights: new Array(COLUMNS).fill(height),
    rigs: {
      host: { column: host, hp: 100, ammo: { ...ammo } },
      guest: { column: guest, hp: 100, ammo: { ...ammo } },
    },
    wind: 0,
    moves: 0,
    lastShot: null,
  };
}

const shot: Move = { dx: 0, angle: 45, power: 70, weapon: "packet" };

function upAndDown(state: State, weapon: Move["weapon"] = "packet"): State {
  return play(state, { dx: 0, angle: 90, power: 30, weapon })!;
}

Deno.test("the initial state puts the host left to move and both rigs on the ridge", () => {
  const state = initialState(42);
  assertEquals(turn(state), "host");
  assert(state.rigs.host.column < state.rigs.guest.column);
  assertEquals(state.rigs.host.hp, 100);
  assertEquals(state.rigs.guest.ammo, {
    packet: 0,
    burst: 2,
    drill: 2,
    firewall: 2,
  });
  assertEquals(state.heights.length, COLUMNS);
  assert(state.heights.every((h) => h >= 15 && h <= 85));
  assert(state.wind >= -5 && state.wind <= 5);
  assertEquals(turn(play(state, shot)!), "guest");
});

Deno.test("moves out of range, unreachable, or with bad aim are rejected", () => {
  const state = flat();
  assertEquals(play(state, { ...shot, dx: MAX_MOVE + 1 }), null);
  assertEquals(play(state, { ...shot, dx: -21 }), null);
  assertEquals(play(state, { ...shot, dx: 1.5 }), null);
  assertEquals(play(flat(5), { ...shot, dx: -6 }), null);
  assertEquals(play(state, { ...shot, angle: -1 }), null);
  assertEquals(play(state, { ...shot, angle: 181 }), null);
  assertEquals(play(state, { ...shot, power: -1 }), null);
  assertEquals(play(state, { ...shot, power: 101 }), null);
  assert(play(state, { ...shot, dx: 0 }) !== null);
  assert(play(state, { ...shot, dx: MAX_MOVE }) !== null);

  const cliff = flat();
  cliff.heights[25] = 47;
  assertEquals(reachable(cliff, 10), false);
  assertEquals(reachable(cliff, 4), true);
  cliff.heights[25] = 46;
  assertEquals(reachable(cliff, 10), true);
});

Deno.test("a weapon with no ammo is rejected, and packets never run out", () => {
  const state = flat();
  state.rigs.host.ammo.drill = 0;
  assertEquals(play(state, { ...shot, weapon: "drill" }), null);
  const next = play(state, shot)!;
  assertEquals(next.rigs.host.ammo.packet, 0);
});

Deno.test("a finished game accepts no move", () => {
  const state = flat();
  state.rigs.guest.hp = 0;
  assertEquals(outcome(state), "host");
  assertEquals(play(state, shot), null);
});

Deno.test("the same inputs give deeply equal states", () => {
  const moves: Move[] = [
    shot,
    { dx: -4, angle: 120, power: 75, weapon: "burst" },
    { dx: 3, angle: 60, power: 80, weapon: "drill" },
  ];
  const run = () => moves.reduce((s, m) => play(s, m)!, initialState(99));
  assertEquals(run(), run());
});

Deno.test("a packet lowers the terrain and a firewall raises it", () => {
  const crater = play(flat(), shot)!;
  const [blast] = crater.lastShot!.blasts;
  assert(crater.heights[blast.x] < 40);
  assert(crater.heights.every((h) => h <= 40));

  const mound = play(flat(), { ...shot, weapon: "firewall" })!;
  const [wall] = mound.lastShot!.blasts;
  assert(mound.heights[wall.x] > 40);
  assert(mound.heights.every((h) => h >= 40));
  assertEquals(mound.rigs.host.ammo.firewall, 1);
});

Deno.test("a drill digs deeper and hurts more than a packet", () => {
  const packet = upAndDown(flat());
  const drill = upAndDown(flat(), "drill");
  assert(drill.heights[20] < packet.heights[20]);
  assert(drill.rigs.host.hp < packet.rigs.host.hp);
});

Deno.test("a rig falls into a crater dug under it", () => {
  const state = flat();
  const before = state.heights[state.rigs.guest.column];
  let hit: State | null = null;
  for (let power = 50; power <= 100 && !hit; power++) {
    const next = play(state, { ...shot, power })!;
    const blast = next.lastShot!.blasts[0];
    if (
      blast && Math.abs(blast.x - state.rigs.guest.column) <= RIG_HALF_WIDTH
    ) {
      hit = next;
    }
  }
  assert(hit, "some power lands on the guest");
  assert(hit.rigs.guest.hp < 100);
  assert(hit.heights[hit.rigs.guest.column] < before);
});

Deno.test("a shot through a rig's side columns hits the rig above the ground", () => {
  const state = flat();
  const guest = state.rigs.guest.column;
  const next = play(state, { ...shot, power: 82 })!;
  const [blast] = next.lastShot!.blasts;
  assert(blast.x !== guest);
  assert(Math.abs(blast.x - guest) <= RIG_HALF_WIDTH);
  assert(blast.y >= state.heights[blast.x]);
  assert(next.rigs.guest.hp < 100);
});

Deno.test("a shot straight up comes down on its own rig", () => {
  const next = upAndDown(flat());
  assertEquals(next.lastShot!.blasts.length, 1);
  assert(next.rigs.host.hp < 100);
  assertEquals(next.rigs.guest.hp, 100);
});

Deno.test("damage to zero ends the game, and both at zero is a draw", () => {
  const state = flat();
  state.rigs.host.hp = 10;
  const next = upAndDown(state);
  assertEquals(next.rigs.host.hp, 0);
  assertEquals(outcome(next), "guest");

  const both = flat(20, 22);
  both.rigs.host.hp = 5;
  both.rigs.guest.hp = 5;
  assertEquals(outcome(upAndDown(both)), "draw");
});

Deno.test("a burst spends one ammo and flies three packets", () => {
  const next = play(flat(), { ...shot, weapon: "burst" })!;
  assertEquals(next.rigs.host.ammo.burst, 1);
  assertEquals(next.lastShot!.paths.length, 3);
  assertEquals(next.lastShot!.blasts.length, 3);
});

Deno.test("a shot off the side of the map leaves no blast", () => {
  const next = play(flat(), { ...shot, angle: 170, power: 100 })!;
  assertEquals(next.lastShot!.blasts, []);
  assertEquals(next.heights, flat().heights);
});

Deno.test("play leaves its input untouched", () => {
  const state = initialState(12);
  const copy = structuredClone(state);
  play(state, { dx: 3, angle: 40, power: 70, weapon: "burst" });
  assertEquals(state, copy);
});

Deno.test("the checksum follows the state", () => {
  const state = flat();
  const moved = flat(21);
  assertNotEquals(checksum(state), checksum(moved));
  assert(checksum(state) >= 0 && checksum(state) <= 255);
});

Deno.test("the golden replay matches its recorded checksum and HP", () => {
  assertEquals(goldenChecksum(), 227);
  const state = goldenState();
  assertEquals(state.rigs.host.hp, 100);
  assertEquals(state.rigs.guest.hp, 28);
});
