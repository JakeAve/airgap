// Wire layout: hop count 4 | jump 1 | from 5 | dir 2 × count. The jump bit is
// per move, not per hop, because a multi-jump's hops are always the same
// distance (a man or king cannot mix steps and jumps in one move).

import { BitReader, BitWriter } from "@/lib/bits/mod.ts";
import { direction, hop } from "./logic.ts";

const HOP_COUNT_BITS = 4;
const JUMP_BITS = 1;
const FROM_BITS = 5;
const DIR_BITS = 2;
const MAX_HOPS = 2 ** HOP_COUNT_BITS - 1;

export function encodeMove(path: number[]): Uint8Array {
  const hops = path.length - 1;
  if (hops < 1 || hops > MAX_HOPS) {
    throw new RangeError(`path must have 1..${MAX_HOPS} hops, got ${hops}`);
  }
  const dirs: number[] = [];
  let distance: 1 | 2 | undefined;
  for (let i = 0; i < hops; i++) {
    const step = direction(path[i], path[i + 1]);
    if (!step) {
      throw new RangeError(
        `squares ${path[i]} and ${path[i + 1]} are not one diagonal apart`,
      );
    }
    if (distance === undefined) distance = step.distance;
    else if (step.distance !== distance) {
      throw new RangeError("every hop of a move must be the same distance");
    }
    dirs.push(step.dir);
  }
  const writer = new BitWriter()
    .write(hops, HOP_COUNT_BITS)
    .write(distance === 2 ? 1 : 0, JUMP_BITS)
    .write(path[0], FROM_BITS);
  for (const dir of dirs) writer.write(dir, DIR_BITS);
  return writer.bytes();
}

/** The path of squares, or null when the count is 0, a square is off the board, or the payload is too short. */
export function decodeMove(payload: Uint8Array): number[] | null {
  const reader = new BitReader(payload);
  if (reader.remaining < HOP_COUNT_BITS) return null;
  const hops = reader.read(HOP_COUNT_BITS);
  if (hops === 0) return null;
  if (reader.remaining < JUMP_BITS + FROM_BITS + hops * DIR_BITS) return null;
  const distance = reader.read(JUMP_BITS) === 1 ? 2 : 1;
  const path = [reader.read(FROM_BITS)];
  for (let i = 0; i < hops; i++) {
    const next = hop(path[path.length - 1], reader.read(DIR_BITS), distance);
    if (next === null) return null;
    path.push(next);
  }
  return path;
}
