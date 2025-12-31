'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ExamRow, ItemAnalysisRow, CorrectAnswersMap } from '@/types/exam';

const STORAGE_KEY = 'kfupm_exam_wizard_v1';
const STORAGE_VERSION = 1;

export interface WizardState {
  // Step 1: Student Data
  studentData: ExamRow[] | null;
  numQuestions: number;

  // Step 2: Re-grading
  correctAnswersMap: CorrectAnswersMap | null;
  hasRegraded: boolean;

  // Step 3: Item Analysis
  itemAnalysisData: ItemAnalysisRow[] | null;
  hasPermutation: boolean;

  // Metadata
  currentStep: number;
  completedSteps: number[];
}

interface WizardContextType {
  state: WizardState;
  updateStudentData: (data: ExamRow[], numQuestions: number) => void;
  updateCorrectAnswers: (correctMap: CorrectAnswersMap, regraded: boolean) => void;
  updateItemAnalysis: (data: ItemAnalysisRow[], hasPermutation: boolean) => void;
  setCurrentStep: (step: number) => void;
  markStepComplete: (step: number) => void;
  resetWizard: () => void;
  saveToLocalStorage: () => void;
}

const initialState: WizardState = {
  studentData: null,
  numQuestions: 0,
  correctAnswersMap: null,
  hasRegraded: false,
  itemAnalysisData: null,
  hasPermutation: false,
  currentStep: 1,
  completedSteps: [],
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.version === STORAGE_VERSION) {
          setState(parsed.state);
        } else {
          // Version mismatch, clear old data
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('Failed to load wizard state from localStorage:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const saveToLocalStorage = () => {
    try {
      const toSave = {
        version: STORAGE_VERSION,
        state,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
      console.error('Failed to save wizard state to localStorage:', error);
    }
  };

  // Auto-save to localStorage whenever state changes
  useEffect(() => {
    saveToLocalStorage();
  }, [state]);

  const updateStudentData = (data: ExamRow[], numQuestions: number) => {
    setState((prev) => ({
      ...prev,
      studentData: data,
      numQuestions,
    }));
  };

  const updateCorrectAnswers = (correctMap: CorrectAnswersMap, regraded: boolean) => {
    setState((prev) => ({
      ...prev,
      correctAnswersMap: correctMap,
      hasRegraded: regraded,
    }));
  };

  const updateItemAnalysis = (data: ItemAnalysisRow[], hasPermutation: boolean) => {
    setState((prev) => ({
      ...prev,
      itemAnalysisData: data,
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
        updateCorrectAnswers,
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
    throw new Error('useWizard must be used within WizardProvider');
  }
  return context;
}
