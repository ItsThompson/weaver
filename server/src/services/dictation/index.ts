export {
  WHISPER_PORT,
  startWhisperServer,
  stopWhisperServer,
  isWhisperServerRunning,
  waitForWhisperReady,
} from "./whisper-server";

export {
  checkOllamaHealth,
  listOllamaModels,
  generateText,
} from "./ollama-client";

export { stopOllamaServer } from "./ollama-server";

export { logDictation, readDictationHistory } from "./history";

export {
  AVAILABLE_MODELS,
  downloadModel,
  listLocalModels,
  getDefaultModelPath,
} from "./model-download";
