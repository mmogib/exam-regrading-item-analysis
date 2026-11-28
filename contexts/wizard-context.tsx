"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { ExamRow, ItemAnalysisRow, CorrectAnswersMap } from "@/types/exam";
import { error as logError } from "@/lib/logger";
import { isSolutionRow } from "@/lib/excel-utils";

const STORAGE_KEY = "kfupm_exam_wizard_v1";
/**
 * 2 (v1.9.1, P11): adds studentRevision. Version-1 sessions are migrated once,
 * keeping the student data but not the item analysis (see migrateStoredState).
 */
const STORAGE_VERSION = 2;

/** What a state change removed, for a one-time message in Step 1 (never persisted). */
export interface WizardNotice {
  kind: "student-data-replaced" | "session-upgraded";
  itemAnalysisRemoved: boolean;
  /** File name of the removed item-analysis file, when known. */
  itemAnalysisFileName: string | null;
  /** Step 2 re-grading metadata of the previous data was reset. */
  regradeReset: boolean;
}

export interface WizardState {
  // Step 1: Student Data
  studentData: ExamRow[] | null;
  studentDataFileName: string | null;
  numQuestions: number;
  /**
   * Goes up whenever the working student data change: a Step 1 import, a
   * re-grade that changes the key, or Start Over. An item-analysis file is
   * accepted only for the revision it was validated against (P11).
   */
  studentRevision: number;

  // Step 2: Re-grading
  correctAnswersMap: CorrectAnswersMap | null;
  hasRegraded: boolean;

  // Step 3: Item Analysis
  itemAnalysisData: ItemAnalysisRow[] | null;
  itemAnalysisFileName: string | null;
  hasPermutation: boolean;

  // Metadata
  currentStep: number;
  completedSteps: number[];

  /** Transient: shown once, not saved to localStorage. */
  notice: WizardNotice | null;
}

interface WizardContextType {
  state: WizardState;
  /** Accept a successfully imported student file (always clears the later steps). */
  updateStudentData: (
    data: ExamRow[],
    numQuestions: number,
    fileName: string
  ) => void;
  /** Apply a re-graded answer key; returns true if loaded item analysis was cleared. */
  applyRegrade: (revisedData: ExamRow[], correctMap: CorrectAnswersMap) => boolean;
  /**
   * Accept an item-analysis file and complete Step 3, but only if the student
   * data are still the revision it was validated against; otherwise nothing changes.
   */
  acceptItemAnalysis: (
    data: ItemAnalysisRow[],
    hasPermutation: boolean,
    fileName: string,
    validatedRevision: number
  ) => void;
  setCurrentStep: (step: number) => void;
  markStepComplete: (step: number) => void;
  dismissNotice: () => void;
  resetWizard: () => void;
  saveToLocalStorage: () => void;
}

