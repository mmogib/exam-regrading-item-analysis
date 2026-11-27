import { describe, it, expect } from "vitest";
import {
  applyColumnMapping,
  buildCorrectAnswersMap,
  computeResults,
  detectColumns,
  getAllQuestionCols,
  getSolutionCodes,
  guessNumQuestions,
  isSolutionRow,
  parseSolutionCell,
  reviseSolutionRows,
  validateCodesHaveSolutions,
} from "@/lib/excel-utils";
import { examRow } from "./helpers";

describe("isSolutionRow", () => {
  it("recognises all-zero codes (new format)", () => {
    expect(isSolutionRow(examRow("201900001", "0", []))).toBe(true);
    expect(isSolutionRow(examRow("201900001", "000", []))).toBe(true);
  });

  it("recognises solution IDs (old format) and empty IDs", () => {
    expect(isSolutionRow(examRow("000000000", "001", []))).toBe(true);
    expect(isSolutionRow(examRow("0", "001", []))).toBe(true);
    expect(isSolutionRow(examRow("", "001", []))).toBe(true);
  });

  it("does not flag ordinary student rows", () => {
    expect(isSolutionRow(examRow("201900001", "001", []))).toBe(false);
  });
});

describe("parseSolutionCell", () => {
  it("splits multi-answer cells, de-duplicates, and drops non A-E letters", () => {
    expect(parseSolutionCell("ABE")).toEqual(["A", "B", "E"]);
    expect(parseSolutionCell("BAB")).toEqual(["B", "A"]);
    expect(parseSolutionCell("AXZ")).toEqual(["A"]);
    expect(parseSolutionCell("")).toEqual([]);
  });
});

describe("detectColumns", () => {
  it("fuzzy-matches ID, Code and question headers and drops empty question columns", () => {
    const raw = [
      { "Student ID": "1", "Exam Version": "001", Q1: "A", Q2: "B", "Question 3": "C", Notes: "x", "4": "" },
      { "Student ID": "2", "Exam Version": "001", Q1: "B", Q2: "B", "Question 3": "", Notes: "", "4": "" },
    ];
    const detection = detectColumns(raw);
    expect(detection.valid).toBe(true);
    expect(detection.idColumn).toBe("Student ID");
    expect(detection.codeColumn).toBe("Exam Version");
    expect(detection.questionColumns).toEqual([
      { name: "Q1", number: 1 },
      { name: "Q2", number: 2 },
      { name: "Question 3", number: 3 },
    ]);
  });

  it("rejects non-sequential question numbers", () => {
    const detection = detectColumns([{ ID: "1", Code: "001", Q1: "A", Q3: "B" }]);
    expect(detection.valid).toBe(false);
    expect(detection.errors.join(" ")).toMatch(/not sequential/);
  });

  it("reports a missing ID column", () => {
    const detection = detectColumns([{ Name: "x", Code: "001", Q1: "A" }]);
    expect(detection.valid).toBe(false);
    expect(detection.errors.join(" ")).toMatch(/Could not detect ID column/);
  });
});

describe("applyColumnMapping", () => {
  it("normalises keys, pads numeric IDs to 9 digits and blanks invalid answers", () => {
    const raw = [
      { "Student ID": "123", Version: "001", Q1: "a", Q2: "BC", Q3: "x" },
      { "Student ID": "S-12", Version: "002", Q1: "E", Q2: "", Q3: "D" },
    ];
    const rows = applyColumnMapping(raw, detectColumns(raw));
    expect(rows).toEqual([
      { ID: "000000123", Code: "001", "1": "A", "2": "BC", "3": "" },
      { ID: "S-12", Code: "002", "1": "E", "2": "", "3": "D" },
    ]);
  });
});

