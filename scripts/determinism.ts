// Proves goldenChecksum() is bit-identical across browser engines: bundles
// logic.ts for the browser, runs it in Chromium, Firefox, and WebKit via
// Playwright, and checks the result against Deno's own run (the value
// hard-coded in src/games/packetStorm/logic.test.ts).
import { join } from "@std/path";
import { chromium, firefox, webkit } from "playwright";
import { goldenChecksum } from "@/games/packetStorm/logic.ts";

const ROOT = new URL("..", import.meta.url).pathname;

async function bundle(entry: string, out: string) {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["bundle", "--platform", "browser", "-o", out, entry],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success } = await cmd.output();
  if (!success) throw new Error(`bundle failed for ${entry}`);
}

const tempDir = await Deno.makeTempDir({ prefix: "airgap-determinism-" });
const entry = join(tempDir, "entry.ts");
await Deno.writeTextFile(
  entry,
  `import { goldenChecksum } from ${
    JSON.stringify(join(ROOT, "src/games/packetStorm/logic.ts"))
  };\n(globalThis as unknown as { golden: number }).golden = goldenChecksum();\n`,
);
const bundlePath = join(tempDir, "entry.js");
await bundle(entry, bundlePath);
const script = await Deno.readTextFile(bundlePath);

const expected = goldenChecksum();

const engines = [
  ["chromium", chromium] as const,
  ["firefox", firefox] as const,
  ["webkit", webkit] as const,
];

let failed = false;
for (const [name, launcher] of engines) {
  try {
    const browser = await launcher.launch({
      executablePath: name === "chromium"
        ? Deno.env.get("CHROMIUM_PATH")
        : undefined,
    });
    try {
      const page = await browser.newPage();
      await page.goto("about:blank");
      await page.addScriptTag({ content: script });
      const golden = await page.evaluate(
        () => (globalThis as unknown as { golden: number }).golden,
      );
      console.log(`${name}: ${golden}`);
      if (golden !== expected) failed = true;
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.log(`${name}: launch failed — ${(err as Error).message}`);
    failed = true;
  }
}

await Deno.remove(tempDir, { recursive: true });

if (failed) {
  console.error(`mismatch: expected ${expected}`);
  Deno.exit(1);
}
