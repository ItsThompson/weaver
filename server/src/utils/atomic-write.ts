import { writeFile, rename } from "node:fs/promises";

export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}
