/**
 * The 1.9.1 batch (references/BATCH_1.9.1.md, channel 010), hand-checked:
 * P3 header-based CSV reading, P5 version-name pairs, P6 working accepted sets,
 * P7 option counts and DE (N/A), P8 one-question exams, P9 option r_pb against
 * the rest score, P10 quartile ties, P12 version codes and binding.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { saveAs } from "file-saver";
import {
  applyCodeBinding,
  applyColumnMapping,
  bindVersionCodes,
  buildCorrectAnswersMap,
  classifyStudentsByQuartile,
  computeComprehensiveItemAnalysis,
  computeResults,
  exportComprehensiveAnalysisToExcel,
  findVersionPairs,
  getAllQuestionCols,
  normalizeItemAnalysis,
  normalizeVersionCode,
  parseCSVWithMapping,
  parseWideFormat,
  readCSVFileWithDetection,
  readCsvTable,
  readExamDataFileWithDetection,
  reviseSolutionRows,
  sortVersionCodes,
  validateCorrectAnswers,
  versionCodeKey,
} from "@/lib/excel-utils";
import { toVersionLetter, type Letter } from "@/lib/dummy-data";
import { ComprehensiveResults } from "@/components/wizard/results/comprehensive-results";
import type { ExamRow, ItemAnalysisRow, StudentResult } from "@/types/exam";
import { blobToBytes, examRow, makeFile, readWorkbookSheets } from "./helpers";

vi.mock("file-saver", () => ({ saveAs: vi.fn() }));
beforeEach(() => vi.mocked(saveAs).mockClear());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ident = (n: number) => "ABCDE".slice(0, n);
const map = (code: string, order: number, master: number, permutation: string, correct: string): ItemAnalysisRow => ({
  code,
  order,
  order_in_master: master,
  permutation,
  correct,
});

/** Independent Pearson correlation (0 when either side is constant). */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/* ------------------------------------------------------------------ */
/* P3                                                                  */
/* ------------------------------------------------------------------ */

describe("P3: CSV columns come from the header row", () => {
  it("keeps every column for every row, including an all-empty optional column", () => {
    const [rows, columns] = readCsvTable('Version,"Version Q#",Master Q#,Note\n1,1,1,\n1,2,2,\n');
    expect(columns).toEqual(["Version", "Version Q#", "Master Q#", "Note"]);
    expect(rows).toEqual([
      { Version: "1", "Version Q#": "1", "Master Q#": "1", Note: "" },
      { Version: "1", "Version Q#": "2", "Master Q#": "2", Note: "" },
    ]);
  });

  it("rejects repeated column names and files without data rows", async () => {
    expect(() => readCsvTable("Version,version,Master Q#\n1,1,1\n")).toThrow(/two columns named "Version" and "version"/);
    expect(() => readCsvTable("Version,Version Q#,Master Q#\n")).toThrow(/no data rows/);
    await expect(readCSVFileWithDetection(makeFile("Version,Version Q#\n", "x.csv"))).rejects.toThrow(/no data rows/);
  });
});

/* ------------------------------------------------------------------ */
/* P5                                                                  */
/* ------------------------------------------------------------------ */

