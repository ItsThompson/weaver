import type {
  WeaverConfig,
  ServiceState,
  ServicesStatusResponse,
} from "@weaver/shared/types";
import { log } from "../utils/logger";

export interface ServiceManagerDeps {
  startWhisper: (modelPath: string) => void;
  waitForWhisperReady: () => Promise<boolean>;
  isWhisperRunning: () => Promise<boolean>;
  stopWhisper: () => void;
  ensureOllamaRunning: (url: string) => Promise<boolean>;
  checkOllamaHealth: (url: string) => Promise<boolean>;
  stopOllama: () => void;
  getDefaultModelPath: () => Promise<string | null>;
  readConfig: () => Promise<{ config: WeaverConfig }>;
}

export interface ServiceManager {
  start: (config: WeaverConfig) => Promise<void>;
  stop: () => Promise<void>;
  getStatus: () => Promise<ServicesStatusResponse>;
  checkHealth: () => Promise<void>;
  startWhisperIfReady: () => Promise<void>;
}

function isTerminal(state: ServiceState): boolean {
  return state === "running" || state === "error" || state === "not_configured";
}

export function createServiceManager(deps: ServiceManagerDeps): ServiceManager {
  let whisperState: ServiceState = "stopped";
  let whisperError: string | undefined;
  let ollamaState: ServiceState = "stopped";
  let ollamaError: string | undefined;
  let lastConfig: WeaverConfig | null = null;

  // Mutex: serializes start/stop to prevent interleaved state transitions
  let pending: Promise<void> = Promise.resolve();

  function serialize(fn: () => Promise<void>): Promise<void> {
    pending = pending.then(fn, fn);
    return pending;
  }

  async function startWhisper(config: WeaverConfig): Promise<void> {
    if (!config.enable_dictation) {
      whisperState = "not_configured";
      whisperError = undefined;
      return;
    }

    const modelPath = await deps.getDefaultModelPath();
    if (!modelPath) {
      whisperState = "not_configured";
      whisperError = undefined;
      return;
    }

    whisperState = "starting";
    whisperError = undefined;
    try {
      deps.startWhisper(modelPath);
      const ready = await deps.waitForWhisperReady();
      if (ready) {
        whisperState = "running";
      } else {
        whisperState = "error";
        whisperError = "Whisper failed to start";
      }
    } catch (err) {
      whisperState = "error";
      whisperError = err instanceof Error ? err.message : String(err);
    }
  }

  async function startOllama(config: WeaverConfig): Promise<void> {
    if (!config.enable_dictation || !config.dictation.llm_cleanup) {
      ollamaState = "not_configured";
      ollamaError = undefined;
      return;
    }

    ollamaState = "starting";
    ollamaError = undefined;
    try {
      const running = await deps.ensureOllamaRunning(
        config.dictation.ollama_url,
      );
      if (running) {
        ollamaState = "running";
      } else {
        ollamaState = "error";
        ollamaError = "Ollama failed to start";
      }
    } catch (err) {
      ollamaState = "error";
      ollamaError = err instanceof Error ? err.message : String(err);
    }
  }

  async function start(config: WeaverConfig): Promise<void> {
    return serialize(async () => {
      lastConfig = config;
      log({
        timestamp: new Date().toISOString(),
        event: "service_manager_start",
        enableDictation: config.enable_dictation,
        llmCleanup: config.dictation.llm_cleanup,
      });
      await Promise.all([startWhisper(config), startOllama(config)]);
    });
  }

  async function stop(): Promise<void> {
    return serialize(async () => {
      deps.stopWhisper();
      deps.stopOllama();
      whisperState = "stopped";
      whisperError = undefined;
      ollamaState = "stopped";
      ollamaError = undefined;
      lastConfig = null;
    });
  }

  async function getStatus(): Promise<ServicesStatusResponse> {
    return {
      ready: isTerminal(whisperState) && isTerminal(ollamaState),
      services: {
        whisper: {
          state: whisperState,
          ...(whisperError && { error: whisperError }),
        },
        ollama: {
          state: ollamaState,
          ...(ollamaError && { error: ollamaError }),
        },
      },
    };
  }

  async function checkHealth(): Promise<void> {
    return serialize(async () => {
      if (whisperState === "running" && !(await deps.isWhisperRunning())) {
        whisperState = "error";
        whisperError = "Whisper process exited unexpectedly";
      }
      if (ollamaState === "running" && lastConfig) {
        const healthy = await deps.checkOllamaHealth(
          lastConfig.dictation.ollama_url,
        );
        if (!healthy) {
          ollamaState = "error";
          ollamaError = "Ollama is no longer reachable";
        }
      }
    });
  }

  async function startWhisperIfReady(): Promise<void> {
    return serialize(async () => {
      const { config } = await deps.readConfig();
      if (!config.enable_dictation) {
        return;
      }
      if (whisperState === "running" || whisperState === "starting") {
        return;
      }

      const modelPath = await deps.getDefaultModelPath();
      if (!modelPath) {
        return;
      }

      lastConfig = config;
      await startWhisper(config);
    });
  }

  return { start, stop, getStatus, checkHealth, startWhisperIfReady };
}
