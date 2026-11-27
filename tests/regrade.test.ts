import { describe, it, expect } from "vitest";
import { applyRegradedKey, type WizardState } from "@/contexts/wizard-context";
import {
  buildCorrectAnswersMap,
  computeComprehensiveItemAnalysis,
  reviseSolutionRows,
  validateCorrectAnswers,
} from "@/lib/excel-utils";
import type { CorrectAnswersMap, ItemAnalysisRow } from "@/types/exam";
import { examRow } from "./helpers";

// Version 001 key as published in the file: Q1 = B (wrong, the real answer is C), Q2 = A
const data = [
  examRow("0", "001", ["B", "A"]),
  examRow("201900001", "001", ["C", "A"]),
  examRow("201900002", "001", ["C", "A"]),
  examRow("201900003", "001", ["B", "E"]),
];
const qCols = ["1", "2"];
const corrected: CorrectAnswersMap = { "001": [["C"], ["A"]] };

// The Shuffler's Question Map knows the real key (Q1 = C)
const questionMap: ItemAnalysisRow[] = [
  { code: "001", order: 1, order_in_master: 1, permutation: "ABCDE", correct: "C" },
  { code: "001", order: 2, order_in_master: 2, permutation: "ABCDE", correct: "A" },
];

const baseState = (overrides: Partial<WizardState> = {}): WizardState => ({
  studentData: data,
  studentDataFileName: "exam.xlsx",
  numQuestions: 2,
  correctAnswersMap: null,
  hasRegraded: false,
  itemAnalysisData: null,
  itemAnalysisFileName: null,
  hasPermutation: false,
  currentStep: 2,
  completedSteps: [1],
  ...overrides,
});

describe("P4: a key corrected in Step 2 is used by Steps 3 and 4", () => {
  it("the published wrong key fails Step 3 validation", () => {
    expect(validateCorrectAnswers(questionMap, data)).toContain("Q1");
  });

  it("after re-grading, the working data carries the corrected key", () => {
    const revised = reviseSolutionRows(data, qCols, corrected);
    const { state } = applyRegradedKey(baseState(), revised, corrected);

    expect(state.studentData).toBe(revised);
    expect(state.correctAnswersMap).toBe(corrected);
    expect(state.hasRegraded).toBe(true);
    // Step 2 rebuilds its key from the working data, e.g. after a page refresh
    expect(buildCorrectAnswersMap(state.studentData!, qCols)).toEqual(corrected);
    // Step 3 now validates against the corrected key
    expect(validateCorrectAnswers(questionMap, state.studentData!)).toBeNull();
    // Step 4 analyses with the corrected key: Q1 difficulty 2 of 3 instead of 1 of 3
    const analysis = computeComprehensiveItemAnalysis(state.studentData!, questionMap, 2);
    expect(analysis.itemStatistics[0].p_i).toBeCloseTo(2 / 3, 10);
  });

  it("clears an already-accepted item analysis when the key changes", () => {
    const prev = baseState({
      itemAnalysisData: questionMap,
      itemAnalysisFileName: "map.csv",
      hasPermutation: true,
      completedSteps: [1, 2, 3],
    });
    const result = applyRegradedKey(prev, reviseSolutionRows(data, qCols, corrected), corrected);

    expect(result.itemAnalysisCleared).toBe(true);
    expect(result.state.itemAnalysisData).toBeNull();
    expect(result.state.itemAnalysisFileName).toBeNull();
    expect(result.state.hasPermutation).toBe(false);
    expect(result.state.completedSteps).toEqual([1, 2]);
  });

  it("keeps the item analysis when re-grading does not change the key", () => {
    const unchanged = buildCorrectAnswersMap(data, qCols);
    const prev = baseState({ itemAnalysisData: questionMap, completedSteps: [1, 2, 3] });
    const result = applyRegradedKey(prev, reviseSolutionRows(data, qCols, unchanged), unchanged);

    expect(result.itemAnalysisCleared).toBe(false);
    expect(result.state.itemAnalysisData).toBe(questionMap);
    expect(result.state.completedSteps).toEqual([1, 2, 3]);
  });

  it("reviseSolutionRows does not reorder the caller's answer arrays", () => {
    const map: CorrectAnswersMap = { "001": [["C", "B"], ["A"]] };
    const revised = reviseSolutionRows(data, qCols, map);
    expect(revised[0]["1"]).toBe("BC");
    expect(map["001"][0]).toEqual(["C", "B"]);
  });
});
