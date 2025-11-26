"use client";

import { useEffect, useState, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { getPageText, getPageImage } from "@/lib/pdf-loader";
import { BionicText } from "./BionicText";
import { PDFSummarySidebar } from "./PDFSummarySidebar";
import { FlashcardStudyModal } from "./FlashcardStudyModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn, scheduleIdleTask, cancelIdleTask } from "@/lib/utils";

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
  
  // Study Modal State
  const [isStudyModalOpen, setIsStudyModalOpen] = useState(false);
  const [studyCards, setStudyCards] = useState<string[]>([]);
  const [studyTitle, setStudyTitle] = useState("");

  // Summary generation queue
  const summaryQueueRef = useRef<Array<{ pageNum: number; pageText: string; forceRefresh?: boolean }>>(
    []
  );
  const isProcessingQueueRef = useRef(false);
  
  // Page loading queue
  const pageLoadQueueRef = useRef<number[]>([]);
  const isPageLoadingRef = useRef(false);
  const idleTaskRef = useRef<number | null>(null);

  // Process summary queue with dynamic batching (Token & Page limits)
  const processSummaryQueue = async () => {
    if (isProcessingQueueRef.current || summaryQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;

    const MAX_BATCH_PAGES = 20;
    const MAX_BATCH_TOKENS = 25000; // Reduced to 25k to account for output tokens

    while (summaryQueueRef.current.length > 0) {
      const batch: Array<{ pageNum: number; pageText: string }> = [];
      let currentBatchTokens = 0;
      
      // Peek at the queue to build the batch
      while (batch.length < MAX_BATCH_PAGES && summaryQueueRef.current.length > 0) {
        // Peek first, don't remove yet
        const item = summaryQueueRef.current[0];
        
        // 1. Check if already done (cleanup)
        if (generatingSummaries.has(item.pageNum) || pageSummaryCache[item.pageNum]) {
          summaryQueueRef.current.shift(); // Remove and skip
          continue;
        }

        // 2. Check for empty pages (cleanup)
        if (!item.pageText || item.pageText.trim().length < 10) {
          summaryQueueRef.current.shift(); // Remove
          setPageSummary(item.pageNum, "No text content available for this page.");
          continue;
        }

        // 3. Check token limit
        const estimatedTokens = Math.ceil(item.pageText.length / 4);
        
        // If adding this page exceeds token limit AND we already have pages in batch,
        // stop here and process what we have.
        if (batch.length > 0 && currentBatchTokens + estimatedTokens > MAX_BATCH_TOKENS) {
          console.log(`[PDF Reader] Batch full by tokens: ${currentBatchTokens} tokens, ${batch.length} pages`);
          break;
        }

        // Add to batch
        summaryQueueRef.current.shift(); // Remove from queue
        batch.push(item);
        currentBatchTokens += estimatedTokens;
      }

      if (batch.length > 0) {
        console.log(`[PDF Reader] Processing batch: ${batch.length} pages, ~${currentBatchTokens} tokens`);
        
        // Process batch
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
      (p) => 
        !generatingSummaries.has(p.pageNum) && 
        (!pageSummaryCache[p.pageNum] || (p as any).forceRefresh)
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
            forceRefresh: (p as any).forceRefresh, // Pass forceRefresh to API
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
                const data = summaries[pageNum.toString()] || summaries[pageNum];
                if (data) {
                  // Handle both string (legacy) and object (new) formats
                  if (typeof data === "string") {
                    setPageSummary(pageNum, data);
                  } else if (typeof data === "object" && data.summary) {
                    setPageSummary(pageNum, {
                      summary: data.summary,
                      flashcards: data.flashcards || [],
                      keyPoints: data.keyPoints || data.key_points || [],
                    });
                  }
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
        // Extract JSON from the summary text
        let jsonText = fullSummary.trim();
        
        // 1. Try to remove markdown code blocks
        if (jsonText.startsWith("```json")) {
          jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        } else if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
        }

        // 2. If it still doesn't start with {, try to find the first { and last }
        if (!jsonText.startsWith("{")) {
          const match = jsonText.match(/\{[\s\S]*\}/);
          if (match) {
            jsonText = match[0];
          }
        }

        const summaries = JSON.parse(jsonText);

        // Update cache for each page
        pagesToProcess.forEach(({ pageNum }) => {
          const data = summaries[pageNum.toString()] || summaries[pageNum];
          if (data) {
            // Handle both string (legacy) and object (new) formats
            if (typeof data === "string") {
              setPageSummary(pageNum, data);
            } else if (typeof data === "object" && data.summary) {
              setPageSummary(pageNum, {
                summary: data.summary,
                flashcards: data.flashcards || [],
                keyPoints: data.keyPoints || data.key_points || [],
              });
            }
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

  // Queue summary generation for a specific page
  const queueSummary = (pageNum: number, text: string, forceRefresh: boolean = false) => {
    if (!text || text.trim().length < 50) return;
    
    // Check if already cached (unless forcing refresh)
    if (!forceRefresh && pageSummaryCache[pageNum]) return;
    
    // Check if already in queue
    if (summaryQueueRef.current.some(item => item.pageNum === pageNum)) return;

    // Add to queue
    summaryQueueRef.current.push({ pageNum, pageText: text, forceRefresh });
    
    // Trigger processing
    processSummaryQueue();
  };

  // Handle manual regeneration of summary
  const handleRegeneratePage = (pageNum: number) => {
    const text = pageTextCache[pageNum];
    if (text) {
      // Clear existing summary first to show loading state
      setPageSummary(pageNum, null); // Clear to show loading state immediately
      queueSummary(pageNum, text, true);
    }
  };

  const handleStudyPage = (pageNum: number) => {
    const data = pageSummaryCache[pageNum];
    if (data && typeof data === "object" && data.flashcards && data.flashcards.length > 0) {
      setStudyCards(data.flashcards);
      setStudyTitle(`Page ${pageNum} Flashcards`);
      setIsStudyModalOpen(true);
    }
  };

  // Process the page load queue sequentially
  const processPageLoadQueue = async () => {
    if (isPageLoadingRef.current || pageLoadQueueRef.current.length === 0) {
      return;
    }

    isPageLoadingRef.current = true;
    const pageNum = pageLoadQueueRef.current.shift(); // Get next page

    if (pageNum && pageNum >= 1 && pageNum <= pdfPageCount) {
      try {
        // console.log(`[PDF Reader] Processing page load for ${pageNum}`);
        
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
        console.error(`[PDF Reader] ❌ Error loading page ${pageNum}:`, err);
      }
    }

    isPageLoadingRef.current = false;

    // Schedule next processing if queue is not empty
    if (pageLoadQueueRef.current.length > 0) {
      idleTaskRef.current = scheduleIdleTask(() => {
        processPageLoadQueue();
      });
    }
  };

  // Pre-load pages (text + image + summary) - SEQUENTIAL
  const preloadPages = (pageNumbers: number[]) => {
    // Add unique pages to queue
    const newPages = pageNumbers.filter(
      (p) => 
        p >= 1 && 
        p <= pdfPageCount && 
        !pageLoadQueueRef.current.includes(p) &&
        (!pageTextCache[p] || !pageImageCache[p]) // Only queue if not fully loaded
    );

    if (newPages.length === 0) return;

    // Prioritize these new pages (add to front or back? usually surrounding pages are high priority)
    // For now, just append. If we want to prioritize, we could clear queue or prepend.
    // Let's prepend to prioritize the most recently requested pages (e.g. user scrolled to them)
    pageLoadQueueRef.current = [...newPages, ...pageLoadQueueRef.current];
    
    // Remove duplicates again just in case
    pageLoadQueueRef.current = [...new Set(pageLoadQueueRef.current)];

    // Trigger processing if not already running
    if (!isPageLoadingRef.current) {
      // Cancel any pending idle task to restart immediately
      if (idleTaskRef.current) {
        cancelIdleTask(idleTaskRef.current);
      }
      idleTaskRef.current = scheduleIdleTask(() => {
        processPageLoadQueue();
      });
    }
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

  // Intersection observer for continuous scrolling mode
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
              // Update current page if this page is mostly visible
              if (entry.intersectionRatio > 0.5) {
                setCurrentPage(pageNum);
              }

              // Load this page and next 2 pages
              const pagesToLoad = [pageNum, pageNum + 1, pageNum + 2].filter(
                (p) => p <= pdfPageCount
              );
              preloadPages(pagesToLoad);
            }
          }
        });
      },
      { 
        rootMargin: "200px",
        threshold: [0.1, 0.5] // Trigger at 10% and 50% visibility
      }
    );

    // Observe all page elements
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

  // ... (loadPage effect remains same)

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
  const currentPageSummaryData = pageSummaryCache[currentPage];
  const currentPageSummary =
    typeof currentPageSummaryData === "string"
      ? currentPageSummaryData
      : currentPageSummaryData?.summary || null;
  const currentPageFlashcards =
    currentPageSummaryData && typeof currentPageSummaryData === "object"
      ? currentPageSummaryData.flashcards
      : [];
  const currentPageKeyPoints =
    currentPageSummaryData && typeof currentPageSummaryData === "object"
      ? currentPageSummaryData.keyPoints
      : [];
  const isGeneratingSummary = generatingSummaries.has(currentPage);

  // Render a single page with virtualization
  const renderPage = (pageNum: number, showPageNumber = false) => {
    // Virtualization: Only render content if page is close to current page
    // Render 3 pages before and 3 pages after current page
    const isVisible = Math.abs(currentPage - pageNum) <= 3;
    
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
          "mb-8 pb-8 border-b last:border-b-0 min-h-[200px]", // Min height to prevent collapse
          fontFamily === "opendyslexic" && "font-dyslexic"
        )}
      >
        {showPageNumber && (
          <div className="mb-4 text-sm font-semibold text-muted-foreground">
            Page {pageNum}
          </div>
        )}

        {!isVisible ? (
          // Placeholder for off-screen pages
          <div className="h-[800px] flex items-center justify-center bg-muted/10 rounded-lg border border-dashed">
            <p className="text-muted-foreground">Page {pageNum} (scrolled away)</p>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    );
  };



  return (
    <div className="flex flex-col h-full">
      {/* Pagination Controls */}
      {/* ... (controls remain same) ... */}
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

        {/* Summary Sidebar (Always visible now) */}
        <PDFSummarySidebar
          pageNumber={currentPage}
          summary={currentPageSummary}
          flashcards={currentPageFlashcards}
          keyPoints={currentPageKeyPoints}
          isGenerating={isGeneratingSummary}
          onGenerate={() => {
            if (currentPageText) {
              queueSummary(currentPage, currentPageText);
            }
          }}
          onRegenerate={() => handleRegeneratePage(currentPage)}
          onStudy={() => handleStudyPage(currentPage)}
        />
      </div>

      <FlashcardStudyModal
        isOpen={isStudyModalOpen}
        onClose={() => setIsStudyModalOpen(false)}
        cards={studyCards}
        title={studyTitle}
      />
    </div>
  );
}
