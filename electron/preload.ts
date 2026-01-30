import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  loadStorage: (key: string): Promise<string | null> =>
    ipcRenderer.invoke("storage:load", key),
  saveStorage: (key: string, data: string): Promise<void> =>
    ipcRenderer.invoke("storage:save", key, data),
  deleteStorage: (key: string): Promise<void> =>
    ipcRenderer.invoke("storage:delete", key),
});
