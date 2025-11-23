"use client";

import { useEffect, useState, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { getPageText, getPageImage } from "@/lib/pdf-loader";
import { BionicText } from "./BionicText";
import { PDFSummarySidebar } from "./PDFSummarySidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PDFReader() {
  const currentPdfId = useAppStore((state: any) => state.currentPdfId);
  const pdfPageCount = useAppStore((state: any) => state.pdfPageCount);
  const currentPage = useAppStore((state: any) => state.currentPage);
  const pageTextCache = useAppStore((state: any) => state.pageTextCache);
  const pageImageCache = useAppStore((state: any) => state.pageImageCache);
  const pageSummaryCache = useAppStore((state: any) => state.pageSummaryCache);
  const pdfDisplayMode = useAppStore((state: any) => state.pdfDisplayMode);
  const pdfScrollingMode = useAppStore((state: any) => state.pdfScrollingMode);
  const setCurrentPage = useAppStore((state: any) => state.setCurrentPage);
  const setPageText = useAppStore((state: any) => state.setPageText);
  const setPageImage = useAppStore((state: any) => state.setPageImage);
  const setPageSummary = useAppStore((state: any) => state.setPageSummary);
  const bionicEnabled = useAppStore((state: any) => state.bionicEnabled);
  const fontFamily = useAppStore((state: any) => state.fontFamily);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingSummaries, setGeneratingSummaries] = useState<Set<number>>(
    new Set()
  );
  const [pageInputValue, setPageInputValue] = useState<string>("");
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const summaryQueueRef = useRef<Array<{ pageNum: number; pageText: string }>>(
    []
  );
  const isProcessingQueueRef = useRef(false);

  // Process summary queue in batches of 5 to reduce API calls
  const processSummaryQueue = async () => {
    if (isProcessingQueueRef.current || summaryQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;

    const BATCH_SIZE = 5; // Process 5 pages per API call

    while (summaryQueueRef.current.length > 0) {
      // Collect up to BATCH_SIZE pages for batch processing
      const batch: Array<{ pageNum: number; pageText: string }> = [];
      
      while (batch.length < BATCH_SIZE && summaryQueueRef.current.length > 0) {
        const item = summaryQueueRef.current.shift();
        if (!item) break;

        // Skip if already generating or cached
        if (generatingSummaries.has(item.pageNum) || pageSummaryCache[item.pageNum]) {
          continue;
        }

        batch.push(item);
      }

      if (batch.length > 0) {
        // Process batch (5 pages in one API call)
        await generateBatchSummaries(batch);

        // Add delay between batches to avoid rate limits (2 seconds)
        if (summaryQueueRef.current.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    isProcessingQueueRef.current = false;
  };

  // Generate batch summaries for multiple pages (5 pages per API call)
  const generateBatchSummaries = async (
    pages: Array<{ pageNum: number; pageText: string }>
  ) => {
    // Filter out pages that are already generating or cached
    const pagesToProcess = pages.filter(
      (p) => !generatingSummaries.has(p.pageNum) && !pageSummaryCache[p.pageNum]
    );

    if (pagesToProcess.length === 0) {
      return;
    }

    // Mark all pages as generating
    setGeneratingSummaries((prev) => {
      const next = new Set(prev);
      pagesToProcess.forEach((p) => next.add(p.pageNum));
      return next;
    });

    try {
      console.log(
        `[PDF Reader] Generating batch summaries for pages: ${pagesToProcess.map((p) => p.pageNum).join(", ")}`
      );
      const response = await fetch("/api/summarize-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: pagesToProcess.map((p) => ({
            pageNumber: p.pageNum,
            pageText: p.pageText,
          })),
        }),
      });

      // Log which provider/model was used (from response headers)
      const provider = response.headers.get("X-Provider");
      const model = response.headers.get("X-Model");
      const cacheStatus = response.headers.get("X-Cache");
      if (provider && model) {
        console.log(
          `[PDF Reader] ✅ Using ${provider} (${model}) for batch summary${cacheStatus === "HIT" ? " [CACHED]" : ""}`
        );
      }

      // Check if request was queued (202 Accepted)
      if (response.status === 202) {
        const queueData = await response.json();
        const { jobId, statusUrl } = queueData;
        
        console.log(`[PDF Reader] Batch summary request queued with job ID: ${jobId}`);
        
        // Poll for job status
        const pollStatus = async () => {
          const maxAttempts = 300; // 5 minutes max (1 second intervals)
          let attempts = 0;

          const poll = async (): Promise<void> => {
            if (attempts >= maxAttempts) {
              throw new Error("Batch summary request timed out. Please try again.");
            }

            attempts++;
            const statusResponse = await fetch(statusUrl);
            const jobStatus = await statusResponse.json();

            if (jobStatus.status === "completed" && jobStatus.result?.success) {
              // Job completed successfully
              const summaries = jobStatus.result.data;
              
              // Update cache for each page
              pagesToProcess.forEach(({ pageNum }) => {
                const summary = summaries[pageNum.toString()] || summaries[pageNum];
                if (summary && typeof summary === "string") {
                  setPageSummary(pageNum, summary);
                }
              });
              return;
            } else if (jobStatus.status === "failed") {
              throw new Error(jobStatus.error || "Batch summary request failed");
            } else if (jobStatus.status === "processing" || jobStatus.status === "queued") {
              // Still processing, poll again
              setTimeout(poll, 1000);
            } else {
              // Unknown status, poll again
              setTimeout(poll, 1000);
            }
          };

          await poll();
        };

        await pollStatus();
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to generate batch summaries");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullSummary = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                fullSummary += parsed.choices[0].delta.content;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      // Parse JSON response to extract individual page summaries
      try {
        // Extract JSON from the summary text (may have markdown code blocks)
        let jsonText = fullSummary.trim();
        // Remove markdown code blocks if present
        if (jsonText.startsWith("```json")) {
          jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        } else if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
        }

        const summaries = JSON.parse(jsonText);

        // Update cache for each page
        pagesToProcess.forEach(({ pageNum }) => {
          const summary = summaries[pageNum.toString()] || summaries[pageNum];
          if (summary && typeof summary === "string") {
            setPageSummary(pageNum, summary);
          }
        });
      } catch (parseError) {
        console.error(
          "[PDF Reader] Failed to parse batch summary JSON:",
          parseError
        );
        // Fallback: treat entire response as single summary for first page
        if (pagesToProcess.length > 0 && fullSummary.trim()) {
          setPageSummary(pagesToProcess[0].pageNum, fullSummary.trim());
        }
      }
    } catch (err) {
      console.error(
        `[PDF Reader] ❌ Error generating batch summaries:`,
        err
      );
    } finally {
      // Remove from generating set
      setGeneratingSummaries((prev) => {
        const next = new Set(prev);
        pagesToProcess.forEach((p) => next.delete(p.pageNum));
        return next;
      });
    }
  };

  // Generate summary for a single page (legacy, kept for compatibility)
  const generateSummary = async (
    pageNum: number,
    pageText: string,
    retryCount = 0
  ) => {
    // Use batch API even for single pages (more efficient)
    await generateBatchSummaries([{ pageNum, pageText }]);
  };

  // Queue summary for generation (instead of generating immediately)
  const queueSummary = (pageNum: number, pageText: string) => {
    if (generatingSummaries.has(pageNum) || pageSummaryCache[pageNum]) {
      return; // Already generating or cached
    }

    // Check if already in queue
    if (summaryQueueRef.current.some((item) => item.pageNum === pageNum)) {
      return;
    }

    summaryQueueRef.current.push({ pageNum, pageText });
    processSummaryQueue();
  };

  // Pre-load pages (text + image + summary)
  const preloadPages = async (pageNumbers: number[]) => {
    const loadPromises = pageNumbers.map(async (pageNum) => {
      if (pageNum < 1 || pageNum > pdfPageCount) return;

      try {
        // Load text if not cached
        if (!pageTextCache[pageNum]) {
          const text = await getPageText(currentPdfId!, pageNum);
          setPageText(pageNum, text);
          // Queue summary generation if text is available
          if (text.trim()) {
            queueSummary(pageNum, text);
          }
        } else if (pageTextCache[pageNum] && !pageSummaryCache[pageNum]) {
          // Text exists but no summary - queue it
          queueSummary(pageNum, pageTextCache[pageNum]);
        }

        // Load image if not cached
        if (!pageImageCache[pageNum]) {
          const imageData = await getPageImage(currentPdfId!, pageNum);
          setPageImage(pageNum, imageData);
        }
      } catch (err) {
        console.error(
          `[PDF Reader] ❌ Error pre-loading page ${pageNum}:`,
          err
        );
      }
    });

    await Promise.all(loadPromises);
  };

  // Initial load: pages 1-4
  useEffect(() => {
    if (!currentPdfId || !pdfPageCount) return;

    const initialPages = [1, 2, 3, 4].filter((p) => p <= pdfPageCount);
    preloadPages(initialPages);
  }, [currentPdfId, pdfPageCount]);

  // Pre-load surrounding pages when current page loads (paginated mode)
  // Loads pages before and after the current page (e.g., if on page 22, loads 20-24)
  useEffect(() => {
    if (
      !currentPdfId ||
      !pdfPageCount ||
      currentPage < 1 ||
      pdfScrollingMode === "continuous"
    )
      return;

    // Wait for current page to be loaded first, then pre-load surrounding pages
    const currentPageLoaded = pageTextCache[currentPage] || pageImageCache[currentPage];
    
    if (currentPageLoaded) {
      // Pre-load pages around current page: 2 before, 2 after
      const surroundingPages = [
        currentPage - 2,
        currentPage - 1,
        currentPage + 1,
        currentPage + 2,
      ]
        .filter((p) => p >= 1 && p <= pdfPageCount && p !== currentPage)
        .filter((p) => !pageTextCache[p] && !pageImageCache[p]); // Only load if not already cached

      if (surroundingPages.length > 0) {
        console.log(`[PDF Reader] Pre-loading surrounding pages around ${currentPage}:`, surroundingPages);
        preloadPages(surroundingPages);
      }
    }
  }, [currentPdfId, currentPage, pdfPageCount, pdfScrollingMode, pageTextCache, pageImageCache]);

  // Intersection observer for continuous scrolling mode - load pages as they come into view
  useEffect(() => {
    if (pdfScrollingMode !== "continuous" || !currentPdfId || !pdfPageCount)
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageElement = entry.target as HTMLElement;
            const pageNum = parseInt(pageElement.dataset.pageNumber || "0");
            if (pageNum > 0 && pageNum <= pdfPageCount) {
              // Load this page and next 2 pages
              const pagesToLoad = [pageNum, pageNum + 1, pageNum + 2].filter(
                (p) => p <= pdfPageCount
              );
              preloadPages(pagesToLoad);
            }
          }
        });
      },
      { rootMargin: "200px" } // Start loading 200px before page comes into view
    );

    // Observe all page elements - use a small delay to ensure DOM is updated
    const timeoutId = setTimeout(() => {
      pageRefs.current.forEach((ref) => {
        if (ref) observer.observe(ref);
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [pdfScrollingMode, currentPdfId, pdfPageCount, pageTextCache]);

  // Load current page content (for paginated mode)
  useEffect(() => {
    if (
      !currentPdfId ||
      !pdfPageCount ||
      currentPage < 1 ||
      currentPage > pdfPageCount
    ) {
      return;
    }

    if (pdfScrollingMode === "continuous") {
      // In continuous mode, pages are loaded on-demand
      return;
    }

    const loadPage = async () => {
      // Only show loading if page is not already cached
      const needsLoading = !pageTextCache[currentPage] || !pageImageCache[currentPage];
      if (needsLoading) {
        setIsLoading(true);
      }
      setError(null);

      try {
        // Load text if not cached
        if (!pageTextCache[currentPage]) {
          const text = await getPageText(currentPdfId, currentPage);
          setPageText(currentPage, text);
          if (text.trim()) {
            queueSummary(currentPage, text);
          }
        } else if (
          pageTextCache[currentPage] &&
          !pageSummaryCache[currentPage]
        ) {
          queueSummary(currentPage, pageTextCache[currentPage]);
        }

        // Load image if not cached
        if (!pageImageCache[currentPage]) {
          const imageData = await getPageImage(currentPdfId, currentPage);
          setPageImage(currentPage, imageData);
        }
      } catch (err) {
        console.error(
          `[PDF Reader] ❌ Error loading page ${currentPage}:`,
          err
        );
        setError(err instanceof Error ? err.message : "Failed to load page");
      } finally {
        if (needsLoading) {
          setIsLoading(false);
        }
      }
    };

    loadPage();
  }, [
    currentPdfId,
    currentPage,
    pdfPageCount,
    pdfScrollingMode,
    pageTextCache,
    pageImageCache,
    setPageText,
    setPageImage,
  ]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < pdfPageCount) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Sync pageInputValue with currentPage
  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow any input (including empty) for better UX
    setPageInputValue(e.target.value);
  };

  const handlePageInputBlur = () => {
    // Validate and update page on blur
    const page = parseInt(pageInputValue, 10);
    if (!isNaN(page) && page >= 1 && page <= pdfPageCount) {
      setCurrentPage(page);
    } else {
      // Reset to current page if invalid
      setPageInputValue(currentPage.toString());
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur(); // Triggers handlePageInputBlur
    }
  };

  if (!currentPdfId || !pdfPageCount) {
    return null;
  }

  // Render a single page
  const renderPage = (pageNum: number, showPageNumber = false) => {
    const pageText = pageTextCache[pageNum] || "";
    const pageImage = pageImageCache[pageNum];

    return (
      <div
        key={pageNum}
        data-page-number={pageNum}
        ref={(el) => {
          if (el) pageRefs.current.set(pageNum, el);
        }}
        className={cn(
          "mb-8 pb-8 border-b last:border-b-0",
          fontFamily === "opendyslexic" && "font-dyslexic"
        )}
      >
        {showPageNumber && (
          <div className="mb-4 text-sm font-semibold text-muted-foreground">
            Page {pageNum}
          </div>
        )}

        {/* Show image based on display mode */}
        {(pdfDisplayMode === "image" || pdfDisplayMode === "both") &&
          pageImage && (
            <div className="mb-6">
              <img
                src={pageImage}
                alt={`Page ${pageNum}`}
                className="w-full h-auto border rounded-lg shadow-sm"
              />
            </div>
          )}

        {/* Show text based on display mode */}
        {(pdfDisplayMode === "text" || pdfDisplayMode === "both") &&
          pageText && (
            <div className="prose prose-lg dark:prose-invert max-w-none">
              <BionicText
                text={pageText}
                enabled={bionicEnabled}
                fontFamily={fontFamily}
              />
            </div>
          )}

        {!pageText && !pageImage && (
          <div className="text-center text-muted-foreground py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p>Loading page {pageNum}...</p>
          </div>
        )}
      </div>
    );
  };

  // Get pages to render in continuous mode
  const getPagesToRender = () => {
    if (pdfScrollingMode === "paginated") {
      return [currentPage];
    }

    // Continuous mode: render all loaded pages
    const loadedPages: number[] = [];
    for (let i = 1; i <= pdfPageCount; i++) {
      if (pageTextCache[i] || pageImageCache[i]) {
        loadedPages.push(i);
      }
    }
    return loadedPages.length > 0 ? loadedPages : [1]; // At least show page 1
  };

  const currentPageText = pageTextCache[currentPage] || "";
  const currentPageImage = pageImageCache[currentPage];
  const currentPageSummary = pageSummaryCache[currentPage] || null;
  const isGeneratingSummary = generatingSummaries.has(currentPage);

  return (
    <div className="flex flex-col h-full">
      {/* Pagination Controls */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-card">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePreviousPage}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page</span>
          <Input
            type="text"
            inputMode="numeric"
            min={1}
            max={pdfPageCount}
            value={pageInputValue}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            className="w-20 text-center"
            disabled={isLoading}
          />
          <span className="text-sm text-muted-foreground">
            of {pdfPageCount}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={handleNextPage}
          disabled={currentPage >= pdfPageCount || isLoading}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Page Content with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && pdfScrollingMode === "paginated" && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <p className="text-destructive">Error: {error}</p>
            </div>
          )}

          {!error && (
            <div
              className={cn(
                "mx-auto max-w-4xl py-8 px-4",
                fontFamily === "opendyslexic" && "font-dyslexic"
              )}
            >
              {pdfScrollingMode === "paginated"
                ? // Paginated mode: single page
                  renderPage(currentPage)
                : // Continuous mode: all loaded pages
                  getPagesToRender().map((pageNum) =>
                    renderPage(pageNum, true)
                  )}
            </div>
          )}
        </div>

        {/* Summary Sidebar (only in paginated mode) */}
        {pdfScrollingMode === "paginated" && (
          <PDFSummarySidebar
            pageNumber={currentPage}
            summary={currentPageSummary}
            isGenerating={isGeneratingSummary}
            onGenerate={() => {
              if (currentPageText) {
                queueSummary(currentPage, currentPageText);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
