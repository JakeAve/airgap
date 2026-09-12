// Drives the diagnostics page in headless Chromium with a fake microphone and
// camera fed from fixtures.ts, so the whole path from device to decoded
// message runs without hardware. Expects `deno task build` to have run.
// Set CHROMIUM_PATH to use a Chromium outside Playwright's own cache.
import { serveDir } from "@std/http";
import { join } from "@std/path";
import { chromium } from "playwright";
import { TEXT, writeFixtures } from "./fixtures.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const BASE_PATH = "/airgap";

const fixtures = await writeFixtures(
  await Deno.makeTempDir({ prefix: "airgap-e2e-" }),
);

const server = Deno.serve({ port: 0, onListen() {} }, (req) => {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(`${BASE_PATH}/`)) {
    return new Response("not found", { status: 404 });
  }
  return serveDir(req, {
    fsRoot: DIST,
    urlRoot: BASE_PATH.slice(1),
    quiet: true,
  });
});

const PORT = server.addr.port;

const browser = await chromium.launch({
  executablePath: Deno.env.get("CHROMIUM_PATH"),
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${fixtures.wav}`,
    `--use-file-for-fake-video-capture=${fixtures.y4m}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const failures: string[] = [];
try {
  const context = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => failures.push(`page error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") failures.push(`console error: ${msg.text()}`);
  });

  await page.goto(`http://localhost:${PORT}${BASE_PATH}/diag.html`);
  await page.click("#mic");
  await page.waitForFunction(
    () => document.querySelector("#worker-state")?.textContent === "ready",
    null,
    { timeout: 20_000 },
  );

  const receiveVia = async (label: string, button: string) => {
    await page.click(button);
    try {
      await page.waitForFunction(
        (expected) =>
          document.querySelector("#received-text")?.textContent === expected,
        TEXT,
        { timeout: 30_000 },
      );
      console.log(`${label}: ${await page.textContent("#receive-progress")}`);
    } catch {
      failures.push(`${label}: ${await page.textContent("#receive-progress")}`);
    }
  };
  await receiveVia("receive via sound", "#listen");
  await receiveVia("receive via qr", "#scan");
  await receiveVia("receive via both", "#receive-both");

  // A camera turned on by hand stays rolling: scans reuse it and leave it open.
  await page.click("#cam");
  await page.waitForFunction(
    () => document.querySelector("#cam")?.textContent === "Turn off camera",
    null,
    { timeout: 10_000 },
  );
  await receiveVia("receive via qr with the camera already on", "#scan");
  const stillRolling = await page.evaluate(() =>
    document.querySelector<HTMLVideoElement>("#camera")?.srcObject !== null &&
    document.querySelector("#camera")?.hasAttribute("hidden") === false
  );
  if (stillRolling) console.log("camera: still rolling after the scan");
  else failures.push("camera: closed by a scan that did not open it");
  await page.click("#cam");

  await page.click("#play");
  await page.waitForTimeout(1500);
  await page.click("#play-stop");
  await page.waitForFunction(
    () => document.querySelector("#log")?.textContent?.includes("send stopped"),
    null,
    { timeout: 5_000 },
  );
  console.log("play via sound: stopped cleanly");

  // Transmitting and decoding at once. Sound against sound, because with the
  // camera fixture in view the QR path wins in a tenth of a second and proves
  // nothing: what matters is that the single codec worker still decodes the
  // peer while it encodes for our own speaker. Acoustic self-hearing only
  // happens on real devices; the accept predicate covers it in link.test.ts.
  await page.click("#play");
  await page.click("#listen");
  try {
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#received-text")?.textContent === expected,
      TEXT,
      { timeout: 30_000 },
    );
    console.log(
      `decode while transmitting over sound: ${await page.textContent(
        "#receive-progress",
      )}`,
    );
  } catch {
    failures.push(
      `decode while transmitting over sound: ${await page.textContent(
        "#receive-progress",
      )}`,
    );
  }
  await page.click("#play-stop");

  // The fixture message is a CALL, so a guest-role handshake should hear it and
  // answer. There is no peer to ack, so it can only get as far as replying.
  await page.selectOption("#turn-role", "guest");
  await page.click("#handshake");
  try {
    await page.waitForFunction(
      () =>
        document.querySelector("#log")?.textContent?.includes(
          "call heard at",
        ) === true,
      null,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#log")?.textContent?.includes(
          "reply 1: transmitting",
        ) === true,
      null,
      { timeout: 10_000 },
    );
    console.log("handshake: heard the call and answered it");
  } catch {
    failures.push(
      `handshake: ${await page.textContent("#handshake-progress")}`,
    );
  }
  await page.click("#handshake-stop");
} finally {
  await browser.close();
  await server.shutdown();
}

if (failures.length) {
  console.error("e2e failures:\n" + failures.join("\n"));
  Deno.exit(1);
}
console.log("e2e ok");
