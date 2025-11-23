import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  currentText: string;
  bionicEnabled: boolean;
  focusModeEnabled: boolean;
  currentSentenceIndex: number;
  fontFamily: "inter" | "opendyslexic";
  darkMode: boolean;
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
  pageSummaryCache: { [page: number]: string };
  pdfDisplayMode: "text" | "image" | "both";
  pdfScrollingMode: "paginated" | "continuous";
  // Actions
  setText: (text: string) => void;
  toggleBionic: () => void;
  toggleFocusMode: () => void;
  setSentenceIndex: (index: number) => void;
  setFontFamily: (font: "inter" | "opendyslexic") => void;
  toggleDarkMode: () => void;
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
  setPageSummary: (page: number, summary: string) => void;
  setPdfDisplayMode: (mode: "text" | "image" | "both") => void;
  setPdfScrollingMode: (mode: "paginated" | "continuous") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentText: "",
      bionicEnabled: false,
      focusModeEnabled: false,
      currentSentenceIndex: 0,
      fontFamily: "inter",
      darkMode: false,
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
      pdfDisplayMode: "both",
      pdfScrollingMode: "paginated",
      // Actions
      setText: (text) => set({ currentText: text }),
      toggleBionic: () =>
        set((state) => ({ bionicEnabled: !state.bionicEnabled })),
      toggleFocusMode: () =>
        set((state) => ({ focusModeEnabled: !state.focusModeEnabled })),
      setSentenceIndex: (index) => set({ currentSentenceIndex: index }),
      setFontFamily: (font) => set({ fontFamily: font }),
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
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
      isSectionRead: (sectionId) => {
        const state = useAppStore.getState();
        return state.readSections.has(sectionId);
      },
      setPdfSession: ({ pdfId, sessionId, name, pageCount }) =>
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
        }),
      clearPdfSession: () =>
        set({
          pdfSessionId: null,
          currentPdfId: null,
          currentPdfName: null,
          pdfPageCount: 0,
          currentPage: 1,
          pageTextCache: {},
          pageImageCache: {},
          pageSummaryCache: {},
        }),
      setCurrentPage: (page) => set({ currentPage: page }),
      setPageText: (page, text) =>
        set((state) => ({
          pageTextCache: { ...state.pageTextCache, [page]: text },
        })),
      setPageImage: (page, imageData) =>
        set((state) => ({
          pageImageCache: { ...state.pageImageCache, [page]: imageData },
        })),
      setPageSummary: (page, summary) =>
        set((state) => ({
          pageSummaryCache: { ...state.pageSummaryCache, [page]: summary },
        })),
      setPdfDisplayMode: (mode) => set({ pdfDisplayMode: mode }),
      setPdfScrollingMode: (mode) => set({ pdfScrollingMode: mode }),
    }),
    {
      name: "current_session",
      // Custom serialization for Set
      partialize: (state) => ({
        ...state,
        readSections: Array.from(state.readSections),
      }),
      // Custom deserialization for Set
      merge: (persistedState: any, currentState: AppState) => ({
        ...currentState,
        ...persistedState,
        readSections: persistedState?.readSections
          ? new Set(persistedState.readSections)
          : new Set<string>(),
      }),
    }
  )
);
