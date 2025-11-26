"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AIWidgetProps {
  text: string;
}

export function AIWidget({ text }: AIWidgetProps) {
  const [selectedText, setSelectedText] = useState<string>("");
  const [context, setContext] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [explanation, setExplanation] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: Extract surrounding context
  const getSurroundingContext = (
    fullText: string,
    selectedText: string,
    contextWords: number = 50
  ): string => {
    const selectedIndex = fullText.indexOf(selectedText);
    if (selectedIndex === -1) return "";

    const beforeText = fullText.substring(0, selectedIndex);
    const afterText = fullText.substring(selectedIndex + selectedText.length);

    const beforeContext = beforeText
      .trim()
      .split(/\s+/)
      .slice(-contextWords)
      .join(" ");
    const afterContext = afterText
      .trim()
      .split(/\s+/)
      .slice(0, contextWords)
      .join(" ");

    return `${beforeContext} ${selectedText} ${afterContext}`.trim();
  };

  // Handle Text Selection
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setShowButton(false);
        return;
      }

      const selectedText = selection.toString().trim();
      if (selectedText.length > 0 && selectedText.length < 150) {
        // Limit length to avoid accidental large selections

        let fullText = "";

        // Strategy 1: Use text prop if available and contains the selected text
        if (text && text.trim().length > 0) {
          fullText = text;
        }

        // Strategy 2: Extract from DOM - specifically target content paragraphs
        if (!fullText || fullText.length < selectedText.length) {
          // Find all content paragraphs (BionicText renders as <p data-section-id>)
          const contentParagraphs =
            document.querySelectorAll("p[data-section-id]");

          if (contentParagraphs.length > 0) {
            // Collect text from all content paragraphs
            const paragraphs: string[] = [];
            contentParagraphs.forEach((p) => {
              const text = (p as HTMLElement).innerText || p.textContent || "";
              if (text.trim()) {
                paragraphs.push(text.trim());
              }
            });
            fullText = paragraphs.join(" ");
          } else {
            // Fallback: Find the selection's container and walk up to find content
            const range = selection.getRangeAt(0);
            let container = range.commonAncestorContainer;

            // Walk up to find content container, skipping UI elements
            let current: Node | null =
              container.nodeType === Node.TEXT_NODE
                ? container.parentElement
                : container instanceof HTMLElement
                ? container
                : container.parentElement;

            while (current && current instanceof HTMLElement) {
              const className = current.className || "";
              const tagName = current.tagName.toLowerCase();

              // Skip UI elements
              if (
                tagName === "button" ||
                tagName === "input" ||
                tagName === "select" ||
                tagName === "label" ||
                tagName === "nav" ||
                tagName === "header" ||
                tagName === "footer" ||
                className.includes("switch") ||
                className.includes("card-header") ||
                className.includes("card-footer") ||
                current.closest("button, nav, header, [role='button']")
              ) {
                current = current.parentElement;
                continue;
              }

              // Found content container (prose, BionicText wrapper, etc.)
              if (
                className.includes("prose") ||
                className.includes("text-relaxed") ||
                className.includes("max-w-4xl") ||
                tagName === "article" ||
                tagName === "section" ||
                current.querySelector("p[data-section-id]")
              ) {
                // Clone and remove UI elements
                const clone = current.cloneNode(true) as HTMLElement;
                clone
                  .querySelectorAll(
                    "button, input, select, label, nav, header, footer, [role='button'], .switch"
                  )
                  .forEach((el) => el.remove());
                fullText = clone.innerText || clone.textContent || "";
                break;
              }

              current = current.parentElement;
            }
          }
        }

        // Clean up the text - normalize whitespace
        fullText = fullText
          .replace(/\s+/g, " ")
          .replace(/\n\s*\n/g, "\n")
          .trim();

        setSelectedText(selectedText);
        setContext(getSurroundingContext(fullText, selectedText, 100));

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Calculate position relative to viewport, handling scroll
        setButtonPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10, // Fixed position uses viewport coordinates, no scrollY needed
        });

        setShowButton(true);
      } else {
        setShowButton(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
          setShowButton(false);
        }
      }
    };

    const handleScroll = () => {
      if (showButton) {
        setShowButton(false);
      }
    };

    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", handleScroll, { capture: true });
    
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [text, showButton]);

  const cleanup = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Close cleanup
  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setIsLoading(false);
    }
  }, [isOpen]);

  // Robust Polling Function
  const pollJobStatus = async (statusUrl: string) => {
    const poll = async () => {
      try {
        const res = await fetch(statusUrl);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Job expired or not found");
          return; // Transient network error, retry next tick
        }

        const data = await res.json();
        console.log("[AI Widget] Poll status:", data.status);

        if (data.status === "completed") {
          //

          // [Image of server vs client side processing]

          // Backend has finished and saved the JSON. We display it.
          cleanup();

          // Handle cases where data might be nested or a string
          let finalResult = "";
          if (data.result?.data) {
            finalResult =
              typeof data.result.data === "string"
                ? data.result.data
                : JSON.stringify(data.result.data);
          }

          if (!finalResult) {
            setError("Received empty response from AI");
          } else {
            setExplanation(finalResult);
          }
          setIsLoading(false);
        } else if (data.status === "failed") {
          cleanup();
          setError(data.error || "Generation failed");
          setIsLoading(false);
        }
        // If "queued" or "processing", we do nothing and let the interval run again
      } catch (err) {
        console.error("Polling error:", err);
        // Don't stop polling on single network glitch, but maybe count errors if needed
      }
    };

    // Poll every 1 second
    pollIntervalRef.current = setInterval(poll, 1000);
  };

  const handleExplain = async () => {
    if (!selectedText) return;

    setIsOpen(true);
    setShowButton(false);
    setIsLoading(true);
    setExplanation("");
    setError(null);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: selectedText,
          context: context || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to start request");

      // Scenario 1: Immediate Result (Cached)
      if (data.success && data.data) {
        setExplanation(data.data);
        setIsLoading(false);
        return;
      }

      // Scenario 2: Job Queued (Polling required)
      if (data.jobId && data.statusUrl) {
        console.log(`[AI Widget] Job ${data.jobId} queued. Polling...`);
        pollJobStatus(data.statusUrl);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  // Helper to parse explanation
  const parseExplanation = (text: string | object) => {
    if (typeof text === "object") return text as any;
    try {
      let jsonText = text.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }
      
      // If it still doesn't start with {, try to find the first { and last }
      if (!jsonText.startsWith("{")) {
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (match) {
          jsonText = match[0];
        }
      }
      
      return JSON.parse(jsonText);
    } catch (e) {
      return { definition: text };
    }
  };

  const [activeTab, setActiveTab] = useState<"definition" | "synonyms" | "context">("definition");
  const parsedExplanation = explanation ? parseExplanation(explanation) : null;

  return (
    <>
      {/* Floating Button */}
      {showButton && (
        <div
          ref={buttonRef}
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full"
          style={{ left: buttonPosition.x, top: buttonPosition.y }}
        >
          <Button
            onClick={handleExplain}
            size="sm"
            className="shadow-lg animate-in fade-in zoom-in duration-200"
          >
            Explain
          </Button>
        </div>
      )}

      {/* Result Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Explain: "{selectedText}"</DialogTitle>
            <DialogDescription>
              AI-generated explanation based on context.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[150px] py-2">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse">
                  Thinking...
                </p>
              </div>
            ) : error ? (
              <div className="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
                <p className="font-semibold">Error</p>
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExplain}
                  className="mt-4 border-destructive/30 hover:bg-destructive/20"
                >
                  <RefreshCw className="w-3 h-3 mr-2" /> Retry
                </Button>
              </div>
            ) : parsedExplanation ? (
              <div className="space-y-4">
                {/* Tabs */}
                <div className="flex space-x-1 bg-muted/50 p-1 rounded-lg mb-4">
                  <button
                    onClick={() => setActiveTab("definition")}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                      activeTab === "definition"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    Definition
                  </button>
                  <button
                    onClick={() => setActiveTab("synonyms")}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                      activeTab === "synonyms"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    Synonyms
                  </button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[80px] animate-in fade-in slide-in-from-bottom-2 duration-300 mb-6">
                  {activeTab === "definition" && (
                    <div className="prose prose-sm dark:prose-invert leading-relaxed">
                      <p>{parsedExplanation.definition}</p>
                    </div>
                  )}

                  {activeTab === "synonyms" && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground mb-2">
                        Similar words to "{selectedText}":
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {parsedExplanation.synonyms &&
                        Array.isArray(parsedExplanation.synonyms) &&
                        parsedExplanation.synonyms.length > 0 ? (
                          parsedExplanation.synonyms.map(
                            (syn: string, i: number) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"
                              >
                                {syn}
                              </span>
                            )
                          )
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            No synonyms found.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Context Section (Always Visible at Bottom) */}
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Context
                  </p>
                  {context ? (
                    <div className="bg-muted/30 p-3 rounded-md border border-border/50">
                      <p className="text-sm text-foreground/90 italic leading-relaxed whitespace-pre-wrap">
                        "...{context}..."
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No context available from the page.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
