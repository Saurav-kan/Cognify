"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, RotateCw, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFSummarySidebarProps {
  pageNumber: number;
  summary: string | null;
  flashcards?: string[];
  keyPoints?: string[];
  isGenerating: boolean;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  onStudy?: () => void;
}

export function PDFSummarySidebar({
  pageNumber,
  summary,
  flashcards = [],
  keyPoints = [],
  isGenerating,
  onGenerate,
  onRegenerate,
  onStudy,
}: PDFSummarySidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showFlashcardList, setShowFlashcardList] = useState(false);

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
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 pr-12">
            <CardTitle className="text-lg">Page {pageNumber} Summary</CardTitle>
            {summary && onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerate}
                disabled={isGenerating}
                title="Regenerate Summary"
                className="h-8 w-8"
              >
                <RotateCw className={cn("h-4 w-4", isGenerating && "animate-spin")} />
              </Button>
            )}
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
              <div className="space-y-6">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Summary
                  </h4>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {summary}
                  </p>
                </div>

                {keyPoints && keyPoints.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Key Points
                    </h4>
                    <ul className="list-disc list-inside space-y-2 text-sm">
                      {keyPoints.map((point, index) => (
                        <li key={index} className="leading-relaxed">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {flashcards && flashcards.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex flex-col gap-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Flashcards ({flashcards.length})
                      </h4>
                      
                      {onStudy && (
                        <Button 
                          className="w-full" 
                          onClick={onStudy}
                          variant="default"
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Study Flashcards
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowFlashcardList(!showFlashcardList)}
                        className="text-xs text-muted-foreground"
                      >
                        {showFlashcardList ? "Hide List" : "View All Questions"}
                      </Button>
                    </div>

                    {showFlashcardList && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        {flashcards.map((card, index) => (
                          <div
                            key={index}
                            className="p-3 bg-secondary/30 rounded-lg border text-sm"
                          >
                            <p className="leading-relaxed">{card}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
