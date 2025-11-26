"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlashcardStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: string[]; // Array of raw cloze strings
  title?: string;
}

export function FlashcardStudyModal({
  isOpen,
  onClose,
  cards,
  title = "Flashcard Study",
}: FlashcardStudyModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  }, [isOpen]);

  const handleNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((prev) => prev + 1), 150); // Small delay for flip reset
    }
  }, [currentIndex, cards.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((prev) => prev - 1), 150);
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleFlip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, handleFlip]);

  // Parse Cloze Deletion
  // Example: "The {{c1::mitochondria}} is the powerhouse."
  const parseCard = (rawCard: string) => {
    const clozeRegex = /{{c\d+::(.*?)(?:::(.*?))?}}/g;
    
    // Front: Replace {{c1::answer}} with [ ... ]
    const front = rawCard.replace(clozeRegex, "__________");
    
    // Back: Replace {{c1::answer}} with <span class="highlight">answer</span>
    // We'll return segments to render React nodes
    const backSegments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    // Reset regex state
    clozeRegex.lastIndex = 0;

    while ((match = clozeRegex.exec(rawCard)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        backSegments.push(rawCard.substring(lastIndex, match.index));
      }
      
      // Add highlighted answer
      const answer = match[1];
      const hint = match[2]; // Optional hint
      
      backSegments.push(
        <span key={match.index} className="font-bold text-primary bg-primary/10 px-1 rounded">
          {answer}
        </span>
      );
      
      lastIndex = clozeRegex.lastIndex;
    }
    
    // Add remaining text
    if (lastIndex < rawCard.length) {
      backSegments.push(rawCard.substring(lastIndex));
    }

    return { front, back: backSegments };
  };

  if (!isOpen || cards.length === 0) return null;

  const currentCard = cards[currentIndex];
  const { front, back } = parseCard(currentCard);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-muted/30">
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Card {currentIndex + 1} of {cards.length}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Space to flip • Arrows to navigate</span>
          </div>
        </div>

        {/* Card Area */}
        <div className="flex-1 p-8 flex items-center justify-center bg-muted/10 perspective-1000">
          <div
            className={cn(
              "relative w-full max-w-2xl aspect-[3/2] transition-all duration-500 transform-style-3d cursor-pointer",
              isFlipped ? "rotate-y-180" : ""
            )}
            onClick={handleFlip}
          >
            {/* Front */}
            <div className="absolute inset-0 backface-hidden bg-card border shadow-lg rounded-xl flex flex-col items-center justify-center p-8 text-center hover:shadow-xl transition-shadow">
              <p className="text-2xl font-medium leading-relaxed">{front}</p>
              <p className="mt-8 text-sm text-muted-foreground uppercase tracking-widest font-semibold">
                Click to Flip
              </p>
            </div>

            {/* Back */}
            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-card border border-primary/20 shadow-lg rounded-xl flex flex-col items-center justify-center p-8 text-center hover:shadow-xl transition-shadow">
              <p className="text-2xl font-medium leading-relaxed">{back}</p>
              <p className="mt-8 text-sm text-muted-foreground uppercase tracking-widest font-semibold">
                Answer
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 border-t bg-card flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <Button variant="ghost" size="icon" onClick={handleFlip}>
            <RotateCw className="h-5 w-5" />
          </Button>

          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
