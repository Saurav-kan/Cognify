"use client";

import { useEffect } from "react";

export function GlobalErrorHandler() {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[Global Error Handler] Unhandled promise rejection:", event.reason);
      console.error("[Global Error Handler] Rejection details:", {
        reason: event.reason,
        message: event.reason?.message,
        stack: event.reason?.stack,
        name: event.reason?.name,
        toString: event.reason?.toString(),
      });
    };

    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      console.error("[Global Error Handler] Unhandled error:", event.error);
      console.error("[Global Error Handler] Error details:", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        errorMessage: event.error?.message,
        errorStack: event.error?.stack,
        errorName: event.error?.name,
      });
      
      // Check if it's the Object.defineProperty error
      if (
        event.message?.includes("Object.defineProperty") ||
        event.error?.message?.includes("Object.defineProperty") ||
        event.message?.includes("non-object") ||
        event.error?.message?.includes("non-object")
      ) {
        console.error("[Global Error Handler] ⚠️ DETECTED Object.defineProperty ERROR!");
        console.error("[Global Error Handler] Full error object:", event.error);
        console.error("[Global Error Handler] Error stack trace:", event.error?.stack);
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}

