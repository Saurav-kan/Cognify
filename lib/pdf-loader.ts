import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

const pdfRegistry = new Map<string, PDFDocumentProxy>();

type PdfJsModule = typeof import("pdfjs-dist");

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;
let workerSrcPromise: Promise<string> | null = null;

const isBrowser = typeof window !== "undefined";

async function loadPdfJs(): Promise<PdfJsModule> {
  // console.log("[PDF Loader] loadPdfJs called");

  if (!isBrowser) {
    throw new Error("PDF loading is only supported in the browser.");
  }

  if (!pdfjsModulePromise) {
    // console.log("[PDF Loader] Starting PDF.js module import...");

    // Use CDN import to bypass webpack bundling issues
    // The error occurs in webpack's __webpack_require__.r, so we'll load from CDN
    pdfjsModulePromise = (async () => {
      try {
        // console.log(
        //   "[PDF Loader] Attempting to load PDF.js from CDN (bypassing webpack)..."
        // );
        // Use dynamic import with webpackIgnore comment to bypass webpack processing
        const module = await import(
          /* webpackIgnore: true */
          "https://unpkg.com/pdfjs-dist@5.4.394/build/pdf.min.mjs"
        );
        // console.log("[PDF Loader] ✅ PDF.js loaded from CDN");
        // console.log("[PDF Loader] Module keys:", Object.keys(module));
        // console.log(
        //   "[PDF Loader] GlobalWorkerOptions exists:",
        //   !!module.GlobalWorkerOptions
        // );

        // Set worker from CDN as well
        if (module.GlobalWorkerOptions) {
          const workerUrl =
            "https://unpkg.com/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs";
          // console.log("[PDF Loader] Setting workerSrc to CDN URL:", workerUrl);
          (module.GlobalWorkerOptions as any).workerSrc = workerUrl;
          // console.log("[PDF Loader] ✅ Worker configured");
        }

        return module as PdfJsModule;
      } catch (cdnErr: any) {
        // console.warn(
        //   "[PDF Loader] CDN import failed, trying local import:",
        //   cdnErr
        // );
        // console.warn("[PDF Loader] CDN error details:", {
        //   message: cdnErr?.message,
        //   stack: cdnErr?.stack,
        // });

        // Fallback to local import - this will still have the webpack issue
        // but at least we tried CDN first
        try {
          const module = await import("pdfjs-dist");
          // console.log("[PDF Loader] ✅ PDF.js loaded from local bundle");

          if (!workerSrcPromise) {
            // console.log("[PDF Loader] Starting worker import...");
            workerSrcPromise = import("pdfjs-dist/build/pdf.worker.min.mjs?url")
              .then((m) => {
                const workerUrl = m.default as string;
                // console.log(
                //   "[PDF Loader] ✅ Worker imported successfully:",
                //   workerUrl
                // );
                return workerUrl;
              })
              .catch((err) => {
                console.error("[PDF Loader] ❌ Worker import failed:", err);
                // Fallback to CDN worker
                return "https://unpkg.com/pdfjs-dist@5.4.394/build/pdf.worker.min.mjs";
              });
          }

          if (module.GlobalWorkerOptions) {
            const workerUrl = await workerSrcPromise;
            // console.log("[PDF Loader] Setting workerSrc to:", workerUrl);
            (module.GlobalWorkerOptions as any).workerSrc = workerUrl;
            // console.log("[PDF Loader] ✅ Worker configured");
          }

          return module;
        } catch (localErr: any) {
          console.error("[PDF Loader] ❌ Both CDN and local import failed");
          console.error("[PDF Loader] Local error:", localErr);
          throw localErr;
        }
      }
    })();
  }

  return pdfjsModulePromise;
}

export interface LoadedPdfMeta {
  id: string;
  pageCount: number;
}

export interface PageImageOptions {
  scale?: number;
}

