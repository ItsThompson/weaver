export interface WeaverBridge {
  resizeMini(height: number): void;
  selectDirectory(): Promise<string | null>;
}

declare global {
  interface Window {
    weaver?: WeaverBridge;
  }
}
