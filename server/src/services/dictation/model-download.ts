import {
  mkdir,
  writeFile,
  readdir,
  unlink,
  rename,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { modelsDir } from "@weaver/shared/paths";
import type { WhisperModel } from "@weaver/shared/types";

export const AVAILABLE_MODELS: WhisperModel[] = [
  {
    name: "Tiny (English)",
    size: "75 MB",
    filename: "ggml-tiny.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  },
  {
    name: "Base (English)",
    size: "142 MB",
    filename: "ggml-base.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  },
  {
    name: "Small (English)",
    size: "466 MB",
    filename: "ggml-small.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  },
  {
    name: "Medium (English)",
    size: "1.5 GB",
    filename: "ggml-medium.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
  },
  {
    name: "Large v3 Turbo (Quantized)",
    size: "574 MB",
    filename: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
  },
];

export async function downloadModel(
  model: WhisperModel,
  onProgress: (percent: number) => void,
): Promise<void> {
  const dir = modelsDir();
  const dest = join(dir, model.filename);
  const tmp = dest + ".tmp";

  try {
    await stat(dest);
    return; // already exists
  } catch {
    // doesn't exist, proceed
  }

  await mkdir(dir, { recursive: true });

  let response: Response;
  try {
    response = await fetch(model.url);
  } catch (err) {
    throw new Error(`Download failed: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }

  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      received += value.length;
      if (total > 0) {
        onProgress(Math.round((received / total) * 100));
      }
    }
    await writeFile(tmp, Buffer.concat(chunks));
    await rename(tmp, dest);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

export async function listLocalModels(): Promise<string[]> {
  try {
    const files = await readdir(modelsDir());
    return files.filter((f) => f.endsWith(".bin"));
  } catch {
    return [];
  }
}

export async function getDefaultModelPath(): Promise<string | null> {
  const files = await listLocalModels();
  if (files.length === 0) {
    return null;
  }
  return join(modelsDir(), files[0]);
}
