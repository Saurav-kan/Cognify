"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { BionicText } from "@/components/features/BionicText";
import { PanicOverlay } from "@/components/features/PanicOverlay";
import { AIWidget } from "@/components/features/AIWidget";
import { PomodoroTimer } from "@/components/features/PomodoroTimer";
import { ProgressTracker } from "@/components/features/ProgressTracker";
import { TTSReader } from "@/components/features/TTSReader";
import { PDFReader } from "@/components/features/PDFReader";
import { ThemeSelector } from "@/components/features/ThemeSelector";
import { VisualSettings } from "@/components/features/VisualSettings";
import { FlashcardManager } from "@/components/features/FlashcardManager";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Layers } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, ChevronLeft, ChevronRight, X, Lightbulb } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function ReaderPage() {
  const router = useRouter();
  const {
    currentText,
    bionicEnabled,
    focusModeEnabled,
    currentSentenceIndex,
    fontFamily,
    pdfDisplayMode,
    pdfScrollingMode,
    toggleBionic,
    toggleFocusMode,
    setSentenceIndex,
    setFontFamily,
    setPdfDisplayMode,
    setPdfScrollingMode,
    startSession,
    setCurrentPage,
  } = useAppStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);

  // Get PDF session data
  const pdfSessionId = useAppStore((state) => state.pdfSessionId);
  const currentPdfId = useAppStore((state) => state.currentPdfId);
  const currentPdfName = useAppStore((state) => state.currentPdfName);
  const pdfPageCount = useAppStore((state) => state.pdfPageCount);
  const currentPage = useAppStore((state) => state.currentPage);
  const pageTextCache = useAppStore((state) => state.pageTextCache);

  // Redirect if no text AND no PDF session
  useEffect(() => {
    if (!currentText && !pdfSessionId) {
      router.push("/");
    }
  }, [currentText, pdfSessionId, router]);

  // Start session tracking when page loads
  useEffect(() => {
    startSession();
  }, [startSession]);

  // Check for tutorial status
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem("hasSeenExplainTutorial");
    if (!hasSeenTutorial) {
      // Small delay to let the page load
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem("hasSeenExplainTutorial", "true");
  };

  // Show loading state if we have a PDF session but haven't loaded content yet
  if (!currentText && !pdfSessionId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Floating Sidebar Toggle Button (when closed) */}
      {!sidebarOpen && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          className="fixed left-2 top-4 z-50 h-10 w-10 shadow-lg bg-background hover:bg-accent"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}

      {/* Sidebar with ADHD Tools */}
      <div
        className={cn(
          "border-r bg-card transition-all duration-300 overflow-y-auto sticky top-0 h-screen",
          sidebarOpen ? "w-80" : "w-0"
        )}
      >
        <div className={cn("p-4 space-y-4", !sidebarOpen && "hidden")}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Study Tools</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <PomodoroTimer />
          <VisualSettings />
          <TTSReader
            text={
              pdfSessionId
                ? // For PDFs, concatenate all loaded page texts for continuous reading
                  Object.keys(pageTextCache)
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .map((pageNum) => pageTextCache[parseInt(pageNum)])
                    .filter(Boolean) // Remove any empty/undefined pages
                    .join("\n\n") || ""
                : currentText || ""
            }
          />
          <ProgressTracker />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Settings Panel */}
        <div className="border-b bg-card">
          <div className="spacing-relaxed">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => router.push("/")}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </div>

              <Card className="border-0 bg-transparent shadow-none">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-6">
                    {/* Bionic Reading Toggle */}
                    <div className="flex items-center gap-2">
                      <Label htmlFor="bionic-toggle" className="cursor-pointer">
                        Bionic Reading
                      </Label>
                      <Switch
                        id="bionic-toggle"
                        checked={bionicEnabled}
                        onCheckedChange={(checked) => {
                          toggleBionic();
                          // Track feature usage
                          fetch("/api/analytics/track", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              type: "feature",
                              feature: "bionic_reading",
                              enabled: checked,
                            }),
                          }).catch(() => {});
                        }}
                        aria-label="Toggle bionic reading"
                      />
                    </div>

                    {/* Focus Mode Toggle */}
                    <div className="flex items-center gap-2">
                      <Label htmlFor="focus-toggle" className="cursor-pointer">
                        Focus Mode
                      </Label>
                      <Switch
                        id="focus-toggle"
                        checked={focusModeEnabled}
                        onCheckedChange={(checked) => {
                          toggleFocusMode();
                          // Track feature usage
                          fetch("/api/analytics/track", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              type: "feature",
                              feature: "focus_mode",
                              enabled: checked,
                            }),
                          }).catch(() => {});
                        }}
                        aria-label="Toggle focus mode"
                      />
                    </div>

                    {/* Theme Selector */}
            <div className="flex items-center justify-between">
              <Label>Theme</Label>
              <ThemeSelector />
            </div>

          {/* Flashcard Manager */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Layers className="h-4 w-4" />
                Manage Flashcards
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <FlashcardManager />
            </DialogContent>
          </Dialog>

            {/* Font Selector */}
                    <div className="flex items-center gap-2">
                      <Label htmlFor="font-select" className="cursor-pointer">
                        Font:
                      </Label>
                      <select
                        id="font-select"
                        value={fontFamily}
                        onChange={(e) =>
                          setFontFamily(
                            e.target.value as "inter" | "opendyslexic"
                          )
                        }
                        aria-label="Select font family"
                        className="rounded-md border border-input bg-background text-foreground px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="inter">Inter</option>
                        <option value="opendyslexic">OpenDyslexic</option>
                      </select>
                    </div>

                    {/* PDF Display Mode (only show for PDFs) */}
                    {pdfSessionId && (
                      <>
                        <div className="flex items-center gap-2">
                          <Label
                            htmlFor="display-mode-select"
                            className="cursor-pointer"
                          >
                            Display:
                          </Label>
                          <select
                            id="display-mode-select"
                            value={pdfDisplayMode}
                            onChange={(e) =>
                              setPdfDisplayMode(
                                e.target.value as "text" | "image" | "both"
                              )
                            }
                            aria-label="Select display mode"
                            className="rounded-md border border-input bg-background text-foreground px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="both">Both</option>
                            <option value="text">Text Only</option>
                            <option value="image">Image Only</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <Label
                            htmlFor="scrolling-mode-select"
                            className="cursor-pointer"
                          >
                            Scrolling:
                          </Label>
                          <select
                            id="scrolling-mode-select"
                            value={pdfScrollingMode}
                            onChange={(e) =>
                              setPdfScrollingMode(
                                e.target.value as "paginated" | "continuous"
                              )
                            }
                            aria-label="Select scrolling mode"
                            className="rounded-md border border-input bg-background text-foreground px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="paginated">Paginated</option>
                            <option value="continuous">Continuous</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Main Reading Area */}
        <div className="spacing-relaxed flex-1">
          {pdfSessionId ? (
            // PDF Reader
            <PDFReader />
          ) : (
            // Regular Text Reader
            <div
              className={cn(
                "mx-auto max-w-4xl py-8",
                fontFamily === "opendyslexic" && "font-dyslexic"
              )}
            >
              <BionicText
                text={currentText}
                enabled={bionicEnabled}
                fontFamily={fontFamily}
                className="prose prose-lg dark:prose-invert max-w-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Panic Overlay (Focus Mode) */}
      <PanicOverlay
        text={pdfSessionId ? pageTextCache[currentPage] || "" : currentText}
        enabled={focusModeEnabled}
        currentSentenceIndex={currentSentenceIndex}
        onSentenceChange={setSentenceIndex}
        onClose={toggleFocusMode}
        bionicEnabled={bionicEnabled}
        fontFamily={fontFamily}
        isPdf={!!pdfSessionId}
        currentPage={currentPage}
        pdfPageCount={pdfPageCount}
        onPreviousPage={
          pdfSessionId && currentPage > 1
            ? () => {
                setCurrentPage(currentPage - 1);
                setSentenceIndex(0); // Reset to first sentence of new page
              }
            : undefined
        }
        onNextPage={
          pdfSessionId && currentPage < pdfPageCount
            ? () => {
                setCurrentPage(currentPage + 1);
                setSentenceIndex(0); // Reset to first sentence of new page
              }
            : undefined
        }
      />

      {/* AI Widget (always active for text selection) */}
      <AIWidget text={currentText} />
      {/* Tutorial Toast */}
      {showTutorial && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <Card className="w-full max-w-md shadow-2xl border-primary/20 bg-card/95 backdrop-blur">
            <CardContent className="p-4 flex items-start gap-4">
              <div className="bg-primary/10 p-2 rounded-full">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-1">Quick Tip</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Highlight any text on the page to get an instant AI explanation or summary!
                </p>
                <Button size="sm" onClick={dismissTutorial}>
                  Got it
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mt-1 -mr-2 text-muted-foreground hover:text-foreground"
                onClick={dismissTutorial}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
