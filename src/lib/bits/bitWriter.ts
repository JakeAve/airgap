export class BitWriter {
  #bytes: number[] = [];
  #current = 0;
  #filled = 0;

  get bitLength(): number {
    return this.#bytes.length * 8 + this.#filled;
  }

  /** Appends the low `bits` bits of `value`, most significant bit first. */
  write(value: number, bits: number): this {
    if (bits < 0 || bits > 32 || !Number.isInteger(bits)) {
      throw new RangeError(
        `bit width must be an integer in 0..32, got ${bits}`,
      );
    }
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** bits) {
      throw new RangeError(`value ${value} does not fit in ${bits} bits`);
    }
    for (let i = bits - 1; i >= 0; i--) {
      const bit = Math.floor(value / 2 ** i) & 1;
      this.#current = (this.#current << 1) | bit;
      this.#filled++;
      if (this.#filled === 8) {
        this.#bytes.push(this.#current);
        this.#current = 0;
        this.#filled = 0;
      }
    }
    return this;
  }

  writeBytes(bytes: Uint8Array): this {
    for (const b of bytes) this.write(b, 8);
    return this;
  }

  /** Returns the written bits, zero-padded to a whole byte. */
  bytes(): Uint8Array {
    const out = new Uint8Array(
      this.#bytes.length + (this.#filled > 0 ? 1 : 0),
    );
    out.set(this.#bytes);
    if (this.#filled > 0) {
      out[this.#bytes.length] = this.#current << (8 - this.#filled);
    }
    return out;
  }
}
