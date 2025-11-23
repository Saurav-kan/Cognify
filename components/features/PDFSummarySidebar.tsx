"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFSummarySidebarProps {
  pageNumber: number;
  summary: string | null;
  isGenerating: boolean;
  onGenerate?: () => void;
}

export function PDFSummarySidebar({
  pageNumber,
  summary,
  isGenerating,
  onGenerate,
}: PDFSummarySidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      className={cn(
        "relative border-l bg-card transition-all duration-300 overflow-visible",
        isOpen ? "w-80" : "w-0"
      )}
    >
      {/* Toggle Button - Always visible, positioned outside collapsed sidebar */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "absolute top-4 z-10 transition-all duration-300 bg-card border shadow-sm",
          isOpen ? "right-2" : "-left-10"
        )}
        aria-label={isOpen ? "Collapse summary" : "Expand summary"}
      >
        {isOpen ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>

      {/* Content */}
      <div className={cn("h-full overflow-y-auto", !isOpen && "hidden")}>
        <Card className="border-0 shadow-none rounded-none h-full flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Page {pageNumber} Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {isGenerating && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Generating summary...
                </span>
              </div>
            )}

            {!isGenerating && summary && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {summary}
                </p>
              </div>
            )}

            {!isGenerating && !summary && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <p>No summary available for this page.</p>
                {onGenerate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onGenerate}
                    className="mt-4"
                  >
                    Generate Summary
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

