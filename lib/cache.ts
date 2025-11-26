import { get, set, del } from "idb-keyval";

export interface PageSummaryData {
  summary: string;
  flashcards: string[];
}

export interface PdfData {
  textCache?: { [page: number]: string };
  imageCache?: { [page: number]: string };
  summaryCache?: { [page: number]: string | PageSummaryData };
  lastAccessed?: number;
}

const DB_PREFIX = "pdf_data_";
const INDEX_KEY = "pdf_cache_index";
const MAX_CACHE_SIZE = 10;

type CacheIndex = Record<string, number>; // pdfId -> timestamp

async function getIndex(): Promise<CacheIndex> {
  return (await get<CacheIndex>(INDEX_KEY)) || {};
}

async function updateIndex(pdfId: string) {
  try {
    const index = await getIndex();
    index[pdfId] = Date.now();
    await set(INDEX_KEY, index);
  } catch (error) {
    console.error("[Cache] Failed to update index:", error);
  }
}

async function pruneCache() {
  try {
    const index = await getIndex();
    const entries = Object.entries(index);

    if (entries.length <= MAX_CACHE_SIZE) return;

    // Sort by timestamp (oldest first)
    entries.sort(([, timeA], [, timeB]) => timeA - timeB);

    // Identify items to remove
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);

    for (const [id] of toRemove) {
      await del(`${DB_PREFIX}${id}`);
      delete index[id];
    }

    await set(INDEX_KEY, index);
    console.log(`[Cache] Pruned ${toRemove.length} old items.`);
  } catch (error) {
    console.error("[Cache] Failed to prune cache:", error);
  }
}

export async function savePdfData(pdfId: string, data: PdfData): Promise<void> {
  try {
    await set(`${DB_PREFIX}${pdfId}`, data);
    await updateIndex(pdfId);
    await pruneCache();
  } catch (error) {
    console.error(`[Cache] Failed to save PDF data for ${pdfId}:`, error);
  }
}

export async function loadPdfData(pdfId: string): Promise<PdfData | undefined> {
  try {
    const data = await get<PdfData>(`${DB_PREFIX}${pdfId}`);
    if (data) {
      // Update access time asynchronously
      updateIndex(pdfId);
    }
    return data;
  } catch (error) {
    console.error(`[Cache] Failed to load PDF data for ${pdfId}:`, error);
    return undefined;
  }
}

export async function clearPdfData(pdfId: string): Promise<void> {
  try {
    await del(`${DB_PREFIX}${pdfId}`);
    const index = await getIndex();
    if (index[pdfId]) {
      delete index[pdfId];
      await set(INDEX_KEY, index);
    }
  } catch (error) {
    console.error(`[Cache] Failed to clear PDF data for ${pdfId}:`, error);
  }
}
