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
const STORAGE_VERSION = 1;

export interface WizardState {
  // Step 1: Student Data
  studentData: ExamRow[] | null;
  studentDataFileName: string | null;
  numQuestions: number;

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
}

interface WizardContextType {
  state: WizardState;
  updateStudentData: (
    data: ExamRow[],
    numQuestions: number,
    fileName: string
  ) => void;
  /** Apply a re-graded answer key; returns true if loaded item analysis was cleared. */
  applyRegrade: (revisedData: ExamRow[], correctMap: CorrectAnswersMap) => boolean;
  updateItemAnalysis: (
    data: ItemAnalysisRow[],
    hasPermutation: boolean,
    fileName: string
  ) => void;
  setCurrentStep: (step: number) => void;
  markStepComplete: (step: number) => void;
  resetWizard: () => void;
  saveToLocalStorage: () => void;
}

const initialState: WizardState = {
  studentData: null,
  studentDataFileName: null,
  numQuestions: 0,
  correctAnswersMap: null,
  hasRegraded: false,
  itemAnalysisData: null,
  itemAnalysisFileName: null,
  hasPermutation: false,
  currentStep: 1,
  completedSteps: [],
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

function persistState(state: WizardState) {
  try {
    const toSave = {
      version: STORAGE_VERSION,
      state,
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
        const parsed = JSON.parse(stored);
        if (parsed.version === STORAGE_VERSION) {
          // Restoring must happen after mount: the page is statically
          // prerendered, where localStorage does not exist, so a lazy
          // useState initialiser would cause a hydration mismatch.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setState(parsed.state);
        } else {
          // Version mismatch, clear old data
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
    setState((prev) => ({
      ...prev,
      studentData: data,
      studentDataFileName: fileName,
      numQuestions,
    }));
  };

  const applyRegrade = (revisedData: ExamRow[], correctMap: CorrectAnswersMap) => {
    const result = applyRegradedKey(state, revisedData, correctMap);
    setState(result.state);
    return result.itemAnalysisCleared;
  };

  const updateItemAnalysis = (
    data: ItemAnalysisRow[],
    hasPermutation: boolean,
    fileName: string
  ) => {
    setState((prev) => ({
      ...prev,
      itemAnalysisData: data,
      itemAnalysisFileName: fileName,
      hasPermutation,
    }));
  };

  const setCurrentStep = (step: number) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
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

  const resetWizard = () => {
    setState(initialState);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <WizardContext.Provider
      value={{
        state,
        updateStudentData,
        applyRegrade,
        updateItemAnalysis,
        setCurrentStep,
        markStepComplete,
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
