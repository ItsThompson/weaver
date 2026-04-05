export {
  WHISPER_PORT,
  startWhisperServer,
  stopWhisperServer,
  isWhisperServerRunning,
  touchWhisperActivity,
} from "./whisper-server";

export { checkOllamaHealth, generateText } from "./ollama-client";

export { logDictation } from "./history";

export {
  AVAILABLE_MODELS,
  downloadModel,
  listLocalModels,
  getDefaultModelPath,
} from "./model-download";
