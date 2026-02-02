import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = os.homedir();
const platform = process.platform;

const candidates = [];

if (platform === "darwin") {
  const support = path.join(home, "Library", "Application Support");
  candidates.push(
    path.join(support, "OnionOps"),
    path.join(support, "focustree"),
    path.join(support, "Electron")
  );
} else if (platform === "win32") {
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  candidates.push(
    path.join(appData, "OnionOps"),
    path.join(appData, "focustree"),
    path.join(appData, "Electron")
  );
} else {
  const config = path.join(home, ".config");
  candidates.push(
    path.join(config, "OnionOps"),
    path.join(config, "focustree"),
    path.join(config, "Electron")
  );
}

const removed = [];
const attempted = new Set();

for (const base of candidates) {
  const target = path.join(base, "focustree-data");
  if (attempted.has(target)) continue;
  attempted.add(target);
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  removed.push(target);
}

if (removed.length === 0) {
  console.log("No OnionOps data folders found to delete.");
} else {
  console.log("Removed OnionOps data folders:\n" + removed.map((p) => `- ${p}`).join("\n"));
}
