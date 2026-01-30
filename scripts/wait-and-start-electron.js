// Waits for Vite dev server and compiled Electron main process, then starts Electron.
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORTS_TO_TRY = [5173, 5174, 5175, 5176, 5177, 5178];
const MAIN_JS = "out/main/main.js";
const MAX_WAIT = 30000;
const POLL = 500;

async function findVitePort() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT) {
    for (const port of PORTS_TO_TRY) {
      try {
        await fetch(`http://localhost:${port}`);
        return port;
      } catch {
        // not ready yet
      }
    }
    await new Promise((r) => setTimeout(r, POLL));
  }
  throw new Error("Vite dev server did not start in time");
}

async function waitForMainJs() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT) {
    if (existsSync(MAIN_JS)) return;
    await new Promise((r) => setTimeout(r, POLL));
  }
  throw new Error("Electron main.js was not compiled in time");
}

async function main() {
  const [port] = await Promise.all([findVitePort(), waitForMainJs()]);

  const viteUrl = `http://localhost:${port}`;
  console.log(`Vite ready at ${viteUrl} — launching Electron...`);

  const electronPath = execSync("node -e \"console.log(require('electron'))\"")
    .toString()
    .trim();

  const env = { ...process.env, VITE_DEV_SERVER_URL: viteUrl };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, ["."], {
    stdio: "inherit",
    env,
  });

  child.on("close", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
