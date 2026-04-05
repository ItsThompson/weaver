export interface WeaverBridge {
  resizeMini(height: number): void;
  selectDirectory(): Promise<string | null>;
  startDictation(): Promise<void>;
  stopDictation(): Promise<void>;
  onDictationCommand(callback: (event: unknown, command: string) => void): void;
  copyToClipboard(text: string): void;
  showNotification(title: string, body: string): void;
  sendDictationComplete(text: string): void;
  sendDictationError(message: string): void;
}

/**
 * Augments the global Window interface so that `window.weaver` is recognized
 * by TypeScript without `as any` casts. The `weaver` property is set by the
 * Electron preload script via `contextBridge.exposeInMainWorld` and is
 * undefined when running in a regular browser.
 */
declare global {
  interface Window {
    weaver?: WeaverBridge;
  }
}
