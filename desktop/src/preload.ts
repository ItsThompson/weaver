import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("weaver", {
  resizeMini: (height: number) => ipcRenderer.send("mini-resize", height),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  startDictation: () => ipcRenderer.invoke("dictation-start"),
  stopDictation: () => ipcRenderer.invoke("dictation-stop"),
  onDictationCommand: (callback: (_event: unknown, command: string) => void) =>
    ipcRenderer.on("dictation-command", callback),
  copyToClipboard: (text: string) => ipcRenderer.send("copy-clipboard", text),
  showNotification: (title: string, body: string) =>
    ipcRenderer.send("show-notification", title, body),
  sendDictationComplete: (text: string) =>
    ipcRenderer.send("dictation-complete", text),
  sendDictationError: (message: string) =>
    ipcRenderer.send("dictation-error", message),
});
