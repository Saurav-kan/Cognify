"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Play, Pause, Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TTSReaderProps {
  text: string;
}

/**
 * Text-to-Speech Reader using Web Speech API
 * Highlights words as they're read and tracks progress
 */
export function TTSReader({ text }: TTSReaderProps) {
  const { markSectionAsRead, setReadingProgress } = useAppStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const wordsRef = useRef<
    Array<{ word: string; sectionId: string; index: number }>
  >([]);
  const wordElementsRef = useRef<Map<number, HTMLElement>>(new Map());

  // Parse text into words with section tracking and build text mapping
  // IMPORTANT: Build map from the actual text prop (what TTS speaks), not DOM text
  const textToWordsMapRef = useRef<
    Map<
      number,
      { word: string; sectionId: string; charStart: number; charEnd: number }
    >
  >(new Map());

  useEffect(() => {
    if (!text) {
      wordsRef.current = [];
      textToWordsMapRef.current.clear();
      console.log("[TTSReader] No text provided");
      return;
    }
    console.log("[TTSReader] Text received, length:", text.length);

    // Get sections from DOM
    const sections = document.querySelectorAll("[data-section-id]");
    const sectionArray = Array.from(sections);

    // Build word map from the actual text prop (what TTS will speak)
    const words: Array<{ word: string; sectionId: string; index: number }> = [];
    const textMap = new Map<
      number,
      { word: string; sectionId: string; charStart: number; charEnd: number }
    >();

    // Split the text prop into words (this is what TTS speaks)
    const textWords = text.split(/\s+/).filter((w) => w.trim().length > 0);

    // Get section texts to help map words to sections
    const sectionTexts = sectionArray.map((section) => ({
      id: section.getAttribute("data-section-id") || "",
      text: section.textContent || "",
    }));

    // Build a cumulative word count per section to map words
    let globalWordIndex = 0;
    let charOffset = 0;

    for (let i = 0; i < textWords.length; i++) {
      const word = textWords[i];
      const charStart = charOffset;
      const charEnd = charOffset + word.length;

      // Find which section this word belongs to
      // We'll match by finding the word in section texts
      let matchedSectionId: string | null = null;
      let sectionWordIndex = 0;

      // Try to find the section by checking if this word appears in a section
      for (const section of sectionTexts) {
        const sectionWords = section.text.split(/\s+/).filter((w) => w.trim());
        const wordIndexInSection = sectionWords.findIndex(
          (sw) =>
            sw.toLowerCase().replace(/[^\w]/g, "") ===
            word.toLowerCase().replace(/[^\w]/g, "")
        );

        if (wordIndexInSection >= 0) {
          // Check if this is the right occurrence (by global position)
          const wordsBeforeThisInText = textWords
            .slice(0, i)
            .filter(
              (w) =>
                w.toLowerCase().replace(/[^\w]/g, "") ===
                word.toLowerCase().replace(/[^\w]/g, "")
            ).length;

          const wordsBeforeThisInSection = sectionWords
            .slice(0, wordIndexInSection)
            .filter(
              (sw) =>
                sw.toLowerCase().replace(/[^\w]/g, "") ===
                word.toLowerCase().replace(/[^\w]/g, "")
            ).length;

          // If the occurrence counts match, this is likely the right section
          if (wordsBeforeThisInText === wordsBeforeThisInSection) {
            matchedSectionId = section.id;
            sectionWordIndex = wordIndexInSection;
            break;
          }
        }
      }

      // Fallback: assign to section by rough position
      if (!matchedSectionId && sectionArray.length > 0) {
        const sectionIndex = Math.min(
          Math.floor(
            (globalWordIndex / textWords.length) * sectionArray.length
          ),
          sectionArray.length - 1
        );
        matchedSectionId =
          sectionArray[sectionIndex]?.getAttribute("data-section-id") || null;
      }

      if (matchedSectionId) {
        words.push({
          word: word.trim(),
          sectionId: matchedSectionId,
          index: globalWordIndex,
        });

        textMap.set(globalWordIndex, {
          word: word.trim(),
          sectionId: matchedSectionId,
          charStart,
          charEnd,
        });
      }

      globalWordIndex++;
      // Advance char offset: word length + space
      charOffset = charEnd + 1;
    }

    wordsRef.current = words;
    textToWordsMapRef.current = textMap;

    // If TTS is playing and text changed (e.g., new page loaded), update utterance
    if (isPlaying && utteranceRef.current && text) {
      const synth = window.speechSynthesis;
      const currentCharIndex = utteranceRef.current.charIndex || 0;
      
      // Find the current word index in the new text map
      let newWordIndex = currentWordIndex;
      for (const [wordIdx, wordData] of textToWordsMapRef.current.entries()) {
        if (currentCharIndex >= wordData.charStart && currentCharIndex < wordData.charEnd) {
          newWordIndex = wordIdx;
          break;
        }
      }

      // If the text got longer (new page added), continue with updated utterance
      // Note: Web Speech API doesn't support updating utterance mid-speech,
      // so we'll let it continue and the word map will handle the new words
      setCurrentWordIndex(newWordIndex);
    }
  }, [text, isPlaying, currentWordIndex]);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!isSupported) return;

    const synth = window.speechSynthesis;

    const updateVoices = () => {
      const availableVoices = synth.getVoices();
      setVoices(availableVoices);

      if (!selectedVoice && availableVoices.length > 0) {
        const defaultVoice =
          availableVoices.find((voice) => voice.default) || availableVoices[0];
        setSelectedVoice(defaultVoice.name);
      }
    };

    updateVoices();

    const handleVoicesChanged = () => updateVoices();

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", handleVoicesChanged);
      return () => {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
      };
    } else {
      const originalHandler = synth.onvoiceschanged;
      synth.onvoiceschanged = handleVoicesChanged;
      return () => {
        if (synth.onvoiceschanged === handleVoicesChanged) {
          synth.onvoiceschanged = originalHandler ?? null;
        }
      };
    }
  }, [isSupported, selectedVoice]);

  // Highlight current word
  useEffect(() => {
    if (!isPlaying && !isPaused) {
      return;
    }

    // Remove previous highlights - unwrap spans to restore original DOM
    const previousHighlights = document.querySelectorAll(
      "[data-tts-highlight]"
    );
    previousHighlights.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        // Replace span with its text content
        const textNode = document.createTextNode(el.textContent || "");
        parent.replaceChild(textNode, el);
        parent.normalize();
      }
    });
    wordElementsRef.current.clear();

    if (currentWordIndex >= 0 && currentWordIndex < wordsRef.current.length) {
      const currentWord = wordsRef.current[currentWordIndex];
      const section = document.querySelector(
        `[data-section-id="${currentWord.sectionId}"]`
      );

      if (section) {
        // Scroll section into view (only if not already visible)
        const rect = section.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const isVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
        if (!isVisible) {
          section.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        // Find which word in this section we're on (from our word map)
        let sectionWordIndex = 0;
        for (let i = 0; i < currentWordIndex; i++) {
          if (wordsRef.current[i]?.sectionId === currentWord.sectionId) {
            sectionWordIndex++;
          }
        }

        // Get the target word text (normalized for matching)
        const targetWordText = currentWord.word
          .toLowerCase()
          .replace(/[^\w]/g, "");

        // Get all words from section to verify position
        const sectionText = section.textContent || "";
        const sectionWords = sectionText
          .split(/\s+/)
          .filter((w) => w.trim().length > 0)
          .map((w) => w.toLowerCase().replace(/[^\w]/g, ""));

        // Count how many times this word appears before our target position in the word map
        let occurrencesBeforeTarget = 0;
        for (let i = 0; i < currentWordIndex; i++) {
          const word = wordsRef.current[i];
          if (word?.sectionId === currentWord.sectionId) {
            const normalized = word.word.toLowerCase().replace(/[^\w]/g, "");
            if (normalized === targetWordText) {
              occurrencesBeforeTarget++;
            }
          }
        }

        // Also get the approximate position range where we expect to find this word
        // This helps narrow down which occurrence we want (especially for common words like "and")
        const expectedPositionRange = {
          min: Math.max(0, sectionWordIndex - 5), // 5 words before
          max: Math.min(sectionWords.length - 1, sectionWordIndex + 5), // 5 words after
        };

        // Find and highlight the word by traversing text nodes
        const walker = document.createTreeWalker(
          section,
          NodeFilter.SHOW_TEXT,
          null
        );

        let wordCount = 0;
        let node: Node | null;
        let found = false;
        let textNodesChecked = 0;

        // For bionic text, words are wrapped in <strong> tags, so we need a different approach
        // Strategy: Find the word by searching the plain text, then create a range that works with HTML

        // Get the full section text (plain text, no HTML)
        const sectionPlainText = section.textContent || "";

        // Find the target word by occurrence in the plain text
        let targetWordOccurrences = 0;
        let wordStartIndex = -1;
        let wordEndIndex = -1;

        // Use a regex to find the word, handling punctuation
        // Escape special regex characters in the word
        const escapedWord = currentWord.word.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        // Match word with optional punctuation before/after (but not in the middle)
        // This handles cases like "cat," "cat." "(cat)" etc.
        const wordRegex = new RegExp(
          `(?:^|[^\\w])(${escapedWord})(?=[^\\w]|$)`,
          "gi"
        );
        let match;
        const allMatches: Array<{
          wordStart: number;
          wordEnd: number;
          positionInSection: number;
        }> = [];

        // First, find all occurrences and calculate their positions in the section
        while ((match = wordRegex.exec(sectionPlainText)) !== null) {
          const fullMatch = match[0];
          const wordMatch = match[1];
          const wordStartInMatch = fullMatch.indexOf(wordMatch);
          const wordStart = match.index + wordStartInMatch;
          const wordEnd = wordStart + wordMatch.length;

          // Calculate which word position this is in the section
          const textBeforeWord = sectionPlainText.substring(0, wordStart);
          const wordsBefore = textBeforeWord
            .split(/\s+/)
            .filter((w) => w.trim().length > 0).length;

          allMatches.push({
            wordStart,
            wordEnd,
            positionInSection: wordsBefore,
          });
        }

        // Now find the best match using a more precise strategy:
        // 1. First try exact position match
        // 2. Then try occurrence-based (most reliable)
        // 3. Finally try closest position match as fallback

        let bestMatch: { wordStart: number; wordEnd: number } | null = null;
        let matchReason = "";

        // Strategy 1: Try exact position match first
        const exactMatch = allMatches.find(
          (m) => m.positionInSection === sectionWordIndex
        );
        if (exactMatch) {
          bestMatch = {
            wordStart: exactMatch.wordStart,
            wordEnd: exactMatch.wordEnd,
          };
          matchReason = "exact position";
        }

        // Strategy 2: If no exact match, use occurrence-based (most reliable)
        // This matches the word map's occurrence count, which is what TTS is actually speaking
        if (!bestMatch && occurrencesBeforeTarget < allMatches.length) {
          const occurrenceMatch = allMatches[occurrencesBeforeTarget];
          bestMatch = {
            wordStart: occurrenceMatch.wordStart,
            wordEnd: occurrenceMatch.wordEnd,
          };
          matchReason = `occurrence #${occurrencesBeforeTarget + 1}`;
        }

        // Strategy 3: Fallback to closest position match (within 3 words)
        if (!bestMatch) {
          let bestDistance = Infinity;
          for (const matchInfo of allMatches) {
            const distance = Math.abs(
              matchInfo.positionInSection - sectionWordIndex
            );
            if (distance < bestDistance && distance <= 3) {
              bestMatch = {
                wordStart: matchInfo.wordStart,
                wordEnd: matchInfo.wordEnd,
              };
              bestDistance = distance;
              matchReason = `closest position (distance: ${distance})`;
            }
          }
        }

        // Strategy 4: Last resort - use the occurrence count even if it's past the array
        if (!bestMatch && allMatches.length > 0) {
          const index = Math.min(
            occurrencesBeforeTarget,
            allMatches.length - 1
          );
          bestMatch = {
            wordStart: allMatches[index].wordStart,
            wordEnd: allMatches[index].wordEnd,
          };
          matchReason = `last resort (index: ${index})`;
        }

        if (bestMatch) {
          wordStartIndex = bestMatch.wordStart;
          wordEndIndex = bestMatch.wordEnd;
        }

        if (wordStartIndex >= 0 && wordEndIndex > wordStartIndex) {
          // Found the word position in plain text, now find it in the DOM

          // Traverse text nodes and find the character position
          const findWalker = document.createTreeWalker(
            section,
            NodeFilter.SHOW_TEXT,
            null
          );

          let charCount = 0;
          let startNode: Node | null = null;
          let endNode: Node | null = null;
          let startOffset = 0;
          let endOffset = 0;
          let findNode: Node | null;

          while ((findNode = findWalker.nextNode())) {
            const nodeText = findNode.textContent || "";
            const nodeStart = charCount;
            const nodeEnd = charCount + nodeText.length;

            // Check if word starts in this node
            if (
              wordStartIndex >= nodeStart &&
              wordStartIndex < nodeEnd &&
              !startNode
            ) {
              startNode = findNode;
              startOffset = wordStartIndex - nodeStart;
            }

            // Check if word ends in this node
            if (
              wordEndIndex > nodeStart &&
              wordEndIndex <= nodeEnd &&
              !endNode
            ) {
              endNode = findNode;
              endOffset = wordEndIndex - nodeStart;
            }

            // If we found both, we're done
            if (startNode && endNode) {
              break;
            }

            charCount = nodeEnd;
          }

          if (startNode && endNode) {
            try {
              const range = document.createRange();
              range.setStart(startNode, startOffset);
              range.setEnd(endNode, endOffset);

              const span = document.createElement("span");
              span.setAttribute("data-tts-highlight", "true");
              span.className =
                "bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white px-0.5 rounded transition-colors z-10 relative";

              // Try to wrap the content (works even if word spans HTML elements)
              try {
                range.surroundContents(span);
              } catch (e) {
                // If surroundContents fails (word spans elements), extract and insert
                const contents = range.extractContents();
                span.appendChild(contents);
                range.insertNode(span);
              }

              wordElementsRef.current.set(currentWordIndex, span);
              found = true;
            } catch (e) {
              // Silently fail - word highlighting is not critical
            }
          }
        }

        // Fallback: if we didn't find by occurrence, try by position (original method)
        if (!found) {
          const walker2 = document.createTreeWalker(
            section,
            NodeFilter.SHOW_TEXT,
            null
          );

          wordCount = 0;
          let node2: Node | null;

          while (!found && (node2 = walker2.nextNode())) {
            const text = node2.textContent || "";
            const parts = text.split(/(\s+)/);

            for (let i = 0; i < parts.length && !found; i++) {
              const part = parts[i];
              const partNormalized = part
                .trim()
                .toLowerCase()
                .replace(/[^\w]/g, "");

              // Match by position
              const positionMatch = wordCount === sectionWordIndex;
              const textMatch =
                partNormalized && partNormalized === targetWordText;

              if (textMatch && positionMatch) {
                // Found our target word!

                const range = document.createRange();
                let startOffset = 0;

                // Calculate start offset
                for (let j = 0; j < i; j++) {
                  startOffset += parts[j].length;
                }

                const endOffset = startOffset + part.length;
                const textLength = text.length;

                if (startOffset >= 0 && endOffset <= textLength && node2) {
                  try {
                    range.setStart(node2, startOffset);
                    range.setEnd(node2, endOffset);

                    const span = document.createElement("span");
                    span.setAttribute("data-tts-highlight", "true");
                    span.className =
                      "bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white px-0.5 rounded transition-colors z-10 relative";

                    // Try to wrap the content
                    try {
                      range.surroundContents(span);
                    } catch (e) {
                      // If surroundContents fails, extract and insert
                      const contents = range.extractContents();
                      span.appendChild(contents);
                      range.insertNode(span);
                    }

                    wordElementsRef.current.set(currentWordIndex, span);
                    found = true;
                  } catch (e) {
                    // Silently fail - word highlighting is not critical
                  }
                }
                break;
              }

              // Count words
              if (part.trim()) {
                const normalized = part
                  .trim()
                  .toLowerCase()
                  .replace(/[^\w]/g, "");
                if (normalized) {
                  wordCount++;
                }
              }
            }
          }
        }
      }
    }
  }, [currentWordIndex, isPlaying, isPaused]);

  const handlePlay = () => {
    if (!isSupported) {
      console.warn("[TTSReader] Speech synthesis not supported in this browser");
      return;
    }
    if (!text || !text.trim()) {
      console.warn("[TTSReader] No text available to read");
      return;
    }

    if (isPaused && utteranceRef.current) {
      // Resume
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = "en-US";

    if (selectedVoice) {
      const voice = voices.find((v) => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
    }

    let wordIndex = 0;
    let currentSection: string | null = null;
    const sectionWordCounts = new Map<string, number>(); // Track words read per section

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        // Use character index to find the word
        const charIndex = event.charIndex;

        // Find the word that contains this character index
        let foundWordIndex = -1;
        for (const [wordIdx, wordData] of textToWordsMapRef.current.entries()) {
          if (charIndex >= wordData.charStart && charIndex < wordData.charEnd) {
            foundWordIndex = wordIdx;
            break;
          }
        }

        // Fallback: find closest word
        if (foundWordIndex === -1) {
          let closestIndex = 0;
          let minDistance = Infinity;
          for (const [
            wordIdx,
            wordData,
          ] of textToWordsMapRef.current.entries()) {
            const distance = Math.abs(charIndex - wordData.charStart);
            if (distance < minDistance) {
              minDistance = distance;
              closestIndex = wordIdx;
            }
          }
          foundWordIndex = closestIndex;
        }

        if (foundWordIndex >= 0 && foundWordIndex < wordsRef.current.length) {
          const word = wordsRef.current[foundWordIndex];

          setCurrentWordIndex(foundWordIndex);
          wordIndex = foundWordIndex;

          // Track words read in current section
          if (!sectionWordCounts.has(word.sectionId)) {
            sectionWordCounts.set(word.sectionId, 0);
          }
          sectionWordCounts.set(
            word.sectionId,
            (sectionWordCounts.get(word.sectionId) || 0) + 1
          );

          // Mark section as read when we've read at least 50% of its words
          const sectionWords = wordsRef.current.filter(
            (w) => w.sectionId === word.sectionId
          );
          const wordsReadInSection = sectionWordCounts.get(word.sectionId) || 0;
          const sectionTotalWords = sectionWords.length;

          if (wordsReadInSection >= Math.ceil(sectionTotalWords * 0.5)) {
            // Mark section as read if we've read 50% or more
            if (!useAppStore.getState().readSections.has(word.sectionId)) {
              markSectionAsRead(word.sectionId);

              // Update progress
              const allSections =
                document.querySelectorAll("[data-section-id]");
              const readCount = Array.from(allSections).filter((el) => {
                const id = el.getAttribute("data-section-id");
                return id && useAppStore.getState().readSections.has(id);
              }).length;
              const progress =
                allSections.length > 0
                  ? Math.round((readCount / allSections.length) * 100)
                  : 0;
              setReadingProgress(progress);
            }
          }

          // Track section changes
          if (word.sectionId !== currentSection) {
            currentSection = word.sectionId;
            setCurrentSectionId(currentSection);
          }
        }
      }
    };

    const startTime = Date.now();
    
    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentWordIndex(0);
      setCurrentSectionId(null);

      // Mark current section as read
      if (currentSection) {
        markSectionAsRead(currentSection);
      }

      // Mark all remaining sections as read
      const sections = document.querySelectorAll("[data-section-id]");
      sections.forEach((section) => {
        const sectionId = section.getAttribute("data-section-id");
        if (sectionId) {
          markSectionAsRead(sectionId);
        }
      });

      // Update progress to 100%
      setReadingProgress(100);

      // Clean up highlights
      document.querySelectorAll("[data-tts-highlight]").forEach((el) => {
        el.removeAttribute("data-tts-highlight");
        el.classList.remove(
          "bg-yellow-300",
          "dark:bg-yellow-600",
          "text-black",
          "dark:text-white",
          "px-0.5",
          "rounded"
        );
      });
      wordElementsRef.current.clear();

      // Track TTS usage (fire and forget - don't await)
      const duration = Math.round((Date.now() - startTime) / 1000); // Duration in seconds
      const userId = useAppStore.getState().currentPdfId || useAppStore.getState().currentText?.substring(0, 20) || "anonymous";
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tts_usage",
          userId,
          duration,
        }),
      }).catch(() => {
        // Silently fail - analytics shouldn't break the app
      });
    };

    utterance.onerror = (event) => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentWordIndex(0);
    setCurrentSectionId(null);
    utteranceRef.current = null;

    // Clean up highlights
    document.querySelectorAll("[data-tts-highlight]").forEach((el) => {
      el.removeAttribute("data-tts-highlight");
      el.classList.remove(
        "bg-yellow-300",
        "dark:bg-yellow-600",
        "text-black",
        "dark:text-white",
        "px-0.5",
        "rounded"
      );
    });
    wordElementsRef.current.clear();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!isSupported) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Text-to-speech is not supported in your browser.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Text-to-Speech Reader
        </CardTitle>
        <CardDescription>
          Listen to the content while following along
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-2">
          {!isPlaying && !isPaused && (
            <Button
              onClick={handlePlay}
              size="sm"
              className="flex-1"
              aria-label="Start reading"
              disabled={!text || !text.trim() || !isSupported}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Reading
            </Button>
          )}
          {isPlaying && (
            <Button
              onClick={handlePause}
              size="sm"
              variant="outline"
              className="flex-1"
              aria-label="Pause reading"
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {isPaused && (
            <Button
              onClick={handlePlay}
              size="sm"
              className="flex-1"
              aria-label="Resume reading"
            >
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
          {(isPlaying || isPaused) && (
            <Button
              onClick={handleStop}
              size="sm"
              variant="outline"
              aria-label="Stop reading"
            >
              <Square className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Voice Selection */}
        <div className="space-y-2">
          <label
            htmlFor="voice-select"
            className="text-sm text-muted-foreground"
          >
            Voice
          </label>
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            disabled={!voices.length}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {voices.length === 0 ? (
              <option value="">Voices loading...</option>
            ) : (
              voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                  {voice.lang ? ` (${voice.lang})` : ""}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Speed Control */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Speed: {rate.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={rate}
            onChange={(e) => {
              const newRate = parseFloat(e.target.value);
              setRate(newRate);
              if (utteranceRef.current) {
                utteranceRef.current.rate = newRate;
                if (isPaused) {
                  window.speechSynthesis.resume();
                  window.speechSynthesis.pause();
                }
              }
            }}
            className="w-full"
            aria-label="Reading speed"
          />
        </div>
      </CardContent>
    </Card>
  );
}
