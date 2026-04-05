export {
  WHISPER_PORT,
  startWhisperServer,
  stopWhisperServer,
  isWhisperServerRunning,
  touchWhisperActivity,
} from "./whisper-server";

export { checkOllamaHealth, generateText } from "./ollama-client";
