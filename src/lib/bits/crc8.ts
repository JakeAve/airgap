// CRC-8 with polynomial 0x07 (CRC-8/SMBUS). Check value for "123456789" is 0xF4.

const TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  TABLE[i] = crc;
}

export function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = TABLE[crc ^ b];
  return crc;
}