describe("P5: version column pairs", () => {
  it("all legacy spellings: numeric codes, in number order", () => {
    const pairs = findVersionPairs(["Q", "Option", "Master_Correct", "v2_Q", "v2_Opt", "version_1_Q", "Version 1 Opt"])!;
    expect(pairs.mode).toBe("legacy");
    expect(pairs.pairs.map((p) => [p.code, p.qCol, p.optCol])).toEqual([
      ["1", "version_1_Q", "Version 1 Opt"],
      ["2", "v2_Q", "v2_Opt"],
    ]);
    expect(pairs.consecutive).toBe(true);
  });

  it("named or mixed files keep every name as written (one rule for the whole file)", () => {
    expect(findVersionPairs(["A_Opt", "A_Q", "B_Q", "B_Opt"])!.pairs.map((p) => p.code)).toEqual(["A", "B"]);
    const mixed = findVersionPairs(["version_1_Q", "version_1_Opt", "A_Q", "A_Opt"])!;
    expect([mixed.mode, mixed.pairs.map((p) => p.code)]).toEqual(["named", ["version_1", "A"]]);
  });

  it("rejects orphan halves and two columns for one version", () => {
    expect(() => findVersionPairs(["A_Q", "A_Opt", "B_Opt"])).toThrow(/"B_Opt" but no matching _Q column for version "B"/);
    expect(() => findVersionPairs(["version_1_Q", "v1_Q", "version_1_Opt"])).toThrow(/two columns for version "1"/);
    expect(() => findVersionPairs(["A_Q", "a_q", "A_Opt"])).toThrow(/two columns for version "A"/);
    expect(findVersionPairs(["Q", "Option", "Master_Correct"])).toBeNull();
  });

  it("parses a named matrix, with a non-self-inverse shuffle decoded once", () => {
    // Master A -> version B, B -> C, C -> A: version letter -> master letter is "CAB"
    const columns = ["Q", "Option", "Master_Correct", "X_Q", "X_Opt"];
    const rows = [
      { Q: "1", Option: "A", Master_Correct: "YES", X_Q: "2", X_Opt: "B" },
      { Q: "1", Option: "B", Master_Correct: "", X_Q: "2", X_Opt: "C" },
      { Q: "1", Option: "C", Master_Correct: "", X_Q: "2", X_Opt: "A" },
    ];
    expect(parseWideFormat(rows, columns)).toEqual([map("X", 2, 1, "CAB", "B")]);
  });
});

/* ------------------------------------------------------------------ */
/* P7: Options Matrix structure                                        */
/* ------------------------------------------------------------------ */

describe("P7: invalid Options Matrix structures are rejected, not padded", () => {
  const columns = ["Q", "Option", "Master_Correct", "version_1_Q", "version_1_Opt"];
  const row = (opt: string, flag: string, q: string, vopt: string) => ({ Q: "1", Option: opt, Master_Correct: flag, version_1_Q: q, version_1_Opt: vopt });
  it.each([
    ["a duplicate option", [row("A", "YES", "1", "A"), row("A", "", "1", "B")], /each option row needs one letter/],
    ["a hole in the options", [row("A", "YES", "1", "A"), row("C", "", "1", "B")], /each option row needs one letter/],
    ["a single option", [row("A", "YES", "1", "A")], /each option row needs one letter/],
    ["duplicate version letters", [row("A", "YES", "1", "A"), row("B", "", "1", "A")], /one-to-one shuffle of A to B/],
    ["a version letter beyond n", [row("A", "YES", "1", "A"), row("B", "", "1", "C")], /one-to-one shuffle of A to B/],
    ["positions that differ", [row("A", "YES", "1", "A"), row("B", "", "2", "B")], /one whole-number position/],
    ["no correct flag", [row("A", "", "1", "A"), row("B", "", "1", "B")], /exactly one option must be marked/],
    ["two correct flags", [row("A", "YES", "1", "A"), row("B", "YES", "1", "B")], /exactly one option must be marked/],
  ])("%s", (_, rows, error) => {
    expect(() => parseWideFormat(rows, columns)).toThrow(error);
  });
});

/* ------------------------------------------------------------------ */
/* P6: one working key per master question                             */
/* ------------------------------------------------------------------ */