export async function loadPdfFromArrayBuffer(
  buffer: ArrayBuffer,
  id: string
): Promise<LoadedPdfMeta> {
  // console.log("[PDF Loader] loadPdfFromArrayBuffer called");
  // console.log("[PDF Loader] PDF ID:", id);
  // console.log("[PDF Loader] Buffer size:", buffer.byteLength, "bytes");

  try {
    // console.log("[PDF Loader] Loading PDF.js module...");
    const pdfjs = await loadPdfJs();
    // console.log("[PDF Loader] ✅ PDF.js module loaded");
    // console.log(
    //   "[PDF Loader] getDocument function exists:",
    //   typeof pdfjs.getDocument === "function"
    // );

    // console.log("[PDF Loader] Creating PDF document task...");
    const task = pdfjs.getDocument({ data: buffer });
    // console.log("[PDF Loader] ✅ Task created");
    // console.log("[PDF Loader] Task type:", typeof task);
    // console.log("[PDF Loader] Task promise exists:", !!task.promise);

    // console.log("[PDF Loader] Waiting for document to load...");
    const doc = await task.promise;
    // console.log("[PDF Loader] ✅ Document loaded");
    // console.log("[PDF Loader] Document type:", typeof doc);
    // console.log("[PDF Loader] Document numPages:", doc.numPages);

    pdfRegistry.set(id, doc);
    // console.log("[PDF Loader] ✅ PDF registered with ID:", id);

    return {
      id,
      pageCount: doc.numPages,
    };
  } catch (err: any) {
    console.error("[PDF Loader] ❌ Failed to load PDF:", err);
    console.error("[PDF Loader] Error details:", {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      toString: err?.toString(),
    });
    throw err;
  }
}

export function releasePdf(id: string) {
  const handle = pdfRegistry.get(id);
  if (handle) {
    handle.destroy();
    pdfRegistry.delete(id);
  }
}

function getPdfOrThrow(id: string): PDFDocumentProxy {
  const handle = pdfRegistry.get(id);
  if (!handle) {
    throw new Error(`PDF with id "${id}" is not loaded.`);
  }
  return handle;
}

async function getPage(id: string, pageNumber: number): Promise<PDFPageProxy> {
  const doc = getPdfOrThrow(id);
  if (pageNumber < 1 || pageNumber > doc.numPages) {
    throw new Error(`Page ${pageNumber} is out of range.`);
  }
  return doc.getPage(pageNumber);
}

export async function getPageText(
  id: string,
  pageNumber: number
): Promise<string> {
  // console.log("[PDF Loader] getPageText called for page", pageNumber);
  try {
    const page = await getPage(id, pageNumber);
    // console.log("[PDF Loader] ✅ Page retrieved");
    const content = await page.getTextContent();
    // console.log(
    //   "[PDF Loader] ✅ Text content extracted, items:",
    //   content.items.length
    // );
    return content.items
      .map((item) => {
        if ("str" in item) {
          return item.str;
        }
        return "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (err: any) {
    console.error("[PDF Loader] ❌ Failed to get page text:", err);
    throw err;
  }
}

export async function getPageImage(
  id: string,
  pageNumber: number,
  options: PageImageOptions = {}
): Promise<string> {
  // console.log("[PDF Loader] getPageImage called for page", pageNumber);
  try {
    const page = await getPage(id, pageNumber);
    // console.log("[PDF Loader] ✅ Page retrieved for image");
    const scale = options.scale ?? 1.5;
    // console.log("[PDF Loader] Using scale:", scale);
    const viewport = page.getViewport({ scale });
    // console.log(
    //   "[PDF Loader] Viewport size:",
    //   viewport.width,
    //   "x",
    //   viewport.height
    // );

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to get canvas context.");
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    // console.log(
    //   "[PDF Loader] Canvas created:",
    //   canvas.width,
    //   "x",
    //   canvas.height
    // );

    // console.log("[PDF Loader] Starting page render...");
    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    }).promise;
    // console.log("[PDF Loader] ✅ Page rendered");

    const dataUrl = canvas.toDataURL("image/png");
    // console.log(
    //   "[PDF Loader] ✅ Image data URL created, length:",
    //   dataUrl.length
    // );
    return dataUrl;
  } catch (err: any) {
    console.error("[PDF Loader] ❌ Failed to get page image:", err);
    console.error("[PDF Loader] Error details:", {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
    throw err;
  }
}

export function isPdfLoaded(id: string): boolean {
  return pdfRegistry.has(id);
}
