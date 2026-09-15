// Resume-with-QR page: scans on the main thread, no codec worker, because
// this is a plain text URL rather than a wire-protocol frame.
import decodeQR from "qr/decode.js";
import { Camera } from "@/adapters/camera.ts";
import { startApp } from "@/adapters/app.ts";
import type { RgbaImage } from "@/lib/transports/qr/qrDecoder.ts";
import { gameLink } from "@/games/saves.ts";

const MAX_SCAN_EDGE = 1280;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const button = $<HTMLButtonElement>("scan");
const video = $<HTMLVideoElement>("camera");
const status = $<HTMLParagraphElement>("status");

let camera: Camera | undefined;
let scanning: AbortController | undefined;
let navigated = false;

function setStatus(text: string) {
  status.textContent = text;
}

// No `await` in here: decoding and navigating are both synchronous, but
// Camera.scan wants onImage to return a promise so it can back-pressure sync
// and async decoders alike.
function onImage(image: RgbaImage): Promise<void> {
  let text: string;
  try {
    text = decodeQR(image);
  } catch {
    return Promise.resolve();
  }

  const url = gameLink(text, new URL(location.href));
  if (!url) {
    setStatus(`not an Airgap game: ${text.slice(0, 60)}`);
    return Promise.resolve();
  }

  navigated = true;
  scanning?.abort();
  camera?.close();
  location.replace(url.href);
  return Promise.resolve();
}

async function start() {
  button.disabled = true;
  setStatus("starting camera…");
  try {
    camera = await Camera.open(video, "environment");
    video.hidden = false;
    setStatus("point the camera at the other phone's QR code");
    scanning = new AbortController();
    await camera.scan(onImage, scanning.signal, MAX_SCAN_EDGE);
  } catch (err) {
    setStatus(`camera error: ${err}`);
  } finally {
    if (!navigated) {
      camera?.close();
      video.hidden = true;
      button.disabled = false;
    }
  }
}

button.onclick = start;
startApp({ home: false });
