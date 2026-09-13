import type { QrMatrix } from "@/lib/transports/qr/qrEncoder.ts";
import { QR_COLORS } from "@/lib/transports/qr/rasterize.ts";
import { aborted } from "@/lib/transport.ts";

const QUIET_MODULES = 4;
const MODULE_PX = 8;

export function drawQr(
  matrix: QrMatrix,
  canvas: HTMLCanvasElement,
  colors = QR_COLORS,
): void {
  const modules = matrix.length;
  const size = (modules + QUIET_MODULES * 2) * MODULE_PX;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colors.module;
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!matrix[y][x]) continue;
      ctx.fillRect(
        (x + QUIET_MODULES) * MODULE_PX,
        (y + QUIET_MODULES) * MODULE_PX,
        MODULE_PX,
        MODULE_PX,
      );
    }
  }
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

/** Shows one code, or cycles several, until the signal aborts. */
export async function showQrCodes(
  codes: QrMatrix[],
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  intervalMs = 1500,
): Promise<void> {
  let index = 0;
  drawQr(codes[0], canvas);
  const timer = codes.length > 1
    ? setInterval(() => {
      index = (index + 1) % codes.length;
      drawQr(codes[index], canvas);
    }, intervalMs)
    : undefined;
  await aborted(signal);
  if (timer !== undefined) clearInterval(timer);
  clearCanvas(canvas);
}
