import { createServiceManager } from "./service-manager";
import {
  startWhisperServer,
  stopWhisperServer,
  waitForWhisperReady,
  isWhisperServerRunning,
} from "./dictation/whisper-server";
import {
  ensureOllamaRunning,
  stopOllamaServer,
} from "./dictation/ollama-server";
import { checkOllamaHealth } from "./dictation/ollama-client";
import { getDefaultModelPath } from "./dictation/model-download";
import { readConfig } from "./config/config";

const whisperBin = process.env.WEAVER_WHISPER_BIN ?? "";

export const serviceManager = createServiceManager({
  startWhisper: (modelPath) => startWhisperServer(whisperBin, modelPath),
  waitForWhisperReady,
  isWhisperRunning: isWhisperServerRunning,
  stopWhisper: stopWhisperServer,
  ensureOllamaRunning,
  checkOllamaHealth,
  stopOllama: stopOllamaServer,
  getDefaultModelPath,
  readConfig,
});
