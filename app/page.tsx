"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OCRUpload } from "@/components/features/OCRUpload";
import { PDFUpload } from "@/components/features/PDFUpload";
import { useAppStore } from "@/lib/store";
import { sanitizeText } from "@/lib/utils";
import { BookOpen, Upload } from "lucide-react";



export default function HomePage() {
  const [text, setText] = useState("");
  const router = useRouter();
  const setPdfSession = useAppStore((state) => state.setPdfSession);
  const setPageText = useAppStore((state) => state.setPageText);
  const setPageImage = useAppStore((state) => state.setPageImage);
  const clearPdfSession = useAppStore((state) => state.clearPdfSession);

  const handleStartReading = () => {
    try {
      const sanitized = sanitizeText(text);
      if (!sanitized.trim()) {
        alert("Please enter or upload some text to read.");
        return;
      }

      // Chunk the text into "virtual pages"
      const { chunkText } = require("@/lib/utils"); // Dynamic import to avoid server/client issues if any
      const chunks = chunkText(sanitized, 500); // 500 words per page

      // Generate unique ID for session
      const sessionId =
        Date.now().toString(36) + Math.random().toString(36).substr(2);
      const virtualPdfId = `text-${sessionId}`;

      // Clear previous session
      clearPdfSession();

      // Initialize new "Virtual PDF" session
      setPdfSession({
        pdfId: virtualPdfId,
        sessionId: sessionId,
        name: "Pasted Text",
        pageCount: chunks.length,
      });

      // Pre-populate the page cache with our chunks
      chunks.forEach((chunk: string, index: number) => {
        setPageText(index + 1, chunk);
        // No images for text mode
        setPageImage(index + 1, ""); 
      });

      // Navigate to reader page
      router.push(`/reader/${sessionId}`);
    } catch (error) {
      console.error("Error starting reading session:", error);
      alert("An error occurred. Please try again.");
    }
  };

  const handlePdfReady = (sessionId: string) => {
    router.push(`/reader/${sessionId}`);
  };

  const handleTextExtracted = (extractedText: string) => {
    setText(extractedText);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="spacing-relaxed w-full max-w-4xl mx-auto animate-fade-in-up">
        <header className="mb-12 text-center space-y-4">
          <div className="inline-block p-3 rounded-2xl glass-panel mb-4 shadow-sm">
            <BookOpen className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 grey:from-slate-700 grey:to-slate-500 dim:from-blue-100 dim:to-slate-400">
            NeuroFocus
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Transform complex study materials into neuro-friendly formats with AI-powered tools.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-2">
          {/* PDF Upload Section */}
          <div className="glass-panel rounded-xl p-1 delay-100 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
            <PDFUpload onPdfReady={handlePdfReady} />
          </div>

          {/* OCR Upload Section */}
          <div className="glass-panel rounded-xl p-1 delay-200 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
            <OCRUpload onTextExtracted={handleTextExtracted} />
          </div>

          {/* Text Input Section - Spans full width */}
          <div className="md:col-span-2 glass-panel rounded-xl p-1 delay-300 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
             <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Paste Text
                </CardTitle>
                <CardDescription>
                  Directly paste text to read
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  id="text-input"
                  placeholder="Paste your text here..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
                <Button
                  onClick={handleStartReading}
                  disabled={!text.trim()}
                  className="w-full bg-primary/90 hover:bg-primary transition-all shadow-lg hover:shadow-primary/25"
                  size="lg"
                >
                  Start Reading
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

