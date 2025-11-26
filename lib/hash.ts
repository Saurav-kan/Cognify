/**
 * Calculates the SHA-256 hash of an ArrayBuffer.
 * Returns the hash as a hex string.
 */
export async function calculateFileHash(buffer: ArrayBuffer): Promise<string> {
  if (!crypto || !crypto.subtle) {
    throw new Error("Crypto API not available");
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}
