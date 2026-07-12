export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class LocalStorageBackend implements StorageBackend {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}

interface ElectronAPI {
  loadStorage(key: string): Promise<string | null>;
  saveStorage(key: string, data: string): Promise<void>;
  deleteStorage(key: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

type PendingOp = { kind: "save"; value: string } | { kind: "delete" };

class ElectronStorageBackend implements StorageBackend {
  private cache: Map<string, string | null> = new Map();
  private writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pendingOps: Map<string, PendingOp> = new Map();
  private warnedUnregisteredKeys = new Set<string>();

  constructor(private api: ElectronAPI) {
    // Debounced writes would die with the window; send anything pending over
    // IPC before the renderer goes away.
    const flush = () => this.flushPending();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
  }

  async init(keys: string[]): Promise<void> {
    const results = await Promise.all(
      keys.map(async (key) => {
        const value = await this.api.loadStorage(key);
        return [key, value] as const;
      })
    );
    for (const [key, value] of results) {
      this.cache.set(key, value);
    }
  }

  getItem(key: string): string | null {
    if (!this.cache.has(key)) {
      if (!this.warnedUnregisteredKeys.has(key)) {
        this.warnedUnregisteredKeys.add(key);
        console.warn(
          `Storage key "${key}" is not in PERSISTENT_KEYS; it was not loaded from disk and will read as empty until written this session.`
        );
      }
      return null;
    }
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    this.queueOp(key, { kind: "save", value });
  }

  removeItem(key: string): void {
    this.cache.set(key, null);
    this.queueOp(key, { kind: "delete" });
  }

  flushPending(): void {
    this.writeTimers.forEach((timer) => clearTimeout(timer));
    this.writeTimers.clear();
    const ops = Array.from(this.pendingOps.entries());
    this.pendingOps.clear();
    for (const [key, op] of ops) {
      this.performOp(key, op);
    }
  }

  private performOp(key: string, op: PendingOp): void {
    if (op.kind === "save") this.api.saveStorage(key, op.value);
    else this.api.deleteStorage(key);
  }

  private queueOp(key: string, op: PendingOp): void {
    this.pendingOps.set(key, op);
    const existing = this.writeTimers.get(key);
    if (existing) clearTimeout(existing);
    this.writeTimers.set(
      key,
      setTimeout(() => {
        this.writeTimers.delete(key);
        const pending = this.pendingOps.get(key);
        if (!pending) return;
        this.pendingOps.delete(key);
        this.performOp(key, pending);
      }, 100)
    );
  }
}

let backend: StorageBackend | null = null;

export function getStorageBackend(): StorageBackend {
  if (!backend) throw new Error("StorageBackend not initialized");
  return backend;
}

export async function flushStorageKey(key: string): Promise<void> {
  try {
    if (window.electronAPI) {
      const current = getStorageBackend().getItem(key);
      if (current === null) {
        await window.electronAPI.deleteStorage(key);
      } else {
        await window.electronAPI.saveStorage(key, current);
      }
    }
  } catch {
    // ignore flush errors
  }
}

const PERSISTENT_KEYS = [
  "onion-app.state",
  "onion-app.state.backup",
  "onion-app.state.backupAt",
  "onion-app.state.corrupt",
  "onion-app.userName",
  "onion-app.developerMode",
  "onion-app.virtualClock",
  "onion-app.onboarding",
];

export async function initStorageBackend(): Promise<StorageBackend> {
  if (window.electronAPI) {
    const electron = new ElectronStorageBackend(window.electronAPI);
    await electron.init(PERSISTENT_KEYS);
    backend = electron;
  } else {
    backend = new LocalStorageBackend();
  }
  return backend;
}
