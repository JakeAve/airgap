import type { QrMatrix } from "./qrEncoder.ts";
import type { RgbaImage } from "./qrDecoder.ts";

/** Draws a matrix as black-on-white RGBA pixels with a quiet zone. */
export function rasterize(
  matrix: QrMatrix,
  scale = 4,
  quietModules = 4,
): RgbaImage {
  const modules = matrix.length;
  const size = (modules + quietModules * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = ((y + quietModules) * scale + dy) * size;
        for (let dx = 0; dx < scale; dx++) {
          const px = (row + (x + quietModules) * scale + dx) * 4;
          data[px] = 0;
          data[px + 1] = 0;
          data[px + 2] = 0;
        }
      }
    }
  }
  return { width: size, height: size, data };
}
