/**
 * Transforms text into bionic reading format by bolding the first half of each word
 * @param text - The input text to transform
 * @param strength - The percentage of the word to bold (10-100), default 50
 * @returns The transformed text with HTML bold tags
 */
export function transformToBionic(text: string, strength: number = 50): string {
  if (!text) return "";

  // Split text into words while preserving whitespace and punctuation
  const words = text.split(/(\s+)/);

  return words
    .map((word) => {
      // Skip whitespace-only segments
      if (/^\s+$/.test(word)) {
        return word;
      }

      // Extract word without punctuation
      const wordMatch = word.match(/^([\p{P}\p{S}]*)([\p{L}\p{N}]+)([\p{P}\p{S}]*)$/u);
      
      if (!wordMatch) {
        // If no match (e.g., only punctuation), return as is
        return word;
      }

      const [, leadingPunct, coreWord, trailingPunct] = wordMatch;
      
      if (!coreWord) {
        return word;
      }

      // Calculate how many characters to bold based on strength
      // Ensure at least 1 char is bolded if strength > 0
      const ratio = Math.max(0.1, Math.min(1, strength / 100));
      const boldLength = Math.ceil(coreWord.length * ratio);
      const boldPart = coreWord.slice(0, boldLength);
      const normalPart = coreWord.slice(boldLength);

      // Reassemble with bold tags
      return `${leadingPunct}<strong>${boldPart}</strong>${normalPart}${trailingPunct}`;
    })
    .join("");
}

