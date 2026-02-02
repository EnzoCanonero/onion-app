import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { StorageHandler } from "./storage.js";

let mainWindow: BrowserWindow | null = null;
let storage: StorageHandler;

function getDevIconPath(fileName: "icon.png") {
  return path.join(process.cwd(), "build", fileName);
}

function createWindow() {
  const windowIcon = app.isPackaged ? undefined : getDevIconPath("icon.png");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    icon: windowIcon,
  });

  // In dev, load from Vite dev server; in prod, load built HTML
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  if (!app.isPackaged && process.platform === "darwin") {
    const devIcon = getDevIconPath("icon.png");
    if (fs.existsSync(devIcon)) {
      try {
        app.dock.setIcon(devIcon);
      } catch {
        // ignore dev-only dock icon errors
      }
    }
  }
  storage = new StorageHandler(app.getPath("userData"));

  ipcMain.handle("storage:load", (_event, key: string) => {
    return storage.load(key);
  });

  ipcMain.handle("storage:save", (_event, key: string, data: string) => {
    storage.save(key, data);
  });

  ipcMain.handle("storage:delete", (_event, key: string) => {
    storage.delete(key);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
