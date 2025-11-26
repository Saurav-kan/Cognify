"use client";

import { useState, useMemo } from "react";
import { useAppStore, PageSummaryData } from "@/lib/store";
import { getPageText } from "@/lib/pdf-loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Download, Layers, Sparkles, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FlashcardStudyModal } from "./FlashcardStudyModal";

export function FlashcardManager() {
  const pdfPageCount = useAppStore((state) => state.pdfPageCount);
  const currentPdfId = useAppStore((state) => state.currentPdfId);
  const pageSummaryCache = useAppStore((state) => state.pageSummaryCache);
  const pageTextCache = useAppStore((state) => state.pageTextCache);
  const chapterGroupSize = useAppStore((state) => state.chapterGroupSize);
  const setChapterGroupSize = useAppStore((state) => state.setChapterGroupSize);
  const setPageSummary = useAppStore((state) => state.setPageSummary);
  const setPageText = useAppStore((state) => state.setPageText);

  const [generatingChapters, setGeneratingChapters] = useState<Set<number>>(
    new Set()
  );
  const [isStudyModalOpen, setIsStudyModalOpen] = useState(false);
  const [studyCards, setStudyCards] = useState<string[]>([]);
  const [studyTitle, setStudyTitle] = useState("");

  // Calculate chapters
  const chapters = useMemo(() => {
    if (!pdfPageCount) return [];
    const count = Math.ceil(pdfPageCount / chapterGroupSize);
    return Array.from({ length: count }, (_, i) => {
      const start = i * chapterGroupSize + 1;
      const end = Math.min((i + 1) * chapterGroupSize, pdfPageCount);
      return { index: i, start, end };
    });
  }, [pdfPageCount, chapterGroupSize]);

  // Calculate stats for a chapter
  const getChapterStats = (start: number, end: number) => {
    let hasFlashcards = 0;
    let totalFlashcards = 0;
    const missingPages: number[] = [];

    for (let i = start; i <= end; i++) {
      const data = pageSummaryCache[i];
      if (typeof data === "object" && data.flashcards && data.flashcards.length > 0) {
        hasFlashcards++;
        totalFlashcards += data.flashcards.length;
      } else {
        missingPages.push(i);
      }
    }

    return {
      total: end - start + 1,
      completed: hasFlashcards,
      cardCount: totalFlashcards,
      missingPages,
      progress: (hasFlashcards / (end - start + 1)) * 100,
    };
  };

  // Generate missing flashcards for a chapter
  const handleGenerateChapter = async (chapterIndex: number, missingPages: number[]) => {
    if (missingPages.length === 0 || !currentPdfId) return;

    setGeneratingChapters((prev) => new Set(prev).add(chapterIndex));

    try {
      // Process in batches of 5
      const batchSize = 5;
      for (let i = 0; i < missingPages.length; i += batchSize) {
        const batchPageNums = missingPages.slice(i, i + batchSize);
        const batchPages: { pageNumber: number; pageText: string }[] = [];

        // Get text for each page
        for (const pageNum of batchPageNums) {
          let text = pageTextCache[pageNum];
          if (!text) {
            try {
              text = await getPageText(currentPdfId, pageNum);
              setPageText(pageNum, text);
            } catch (err) {
              console.error(`Failed to get text for page ${pageNum}`, err);
              continue;
            }
          }
          if (text && text.trim().length > 10) {
            batchPages.push({ pageNumber: pageNum, pageText: text });
          }
        }

        if (batchPages.length === 0) continue;

        // Call API
        const response = await fetch("/api/summarize-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pages: batchPages.map((p) => ({
              pageNumber: p.pageNumber,
              pageText: p.pageText,
            })),
            forceRefresh: true, // Force refresh to get flashcards and key points
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate summaries");
        }

        // Handle stream response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullSummary = "";

        if (reader) {
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
                  // Ignore
                }
              }
            }
          }
        }

        // Parse JSON result
        try {
          let jsonText = fullSummary.trim();
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

          const summaries = JSON.parse(jsonText);
          console.log("[FlashcardManager] Parsed Summaries:", summaries);
          
          // Update store
          batchPages.forEach(({ pageNumber }) => {
            const data = summaries[pageNumber.toString()] || summaries[pageNumber];
            if (data) {
              if (typeof data === "string") {
                setPageSummary(pageNumber, data);
              } else if (typeof data === "object" && data.summary) {
                setPageSummary(pageNumber, {
                  summary: data.summary,
                  flashcards: data.flashcards || [],
                  keyPoints: data.keyPoints || data.key_points || [],
                });
              }
            }
          });
        } catch (e) {
          console.error("Failed to parse summary response:", e);
        }
      }
    } catch (error) {
      console.error("Failed to generate chapter:", error);
    } finally {
      setGeneratingChapters((prev) => {
        const next = new Set(prev);
        next.delete(chapterIndex);
        return next;
      });
    }
  };

  const handleExportAnki = (chapterIndex: number | null = null) => {
    let cardsToExport: string[] = [];

    const processPage = (pageNum: number) => {
      const data = pageSummaryCache[pageNum];
      if (typeof data === "object" && data.flashcards) {
        data.flashcards.forEach((card) => {
          // Format: "Card Text | Source: Page #"
          cardsToExport.push(`${card} | Source: Page ${pageNum}`);
        });
      }
    };

    if (chapterIndex !== null) {
      // Export specific chapter
      const chapter = chapters[chapterIndex];
      for (let i = chapter.start; i <= chapter.end; i++) {
        processPage(i);
      }
    } else {
      // Export all
      for (let i = 1; i <= pdfPageCount; i++) {
        processPage(i);
      }
    }

    if (cardsToExport.length === 0) {
      alert("No flashcards found to export.");
      return;
    }

    const blob = new Blob([cardsToExport.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flashcards-${chapterIndex !== null ? `chapter-${chapterIndex + 1}` : "all"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStudy = (chapterIndex: number | null = null) => {
    let cards: string[] = [];

    const collectCards = (pageNum: number) => {
      const data = pageSummaryCache[pageNum];
      if (typeof data === "object" && data.flashcards) {
        cards.push(...data.flashcards);
      }
    };

    if (chapterIndex !== null) {
      const chapter = chapters[chapterIndex];
      for (let i = chapter.start; i <= chapter.end; i++) {
        collectCards(i);
      }
      setStudyTitle(`Chapter ${chapterIndex + 1} Study`);
    } else {
      for (let i = 1; i <= pdfPageCount; i++) {
        collectCards(i);
      }
      setStudyTitle("Full Study Session");
    }

    if (cards.length === 0) {
      alert("No flashcards found to study.");
      return;
    }

    setStudyCards(cards);
    setIsStudyModalOpen(true);
  };

  if (!pdfPageCount) return null;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="h-6 w-6" />
          Flashcard Manager
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Group by:</span>
          <Select
            value={chapterGroupSize.toString()}
            onValueChange={(v) => setChapterGroupSize(Number(v))}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="12">12</SelectItem>
              <SelectItem value="20">20</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {chapters.map((chapter) => {
          const stats = getChapterStats(chapter.start, chapter.end);
          const isGenerating = generatingChapters.has(chapter.index);

          return (
            <Card key={chapter.index} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  Chapter {chapter.index + 1}
                </CardTitle>
                <CardDescription>
                  Pages {chapter.start} - {chapter.end}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>
                        {stats.completed} / {stats.total} pages
                      </span>
                    </div>
                    <Progress value={stats.progress} className="h-2" />
                  </div>

                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>{stats.cardCount} cards ready</span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={stats.missingPages.length === 0 || isGenerating}
                      onClick={() =>
                        handleGenerateChapter(chapter.index, stats.missingPages)
                      }
                    >
                      {isGenerating ? (
                        <Sparkles className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Generate
                    </Button>
                    
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      disabled={stats.cardCount === 0}
                      onClick={() => handleExportAnki(chapter.index)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Anki
                    </Button>

                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={stats.cardCount === 0}
                      onClick={() => handleStudy(chapter.index)}
                    >
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Study
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button onClick={() => handleExportAnki(null)}>
          <Download className="h-4 w-4 mr-2" />
          Export All Flashcards
        </Button>
        <Button onClick={() => handleStudy(null)} className="ml-2">
          <PlayCircle className="h-4 w-4 mr-2" />
          Study All
        </Button>
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
