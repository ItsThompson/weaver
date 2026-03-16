import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("weaver", {
  resizeMini: (height: number) => ipcRenderer.send("mini-resize", height),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
});
