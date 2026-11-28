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
    it("versions that disagree on a master key", () => {
      expect(run(replace(5, { correct: "A" }))).toThrow(
        /master Q1: versions 001 and 002 give different correct answers \(master options A and B\)/
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
  });
});
