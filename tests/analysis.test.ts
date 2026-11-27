import { describe, it, expect } from "vitest";
import {
  classifyStudentsByQuartile,
  computeAverageResults,
  computeCodeAverages,
  computeComprehensiveItemAnalysis,
} from "@/lib/excel-utils";
import type { ItemAnalysisRow, StudentResult } from "@/types/exam";
import { examRow } from "./helpers";

describe("cross-version analysis (hand-checked)", () => {
  // Version 002 swaps question order: its Q1 is master Q2, its Q2 is master Q1.
  const answers = [
    examRow("0", "001", ["A", "B"]),
    examRow("0", "002", ["C", "D"]),
    examRow("201900001", "001", ["A", "B"]), // m1 correct, m2 correct
    examRow("201900002", "001", ["A", "E"]), // m1 correct, m2 wrong
    examRow("201900003", "002", ["C", "E"]), // m2 correct, m1 wrong
    examRow("201900004", "002", ["", "D"]), // m2 blank (skipped), m1 correct
  ];
  const itemAnalysis: ItemAnalysisRow[] = [
    { code: "001", order: 1, order_in_master: 1 },
    { code: "001", order: 2, order_in_master: 2 },
    { code: "002", order: 1, order_in_master: 2 },
    { code: "002", order: 2, order_in_master: 1 },
  ];

  it("averages per master question with per-version stats and positions", () => {
    expect(computeAverageResults(answers, itemAnalysis, 2)).toEqual([
      {
        Master_Question: 1,
        Average_score: 75, // 3 of 4
        codeStats: { "001": { count: 2, average: 100 }, "002": { count: 2, average: 50 } },
        positions: { "001": 1, "002": 2 },
      },
      {
        Master_Question: 2,
        Average_score: 66.67, // 2 of 3 (one blank skipped)
        codeStats: { "001": { count: 2, average: 50 }, "002": { count: 1, average: 100 } },
        positions: { "001": 2, "002": 1 },
      },
    ]);
  });

  it("averages per exam version", () => {
    expect(computeCodeAverages(answers, itemAnalysis, 2)).toEqual([
      { Code: "001", Average_score: 75 }, // 3 of 4
      { Code: "002", Average_score: 66.67 }, // 2 of 3
    ]);
  });

  it("fails clearly when item-analysis codes do not match student codes", () => {
    const numericCodes = itemAnalysis.map((ia) => ({ ...ia, code: Number(ia.code) }));
    expect(() => computeAverageResults(answers, numericCodes, 2)).toThrow(/No usable rows/);
  });
});

describe("classifyStudentsByQuartile", () => {
  it("ranks into quartiles, keeping boundary ties in the higher quartile", () => {
    const results: StudentResult[] = [15, 10, 10, 5, 0].map((Tot, i) => ({
      ID: `20190000${i + 1}`,
      Code: "001",
      Tot,
      Per: 0,
    }));
    // n=5: boundaries at indices 2, 3, 4. Index 2 (Tot 10) ties the last T1
    // student, so it is pulled up into T1, which leaves T2 empty (current behaviour).
    expect(classifyStudentsByQuartile(results).map((r) => [r.Tot, r.Rank])).toEqual([
      [15, "T1"],
      [10, "T1"],
      [10, "T1"],
      [5, "T3"],
      [0, "T4"],
    ]);
  });
});