describe("code and question helpers", () => {
  it("sorts solution codes numerically first, then alphabetically", () => {
    const data = ["10", "2", "B", "1", "A"].map((code) => examRow("0", code, ["A"]));
    expect(getSolutionCodes(data)).toEqual(["1", "2", "10", "A", "B"]);
  });

  it("lists student codes that have no solution row", () => {
    const data = [
      examRow("0", "001", ["A"]),
      examRow("0", "002", ["A"]),
      examRow("201900001", "001", ["A"]),
      examRow("201900002", "003", ["A"]),
    ];
    expect(validateCodesHaveSolutions(data)).toEqual(["003"]);
  });

  it("sorts question columns numerically", () => {
    expect(getAllQuestionCols([{ ID: "1", Code: "1", "10": "A", "2": "B", "1": "C" }])).toEqual([
      "1",
      "2",
      "10",
    ]);
  });

  it("guesses the question count from answered solution columns", () => {
    const data = [
      examRow("0", "001", ["A", "B", "C", "", ""]),
      examRow("201900001", "001", ["A", "B", "C", "D", "E"]),
    ];
    expect(guessNumQuestions(data)).toBe(3);
  });
});

describe("scoring (hand-checked)", () => {
  // Version 001 key: Q1=A, Q2=B or C (two accepted answers), Q3=D
  // Version 002 key: Q1=B, Q2=A, Q3=C
  const data = [
    examRow("0", "001", ["A", "BC", "D"]),
    examRow("0", "002", ["B", "A", "C"]),
    examRow("201900001", "001", ["A", "B", "D"]), // 3/3
    examRow("201900002", "001", ["A", "C", "E"]), // 2/3 (C accepted on Q2)
    examRow("201900003", "002", ["B", "B", "C"]), // 2/3
    examRow("201900004", "001", ["", "", ""]), // 0/3
    examRow("201900005", "003", ["A", "B", "D"]), // no key for 003 -> 0
  ];
  const qCols = ["1", "2", "3"];

  it("builds the answer key map per version", () => {
    expect(buildCorrectAnswersMap(data, qCols)).toEqual({
      "001": [["A"], ["B", "C"], ["D"]],
      "002": [["B"], ["A"], ["C"]],
    });
  });

  it("scores students with the default 5 points per question", () => {
    const results = computeResults(data, qCols, buildCorrectAnswersMap(data, qCols));
    expect(results).toEqual([
      { ID: "201900001", Code: "001", Tot: 15, Per: 100 },
      { ID: "201900002", Code: "001", Tot: 10, Per: 66.67 },
      { ID: "201900003", Code: "002", Tot: 10, Per: 66.67 },
      { ID: "201900004", Code: "001", Tot: 0, Per: 0 },
      { ID: "201900005", Code: "003", Tot: 0, Per: 0 },
    ]);
  });

  it("honours a custom points-per-question value", () => {
    const results = computeResults(data, qCols, buildCorrectAnswersMap(data, qCols), 2);
    expect(results.map((r) => r.Tot)).toEqual([6, 4, 4, 0, 0]);
    expect(results.map((r) => r.Per)).toEqual([100, 66.67, 66.67, 0, 0]);
  });

  it("scores a multi-marked student answer by its first letter (current behaviour)", () => {
    const rows = [examRow("0", "001", ["A"]), examRow("201900001", "001", ["AB"])];
    const results = computeResults(rows, ["1"], buildCorrectAnswersMap(rows, ["1"]));
    expect(results[0].Tot).toBe(5);
  });
});

describe("reviseSolutionRows", () => {
  it("rewrites only solution rows, joining accepted answers in sorted order", () => {
    const data = [examRow("0", "001", ["A", "B"]), examRow("201900001", "001", ["A", "C"])];
    const revised = reviseSolutionRows(data, ["1", "2"], { "001": [["A"], ["C", "B"]] });
    expect(revised[0]).toEqual({ ID: "0", Code: "001", "1": "A", "2": "BC" });
    expect(revised[1]).toBe(data[1]);
  });
});
