export class BitReader {
  #bytes: Uint8Array;
  #position = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  get remaining(): number {
    return this.#bytes.length * 8 - this.#position;
  }

  get bytePosition(): number {
    return Math.ceil(this.#position / 8);
  }

  /** Reads `bits` bits, most significant bit first. */
  read(bits: number): number {
    if (bits < 0 || bits > 32 || !Number.isInteger(bits)) {
      throw new RangeError(
        `bit width must be an integer in 0..32, got ${bits}`,
      );
    }
    if (bits > this.remaining) {
      throw new RangeError(
        `read of ${bits} bits overruns ${this.remaining} remaining`,
      );
    }
    let value = 0;
    for (let i = 0; i < bits; i++) {
      const byte = this.#bytes[this.#position >> 3];
      const bit = (byte >> (7 - (this.#position & 7))) & 1;
      value = value * 2 + bit;
      this.#position++;
    }
    return value;
  }

  readBytes(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = this.read(8);
    return out;
  }
}
