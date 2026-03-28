import { writeFile, rename, unlink } from "node:fs/promises";

export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  try {
    await rename(tmpPath, filePath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}
