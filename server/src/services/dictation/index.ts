export {
  WHISPER_PORT,
  startWhisperServer,
  stopWhisperServer,
  isWhisperServerRunning,
  waitForWhisperReady,
  touchWhisperActivity,
} from "./whisper-server";

export {
  checkOllamaHealth,
  listOllamaModels,
  generateText,
} from "./ollama-client";

export { ensureOllamaRunning, stopOllamaServer } from "./ollama-server";

export { logDictation } from "./history";

export {
  AVAILABLE_MODELS,
  downloadModel,
  listLocalModels,
  getDefaultModelPath,
} from "./model-download";