const initialState: WizardState = {
  studentData: null,
  studentDataFileName: null,
  numQuestions: 0,
  studentRevision: 0,
  correctAnswersMap: null,
  hasRegraded: false,
  itemAnalysisData: null,
  itemAnalysisFileName: null,
  hasPermutation: false,
  currentStep: 1,
  completedSteps: [],
  notice: null,
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

/**
 * State transition for Step 2 "Re-grade": the revised data (solution rows
 * rewritten with the corrected key) becomes the working exam data, so Steps 3
 * and 4 and later page loads use the corrected key. If the key actually changed
 * and an item-analysis file was already accepted, that file was validated
 * against the old key, so it is cleared and must be uploaded again.
 */
export function applyRegradedKey(
  prev: WizardState,
  revisedData: ExamRow[],
  correctMap: CorrectAnswersMap
): { state: WizardState; itemAnalysisCleared: boolean } {
  const solutionRows = (data: ExamRow[] | null) =>
    JSON.stringify((data ?? []).filter((row) => isSolutionRow(row)));
  const keyChanged = solutionRows(prev.studentData) !== solutionRows(revisedData);
  const clearItemAnalysis = keyChanged && prev.itemAnalysisData !== null;

  return {
    itemAnalysisCleared: clearItemAnalysis,
    state: {
      ...prev,
      studentData: revisedData,
      // A changed key makes any item-analysis check still in progress obsolete
      studentRevision: keyChanged ? prev.studentRevision + 1 : prev.studentRevision,
      correctAnswersMap: correctMap,
      hasRegraded: true,
      ...(clearItemAnalysis && {
        itemAnalysisData: null,
        itemAnalysisFileName: null,
        hasPermutation: false,
        completedSteps: prev.completedSteps.filter((step) => step !== 3),
      }),
    },
  };
}

/**
 * State transition for a successful Step 1 import (P11). Every accepted import,
 * even of identical rows, starts a new dependency boundary: identical answers do
 * not prove it is the same exam. The new rows are taken as they are (any
 * corrected key inside them stays); everything built on the previous data is
 * cleared, and the wizard returns to Step 1.
 */
export function applyNewStudentData(
  prev: WizardState,
  data: ExamRow[],
  numQuestions: number,
  fileName: string
): WizardState {
  // A notice not yet seen (for example two imports in a row) keeps what it already reported
  const pending = prev.notice?.kind === "student-data-replaced" ? prev.notice : null;
  const itemAnalysisRemoved = prev.itemAnalysisData !== null || !!pending?.itemAnalysisRemoved;
  const removedName = prev.itemAnalysisData !== null ? prev.itemAnalysisFileName : pending?.itemAnalysisFileName ?? null;
  const regradeReset = prev.hasRegraded || prev.correctAnswersMap !== null || !!pending?.regradeReset;
  return {
    ...prev,
    studentData: data,
    studentDataFileName: fileName,
    numQuestions,
    studentRevision: prev.studentRevision + 1,
    correctAnswersMap: null,
    hasRegraded: false,
    itemAnalysisData: null,
    itemAnalysisFileName: null,
    hasPermutation: false,
    currentStep: 1,
    completedSteps: [1],
    notice:
      itemAnalysisRemoved || regradeReset
        ? {
            kind: "student-data-replaced",
            itemAnalysisRemoved,
            itemAnalysisFileName: itemAnalysisRemoved ? removedName : null,
            regradeReset,
          }
        : null,
  };
}

/**
 * State transition for accepting an item-analysis file in Step 3. A file
 * validated against an older revision of the student data (a late read, or a
 * mapping screen left open across a Step 1 import) is dropped, together with
 * its Step 3 completion.
 */
export function acceptItemAnalysisTransition(
  prev: WizardState,
  data: ItemAnalysisRow[],
  hasPermutation: boolean,
  fileName: string,
  validatedRevision: number
): WizardState {
  if (prev.studentData === null || prev.studentRevision !== validatedRevision) return prev;
  return {
    ...prev,
    itemAnalysisData: data,
    itemAnalysisFileName: fileName,
    hasPermutation,
    completedSteps: prev.completedSteps.includes(3) ? prev.completedSteps : [...prev.completedSteps, 3],
  };
}

/**
 * Restore a saved session. Version 2 is restored as saved (minus any notice).
 * Version 1 (before v1.9.1) is migrated once: its student data, file name and
 * question count are kept (including a key corrected in Step 2, which lives in
 * those rows), but its item-analysis file and re-grading state are not trusted,
 * because older versions could pair them with other student data (P11).
 * Anything else is discarded (null).
 */
export function migrateStoredState(parsed: unknown): WizardState | null {
  if (!parsed || typeof parsed !== "object") return null;
  const { version, state } = parsed as { version?: unknown; state?: Partial<WizardState> };
  if (!state || typeof state !== "object") return null;

  if (version === STORAGE_VERSION) {
    return { ...initialState, ...state, notice: null };
  }
  if (version === 1) {
    if (!state.studentData) return { ...initialState };
    const itemAnalysisRemoved = state.itemAnalysisData != null;
    const regradeReset = !!state.hasRegraded || state.correctAnswersMap != null;
    return {
      ...initialState,
      studentData: state.studentData,
      studentDataFileName: state.studentDataFileName ?? null,
      numQuestions: state.numQuestions ?? 0,
      studentRevision: 1,
      currentStep: 1,
      completedSteps: [1],
      notice:
        itemAnalysisRemoved || regradeReset
          ? {
              kind: "session-upgraded",
              itemAnalysisRemoved,
              itemAnalysisFileName: itemAnalysisRemoved ? state.itemAnalysisFileName ?? null : null,
              regradeReset,
            }
          : null,
    };
  }
  return null;
}

function persistState(state: WizardState) {
  try {
    const toSave = {
      version: STORAGE_VERSION,
      state: { ...state, notice: null },
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    logError("Failed to save wizard state to localStorage:", error);
  }
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const restored = migrateStoredState(JSON.parse(stored));
        if (restored) {
          // Restoring must happen after mount: the page is statically
          // prerendered, where localStorage does not exist, so a lazy
          // useState initialiser would cause a hydration mismatch.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setState(restored);
        } else {
          // Unknown version, clear old data
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      logError("Failed to load wizard state from localStorage:", error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const saveToLocalStorage = () => persistState(state);

  // Auto-save to localStorage whenever state changes
  useEffect(() => {
    persistState(state);
  }, [state]);

  const updateStudentData = (
    data: ExamRow[],
    numQuestions: number,
    fileName: string
  ) => {
    // Computed from the latest state, so queued updates cannot be lost
    setState((prev) => applyNewStudentData(prev, data, numQuestions, fileName));
  };

  const applyRegrade = (revisedData: ExamRow[], correctMap: CorrectAnswersMap) => {
    // The return value (for Step 2's message) is computed from this render's
    // state; the update itself is applied to the latest state
    const cleared = applyRegradedKey(state, revisedData, correctMap).itemAnalysisCleared;
    setState((prev) => applyRegradedKey(prev, revisedData, correctMap).state);
    return cleared;
  };

  const acceptItemAnalysis = (
    data: ItemAnalysisRow[],
    hasPermutation: boolean,
    fileName: string,
    validatedRevision: number
  ) => {
    setState((prev) => acceptItemAnalysisTransition(prev, data, hasPermutation, fileName, validatedRevision));
  };

  const setCurrentStep = (step: number) => {
    // Moving on dismisses a Step 1 notice, so it never outlives the import it describes
    setState((prev) => ({
      ...prev,
      currentStep: step,
      notice: null,
    }));
  };

  const markStepComplete = (step: number) => {
    setState((prev) => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(step)
        ? prev.completedSteps
        : [...prev.completedSteps, step],
    }));
  };

  const dismissNotice = () => {
    setState((prev) => (prev.notice ? { ...prev, notice: null } : prev));
  };

  const resetWizard = () => {
    // The revision keeps counting up, so work started before Start Over can
    // never match the data loaded after it
    setState((prev) => ({ ...initialState, studentRevision: prev.studentRevision + 1 }));
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <WizardContext.Provider
      value={{
        state,
        updateStudentData,
        applyRegrade,
        acceptItemAnalysis,
        setCurrentStep,
        markStepComplete,
        dismissNotice,
        resetWizard,
        saveToLocalStorage,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within WizardProvider");
  }
  return context;
}
