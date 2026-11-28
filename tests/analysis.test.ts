import { describe, it, expect } from "vitest";
import {
  buildCorrectAnswersMap,
  classifyStudentsByQuartile,
  computeAverageResults,
  computeCodeAverages,
  computeComprehensiveItemAnalysis,
  computeResults,
  getAllQuestionCols,
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
    // P9: against Q1's rest score R = total - 5 x (Q1 correct) = {10, 5, 0 | 0}, sd = sqrt(17.1875).
    // A chosen by the first three: (5 - 0) / 4.14578 * sqrt(0.75 * 0.25) = 0.522233,
    // which equals Q1's item r_pb (a single accepted answer)
    expect(q1[0].r_pb).toBeCloseTo(0.522233, 5);
    expect(q1[0].r_pb).toBeCloseTo(result.itemStatistics[0].r_pb, 10);
    expect(q1[1].r_pb).toBeCloseTo(-0.522233, 5);
  });
});

describe("comprehensive item analysis across versions (P2, hand-checked)", () => {
  // Master key: m1 = A, m2 = B, m3 = C.
  // Version 001: master order, identity options.
  // Version 002: positions show masters [2, 3, 1] (a 3-cycle). Master Q1 has a
  // non-self-inverse option permutation "BCADE" (version letter -> master letter),
  // so its correct version letter is C.
  const answers = [
    examRow("0", "001", ["A", "B", "C"]),
    examRow("0", "002", ["B", "C", "C"]),
    examRow("s1", "001", ["A", "B", "C"]), // m1 m2 m3 correct
    examRow("s2", "001", ["A", "B", "E"]), // m1 m2
    examRow("s3", "001", ["A", "E", "E"]), // m1
    examRow("s4", "001", ["D", "E", "E"]), // none
    examRow("t1", "002", ["B", "C", "C"]), // m2 m3 m1
    examRow("t2", "002", ["B", "E", "C"]), // m2 m1
    examRow("t3", "002", ["E", "E", "C"]), // m1
    examRow("t4", "002", ["E", "E", "A"]), // none (version A on m1 = master B)
  ];
  const itemAnalysis: ItemAnalysisRow[] = [
    { code: "001", order: 1, order_in_master: 1, permutation: "ABCDE", correct: "A" },
    { code: "001", order: 2, order_in_master: 2, permutation: "ABCDE", correct: "B" },
    { code: "001", order: 3, order_in_master: 3, permutation: "ABCDE", correct: "C" },
    { code: "002", order: 1, order_in_master: 2, permutation: "ABCDE", correct: "B" },
    { code: "002", order: 2, order_in_master: 3, permutation: "ABCDE", correct: "C" },
    { code: "002", order: 3, order_in_master: 1, permutation: "BCADE", correct: "C" },
  ];

  const deepFreeze = <T,>(value: T): T => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };
  const snapshot = JSON.stringify({ answers, itemAnalysis });
  deepFreeze(answers);
  deepFreeze(itemAnalysis);
  const result = computeComprehensiveItemAnalysis(answers, itemAnalysis, 3);

  // Independent point-biserial: Pearson correlation of 0/1 correctness with items-correct minus this item
  const correctness = [
    // m1 m2 m3 for s1..s4, t1..t4
    [1, 1, 1], [1, 1, 0], [1, 0, 0], [0, 0, 0],
    [1, 1, 1], [1, 1, 0], [1, 0, 0], [0, 0, 0],
  ];
  const pearson = (xs: number[], ys: number[]) => {
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const mx = mean(xs);
    const my = mean(ys);
    const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const syy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
    return sxy / Math.sqrt(sxx * syy);
  };
  const restCorrelation = (m: number) => {
    const xs = correctness.map((c) => c[m]);
    return pearson(xs, correctness.map((c, i) => c.reduce((a, b) => a + b, 0) - xs[i]));
  };

  it("labels each statistic with the master question it measures", () => {
    const items = result.itemStatistics;
    // Per master: 6/8, 4/8, 2/8. (Per position, the old bug gave 5/8, 3/8, 4/8.)
    expect(items.map((s) => s.p_i)).toEqual([0.75, 0.5, 0.25]);
    // Upper 3 = s1, t1, s2; lower 3 = t3, s4, t4 (stable order on ties)
    expect(items[0].D_i).toBeCloseTo(2 / 3, 10);
    expect(items[1].D_i).toBe(1);
    expect(items[2].D_i).toBeCloseTo(2 / 3, 10);
    items.forEach((s, m) => expect(s.r_pb).toBeCloseTo(restCorrelation(m), 10));
  });

  it("keeps grades, KR-20 inputs and option statistics in version letters", () => {
    const s = result.testSummary;
    expect(s.totalStudents).toBe(8);
    expect(s.meanScore).toBe(7.5); // items correct 3,2,1,0 per version, 5 points each
    // var(items correct) = 1.25; sum pq = 0.1875 + 0.25 + 0.1875 = 0.625; KR20 = 3/2 * (1 - 0.5)
    expect(s.KR20).toBeCloseTo(0.75, 10);
    const q1 = result.optionStatistics.filter((o) => o.questionNumber === 1);
    // 001: A,A,A,D. 002 (version letters C,C,C,A through BCADE): master A,A,A,B
    expect(q1.map((o) => o.count)).toEqual([6, 1, 0, 1, 0, 0]);
    expect(q1.map((o) => o.isCorrect)).toEqual([true, false, false, false, false, false]);
  });

  it("does not modify its inputs", () => {
    expect(JSON.stringify({ answers, itemAnalysis })).toBe(snapshot);
  });

  it("gives the same result as the same exam already in master order", () => {
    const masterOrder = answers.map((row) =>
      row.Code === "002" ? { ...row, "1": row["3"], "2": row["1"], "3": row["2"] } : { ...row }
    );
    const identityMap = itemAnalysis.map((ia) => ({ ...ia, order: ia.order_in_master }));
    expect(result).toEqual(computeComprehensiveItemAnalysis(masterOrder, identityMap, 3));
  });

  it("KR-20 can also go down once items are per master question", () => {
    // Version 002 swaps two questions. Master correctness (m1, m2):
    // 001: (1,0), (1,1); 002: (0,1), (0,0). Per position p was [0.75, 0.25] -> KR-20 0.5.
    const rows = [
      examRow("0", "001", ["A", "B"]),
      examRow("0", "002", ["B", "A"]),
      examRow("u1", "001", ["A", "E"]),
      examRow("u2", "001", ["A", "B"]),
      examRow("u3", "002", ["B", "E"]),
      examRow("u4", "002", ["E", "E"]),
    ];
    const map: ItemAnalysisRow[] = [
      { code: "001", order: 1, order_in_master: 1, permutation: "ABCDE", correct: "A" },
      { code: "001", order: 2, order_in_master: 2, permutation: "ABCDE", correct: "B" },
      { code: "002", order: 1, order_in_master: 2, permutation: "ABCDE", correct: "B" },
      { code: "002", order: 2, order_in_master: 1, permutation: "ABCDE", correct: "A" },
    ];
    const r = computeComprehensiveItemAnalysis(rows, map, 2);
    expect(r.itemStatistics.map((s) => s.p_i)).toEqual([0.5, 0.5]);
    expect(r.testSummary.KR20).toBeCloseTo(0, 10); // sum pq 0.5 = variance 0.5
  });

  describe("rejects an item analysis file it cannot use", () => {
    const run = (map: ItemAnalysisRow[], rows = answers) => () => computeComprehensiveItemAnalysis(rows, map, 3);
    const replace = (i: number, patch: Partial<ItemAnalysisRow>) =>
      itemAnalysis.map((ia, j) => (j === i ? { ...ia, ...patch } : ia));

    it("a version with no entries", () => {
      expect(run(itemAnalysis.filter((ia) => ia.code !== "002"))).toThrow(/no entries for version 002/);
    });
    it("a missing master question", () => {
      expect(run(itemAnalysis.filter((_, j) => j !== 5))).toThrow(/version 002 has no position for master Q1/);
    });
    it("a master question listed twice", () => {
      expect(run([...itemAnalysis, { ...itemAnalysis[5] }])).toThrow(/master Q1 is listed more than once/);
    });
    it("two masters at one position", () => {
      expect(run(replace(5, { order: 1 }))).toThrow(/position 1 is given to both master Q2 and master Q1/);
    });
    it("positions that are out of range or not whole numbers", () => {
      expect(run(replace(5, { order: 0 }))).toThrow(/position "0" is not a whole number from 1 to 3/);
      expect(run(replace(5, { order: 4 }))).toThrow(/position "4"/);
      expect(run(replace(5, { order: 2.5 }))).toThrow(/position "2.5"/);
      expect(run(replace(5, { order_in_master: 7 }))).toThrow(/master question "7"/);
    });
    it("a missing or invalid option permutation", () => {
      expect(run(replace(5, { permutation: undefined }))).toThrow(
        /version 002, master Q1: the option permutation "" is missing or invalid/
      );
      expect(run(replace(5, { permutation: "AACDE" }))).toThrow(/permutation "AACDE"/);
    });
    it("a missing correct answer, or one outside the options", () => {
      expect(run(replace(5, { correct: undefined }))).toThrow(/version 002, master Q1: the correct answer "" is missing/);
      expect(run(replace(5, { permutation: "BCA", correct: "D" }))).toThrow(/not one of its 3 options/);
    });
    it("a correct letter the version's solution row does not accept", () => {
      // 002's solution row accepts C at master Q1's position; the map says A
      expect(run(replace(5, { correct: "A" }))).toThrow(
        /version 002, master Q1: the item analysis file's correct answer "A" is not accepted by the solution row \("C"\)/
      );
    });
    it("a student listed twice in one version", () => {
      expect(run(itemAnalysis, [...answers, examRow("t4", "002", ["B", "C", "C"])])).toThrow(
        /student ID "t4" appears more than once in version 002/
      );
    });
    it("a version with students but no solution row", () => {
      expect(run(itemAnalysis, answers.filter((r) => !(r.ID === "0" && r.Code === "002")))).toThrow(
        /version 002 has students but no solution row/
      );
    });
    it("the same student ID in two different versions is fine", () => {
      expect(run(itemAnalysis, [...answers, examRow("s1", "002", ["E", "E", "E"])])).not.toThrow();
    });
    it("a missing student answer cell, but not an empty one", () => {
      const missing = answers.map((r) => (r.ID === "t2" ? without(r, "2") : r));
      expect(run(itemAnalysis, missing)).toThrow(/version 002: student "t2" has no value for question 2/);
      expect(run(itemAnalysis, answers.map((r) => (r.ID === "t2" ? { ...r, "2": "" } : r)))).not.toThrow();
    });
    it("a solution row without a mapped question", () => {
      const missing = answers.map((r) => (r.ID === "0" && r.Code === "002" ? without(r, "3") : r));
      expect(run(itemAnalysis, missing)).toThrow(/version 002: the solution row has no question 3/);
    });
    it("conflicting solution rows for one version, in either order", () => {
      const other = examRow("0", "002", ["B", "C", "A"]); // differs at position 3
      expect(run(itemAnalysis, [...answers, other])).toThrow(/version 002 has 2 solution rows with different answers for question 3/);
      expect(run(itemAnalysis, [other, ...answers])).toThrow(/different answers for question 3/);
    });
    it("identical duplicate solution rows are fine", () => {
      expect(computeComprehensiveItemAnalysis([...answers, examRow("0", "002", ["B", "C", "C"])], itemAnalysis, 3)).toEqual(result);
    });
    it("multi-letter Correct metadata, with a clear message", () => {
      expect(run(replace(0, { correct: "AB" }))).toThrow(
        /"Correct" value "AB" must be one option letter; multiple accepted answers belong in the solution row/
      );
    });
  });

  it("gives every student the same grade and keeps every option count and DE", () => {
    // Grades on the original (version-ordered) data, 5 points per question
    const qCols = getAllQuestionCols(answers).slice(0, 3);
    const grades = computeResults(answers, qCols, buildCorrectAnswersMap(answers, qCols));
    expect(grades.map((g) => [g.ID, g.Tot])).toEqual([
      ["s1", 15], ["s2", 10], ["s3", 5], ["s4", 0],
      ["t1", 15], ["t2", 10], ["t3", 5], ["t4", 0],
    ]);
    const tots = grades.map((g) => g.Tot);
    const mean = tots.reduce((a, b) => a + b, 0) / tots.length;
    expect(result.testSummary.meanScore).toBe(mean);
    expect(result.testSummary.stdDevScore).toBeCloseTo(Math.sqrt(tots.reduce((a, t) => a + (t - mean) ** 2, 0) / tots.length), 10);
    // Options A..E, Blank/Other per master question (decoded to master letters)
    const counts = (m: number) => result.optionStatistics.filter((o) => o.questionNumber === m).map((o) => o.count);
    expect(counts(1)).toEqual([6, 1, 0, 1, 0, 0]);
    expect(counts(2)).toEqual([0, 4, 0, 0, 4, 0]);
    expect(counts(3)).toEqual([0, 0, 2, 0, 6, 0]);
    expect(result.itemStatistics.map((s) => s.DE)).toEqual([50, 25, 25]);
  });

  it("matches codes, permutations and correct letters the same way everywhere", () => {
    // Spaces, lower case and reordered mapping rows: same result as the clean input
    const messy = [...itemAnalysis].reverse().map((ia) => ({
      ...ia,
      code: ` ${ia.code} `,
      permutation: ` ${ia.permutation!.toLowerCase()} `,
      correct: ` ${ia.correct!.toLowerCase()}`,
    }));
    const spaced = answers.map((r) => ({ ...r, Code: ` ${r.Code}` }));
    expect(computeComprehensiveItemAnalysis(spaced, messy, 3)).toEqual(result);
  });

  it("works with alphanumeric codes and ignores a version with no students", () => {
    const rename = (c: string) => (c.trim() === "001" ? "A1" : "B2");
    const rows = [...answers.map((r) => ({ ...r, Code: rename(r.Code) })), examRow("0", "099", ["A", "B", "C"])];
    const map = itemAnalysis.map((ia) => ({ ...ia, code: rename(String(ia.code)) }));
    expect(computeComprehensiveItemAnalysis(rows, map, 3)).toEqual(result);
  });

  it("unequal version sizes", () => {
    const fewer = answers.filter((r) => r.ID !== "t3" && r.ID !== "t4"); // 4 in 001, 2 in 002
    const r = computeComprehensiveItemAnalysis(fewer, itemAnalysis, 3);
    // Master correctness: s1 111, s2 110, s3 100, s4 000, t1 111, t2 110
    expect(r.itemStatistics.map((s) => s.p_i)).toEqual([5 / 6, 4 / 6, 2 / 6]);
    const matrix = [[1, 1, 1], [1, 1, 0], [1, 0, 0], [0, 0, 0], [1, 1, 1], [1, 1, 0]];
    r.itemStatistics.forEach((s, m) => expect(s.r_pb).toBeCloseTo(restScoreCorrelation(matrix, m), 10));
  });
});

