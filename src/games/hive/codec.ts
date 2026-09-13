// Wire layout: piece 5 | ref 5 | dir 3 | thrown 1 | spare 2. A destination is
// named relative to a piece already in play, so the 16 bits never have to hold
// a coordinate. The first move of a game has no reference to point at, so the
// ref field carries the option set instead.

import { BitReader, BitWriter } from "@/lib/bits/mod.ts";
import {
  direction,
  hexOf,
  inPlay,
  key,
  type Kind,
  kindOf,
  type Move,
  neighbour,
  type Options,
  PIECES_PER_SIDE,
  type State,
} from "./logic.ts";

const PIECE_BITS = 5;
const REF_BITS = 5;
const DIR_BITS = 3;
const THROWN_BITS = 1;
const SPARE_BITS = 2;
const PAYLOAD_BYTES = 2;

/** dir 6 puts the mover on top of the reference instead of beside it. */
const ON_TOP = 6;

const PIECE_COUNT = 2 * PIECES_PER_SIDE;
const FPGA_BIT = 1;
const PROBE_BIT = 2;
const CRANE_BIT = 4;

const MARKS: Record<Kind, string> = {
  motherboard: "MB",
  clock: "CK",
  heatsink: "HS",
  jumper: "JP",
  packet: "PK",
  fpga: "FP",
  probe: "PR",
  crane: "CR",
};

function optionBits(options: Options): number {
  return (options.fpga ? FPGA_BIT : 0) | (options.probe ? PROBE_BIT : 0) |
    (options.crane ? CRANE_BIT : 0);
}

function reference(state: State, move: Move): { ref: number; dir: number } {
  const top = state.stacks.get(key(move.to))?.at(-1);
  if (top !== undefined) return { ref: top, dir: ON_TOP };
  for (const piece of [...inPlay(state, "host"), ...inPlay(state, "guest")]) {
    if (piece === move.piece) continue;
    const dir = direction(hexOf(state, piece)!, move.to);
    if (dir !== null) return { ref: piece, dir };
  }
  throw new RangeError(`no piece in play borders ${key(move.to)}`);
}

export function encodeMove(state: State, move: Move): Uint8Array {
  const { ref, dir } = state.moves === 0
    ? { ref: optionBits(state.options), dir: 0 }
    : reference(state, move);
  return new BitWriter()
    .write(move.piece, PIECE_BITS)
    .write(ref, REF_BITS)
    .write(dir, DIR_BITS)
    .write(move.thrown ? 1 : 0, THROWN_BITS)
    .write(0, SPARE_BITS)
    .bytes();
}

interface Fields {
  piece: number;
  ref: number;
  dir: number;
  thrown: boolean;
}

function fields(payload: Uint8Array): Fields | null {
  if (payload.length < PAYLOAD_BYTES) return null;
  const reader = new BitReader(payload);
  const piece = reader.read(PIECE_BITS);
  const ref = reader.read(REF_BITS);
  const dir = reader.read(DIR_BITS);
  const thrown = reader.read(THROWN_BITS) === 1;
  if (piece >= PIECE_COUNT || dir > ON_TOP) return null;
  return { piece, ref, dir, thrown };
}

/** The move, plus the option set when this is the game's first move. */
export function decodeMove(
  state: State,
  payload: Uint8Array,
): { move: Move; options?: Options } | null {
  const read = fields(payload);
  if (read === null) return null;
  const { piece, ref, dir, thrown } = read;
  if (state.moves === 0) {
    return {
      move: { piece, to: { q: 0, r: 0 }, thrown },
      options: {
        fpga: (ref & FPGA_BIT) !== 0,
        probe: (ref & PROBE_BIT) !== 0,
        crane: (ref & CRANE_BIT) !== 0,
      },
    };
  }
  if (ref >= PIECE_COUNT) return null;
  const from = hexOf(state, ref);
  if (from === null) return null;
  return {
    move: { piece, to: dir === ON_TOP ? from : neighbour(from, dir), thrown },
  };
}

export function describeMove(state: State, payload: Uint8Array): string {
  const read = fields(payload);
  if (read === null || decodeMove(state, payload) === null) return "unknown";
  const { piece, ref, dir, thrown } = read;
  const mover = MARKS[kindOf(piece)];
  if (state.moves === 0) return `${mover} placed`;
  const verb = thrown ? "thrown to" : "to";
  const where = dir === ON_TOP ? "top" : `${dir}`;
  return `${mover} ${verb} ${where} of ${MARKS[kindOf(ref)]}`;
}
