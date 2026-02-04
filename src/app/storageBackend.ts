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

class ElectronStorageBackend implements StorageBackend {
  private cache: Map<string, string | null> = new Map();
  private writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(private api: ElectronAPI) {}

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
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    return null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    this.debouncedWrite(key, value);
  }

  removeItem(key: string): void {
    this.cache.set(key, null);
    this.debouncedDelete(key);
  }

  private debouncedWrite(key: string, value: string): void {
    const existing = this.writeTimers.get(key);
    if (existing) clearTimeout(existing);
    this.writeTimers.set(
      key,
      setTimeout(() => {
        this.api.saveStorage(key, value);
        this.writeTimers.delete(key);
      }, 100)
    );
  }

  private debouncedDelete(key: string): void {
    const existing = this.writeTimers.get(key);
    if (existing) clearTimeout(existing);
    this.writeTimers.set(
      key,
      setTimeout(() => {
        this.api.deleteStorage(key);
        this.writeTimers.delete(key);
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
  "focustree.state",
  "focustree.userName",
  "focustree.developerMode",
  "focustree.virtualClock",
  "focustree.onboarding",
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