describe("P6: the working accepted sets decide correctness", () => {
  // Master Q1 accepts {A, C}. Version 002 shows master Q1 with options swapped A<->C ("CBADE"),
  // so its version letters for {A, C} are also "AC", and its scalar "A" means master C.
  const exam = [
    examRow("0", "001", ["AC", "B"]),
    examRow("0", "002", ["AC", "B"]),
    examRow("s1", "001", ["A", "B"]),
    examRow("s2", "001", ["C", "B"]),
    examRow("s3", "001", ["B", "E"]),
    examRow("t1", "002", ["A", "B"]),
    examRow("t2", "002", ["C", "E"]),
    examRow("t3", "002", ["D", "B"]),
  ];
  const equalSets = [
    map("001", 1, 1, "ABCDE", "A"),
    map("001", 2, 2, "ABCDE", "B"),
    map("002", 1, 1, "CBADE", "A"),
    map("002", 2, 2, "ABCDE", "B"),
  ];

  it("equal working sets with different scalar representatives are accepted, and both answers are correct", () => {
    const r = computeComprehensiveItemAnalysis(exam, equalSets, 2);
    const q1 = r.optionStatistics.filter((o) => o.questionNumber === 1);
    expect(q1.filter((o) => o.isCorrect).map((o) => o.option)).toEqual(["A", "C"]);
    expect(q1.filter((o) => o.isCorrect).every((o) => !o.isFunctional)).toBe(true);
    // Correct: s1 A, s2 C, t1 (A = master C), t2 (C = master A) -> 4 of 6
    expect(r.itemStatistics[0].p_i).toBeCloseTo(4 / 6, 10);
    // Distractors B, D, E: B chosen by s3, D by t3 (both >= 5%), E by nobody -> 2 of 3
    expect(r.itemStatistics[0].DE).toBeCloseTo((2 / 3) * 100, 10);
  });

  it("different working sets are an error, even when the scalar letters agree", () => {
    const narrowed = exam.map((row) => (row.ID === "0" && row.Code === "002" ? { ...row, "1": "C" } : row));
    // 002 now accepts only version C = master A; scalar "C" there decodes to master A, like 001's "A"
    const maps = equalSets.map((m) => (m.code === "002" && m.order_in_master === 1 ? { ...m, correct: "C" } : m));
    expect(() => computeComprehensiveItemAnalysis(narrowed, maps, 2)).toThrow(
      /master Q1: versions 001 and 002 accept different answers \(master options AC and A\)/
    );
  });

  it("a version without students cannot decide the key, even listed first", () => {
    const unused = [map("009", 1, 1, "ABCDE", "E"), map("009", 2, 2, "ABCDE", "E"), ...equalSets];
    expect(() => computeComprehensiveItemAnalysis(exam, unused, 2)).not.toThrow();
  });

  it("an empty working set, or one beyond the options, is an error", () => {
    const blank = exam.map((row) => (row.ID === "0" && row.Code === "002" ? { ...row, "1": "" } : row));
    expect(() => computeComprehensiveItemAnalysis(blank, equalSets, 2)).toThrow(/version 002, master Q1: the solution row has no answer/);
    const three = equalSets.map((m) => (m.order_in_master === 1 ? { ...m, permutation: m.code === "002" ? "CBA" : "ABC" } : m));
    const beyond = exam.map((row) => (row.ID === "0" ? { ...row, "1": "AD" } : row));
    expect(() => computeComprehensiveItemAnalysis(beyond, three, 2)).toThrow(/accepts "D", which is not one of its 3 options/);
  });

  it("a second answer accepted in Step 2 becomes correct in the option analysis", () => {
    // A single key, master A: version letter A in 001, C in 002 (its options swap A and C)
    const single = exam.map((row) => (row.ID === "0" ? { ...row, "1": row.Code === "001" ? "A" : "C" } : row));
    const singleMap = equalSets.map((m) => (m.code === "002" && m.order_in_master === 1 ? { ...m, correct: "C" } : m));
    const before = computeComprehensiveItemAnalysis(single, singleMap, 2).optionStatistics.filter((o) => o.questionNumber === 1);
    expect(before.filter((o) => o.isCorrect).map((o) => o.option)).toEqual(["A"]);
    // Step 2 accepts A and C for Q1 in both versions
    const qCols = getAllQuestionCols(single).slice(0, 2);
    const correctMap = buildCorrectAnswersMap(single, qCols);
    correctMap["001"][0] = ["A", "C"];
    correctMap["002"][0] = ["A", "C"];
    const revised = reviseSolutionRows(single, qCols, correctMap);
    expect(validateCorrectAnswers(singleMap, revised)).toBeNull();
    const after = computeComprehensiveItemAnalysis(revised, singleMap, 2).optionStatistics.filter((o) => o.questionNumber === 1);
    expect(after.filter((o) => o.isCorrect).map((o) => o.option)).toEqual(["A", "C"]);
    expect(after.find((o) => o.option === "C")!.isFunctional).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* P7: option counts and DE                                            */
/* ------------------------------------------------------------------ */

describe("P7: DE counts real options only", () => {
  // One version, 20 students, key A everywhere; Q1..Q4 have 2, 3, 4 and 5 options.
  // Each student's answers are given per question below (counts per option).
  const plan: Record<number, string[]> = {
    1: [...Array(15).fill("A"), ...Array(5).fill("B")], // B functional -> DE 100
    2: [...Array(15).fill("A"), ...Array(4).fill("B"), "E"], // C unchosen, E is not an option -> DE 50
    3: [...Array(14).fill("A"), ...Array(3).fill("B"), ...Array(3).fill("C")], // D unchosen -> 66.67
    4: [...Array(12).fill("A"), "B", "B", "C", "C", "D", "D", "E", "E"], // all four -> 100
  };
  const students = Array.from({ length: 20 }, (_, i) => examRow(`s${i}`, "001", [1, 2, 3, 4].map((q) => plan[q][i])));
  const exam = [examRow("0", "001", ["A", "A", "A", "A"]), ...students];
  const maps = [1, 2, 3, 4].map((q) => map("001", q, q, ident(q + 1), "A"));
  const r = computeComprehensiveItemAnalysis(exam, maps, 4);

  it("divides by the real distractors (n - accepted)", () => {
    expect(r.itemStatistics.map((s) => s.DE)).toEqual([100, 50, (2 / 3) * 100, 100]);
  });

  it("lists A..n plus Blank/Other; an answer beyond n is Blank/Other; counts are conserved", () => {
    const q2 = r.optionStatistics.filter((o) => o.questionNumber === 2);
    expect(q2.map((o) => [o.option, o.count])).toEqual([
      ["A", 15],
      ["B", 4],
      ["C", 0],
      ["Blank/Other", 1],
    ]);
    for (const q of [1, 2, 3, 4]) {
      const rows = r.optionStatistics.filter((o) => o.questionNumber === q);
      expect(rows).toHaveLength(q + 2);
      expect(rows.reduce((a, o) => a + o.count, 0)).toBe(20);
    }
  });

  it("the three-option example: A correct, B and C each >= 5% gives DE 100", () => {
    const three = [examRow("0", "001", ["A", "A"]), ...["A", "A", "A", "B", "C", "A", "B", "C", "A", "A"].map((a, i) => examRow(`x${i}`, "001", [a, "A"]))];
    const res = computeComprehensiveItemAnalysis(three, [map("001", 1, 1, "ABC", "A"), map("001", 2, 2, "AB", "A")], 2);
    expect(res.itemStatistics[0].DE).toBe(100);
    expect(res.optionStatistics.filter((o) => o.questionNumber === 1).map((o) => o.option)).toEqual(["A", "B", "C", "Blank/Other"]);
  });

  it("every option accepted: DE is N/A, and the decision skips the distractor rules", () => {
    const all = [examRow("0", "001", ["AB", "A"]), ...["A", "B", "A", "B"].map((a, i) => examRow(`y${i}`, "001", [a, i % 2 ? "A" : "B"]))];
    const res = computeComprehensiveItemAnalysis(all, [map("001", 1, 1, "AB", "A"), map("001", 2, 2, "AB", "A")], 2);
    expect(res.itemStatistics[0].DE).toBeNull();
    expect(res.itemStatistics[0].decisionReason).not.toMatch(/distractor/i);
    expect(res.itemStatistics[0].decisionReason).toMatch(/Too easy/);
  });

  it("versions that disagree on the number of options are an error", () => {
    const two = [examRow("0", "001", ["A", "A"]), examRow("0", "002", ["A", "A"]), examRow("a", "001", ["A", "A"]), examRow("b", "002", ["B", "A"])];
    const maps2 = [map("001", 1, 1, "ABC", "A"), map("001", 2, 2, "AB", "A"), map("002", 1, 1, "ABCD", "A"), map("002", 2, 2, "AB", "A")];
    expect(() => computeComprehensiveItemAnalysis(two, maps2, 2)).toThrow(/different numbers of options \(3 and 4\)/);
  });

  it("N/A in the export and in the results table", async () => {
    const all = [examRow("0", "001", ["AB", "A"]), ...["A", "B", "A", "B"].map((a, i) => examRow(`y${i}`, "001", [a, i % 2 ? "A" : "B"]))];
    const res = computeComprehensiveItemAnalysis(all, [map("001", 1, 1, "AB", "A"), map("001", 2, 2, "AB", "A")], 2);
    exportComprehensiveAnalysisToExcel(res, "report.xlsx");
    const sheets = readWorkbookSheets(await blobToBytes(vi.mocked(saveAs).mock.calls[0][0] as Blob));
    expect(sheets["Item Statistics"][1][4]).toBe("N/A");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ComprehensiveResults, { results: res, onDownload: () => {} })));
    const cells = [...container.querySelectorAll("td")].map((td) => td.textContent?.trim());
    expect(cells).toContain("N/A");
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("011: N/A in the results table sorts last both ways, without a percent sign", () => {
  it("renders N/A only for the item without distractors, and keeps it last when sorting by DE", async () => {
    // Q1: every option accepted (DE N/A). Q2: B is a functional distractor (DE 100)
    const all = [examRow("0", "001", ["AB", "A"]), ...["A", "B", "A", "B"].map((a, i) => examRow(`y${i}`, "001", [a, i % 2 ? "A" : "B"]))];
    const res = computeComprehensiveItemAnalysis(all, [map("001", 1, 1, "AB", "A"), map("001", 2, 2, "AB", "A")], 2);
    expect(res.itemStatistics.map((s) => s.DE)).toEqual([null, 100]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ComprehensiveResults, { results: res, onDownload: () => {} })));
    const itemTable = () => [...container.querySelectorAll("table")].find((t) => t.textContent?.includes("DE (%)"))!;
    const rowCells = () =>
      [...itemTable().querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim()));
    const deColumn = () => {
      const headers = [...itemTable().querySelectorAll("th")].map((th) => th.textContent ?? "");
      return headers.findIndex((h) => h.includes("DE (%)"));
    };
    const deCells = () => rowCells().map((cells) => [cells[0], cells[deColumn()]]);

    expect(deCells()).toEqual([
      ["Q1", "N/A"],
      ["Q2", "100.0%"],
    ]);
    const sortByDE = async () => {
      const th = [...itemTable().querySelectorAll("th")].find((h) => h.textContent?.includes("DE (%)"))!;
      await act(async () => th.click());
    };
    await sortByDE(); // ascending
    expect(deCells().map((c) => c[0])).toEqual(["Q2", "Q1"]);
    await sortByDE(); // descending
    expect(deCells().map((c) => c[0])).toEqual(["Q2", "Q1"]);
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("011 D4: compound student marks", () => {
  it("the comprehensive analysis rejects a mark like AB; grading is unchanged", async () => {
    const csv = "ID,Code,1,2,3\n0,001,A,A,A\ns1,001,AB,A,A\ns2,001,A,A,B\ns3,001,B,B,A\ns4,001,B,B,B\n";
    const { rawData, detection } = await readExamDataFileWithDetection(makeFile(csv, "c.csv"));
    const rows = applyColumnMapping(rawData, detection);
    expect(rows.find((r) => r.ID === "s1")!["1"]).toBe("AB"); // Step 1 keeps it
    const qCols = getAllQuestionCols(rows).slice(0, 3);
    // Grading counts the first letter, as before
    expect(computeResults(rows, qCols, buildCorrectAnswersMap(rows, qCols)).map((g) => g.Tot)).toEqual([15, 10, 5, 0]);
    const maps = [1, 2, 3].map((q) => map("001", q, q, "ABCDE", "A"));
    expect(() => computeComprehensiveItemAnalysis(rows, maps, 3)).toThrow(
      /student "s1" has "AB" for question 1\. The comprehensive analysis needs one response per question/
    );
  });
});

/* ------------------------------------------------------------------ */
/* P8                                                                  */
/* ------------------------------------------------------------------ */

describe("P8: one question is not enough for the comprehensive analysis", () => {
  it("rejects one-question exams with mixed or equal scores", () => {
    const mixed = [examRow("0", "001", ["A"]), examRow("a", "001", ["A"]), examRow("b", "001", ["B"])];
    const equal = [examRow("0", "001", ["A"]), examRow("a", "001", ["A"]), examRow("b", "001", ["A"])];
    for (const exam of [mixed, equal]) {
      expect(() => computeComprehensiveItemAnalysis(exam, [map("001", 1, 1, "ABCDE", "A")], 1)).toThrow(/at least 2 questions/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* P9                                                                  */
/* ------------------------------------------------------------------ */

describe("P9: option r_pb against the item's rest score", () => {
  // Two versions; version 002 shows masters [2, 3, 1] and master Q1 with options "BCADE".
  // Master Q1 accepts {A, D} (two answers); students' master choices are listed per master.
  const order002 = [2, 3, 1];
  const perms: Record<number, string> = { 1: "BCADE", 2: "ABCDE", 3: "ABCDE" };
  const key: Record<number, Letter[]> = { 1: ["A", "D"], 2: ["B"], 3: ["C"] };
  const choices: { id: string; code: "001" | "002"; m: (Letter | "")[] }[] = [
    { id: "s1", code: "001", m: ["A", "B", "C"] },
    { id: "s2", code: "001", m: ["D", "B", "E"] },
    { id: "s3", code: "001", m: ["B", "", "C"] },
    { id: "s4", code: "001", m: ["", "E", "E"] },
    { id: "t1", code: "002", m: ["A", "B", "C"] },
    { id: "t2", code: "002", m: ["C", "B", "C"] },
    { id: "t3", code: "002", m: ["D", "A", "E"] },
    { id: "t4", code: "002", m: ["E", "E", "E"] },
  ];
  const versionCell = (code: string, master: number, letters: Letter[]) =>
    letters.map((l) => (code === "001" ? l : toVersionLetter(perms[master], l))).sort().join("");
  const rowFor = (id: string, code: string, m: (Letter | "")[]) => {
    const order = code === "001" ? [1, 2, 3] : order002;
    return examRow(id, code, order.map((master) => {
      const c = m[master - 1];
      return c === "" ? "" : versionCell(code, master, [c]);
    }));
  };
  const exam: ExamRow[] = [
    examRow("0", "001", [1, 2, 3].map((master) => versionCell("001", master, key[master]))),
    examRow("0", "002", order002.map((master) => versionCell("002", master, key[master]))),
    ...choices.map((c) => rowFor(c.id, c.code, c.m)),
  ];
  const maps: ItemAnalysisRow[] = [
    ...[1, 2, 3].map((m) => map("001", m, m, "ABCDE", key[m][0])),
    ...order002.map((master, p) => map("002", p + 1, master, perms[master], toVersionLetter(perms[master], key[master][0]))),
  ];
  const r = computeComprehensiveItemAnalysis(exam, maps, 3);

  it("matches an independent Pearson for every option, including Blank/Other and a two-answer item", () => {
    const correct = choices.map((c) => c.m.map((x, i) => (x !== "" && key[i + 1].includes(x) ? 1 : 0)));
    const totals = correct.map((row) => row.reduce((a: number, b) => a + b, 0));
    for (const master of [1, 2, 3]) {
      const rest = correct.map((row, i) => totals[i] - row[master - 1]);
      for (const o of r.optionStatistics.filter((x) => x.questionNumber === master)) {
        const sel = choices.map((c) => {
          const x = c.m[master - 1];
          return (o.option === "Blank/Other" ? x === "" : x === o.option) ? 1 : 0;
        });
        expect(o.r_pb, `Q${master} ${o.option}`).toBeCloseTo(pearson(sel, rest), 10);
      }
    }
  });

  it("is 0 for an option nobody (or everybody) chooses", () => {
    const q1 = r.optionStatistics.filter((o) => o.questionNumber === 1);
    expect(q1.find((o) => o.option === "Blank/Other")!.count).toBe(1);
    const allSame = [examRow("0", "001", ["A", "A"]), ...["a", "b", "c"].map((id, i) => examRow(id, "001", ["A", i ? "A" : "B"]))];
    const res = computeComprehensiveItemAnalysis(allSame, [map("001", 1, 1, "AB", "A"), map("001", 2, 2, "AB", "A")], 2);
    expect(res.optionStatistics.filter((o) => o.questionNumber === 1).map((o) => o.r_pb)).toEqual([0, 0, 0]);
  });
});

/* ------------------------------------------------------------------ */
/* P10                                                                 */
/* ------------------------------------------------------------------ */

describe("P10: quartile groups keep tied totals together", () => {
  const results = (tots: number[]): StudentResult[] => tots.map((Tot, i) => ({ ID: `s${i}`, Code: "001", Tot, Per: Tot }));
  const sizes = (tots: number[]) => {
    const ranked = classifyStudentsByQuartile(results(tots));
    return ["T1", "T2", "T3", "T4"].map((t) => ranked.filter((s) => s.Rank === t).length);
  };

  it("a tie spanning a cutoff moves up as a block (groups can be empty)", () => {
    expect(sizes([20, 15, 15, 15, 15, 10, 5, 0])).toEqual([5, 0, 1, 2]);
  });
  it("all equal: everyone in T1; no ties: equal quarters", () => {
    expect(sizes([7, 7, 7, 7, 7, 7, 7, 7])).toEqual([8, 0, 0, 0]);
    expect(sizes([8, 7, 6, 5, 4, 3, 2, 1])).toEqual([2, 2, 2, 2]);
  });
  it("small and empty inputs", () => {
    expect(sizes([5])).toEqual([1, 0, 0, 0]);
    // N = 2: nominal ends 1, 1, 2, so T2 is empty and the second student is T3 (as before 1.9.1)
    expect(sizes([5, 0])).toEqual([1, 0, 1, 0]);
    expect(sizes([5, 3, 0])).toEqual([1, 1, 1, 0]);
    expect(classifyStudentsByQuartile([])).toEqual([]);
  });
  it("reordering equal-score rows does not change their groups", () => {
    const label = (tots: number[]) =>
      Object.fromEntries(classifyStudentsByQuartile(results(tots)).map((s) => [`${s.Tot}`, s.Rank]));
    expect(label([10, 10, 5, 5, 0, 0, 10, 5])).toEqual(label([5, 10, 0, 5, 10, 0, 5, 10]));
  });
});

/* ------------------------------------------------------------------ */
/* P12                                                                 */
/* ------------------------------------------------------------------ */

describe("P12: version codes", () => {
  it("only all-digit codes become numbers; too long ones are refused, never merged", () => {
    expect(["001", " 7 ", "1A", "0x1", "1e2", "A"].map(normalizeVersionCode)).toEqual([1, 7, "1A", "0x1", "1e2", "A"]);
    expect(() => normalizeVersionCode("9007199254740993")).toThrow(/too long/);
    expect(versionCodeKey("001")).toBe("1");
    expect(versionCodeKey("0")).toBe("0");
  });

  it("the CSV reader no longer converts codes before Step 3 sees them", async () => {
    const d = await readCSVFileWithDetection(makeFile("Version,Version Q#,Master Q#\n0x1,1,1\n1e2,1,1\n001,1,1\n", "m.csv"));
    expect(normalizeItemAnalysis(d.data, "NEW").map((r) => r.code)).toEqual(["0x1", "1e2", 1]);
  });

  it("sorting is deterministic, whatever the arrival order", () => {
    expect(sortVersionCodes(["1B", "1A"])).toEqual(sortVersionCodes(["1A", "1B"]));
    expect(sortVersionCodes(["002", "A", "1", "B2", "B10"])).toEqual(["1", "002", "A", "B2", "B10"]);
  });

  it.each([
    ["exact, in any order", ["001", "002"], ["002", "001"], "exact"],
    ["exact names", ["1A", "1B"], ["1B", "1A"], "exact"],
    ["whitespace is trimmed", ["001"], [" 001 "], "exact"],
    ["by number", ["001", "002"], ["1", "2"], "numeric"],
    ["0x1 is not a number", ["0x1", "2"], ["1", "2"], "manual"],
    ["1e2 is not a number", ["100"], ["1e2"], "manual"],
    ["ambiguous aliases", ["01", "1"], ["1", "2"], "manual"],
    ["a missing version", ["001", "002"], ["1"], "manual"],
    ["mixed names", ["001", "A"], ["1", "A"], "manual"],
  ])("binding: %s", (_, students, items, kind) => {
    expect(bindVersionCodes(students, items).kind).toBe(kind);
  });

  it("numeric binding is by identity, so swapped versions cannot hide behind identical keys", async () => {
    // 001 shows masters [1, 2]; 002 shows [2, 1]; every key is A, so validation alone cannot catch a swap
    const csv = ["Version,Version Q#,Master Q#,Permutation,Correct", "2,1,2,ABCDE,A", "2,2,1,ABCDE,A", "1,1,1,ABCDE,A", "1,2,2,ABCDE,A"].join("\n");
    const d = await readCSVFileWithDetection(makeFile(csv, "map.csv"));
    const parsed = normalizeItemAnalysis(d.data, "NEW");
    const binding = bindVersionCodes(["002", "001"], parsed.map((p) => String(p.code)));
    expect(binding.kind).toBe("numeric");
    const bound = applyCodeBinding(parsed, (binding as { itemToStudent: Map<string, string> }).itemToStudent);
    expect(bound.map((b) => `${b.code}:${b.order}->${b.order_in_master}`)).toEqual(["002:1->2", "002:2->1", "001:1->1", "001:2->2"]);
  });

  it("011 D3: two spellings of one version number are rejected before rows can merge", async () => {
    const merged = "Version,Version Q#,Master Q#,Permutation,Correct\n01,1,1,ABCDE,A\n1,2,2,ABCDE,A\n";
    const d = await readCSVFileWithDetection(makeFile(merged, "m.csv"));
    expect(() => normalizeItemAnalysis(d.data, "NEW")).toThrow(/uses both "01" and "1" as version codes/);
    const old = await readCSVFileWithDetection(makeFile("code,order,order in master\n01,1,1\n1,2,2\n", "o.csv"));
    expect(old.format).toBe("OLD");
    expect(() => normalizeItemAnalysis(old.data, "OLD")).toThrow(/"01" and "1"/);
    expect(() =>
      parseCSVWithMapping(
        [
          { F: "01", I: "1", S: "1" },
          { F: "1", I: "2", S: "2" },
        ],
        { code: "F", order: "I", orderInMaster: "S" }
      )
    ).toThrow(/"01" and "1"/);
    expect(() => findVersionPairs(["01_Q", "01_Opt", "1_Q", "1_Opt"])).toThrow(/Options Matrix uses both "01" and "1"/);
    // Repeated rows of one spelling are fine, and 001/002 still bind to 1/2 by number
    const one = normalizeItemAnalysis(
      [
        { Version: "01", "Version Q#": "1", "Master Q#": "1" },
        { Version: "01", "Version Q#": "2", "Master Q#": "2" },
      ],
      "NEW"
    );
    expect(one.map((r) => r.code)).toEqual([1, 1]);
    expect(bindVersionCodes(["001", "002"], ["1", "2"]).kind).toBe("numeric");
  });

  it("manual binding suggests by deterministic position and maps through a Map (any name is safe)", () => {
    const b = bindVersionCodes(["A", "__proto__"], ["X", "Y"]);
    expect(b.kind).toBe("manual");
    if (b.kind !== "manual") return;
    expect([...b.suggestion]).toEqual([
      ["__proto__", "X"],
      ["A", "Y"],
    ]);
    const rows = applyCodeBinding([map("Y", 1, 1, "AB", "A")], new Map([["Y", "__proto__"]]));
    expect(rows[0].code).toBe("__proto__");
  });
});
