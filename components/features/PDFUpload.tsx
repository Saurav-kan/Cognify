"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, FileInput, FileWarning } from "lucide-react";
import { loadPdfFromArrayBuffer, releasePdf } from "@/lib/pdf-loader";
import { useAppStore } from "@/lib/store";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

interface PDFUploadProps {
  onPdfReady?: (sessionId: string) => void;
}

export function PDFUpload({ onPdfReady }: PDFUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const currentPdfId = useAppStore((state) => state.currentPdfId);
  const setPdfSession = useAppStore((state) => state.setPdfSession);
  const clearPdfSession = useAppStore((state) => state.clearPdfSession);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    console.log("[PDF Upload] File select triggered");
    const file = event.target.files?.[0];
    if (!file) {
      console.log("[PDF Upload] No file selected");
      return;
    }

    console.log("[PDF Upload] File selected:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (file.type !== "application/pdf") {
      console.warn("[PDF Upload] Invalid file type:", file.type);
      setError("Please upload a PDF file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      console.warn("[PDF Upload] File too large:", file.size);
      setError(`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setFileName(file.name);
    setPageCount(null);

    try {
      console.log("[PDF Upload] Converting file to ArrayBuffer...");
      const arrayBuffer = await file.arrayBuffer();
      console.log(
        "[PDF Upload] ✅ ArrayBuffer created, size:",
        arrayBuffer.byteLength
      );

      if (currentPdfId) {
        console.log("[PDF Upload] Releasing previous PDF:", currentPdfId);
        releasePdf(currentPdfId);
        clearPdfSession();
      }

      const pdfId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `pdf-${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2)}`;

      const sessionId = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`;

      console.log("[PDF Upload] PDF ID:", pdfId);
      console.log("[PDF Upload] Session ID:", sessionId);
      console.log("[PDF Upload] Calling loadPdfFromArrayBuffer...");

      const { pageCount } = await loadPdfFromArrayBuffer(arrayBuffer, pdfId);

      console.log("[PDF Upload] ✅ PDF loaded successfully, pages:", pageCount);

      console.log("[PDF Upload] Setting PDF session in store...");
      setPdfSession({
        pdfId,
        sessionId,
        name: file.name,
        pageCount,
      });
      console.log("[PDF Upload] ✅ Session set in store");

      setPageCount(pageCount);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (onPdfReady) {
        console.log("[PDF Upload] Calling onPdfReady callback...");
        onPdfReady(sessionId);
      } else {
        console.log("[PDF Upload] Navigating to reader page...");
        router.push(`/reader/${sessionId}`);
      }
    } catch (err) {
      console.error("[PDF Upload] ❌ Error processing PDF:", err);
      console.error("[PDF Upload] Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
        toString: err?.toString(),
      });

      // Log full error object
      if (err instanceof Error) {
        console.error("[PDF Upload] Full error object:", {
          message: err.message,
          stack: err.stack,
          name: err.name,
          cause: (err as any).cause,
        });
      }

      const message =
        err instanceof Error
          ? err.message
          : "Failed to process PDF. Please try again.";
      setError(message);
    } finally {
      console.log("[PDF Upload] Processing complete");
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileInput className="h-5 w-5" />
          PDF Loader
        </CardTitle>
        <CardDescription>
          Upload a PDF to process it page by page with cached AI summaries
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pdf-file">Upload PDF</Label>
          <Input
            id="pdf-file"
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            ref={fileInputRef}
            disabled={isProcessing}
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            Supported format: PDF (Max 25MB)
          </p>
        </div>

        {isProcessing && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading {fileName ?? "PDF"}...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <FileWarning className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {!error && pageCount !== null && fileName && (
          <div className="space-y-1 rounded-md bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
            <p>
              Loaded <strong>{fileName}</strong>
            </p>
            <p>{pageCount} pages detected. Launching the reader...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
