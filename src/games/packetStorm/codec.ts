// Wire layout: dx+31 (6 bits) | angle (8) | power (7) | weapon index (3) |
// checksum (8) | seed (8, first move only). 32 bits = 4 bytes, 40 with seed =
// 5. dx is biased by 31 so it fits unsigned in 6 bits (raw range 0..62); raw
// 63 is out of range and rejected. A payload of 5 or more bytes carries a
// seed because received payloads are zero-padded to whole 2-byte frames, so
// exactly 4 bytes never does.

import { BitReader, BitWriter } from "@/lib/bits/mod.ts";
import { Move, WEAPONS } from "./logic.ts";

const DX_BITS = 6;
const ANGLE_BITS = 8;
const POWER_BITS = 7;
const WEAPON_BITS = 3;
const CHECKSUM_BITS = 8;
const SEED_BITS = 8;
const DX_BIAS = 31;

export interface WireMove extends Move {
  checksum: number;
  seed?: number;
}

export function encodeMove(
  move: Move,
  checksum: number,
  seed?: number,
): Uint8Array {
  const { dx, angle, power, weapon } = move;
  if (!Number.isInteger(dx) || dx < -31 || dx > 31) {
    throw new RangeError(`dx must be an integer in -31..31, got ${dx}`);
  }
  if (!Number.isInteger(angle) || angle < 0 || angle > 180) {
    throw new RangeError(`angle must be an integer in 0..180, got ${angle}`);
  }
  if (!Number.isInteger(power) || power < 0 || power > 100) {
    throw new RangeError(`power must be an integer in 0..100, got ${power}`);
  }
  const weaponIndex = WEAPONS.indexOf(weapon);
  if (weaponIndex < 0) {
    throw new RangeError(`unknown weapon ${weapon}`);
  }
  if (!Number.isInteger(checksum) || checksum < 0 || checksum > 255) {
    throw new RangeError(
      `checksum must be an integer in 0..255, got ${checksum}`,
    );
  }
  if (
    seed !== undefined &&
    (!Number.isInteger(seed) || seed < 0 || seed > 255)
  ) {
    throw new RangeError(`seed must be an integer in 0..255, got ${seed}`);
  }
  const writer = new BitWriter()
    .write(dx + DX_BIAS, DX_BITS)
    .write(angle, ANGLE_BITS)
    .write(power, POWER_BITS)
    .write(weaponIndex, WEAPON_BITS)
    .write(checksum, CHECKSUM_BITS);
  if (seed !== undefined) writer.write(seed, SEED_BITS);
  return writer.bytes();
}

export function decodeMove(payload: Uint8Array): WireMove | null {
  if (payload.length < 4) return null;
  const hasSeed = payload.length >= 5;
  const reader = new BitReader(payload);
  const rawDx = reader.read(DX_BITS);
  if (rawDx > 62) return null;
  const angle = reader.read(ANGLE_BITS);
  if (angle > 180) return null;
  const power = reader.read(POWER_BITS);
  if (power > 100) return null;
  const weaponIndex = reader.read(WEAPON_BITS);
  if (weaponIndex > 3) return null;
  const checksum = reader.read(CHECKSUM_BITS);
  const seed = hasSeed ? reader.read(SEED_BITS) : undefined;
  return {
    dx: rawDx - DX_BIAS,
    angle,
    power,
    weapon: WEAPONS[weaponIndex],
    checksum,
    seed,
  };
}