describe("comprehensive item analysis (single version, hand-checked)", () => {
  // Key: Q1=A, Q2=B, Q3=C. Scores (5 pts/question): 15, 10, 5, 0.
  const answers = [
    examRow("0", "001", ["A", "B", "C"]),
    examRow("201900001", "001", ["A", "B", "C"]),
    examRow("201900002", "001", ["A", "B", "D"]),
    examRow("201900003", "001", ["A", "E", "E"]),
    examRow("201900004", "001", ["B", "E", "E"]),
  ];
  const itemAnalysis: ItemAnalysisRow[] = ["A", "B", "C"].map((correct, i) => ({
    code: "001",
    order: i + 1,
    order_in_master: i + 1,
    permutation: "ABCDE",
    correct,
  }));
  const result = computeComprehensiveItemAnalysis(answers, itemAnalysis, 3);

  it("computes difficulty, discrimination and point-biserial per item", () => {
    const items = result.itemStatistics;
    // p: correct counts 3, 2, 1 of 4
    expect(items.map((s) => s.p_i)).toEqual([0.75, 0.5, 0.25]);
    // D: upper 27% = top 2 {15,10}, lower = bottom 2 {5,0}
    expect(items.map((s) => s.D_i)).toEqual([0.5, 1, 0.5]);
    // r_pb with rest scores; e.g. Q1: rest {10,5,0 | 0}, sd = sqrt(17.1875)
    // -> (5 - 0) / 4.14578 * sqrt(0.75 * 0.25) = 0.522233
    expect(items[0].r_pb).toBeCloseTo(0.522233, 5);
    expect(items[1].r_pb).toBeCloseTo(0.707107, 5);
    expect(items[2].r_pb).toBeCloseTo(0.522233, 5);
  });

  it("computes distractor efficiency and decisions", () => {
    const items = result.itemStatistics;
    // Functional distractor = chosen by >= 5% (0.2 of 4 students).
    // Q1: B -> 1 of 4; Q2: E -> 1 of 4; Q3: D, E -> 2 of 4
    expect(items.map((s) => s.DE)).toEqual([25, 25, 50]);
    expect(items.map((s) => s.decision)).toEqual(["REVISE", "REVISE", "REVISE"]);
    expect(items.map((s) => s.decisionReason)).toEqual([
      "Poor distractor efficiency",
      "Poor distractor efficiency",
      "Too difficult; Poor distractor efficiency",
    ]);
  });

  it("computes the test summary including KR-20", () => {
    const s = result.testSummary;
    expect(s.totalItems).toBe(3);
    expect(s.totalStudents).toBe(4);
    expect(s.meanScore).toBe(7.5);
    expect(s.stdDevScore).toBeCloseTo(Math.sqrt(31.25), 10);
    expect(s.meanDifficulty).toBe(0.5);
    expect(s.meanDiscrimination).toBeCloseTo(2 / 3, 10);
    // items correct 3,2,1,0: var = 1.25; sum pq = 0.625; KR20 = 3/2 * (1 - 0.5)
    expect(s.KR20).toBeCloseTo(0.75, 10);
    expect([s.itemsToKeep, s.itemsToRevise, s.itemsToInvestigate]).toEqual([0, 3, 0]);
  });

  it("computes option-level statistics", () => {
    const q1 = result.optionStatistics.filter((o) => o.questionNumber === 1);
    expect(q1.map((o) => o.option)).toEqual(["A", "B", "C", "D", "E", "Blank/Other"]);
    expect(q1.map((o) => o.count)).toEqual([3, 1, 0, 0, 0, 0]);
    expect(q1.map((o) => o.isCorrect)).toEqual([true, false, false, false, false, false]);
    expect(q1.map((o) => o.isFunctional)).toEqual([false, true, false, false, false, false]);
    expect(q1.map((o) => [o.T1, o.T2, o.T3, o.T4])).toEqual([
      [1, 1, 1, 0],
      [0, 0, 0, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(q1[0].p_ij).toBe(0.75);
    expect(q1[0].D_ij).toBe(0.5);
    expect(q1[1].D_ij).toBe(-0.5);
    // A chosen by {15,10,5}, not by {0}: (10 - 0) / sqrt(31.25) * sqrt(0.1875)
    expect(q1[0].r_pb).toBeCloseTo(0.774597, 5);
    expect(q1[1].r_pb).toBeCloseTo(-0.774597, 5);
  });
});
