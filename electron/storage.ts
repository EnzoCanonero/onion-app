import fs from "node:fs";
import path from "node:path";

export class StorageHandler {
  private dir: string;

  constructor(userDataPath: string) {
    this.dir = path.join(userDataPath, "onion-app-data");
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.dir, `${safe}.json`);
  }

  load(key: string): string | null {
    const fp = this.filePath(key);
    try {
      if (!fs.existsSync(fp)) return null;
      return fs.readFileSync(fp, "utf-8");
    } catch {
      return null;
    }
  }

  save(key: string, data: string): void {
    const fp = this.filePath(key);
    const tmp = fp + ".tmp";
    fs.writeFileSync(tmp, data, "utf-8");
    fs.renameSync(tmp, fp);
  }

  delete(key: string): void {
    const fp = this.filePath(key);
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      // ignore
    }
  }
}