/** Copy of a row without one question column. */
function without(row: ReturnType<typeof examRow>, key: string) {
  const copy = { ...row };
  delete copy[key];
  return copy;
}

/** Pearson correlation of 0/1 correctness on item m with items-correct minus that item. */
function restScoreCorrelation(matrix: number[][], m: number): number {
  const xs = matrix.map((c) => c[m]);
  const ys = matrix.map((c, i) => c.reduce((a, b) => a + b, 0) - xs[i]);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const syy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

describe("comprehensive item analysis: one shuffled version (P2)", () => {
  // One version whose positions show masters [2, 3, 1]; master key A, B, C.
  // Older releases labelled position statistics as master questions here too.
  const answers = [
    examRow("0", "001", ["B", "C", "A"]),
    examRow("a1", "001", ["B", "C", "A"]), // m2 m3 m1
    examRow("a2", "001", ["B", "C", "E"]), // m2 m3
    examRow("a3", "001", ["B", "E", "E"]), // m2
    examRow("a4", "001", ["", "E", "E"]), // none (one blank)
    examRow("a5", "001", ["E", "E", "A"]), // m1
  ];
  const map: ItemAnalysisRow[] = [
    { code: "001", order: 1, order_in_master: 2, permutation: "ABCDE", correct: "B" },
    { code: "001", order: 2, order_in_master: 3, permutation: "ABCDE", correct: "C" },
    { code: "001", order: 3, order_in_master: 1, permutation: "ABCDE", correct: "A" },
  ];
  const r = computeComprehensiveItemAnalysis(answers, map, 3);

  it("labels statistics by master question", () => {
    // Per master 2/5, 3/5, 2/5 (per position it would be 3/5, 2/5, 2/5)
    expect(r.itemStatistics.map((s) => s.p_i)).toEqual([0.4, 0.6, 0.4]);
    // Upper 2 = a1, a2; lower 2 = a5, a4
    expect(r.itemStatistics.map((s) => s.D_i)).toEqual([0, 1, 1]);
    const matrix = [[1, 1, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0], [1, 0, 0]];
    r.itemStatistics.forEach((s, m) => expect(s.r_pb).toBeCloseTo(restScoreCorrelation(matrix, m), 10));
  });
});

describe("comprehensive item analysis: constant items", () => {
  // Q1 everyone correct, Q2 everyone blank, Q3 half correct with a constant rest score
  const answers = [
    examRow("0", "001", ["A", "B", "C"]),
    examRow("c1", "001", ["A", "", "C"]),
    examRow("c2", "001", ["A", "", "E"]),
    examRow("c3", "001", ["A", "", "C"]),
    examRow("c4", "001", ["A", "", "E"]),
  ];
  const map: ItemAnalysisRow[] = ["A", "B", "C"].map((correct, i) => ({
    code: "001",
    order: i + 1,
    order_in_master: i + 1,
    permutation: "ABCDE",
    correct,
  }));
  const r = computeComprehensiveItemAnalysis(answers, map, 3);

  it("returns finite zero correlations, as the oracle does", () => {
    expect(r.itemStatistics.map((s) => s.p_i)).toEqual([1, 0, 0.5]);
    expect(r.itemStatistics.map((s) => s.r_pb)).toEqual([0, 0, 0]);
    const matrix = [[1, 0, 1], [1, 0, 0], [1, 0, 1], [1, 0, 0]];
    [0, 1, 2].forEach((m) => expect(restScoreCorrelation(matrix, m)).toBe(0));
    // items correct 2,1,2,1: var 0.25 = sum pq 0.25 -> KR-20 0
    expect(r.testSummary.KR20).toBeCloseTo(0, 10);
    expect(Number.isFinite(r.testSummary.KR20)).toBe(true);
  });
});
