const MAX_CHUNK_LENGTH = 300;

const SENTENCE_END = /[.!?]/;

export function hasPunctuation(text: string): boolean {
  return SENTENCE_END.test(text);
}

export function chunkTranscript(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  // Split on sentence-ending punctuation, keeping the delimiter with the preceding chunk
  const sentences = trimmed.split(/(?<=[.!?])\s+/);

  const chunks: string[] = [];
  let current = "";

  sentences.forEach((sentence) => {
    if (!current) {
      current = sentence;
    } else if (current.length + sentence.length + 1 <= MAX_CHUNK_LENGTH) {
      current += " " + sentence;
    } else {
      chunks.push(current);
      current = sentence;
    }
  });

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
