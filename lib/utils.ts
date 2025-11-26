import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitizes text by removing excessive whitespace and normalizing line breaks
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cleans OCR text by removing line breaks inside sentences
 */
export function cleanOCRText(text: string): string {
  return text
    .replace(/([a-z])\n([a-z])/gi, "$1 $2") // Remove line breaks between lowercase letters
    .replace(/([.!?])\n+/g, "$1 ") // Remove line breaks after sentence endings
    .replace(/\n{2,}/g, "\n\n") // Normalize multiple line breaks
    .trim();
}


/**
 * Splits text into chunks (virtual pages) of approximately N words
 */
export function chunkText(text: string, wordsPerPage: number = 500): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const word of words) {
    currentChunk.push(word);
    currentWordCount++;

    if (currentWordCount >= wordsPerPage) {
      // Try to end on a sentence boundary if possible
      if (/[.!?]$/.test(word) || currentWordCount > wordsPerPage + 50) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
        currentWordCount = 0;
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

/**
 * Schedules a task to run when the main thread is idle.
 * Falls back to setTimeout if requestIdleCallback is not supported.
 */
export function scheduleIdleTask(callback: () => void, timeout: number = 1000): number {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    return (window as any).requestIdleCallback(callback, { timeout });
  }
  return setTimeout(callback, 1) as unknown as number;
}

/**
 * Cancels a scheduled idle task.
 */
export function cancelIdleTask(id: number) {
  if (typeof window !== "undefined" && "cancelIdleCallback" in window) {
    (window as any).cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}
