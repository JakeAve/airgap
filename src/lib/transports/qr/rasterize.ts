import type { QrMatrix } from "./qrEncoder.ts";
import type { RgbaImage } from "./qrDecoder.ts";

/**
 * The site's transmit amber on its background: an inverted code, which the
 * decoder handles. Shared by the screen adapter and the test rasterizer so the
 * tests and the e2e camera fixture exercise the same colours a phone sees.
 */
export const QR_COLORS = { module: "#ff9f00", background: "#0a0a0b" };

/** The site's receive teal, the guest's colour on the exchange screen. */
export const QR_GUEST_COLORS = { ...QR_COLORS, module: "#34d5c4" };

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Draws a matrix as RGBA pixels in `QR_COLORS` with a quiet zone. */
export function rasterize(
  matrix: QrMatrix,
  scale = 4,
  quietModules = 4,
  colors = QR_COLORS,
): RgbaImage {
  const modules = matrix.length;
  const size = (modules + quietModules * 2) * scale;
  const module = rgb(colors.module);
  const background = rgb(colors.background);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set(background, i);
    data[i + 3] = 255;
  }
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = ((y + quietModules) * scale + dy) * size;
        for (let dx = 0; dx < scale; dx++) {
          data.set(module, (row + (x + quietModules) * scale + dx) * 4);
        }
      }
    }
  }
  return { width: size, height: size, data };
}
