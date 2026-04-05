import { BrowserWindow, clipboard, ipcMain, Notification } from "electron";

type DictationState = "idle" | "recording" | "processing";

let state: DictationState = "idle";

function send(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, ...args);
}

function notify(title: string, body: string): void {
  new Notification({ title, body }).show();
}

export function setupDictation(): void {
  ipcMain.on("copy-clipboard", (_e, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.on("show-notification", (_e, title: string, body: string) => {
    notify(title, body);
  });

  ipcMain.handle("dictation-start", () => {
    state = "recording";
    send("dictation-command", "start");
    notify("Weaver Dictation", "Listening...");
  });

  ipcMain.handle("dictation-stop", () => {
    state = "processing";
    send("dictation-command", "stop");
    notify("Weaver Dictation", "Processing...");
  });

  ipcMain.on("dictation-complete", (_e, text: string) => {
    clipboard.writeText(text);
    notify("Weaver Dictation", "Copied to clipboard!");
    state = "idle";
  });

  ipcMain.on("dictation-error", (_e, message: string) => {
    notify("Weaver Dictation", `Error: ${message}`);
    state = "idle";
  });
}

export function handleF4(): void {
  if (state === "idle") {
    send("dictation-command", "start");
    state = "recording";
    notify("Weaver Dictation", "Listening...");
  } else if (state === "recording") {
    send("dictation-command", "stop");
    state = "processing";
    notify("Weaver Dictation", "Processing...");
  }
}
