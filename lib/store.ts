import { create } from "zustand";
import { persist } from "zustand/middleware";
import { savePdfData, loadPdfData, clearPdfData } from "./cache";

export interface PageSummaryData {
  summary: string;
  flashcards: string[];
  keyPoints?: string[];
}

interface AppState {
  currentText: string;
  bionicEnabled: boolean;
  bionicStrength: number; // 10-100 (percentage)
  focusModeEnabled: boolean;
  currentSentenceIndex: number;
  fontFamily: "inter" | "opendyslexic";
  theme: "light" | "dark" | "light-grey" | "dim" | "grey";
  // Visual Customization
  lineHeight: number;
  letterSpacing: number;
  fontSize: number;
  // ADHD-friendly features
  pomodoroEnabled: boolean;
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
  pomodoroTimeRemaining: number; // in seconds
  pomodoroIsBreak: boolean;
  currentChunkIndex: number;
  readingProgress: number; // 0-100
  sessionStartTime: number | null;
  totalStudyTime: number; // in seconds
  wordsRead: number;
  readSections: Set<string>; // Set of section IDs that have been read via TTS
  // PDF session state
  pdfSessionId: string | null;
  currentPdfId: string | null;
  currentPdfName: string | null;
  pdfPageCount: number;
  currentPage: number;
  pageTextCache: { [page: number]: string };
  pageImageCache: { [page: number]: string };
  pageSummaryCache: { [page: number]: PageSummaryData | string };
  chapterGroupSize: number;
  pdfDisplayMode: "text" | "image" | "both";
  pdfScrollingMode: "paginated" | "continuous";
  // Actions
  setText: (text: string) => void;
  toggleBionic: () => void;
  setBionicStrength: (strength: number) => void;
  toggleFocusMode: () => void;
  setSentenceIndex: (index: number) => void;
  setFontFamily: (font: "inter" | "opendyslexic") => void;
  setTheme: (theme: "light" | "dark" | "light-grey" | "dim" | "grey") => void;
  setLineHeight: (value: number) => void;
  setLetterSpacing: (value: number) => void;
  setFontSize: (value: number) => void;
  togglePomodoro: () => void;
  setPomodoroWorkMinutes: (minutes: number) => void;
  setPomodoroBreakMinutes: (minutes: number) => void;
  setPomodoroTimeRemaining: (
    secondsOrUpdater: number | ((prev: number) => number)
  ) => void;
  setPomodoroIsBreak: (isBreak: boolean) => void;
  setCurrentChunkIndex: (index: number) => void;
  setReadingProgress: (progress: number) => void;
  startSession: () => void;
  updateStudyStats: (wordsRead: number) => void;
  markSectionAsRead: (sectionId: string) => void;
  isSectionRead: (sectionId: string) => boolean;
  setPdfSession: (payload: {
    pdfId: string;
    sessionId: string;
    name: string;
    pageCount: number;
  }) => void;
  clearPdfSession: () => void;
  setCurrentPage: (page: number) => void;
  setPageText: (page: number, text: string) => void;
  setPageImage: (page: number, imageData: string) => void;
  setPageSummary: (page: number, data: PageSummaryData | string) => void;
  setChapterGroupSize: (size: number) => void;
  setPdfDisplayMode: (mode: "text" | "image" | "both") => void;
  setPdfScrollingMode: (mode: "paginated" | "continuous") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentText: "",
      bionicEnabled: false,
      bionicStrength: 50,
      focusModeEnabled: false,
      currentSentenceIndex: 0,
      fontFamily: "inter" as "inter" | "opendyslexic",
      theme: "light" as "light" | "dark" | "light-grey" | "dim" | "grey",
      // Visual Customization Defaults
      lineHeight: 1.6,
      letterSpacing: 0,
      fontSize: 18,
      // ADHD-friendly features
      pomodoroEnabled: false,
      pomodoroWorkMinutes: 25,
      pomodoroBreakMinutes: 5,
      pomodoroTimeRemaining: 25 * 60, // 25 minutes in seconds
      pomodoroIsBreak: false,
      currentChunkIndex: 0,
      readingProgress: 0,
      sessionStartTime: null,
      totalStudyTime: 0,
      wordsRead: 0,
      readSections: new Set<string>(),
      pdfSessionId: null,
      currentPdfId: null,
      currentPdfName: null,
      pdfPageCount: 0,
      currentPage: 1,
      pageTextCache: {},
      pageImageCache: {},
      pageSummaryCache: {},
      chapterGroupSize: 10,
      pdfDisplayMode: "both" as "text" | "image" | "both",
      pdfScrollingMode: "paginated" as "paginated" | "continuous",
      // Actions
      setText: (text) => set({ currentText: text }),
      toggleBionic: () =>
        set((state) => ({ bionicEnabled: !state.bionicEnabled })),
      setBionicStrength: (strength) => set({ bionicStrength: strength }),
      toggleFocusMode: () =>
        set((state) => ({ focusModeEnabled: !state.focusModeEnabled })),
      setSentenceIndex: (index) => set({ currentSentenceIndex: index }),
      setFontFamily: (font) => set({ fontFamily: font }),
      setTheme: (theme) => set({ theme }),
      setLineHeight: (value) => set({ lineHeight: value }),
      setLetterSpacing: (value) => set({ letterSpacing: value }),
      setFontSize: (value) => set({ fontSize: value }),
      togglePomodoro: () =>
        set((state) => {
          const newEnabled = !state.pomodoroEnabled;
          if (newEnabled && state.pomodoroTimeRemaining === 0) {
            // Reset timer when starting
            return {
              pomodoroEnabled: newEnabled,
              pomodoroTimeRemaining: state.pomodoroIsBreak
                ? state.pomodoroBreakMinutes * 60
                : state.pomodoroWorkMinutes * 60,
            };
          }
          return { pomodoroEnabled: newEnabled };
        }),
      setPomodoroWorkMinutes: (minutes) =>
        set({
          pomodoroWorkMinutes: minutes,
          pomodoroTimeRemaining: minutes * 60,
        }),
      setPomodoroBreakMinutes: (minutes) =>
        set({ pomodoroBreakMinutes: minutes }),
      setPomodoroTimeRemaining: (
        secondsOrUpdater: number | ((prev: number) => number)
      ) =>
        set((state) => ({
          pomodoroTimeRemaining:
            typeof secondsOrUpdater === "function"
              ? secondsOrUpdater(state.pomodoroTimeRemaining)
              : secondsOrUpdater,
        })),
      setPomodoroIsBreak: (isBreak) => set({ pomodoroIsBreak: isBreak }),
      setCurrentChunkIndex: (index) => set({ currentChunkIndex: index }),
      setReadingProgress: (progress) =>
        set({ readingProgress: Math.max(0, Math.min(100, progress)) }),
      startSession: () =>
        set({
          sessionStartTime: Date.now(),
          totalStudyTime: 0,
          wordsRead: 0,
          readSections: new Set<string>(), // Reset read sections for new session
          readingProgress: 0,
        }),
      updateStudyStats: (words) =>
        set((state) => ({
          wordsRead: state.wordsRead + words,
          totalStudyTime: state.sessionStartTime
            ? Math.floor((Date.now() - state.sessionStartTime) / 1000)
            : 0,
        })),
      markSectionAsRead: (sectionId) =>
        set((state) => {
          const newSet = new Set(state.readSections);
          newSet.add(sectionId);
          return { readSections: newSet };
        }),
      isSectionRead: (sectionId: string): boolean => {
        const state = useAppStore.getState();
        return state.readSections.has(sectionId);
      },
      setPdfSession: ({ pdfId, sessionId, name, pageCount }) => {
        set({
          pdfSessionId: sessionId,
          currentPdfId: pdfId,
          currentPdfName: name,
          pdfPageCount: pageCount,
          currentPage: 1,
          currentText: "",
          pageTextCache: {},
          pageImageCache: {},
          pageSummaryCache: {},
          pdfDisplayMode: "both",
          pdfScrollingMode: "paginated",
          readSections: new Set(),
          readingProgress: 0,
        });

        // Load cached data from IDB
        loadPdfData(pdfId).then((data) => {
          if (data) {
            set({
              pageTextCache: data.textCache || {},
              pageImageCache: data.imageCache || {},
              pageSummaryCache: data.summaryCache || {},
            });
          }
        });
      },
      clearPdfSession: () => {
        const { currentPdfId } = get();
        if (currentPdfId) {
          // Optional: Clear IDB data when session is cleared?
          // For now, we keep it as a cache.
          // clearPdfData(currentPdfId); 
        }
        set({
          pdfSessionId: null,
          currentPdfId: null,
          currentPdfName: null,
          pdfPageCount: 0,
          currentPage: 1,
          pageTextCache: {},
          pageImageCache: {},
          pageSummaryCache: {},
        });
      },
      setCurrentPage: (page) => set({ currentPage: page }),
      setPageText: (page, text) => {
        set((state) => {
          const newCache = { ...state.pageTextCache, [page]: text };
          // Save to IDB
          if (state.currentPdfId) {
            savePdfData(state.currentPdfId, {
              textCache: newCache,
              imageCache: state.pageImageCache,
              summaryCache: state.pageSummaryCache,
            });
          }
          return { pageTextCache: newCache };
        });
      },
      setPageImage: (page, imageData) => {
        set((state) => {
          const newCache = { ...state.pageImageCache, [page]: imageData };
          // Save to IDB
          if (state.currentPdfId) {
            savePdfData(state.currentPdfId, {
              textCache: state.pageTextCache,
              imageCache: newCache,
              summaryCache: state.pageSummaryCache,
            });
          }
          return { pageImageCache: newCache };
        });
      },
      setPageSummary: (page: number, data: PageSummaryData | string) => {
        set((state) => {
          const newCache = { ...state.pageSummaryCache, [page]: data };
          // Save to IDB
          if (state.currentPdfId) {
            savePdfData(state.currentPdfId, {
              textCache: state.pageTextCache,
              imageCache: state.pageImageCache,
              summaryCache: newCache,
            });
          }
          return { pageSummaryCache: newCache };
        });
      },
      setChapterGroupSize: (size: number) => set({ chapterGroupSize: size }),
      setPdfDisplayMode: (mode) => set({ pdfDisplayMode: mode }),
      setPdfScrollingMode: (mode) => set({ pdfScrollingMode: mode }),
    }),
    {
      name: "current_session",
      // Custom serialization for Set
      partialize: (state) => {
        // Exclude heavy cache data from localStorage
        const {
          pageTextCache,
          pageImageCache,
          pageSummaryCache,
          ...persistedState
        } = state;
        return {
          ...persistedState,
          readSections: Array.from(state.readSections),
        };
      },
      // Custom deserialization for Set
      merge: (persistedState: any, currentState: AppState) => {
        // Handle migration from darkMode boolean to theme string
        let theme = currentState.theme;
        if (persistedState && 'darkMode' in persistedState) {
          theme = persistedState.darkMode ? 'dark' : 'light';
        }
        if (persistedState && 'theme' in persistedState) {
          theme = persistedState.theme;
          // Migrate old themes
          if ((theme as string) === 'grey') {
            theme = 'light-grey';
          } else if ((theme as string) === 'sepia') {
            theme = 'grey';
          }
        }

        return {
          ...currentState,
          ...persistedState,
          theme,
          readSections: persistedState?.readSections
            ? new Set(persistedState.readSections)
            : new Set<string>(),
        };
      },
    }
  )
);
