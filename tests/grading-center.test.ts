/**
 * Template dialog core (lib/grading-center.ts): grading-center layout, Shuffler
 * input (Question Map or Options Matrix), scan errors, and the expected results,
 * all checked through the app's real Step 1 / Step 3 / Step 4 functions.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  applyColumnMapping,
  buildCorrectAnswersMap,
  computeAverageResults,
  computeComprehensiveItemAnalysis,
  computeResults,
  getAllQuestionCols,
  guessNumQuestions,
  isSolutionRow,
  normalizeItemAnalysis,
  parseWideFormat,
  readCSVFileWithDetection,
  readExamDataFileWithDetection,
  reviseSolutionRows,
  validateCorrectAnswers,
} from "@/lib/excel-utils";
import { buildDataset, DEFAULT_PARAMS, optionsMatrixTable, questionMapTable, toDelimited } from "@/lib/dummy-data";
import {
  buildGradingCenterSnapshot,
  DEFAULT_GRADING_CENTER_SETTINGS,
  GRADING_CENTER_COLUMNS,
  maskOneDigit,
  MAX_STUDENTS,
  parseCsv,
  readShufflerFile,
  validateSettings,
  type DownloadKind,
  type GradingCenterSettings,
  type GradingCenterSnapshot,
} from "@/lib/grading-center";
import type { CorrectAnswersMap, ExamRow, ItemAnalysisRow } from "@/types/exam";
import { makeFile, mapCodesByPosition } from "./helpers";

const settings = (patch: Partial<GradingCenterSettings> = {}): GradingCenterSettings => ({
  ...DEFAULT_GRADING_CENTER_SETTINGS,
  seed: 7,
  ...patch,
});
const fileOf = (snap: GradingCenterSnapshot, kind: DownloadKind) => {
  const f = snap.files.find((x) => x.kind === kind);
  if (!f) throw new Error(`no ${kind} file`);
  return f;
};
const asFile = (content: string | Uint8Array, name: string) => makeFile(content, name);
const sheetRows = (bytes: Uint8Array) => {
  const wb = XLSX.read(bytes, { type: "array" });
  expect(wb.SheetNames).toHaveLength(1);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { ws, rows: XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: "", raw: true }) };
};

/** Step 1 exactly as the UI does it. */
async function importStudentFile(snap: GradingCenterSnapshot): Promise<ExamRow[]> {
  const f = fileOf(snap, "student-data");
  const { rawData, detection } = await readExamDataFileWithDetection(asFile(f.content, f.name));
  expect(detection.valid, detection.errors.join("; ")).toBe(true);
  return applyColumnMapping(rawData, detection);
}

/** Step 3 detection + parsing (no code mapping applied). */
async function importItemFile(content: string | Uint8Array, name: string): Promise<ItemAnalysisRow[]> {
  const d = await readCSVFileWithDetection(asFile(content, name));
  if (d.format === "WIDE") return parseWideFormat(d.data, d.columns);
  if (d.format === "UNKNOWN") throw new Error(`${name}: format not detected`);
  return normalizeItemAnalysis(d.data, d.format);
}

const gradesByKey = (rows: ExamRow[], K: number) => {
  const qCols = getAllQuestionCols(rows).slice(0, K);
  return new Map(computeResults(rows, qCols, buildCorrectAnswersMap(rows, qCols)).map((g) => [`${g.Code}|${g.ID}`, g.Tot]));
};

function expectComprehensiveMatchesOracle(rows: ExamRow[], map: ItemAnalysisRow[], snap: GradingCenterSnapshot) {
  const app = computeComprehensiveItemAnalysis(rows, map, snap.questions);
  app.itemStatistics.forEach((s, i) => {
    expect(s.p_i).toBeCloseTo(snap.expected.masterQuestions[i].p, 10);
    expect(s.D_i).toBeCloseTo(snap.expected.masterQuestions[i].D, 10);
    expect(s.r_pb).toBeCloseTo(snap.expected.masterQuestions[i].rpb, 10);
  });
  expect(app.testSummary.KR20).toBeCloseTo(snap.expected.reliability.KR20, 10);
}

describe("parseCsv", () => {
  it("handles a BOM, quoted fields, doubled quotes, CRLF and blank lines", () => {
    expect(parseCsv('﻿a,b,c\r\n"x, y","say ""hi""",3\r\n\r\n4,,6\n')).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "3"],
      ["4", "", "6"],
    ]);
  });
  it("rejects an unclosed quote", () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(/unclosed quoted field/);
  });
});

describe("generated exam (no Shuffler file)", () => {
  const s = settings();
  const snap = buildGradingCenterSnapshot(s);
  const N = s.students;
  const V = s.versions;
  const K = s.questions;

  it("writes the grading-center layout as .xlsx", () => {
    const student = fileOf(snap, "student-data");
    expect(student.name).toMatch(/_grading_center\.xlsx$/);
    expect(student.mime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const bytes = student.content as Uint8Array;
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // a zip container (.xlsx), not OLE (.xls)
    const { ws, rows } = sheetRows(bytes);
    expect(rows[0]).toEqual(["form", "ID", "Section", "Code", ...Array.from({ length: GRADING_CENTER_COLUMNS }, (_, i) => String(i + 1))]);
    expect(ws["!ref"]).toBe(`A1:DY${N + V + 1}`);
    const data = rows.slice(1);
    expect(data).toHaveLength(N + V);
    expect(data.map((r) => r[0])).toEqual(Array.from({ length: N + V }, (_, i) => i + 1)); // form counts solutions too
    expect(ws["A2"].t).toBe("n");
    expect(ws["B2"].t).toBe("s");
    // Solution rows first: legacy all-zero ID, section 00, one per version
    data.slice(0, V).forEach((r, i) => {
      expect(r.slice(1, 4)).toEqual(["000000000", "00", String(i + 1).padStart(3, "0")]);
    });
    for (const r of data.slice(V)) {
      expect(String(r[1])).toMatch(/^2\d{8}$/);
      expect(String(r[2])).toMatch(/^\d\d$/);
      expect(r.slice(4 + K).every((c) => c === "")).toBe(true); // only the first K columns are filled
    }
  });

  it("imports in Step 1 with the right counts and grades", async () => {
    const rows = await importStudentFile(snap);
    expect(guessNumQuestions(rows)).toBe(K);
    expect(rows.filter((r) => !isSolutionRow(r))).toHaveLength(N);
    const grades = gradesByKey(rows, K);
    snap.expected.grades.published.forEach((g) => expect(grades.get(`${g.Code}|${g.ID}`)).toBe(g.Tot));
  });

  it("its Question Map validates after Step 3's suggested code mapping; the analysis matches the oracle", async () => {
    const rows = await importStudentFile(snap);
    const f = fileOf(snap, "question-map");
    // Step 3 parses numeric codes as numbers (001 -> 1), so it always offers the code mapping
    const parsed = await importItemFile(f.content, f.name);
    expect(new Set(parsed.map((m) => String(m.code)))).toEqual(new Set(["1", "2", "3", "4"]));
    const map = mapCodesByPosition(parsed, rows);
    expect(new Set(map.map((m) => String(m.code)))).toEqual(new Set(snap.versions));
    expect(validateCorrectAnswers(map, rows)).toBeNull();
    expectComprehensiveMatchesOracle(rows, map, snap);
  });

  it("its Options Matrix and Normal files describe the same exam", async () => {
    const rows = await importStudentFile(snap);
    const om = fileOf(snap, "options-matrix");
    const wide = mapCodesByPosition(await importItemFile(om.content, om.name), rows);
    expect(validateCorrectAnswers(wide, rows)).toBeNull();
    expectComprehensiveMatchesOracle(rows, wide, snap);
    const normal = fileOf(snap, "normal");
    expect(await importItemFile(normal.content, normal.name)).toHaveLength(K * V);
  });

  it("offers student data, three companions and expected results", () => {
    expect(snap.files.map((f) => f.kind)).toEqual(["student-data", "question-map", "options-matrix", "normal", "expected-results"]);
    expect(snap.files.every((f) => f.name.startsWith("synthetic_"))).toBe(true);
  });

  it("is deterministic for the same settings", () => {
    const again = buildGradingCenterSnapshot(settings());
    expect(sheetRows(fileOf(again, "student-data").content as Uint8Array).rows).toEqual(
      sheetRows(fileOf(snap, "student-data").content as Uint8Array).rows
    );
    expect(fileOf(again, "expected-results").content).toBe(fileOf(snap, "expected-results").content);
    expect(fileOf(buildGradingCenterSnapshot(settings({ seed: 8 })), "expected-results").content).not.toBe(
      fileOf(snap, "expected-results").content
    );
  });
});

describe("scan errors", () => {
  // Rates far above the preset so every kind occurs in a small file
  const s = settings({ students: 300, scanErrors: true, scanErrorRates: { multipleMark: 0.05, maskedId: 0.4, unreadableSection: 0.3 } });
  const snap = buildGradingCenterSnapshot(s);
  const data = sheetRows(fileOf(snap, "student-data").content as Uint8Array).rows.slice(1 + s.versions);

  it("prints X, @ in IDs and @@ sections, and reports what it did", () => {
    const cells = data.flatMap((r) => r.slice(4, 4 + s.questions));
    expect(cells.filter((c) => c === "X")).toHaveLength(snap.realized.multipleMarks);
    expect(data.filter((r) => String(r[1]).includes("@"))).toHaveLength(snap.realized.maskedIds);
    expect(data.filter((r) => r[2] === "@@")).toHaveLength(snap.realized.unreadableSections);
    expect(snap.realized.multipleMarks).toBeGreaterThan(0);
    expect(snap.realized.maskedIds).toBeGreaterThan(0);
    expect(snap.realized.unreadableSections).toBeGreaterThan(0);
    // One "@" per masked ID; (Code, ID) stays unique
    data.filter((r) => String(r[1]).includes("@")).forEach((r) => expect(String(r[1])).toMatch(/^[\d@]{9}$/));
    expect(new Set(data.map((r) => `${r[3]}|${r[1]}`)).size).toBe(data.length);
  });

  it("never touches solution rows", () => {
    const solutions = sheetRows(fileOf(snap, "student-data").content as Uint8Array).rows.slice(1, 1 + s.versions);
    solutions.forEach((r) => {
      expect(r.slice(1, 3)).toEqual(["000000000", "00"]);
      expect(r.slice(4, 4 + s.questions).every((c) => /^[A-E]+$/.test(String(c)))).toBe(true);
    });
  });

  it("the expected results grade X as blank and use the printed IDs", async () => {
    const rows = await importStudentFile(snap);
    const grades = gradesByKey(rows, s.questions);
    expect(grades.size).toBe(s.students);
    snap.expected.grades.published.forEach((g) => expect(grades.get(`${g.Code}|${g.ID}`)).toBe(g.Tot));
    const f = fileOf(snap, "question-map");
    expectComprehensiveMatchesOracle(rows, mapCodesByPosition(await importItemFile(f.content, f.name), rows), snap);
  });

  it("is off by default", () => {
    const plain = buildGradingCenterSnapshot(settings());
    expect([plain.realized.multipleMarks, plain.realized.maskedIds, plain.realized.unreadableSections]).toEqual([0, 0, 0]);
  });
});

describe("from a Shuffler file", () => {
  // A Shuffler-like exam: version codes 1..3, as the Shuffler writes them
  const ds = buildDataset({ ...DEFAULT_PARAMS, questions: 8, versions: 3, plants: false, seed: 3 });
  const qmText = toDelimited(questionMapTable(ds.exam));
  const omText = toDelimited(optionsMatrixTable(ds.exam)).replace(/,NO,/g, ",,"); // Shuffler leaves non-correct rows blank
  const bytes = (t: string) => new TextEncoder().encode(t);
  const s = settings({ students: 90 });

  it("reads the Question Map and the Options Matrix into the same exam", () => {
    const qm = readShufflerFile(qmText);
    const om = readShufflerFile(omText);
    const sortEntries = (e: typeof qm.entries) => [...e].sort((a, b) => a.code.localeCompare(b.code) || a.position - b.position);
    expect(qm.kind).toBe("question-map");
    expect(om.kind).toBe("options-matrix");
    expect([qm.questions, qm.versions]).toEqual([8, ["1", "2", "3"]]);
    expect(sortEntries(om.entries)).toEqual(sortEntries(qm.entries));
  });

  it("gives identical files from either input", () => {
    const a = buildGradingCenterSnapshot(s, { fileName: "map.csv", bytes: bytes(qmText) });
    const b = buildGradingCenterSnapshot(s, { fileName: "matrix.csv", bytes: bytes(omText) });
    expect(sheetRows(fileOf(a, "student-data").content as Uint8Array).rows).toEqual(
      sheetRows(fileOf(b, "student-data").content as Uint8Array).rows
    );
    expect(fileOf(a, "question-map").content).toBe(fileOf(b, "question-map").content);
    expect(a.expected).toEqual(b.expected);
  });

  it("uses grading-center codes, offers the original unchanged, and both validate in Step 3", async () => {
    const snap = buildGradingCenterSnapshot(s, { fileName: "map.csv", bytes: bytes(qmText) });
    expect(snap.versions).toEqual(["001", "002", "003"]);
    expect(snap.files.map((f) => f.kind)).toEqual(["student-data", "question-map", "original", "expected-results"]);
    const original = fileOf(snap, "original");
    expect(original.name).toBe("map.csv");
    expect(new TextDecoder().decode(original.content as Uint8Array)).toBe(qmText);

    const rows = await importStudentFile(snap);
    const generated = fileOf(snap, "question-map");
    const map = mapCodesByPosition(await importItemFile(generated.content, generated.name), rows);
    expect(new Set(map.map((m) => String(m.code)))).toEqual(new Set(snap.versions));
    expect(validateCorrectAnswers(map, rows)).toBeNull();
    expectComprehensiveMatchesOracle(rows, map, snap);
    // The original (codes 1..3) works through Step 3's code mapping
    const viaOriginal = mapCodesByPosition(await importItemFile(qmText, "map.csv"), rows);
    expect(validateCorrectAnswers(viaOriginal, rows)).toBeNull();
  });

  it("a planted wrong key is rejected in Step 3 until it is corrected in Step 2", async () => {
    const snap = buildGradingCenterSnapshot({ ...s, plantMiskey: true }, { fileName: "map.csv", bytes: bytes(qmText) });
    const rows = await importStudentFile(snap);
    const f = fileOf(snap, "question-map");
    const map = mapCodesByPosition(await importItemFile(f.content, f.name), rows);
    const error = validateCorrectAnswers(map, rows);
    expect(error).toMatch(/Correct answer mismatch/);
    expect(error!.split("\n")).toHaveLength(1 + 3); // one per version, all the same master question

    // Step 2: set the key from the map, then Step 3 accepts it
    const qCols = getAllQuestionCols(rows).slice(0, snap.questions);
    const correctMap: CorrectAnswersMap = {};
    for (const m of map) {
      (correctMap[String(m.code)] ??= qCols.map(() => []))[m.order - 1] = [m.correct as "A"];
    }
    expect(validateCorrectAnswers(map, reviseSolutionRows(rows, qCols, correctMap))).toBeNull();
    const json = JSON.parse(fileOf(snap, "expected-results").content as string);
    expect(json.afterCorrectingTheKey.masterQuestions).toHaveLength(snap.questions);
  });

  it("reads custom version names, 2 to 4 options and quoted fields in an Options Matrix", () => {
    // Version A: Q1 at position 2 with options shuffled A->B, B->A; Q2 at 1 with A->C, B->A, C->B; Q3 4-option identity
    const text = [
      'Q,Option,Master_Correct,A_Q,A_Opt,"B_Q",B_Opt',
      "1,A,YES,2,B,1,A",
      "1,B,,2,A,1,B",
      "2,A,,1,C,3,A",
      '2,B,"YES",1,A,3,B',
      "2,C,,1,B,3,C",
      "3,A,,3,A,2,D",
      "3,B,,3,B,2,C",
      "3,C,yes,3,C,2,B",
      "3,D,,3,D,2,A",
    ].join("\r\n");
    const exam = readShufflerFile(text);
    expect(exam.versions).toEqual(["A", "B"]);
    const e = (code: string, master: number) => exam.entries.find((x) => x.code === code && x.master === master)!;
    expect(e("A", 1)).toEqual({ code: "A", position: 2, master: 1, permutation: "BA", correct: "B" });
    expect(e("A", 2)).toEqual({ code: "A", position: 1, master: 2, permutation: "BCA", correct: "A" });
    expect(e("B", 3)).toEqual({ code: "B", position: 2, master: 3, permutation: "DCBA", correct: "B" });
    const snap = buildGradingCenterSnapshot(settings({ students: 20, plants: false }), { fileName: "m.csv", bytes: bytes(text) });
    expect(snap.versions).toEqual(["A", "B"]);
  });

  describe("rejects a file it cannot use", () => {
    const qmRows = qmText.trim().split("\n");
    const header = qmRows[0];
    const body = qmRows.slice(1);
    const qm = (lines: string[]) => [header, ...lines].join("\n");
    const cell = (line: string, i: number, v: string) => line.split(",").map((c, j) => (j === i ? v : c)).join(",");
    // Columns: Group, Master Q#, Version, Version Q#, Permutation, Correct, Points

    it("not a Shuffler file", () => {
      expect(() => readShufflerFile("ID,Code,1\n1,001,A\n")).toThrow(/not a Shuffler Question Map/);
    });
    it("a master question listed twice", () => {
      expect(() => readShufflerFile(qm([...body, body[0]]))).toThrow(/listed more than once/);
    });
    it("a missing master question", () => {
      expect(() => readShufflerFile(qm(body.filter((l) => !(l.split(",")[2] === "2" && l.split(",")[1] === "5"))))).toThrow(
        /Version 2 has no position for master Q5/
      );
    });
    it("a position used twice", () => {
      const line = body.findIndex((l) => l.split(",")[2] === "1" && l.split(",")[3] === "2");
      expect(() => readShufflerFile(qm(body.map((l, i) => (i === line ? cell(l, 3, "1") : l))))).toThrow(/position 1 is used twice/);
    });
    it("a bad permutation or correct letter", () => {
      expect(() => readShufflerFile(qm([cell(body[0], 4, "AACDE"), ...body.slice(1)]))).toThrow(/not a shuffle/);
      expect(() => readShufflerFile(qm([cell(cell(body[0], 4, "BCA"), 5, "E"), ...body.slice(1)]))).toThrow(/not one of its 3 options/);
    });
    it("versions that disagree on a key", () => {
      const l = body[0].split(",");
      const other = l[5] === "A" ? "B" : "A";
      expect(() => readShufflerFile(qm([cell(body[0], 5, other), ...body.slice(1)]))).toThrow(/disagree on its key/);
    });
    it("a reserved or colliding version code", () => {
      expect(() => readShufflerFile(qm(body.map((l) => (l.split(",")[2] === "1" ? cell(l, 2, "000") : l))))).toThrow(/reserved for solution rows/);
      expect(() => readShufflerFile(qm(body.map((l) => (l.split(",")[2] === "1" ? cell(l, 2, "02") : l))))).toThrow(/both become code 002/);
    });
    it("an Options Matrix with two correct options or inconsistent positions", () => {
      const lines = omText.trim().split("\n");
      const twoYes = lines.map((l, i) => (i === 2 ? l.replace(/^(\d+,[A-E]),,/, "$1,YES,") : l)).join("\n");
      expect(() => readShufflerFile(twoYes)).toThrow(/exactly one option must be marked/);
      const moved = lines.map((l, i) => (i === 2 ? l.split(",").map((c, j) => (j === 3 ? "99" : c)).join(",") : l)).join("\n");
      expect(() => readShufflerFile(moved)).toThrow(/different positions/);
    });
    it("more than 125 questions", () => {
      const big = buildDataset({ ...DEFAULT_PARAMS, questions: 126, versions: 1, students: 1, plants: false });
      expect(() => readShufflerFile(toDelimited(questionMapTable(big.exam)))).toThrow(/at most 125/);
    });
  });
});

describe("settings bounds", () => {
  const errors = (patch: Partial<GradingCenterSettings>) => validateSettings(settings(patch)).join(" ");
  it("accepts the defaults", () => {
    expect(validateSettings(DEFAULT_GRADING_CENTER_SETTINGS)).toEqual([]);
  });
  it("rejects out-of-range values", () => {
    expect(errors({ students: 0 })).toMatch(/Students must be/);
    expect(errors({ students: MAX_STUDENTS + 1 })).toMatch(/Students must be/);
    expect(errors({ students: 2.5 })).toMatch(/Students must be/);
    expect(errors({ questions: 1 })).toMatch(/Questions must be/);
    expect(errors({ questions: 126 })).toMatch(/Questions must be/);
    expect(errors({ versions: 0 })).toMatch(/Versions must be/);
    expect(errors({ students: 3, versions: 4 })).toMatch(/at least the number of versions/);
    expect(errors({ sections: 0 })).toMatch(/Sections must be/);
    expect(errors({ sections: 100 })).toMatch(/Sections must be/);
    expect(errors({ seed: -1 })).toMatch(/Seed must be/);
    expect(errors({ blankRate: 0.6 })).toMatch(/Blank responses/);
    expect(errors({ questions: 4, plants: true })).toMatch(/need at least 5 questions/);
    expect(errors({ scanErrors: true, scanErrorRates: { multipleMark: 2, maskedId: 0, unreadableSection: 0 } })).toMatch(/Multiple marks/);
  });
  it("throws all problems before generating", () => {
    expect(() => buildGradingCenterSnapshot(settings({ students: 0, sections: 0 }))).toThrow(/Students must be[\s\S]*Sections must be/);
  });
  it("generates the largest supported file", () => {
    const t = Date.now();
    const snap = buildGradingCenterSnapshot(settings({ students: MAX_STUDENTS, questions: GRADING_CENTER_COLUMNS, versions: 4 }));
    const { rows } = sheetRows(fileOf(snap, "student-data").content as Uint8Array);
    expect(rows).toHaveLength(1 + MAX_STUDENTS + 4);
    console.log(`largest file (${MAX_STUDENTS} students x ${GRADING_CENTER_COLUMNS} questions): ${Date.now() - t} ms`);
  });
});

/* ------------------------------------------------------------------ */
/* 007 review: codes, originals, malformed input, rates, keys, files   */
/* ------------------------------------------------------------------ */

const enc = (t: string) => new TextEncoder().encode(t);

/** A small valid Question Map: K = 3, the given version codes, the second version rotated. */
function smallQuestionMap(codes: string[]): string {
  const lines = ["Group,Master Q#,Version,Version Q#,Permutation,Correct,Points"];
  codes.forEach((code, v) => {
    const order = v % 2 === 0 ? [1, 2, 3] : [2, 3, 1]; // order[p-1] = master at position p
    order.forEach((master, p) => lines.push(`1,${master},${code},${p + 1},ABCDE,${"ABC"[master - 1]},1`));
  });
  return lines.join("\n") + "\n";
}

/** Step 1 + Step 3 (with the suggested code mapping) + Step 4 on a snapshot's own files. */
async function completeFlow(snap: GradingCenterSnapshot) {
  const rows = await importStudentFile(snap);
  const f = fileOf(snap, "question-map");
  const map = mapCodesByPosition(await importItemFile(f.content, f.name), rows);
  expect(new Set(map.map((m) => String(m.code)))).toEqual(new Set(snap.versions));
  expect(validateCorrectAnswers(map, rows)).toBeNull();
  expectComprehensiveMatchesOracle(rows, map, snap);
  return { rows, map };
}

describe("version codes and Step 3", () => {
  const small = settings({ students: 30, plants: false });

  it("rejects codes that Step 3 would read as the same number", () => {
    expect(() => readShufflerFile(smallQuestionMap(["1A", "1B"]))).toThrow(/"1A" and "1B" would both be read as 1 in Step 3/);
    expect(() => readShufflerFile(smallQuestionMap(["1", "1A"]))).toThrow(/would both be read as 1 in Step 3/);
    expect(() => readShufflerFile(smallQuestionMap(["01", "1"]))).toThrow(/both become code 001/);
  });

  it("numeric, mixed and alphabetic codes complete the whole flow", async () => {
    for (const codes of [["1", "2"], ["1", "A"], ["A", "B"]]) {
      const snap = buildGradingCenterSnapshot(small, { fileName: "map.csv", bytes: enc(smallQuestionMap(codes)) });
      await completeFlow(snap);
    }
  });

  it("records the true source codes next to the generated ones", () => {
    const snap = buildGradingCenterSnapshot(small, { fileName: "map.csv", bytes: enc(smallQuestionMap(["01", "2"])) });
    expect(snap.versions).toEqual(["001", "002"]);
    expect(snap.sourceVersions).toEqual(["01", "2"]);
    const json = JSON.parse(fileOf(snap, "expected-results").content as string);
    expect(json.versionCodes).toEqual([
      { source: "01", file: "001" },
      { source: "2", file: "002" },
    ]);
    expect(buildGradingCenterSnapshot(small).sourceVersions).toBeNull();
  });
});

describe("the uploaded original in Step 3", () => {
  const exam = buildDataset({ ...DEFAULT_PARAMS, questions: 6, versions: 2, plants: false, seed: 9 });
  const flagged = toDelimited(optionsMatrixTable(exam.exam)); // YES/NO on every row: Step 3 reads it
  const small = settings({ students: 30, plants: false });
  const original = (text: string, name: string) => {
    const snap = buildGradingCenterSnapshot(small, { fileName: name, bytes: enc(text) });
    return { snap, file: fileOf(snap, "original") };
  };
  const step3Format = async (text: string, name: string) => (await readCSVFileWithDetection(asFile(text, name))).format;

  it("says when it works, and it does", async () => {
    const { snap, file } = original(flagged, "matrix.csv");
    expect(file.description).toMatch(/It also works in Step 3/);
    expect(await step3Format(flagged, "matrix.csv")).toBe("WIDE");
    const rows = await importStudentFile(snap);
    const map = mapCodesByPosition(await importItemFile(flagged, "matrix.csv"), rows);
    expect(validateCorrectAnswers(map, rows)).toBeNull();
  });

  it("says when Step 3 cannot read it (custom version names, P5), and the generated map still works", async () => {
    const renamed = flagged.replace(/version_1_/g, "A_").replace(/version_2_/g, "B_");
    const { snap, file } = original(renamed, "named.csv");
    expect(file.description).toMatch(/cannot read this file as it is: its version columns are not named version_1/);
    expect(await step3Format(renamed, "named.csv")).not.toBe("WIDE");
    await completeFlow(snap);
  });

  it("says when Step 3 cannot read it (an empty cell in the first row, P3)", async () => {
    const lines = flagged.trim().split("\n");
    const blankFirst = [lines[0], lines[1].replace(/,(YES|NO),/, ",,"), ...lines.slice(2)].join("\n") + "\n";
    const { snap, file } = original(blankFirst, "blank.csv");
    expect(file.description).toMatch(/first data row has an empty cell/);
    expect(await step3Format(blankFirst, "blank.csv")).not.toBe("WIDE");
    await completeFlow(snap);
  });

  it("mentions the planted wrong key", () => {
    const snap = buildGradingCenterSnapshot({ ...small, plantMiskey: true }, { fileName: "map.csv", bytes: enc(smallQuestionMap(["1", "2"])) });
    expect(fileOf(snap, "original").description).toMatch(/rejects it until you correct the planted wrong key/);
    expect(fileOf(snap, "question-map").description).toMatch(/rejects it until you correct the planted wrong key/);
  });
});

describe("malformed files are rejected, not repaired", () => {
  const header = "Q,Option,Master_Correct,A_Q,A_Opt";
  const good = [header, "1,A,YES,1,A", "1,B,,1,B", "2,A,,2,B", "2,B,YES,2,A"];

  it("accepts the well-formed control", () => {
    expect(readShufflerFile(good.join("\n")).versions).toEqual(["A"]);
  });
  it("an _Opt column without its _Q column, and the reverse", () => {
    const orphanOpt = good.map((l, i) => (i === 0 ? `${l},B_Opt` : `${l},A`)).join("\n");
    expect(() => readShufflerFile(orphanOpt)).toThrow(/has "B_Opt" but no "B_Q" column/);
    const orphanQ = good.map((l, i) => (i === 0 ? `${l},B_Q` : `${l},1`)).join("\n");
    expect(() => readShufflerFile(orphanQ)).toThrow(/has "B_Q" but no "B_Opt" column/);
  });
  it("a repeated column name", () => {
    expect(() => readShufflerFile(good.map((l, i) => (i === 0 ? `${l},a_opt` : `${l},A`)).join("\n"))).toThrow(/repeats a column name/);
  });
  it("option labels that are not single, distinct letters", () => {
    const labels = (a: string, b: string) => [header, `1,${a},YES,1,A`, `1,${b},,1,B`, ...good.slice(3)].join("\n");
    expect(() => readShufflerFile(labels("AB", ""))).toThrow(/each option row needs one letter/);
    expect(() => readShufflerFile(labels("A", "A"))).toThrow(/each option row needs one letter/);
    expect(() => readShufflerFile(labels("A", ""))).toThrow(/found A, \(blank\)/);
  });
  it("malformed CSV quoting", () => {
    expect(() => parseCsv('a,b\n"x"y,z\n')).toThrow(/CSV line 2: text after a closing quote/);
    expect(() => parseCsv('a,b\nx"y",z\n')).toThrow(/CSV line 2: a quote inside an unquoted field/);
    expect(parseCsv('a,b\n"x\ny",z\n')).toEqual([["a", "b"], ["x\ny", "z"]]);
    expect(parseCsv('a,"b ""c"""\n')).toEqual([["a", 'b "c"']]);
  });
});

describe("scan-error rates", () => {
  it('"X" applies to answered responses only, so it never exceeds them', async () => {
    const s = settings({
      students: 60,
      plants: false,
      blankRate: 0.5,
      scanErrors: true,
      scanErrorRates: { multipleMark: 1, maskedId: 0, unreadableSection: 0 },
    });
    expect(validateSettings(s)).toEqual([]);
    const snap = buildGradingCenterSnapshot(s);
    const cells = sheetRows(fileOf(snap, "student-data").content as Uint8Array).rows
      .slice(1 + s.versions)
      .flatMap((r) => r.slice(4, 4 + s.questions));
    expect(cells.every((c) => c === "X" || c === "")).toBe(true);
    expect(snap.realized.multipleMarks + snap.realized.blanks).toBe(s.students * s.questions);
    expect(cells.filter((c) => c === "X")).toHaveLength(snap.realized.multipleMarks);
    expect(snap.expected.grades.published.every((g) => g.Tot === 0)).toBe(true);
  });
});

describe("maskOneDigit", () => {
  it("takes the first free position from the start, wrapping around, or gives up", () => {
    expect(maskOneDigit("123", 1, () => false)).toBe("1@3");
    expect(maskOneDigit("123", 1, (x) => x === "1@3")).toBe("12@");
    expect(maskOneDigit("123", 2, (x) => x === "12@")).toBe("@23");
    expect(maskOneDigit("123", 0, () => true)).toBeNull();
  });
});

describe("after correcting a planted wrong key (with scan errors)", () => {
  it("grades and item statistics match the corrected-key expected results", async () => {
    const s = settings({
      students: 150,
      plantMiskey: true,
      scanErrors: true,
      scanErrorRates: { multipleMark: 0.02, maskedId: 0.2, unreadableSection: 0.2 },
    });
    const exam = buildDataset({ ...DEFAULT_PARAMS, questions: 8, versions: 3, plants: false, seed: 3 });
    const snap = buildGradingCenterSnapshot(s, { fileName: "map.csv", bytes: enc(toDelimited(questionMapTable(exam.exam))) });
    const rows = await importStudentFile(snap);
    const f = fileOf(snap, "question-map");
    const map = mapCodesByPosition(await importItemFile(f.content, f.name), rows);
    expect(validateCorrectAnswers(map, rows)).toMatch(/Correct answer mismatch/);

    // Step 2: correct the key from the map
    const qCols = getAllQuestionCols(rows).slice(0, snap.questions);
    const correctMap: CorrectAnswersMap = {};
    for (const m of map) (correctMap[String(m.code)] ??= qCols.map(() => []))[m.order - 1] = [m.correct as "A"];
    const revised = reviseSolutionRows(rows, qCols, correctMap);
    expect(validateCorrectAnswers(map, revised)).toBeNull();

    const json = JSON.parse(fileOf(snap, "expected-results").content as string);
    const grades = gradesByKey(revised, snap.questions);
    snap.expected.grades.corrected.forEach((g) => expect(grades.get(`${g.Code}|${g.ID}`)).toBe(g.Tot));
    const app = computeComprehensiveItemAnalysis(revised, map, snap.questions);
    app.itemStatistics.forEach((st, i) => {
      const ref = json.afterCorrectingTheKey.masterQuestions[i];
      expect(st.p_i).toBeCloseTo(ref.p, 10);
      expect(st.D_i).toBeCloseTo(ref.D, 10);
      expect(st.r_pb).toBeCloseTo(ref.rpb, 10);
    });
    expect(app.testSummary.KR20).toBeCloseTo(json.afterCorrectingTheKey.reliability.KR20, 10);
  });
});

describe("the Normal companion", () => {
  it("has the Question Map's mapping and gives the oracle's cross-version averages", async () => {
    const snap = buildGradingCenterSnapshot(settings({ students: 120 }));
    const rows = await importStudentFile(snap);
    const normal = fileOf(snap, "normal");
    const qm = fileOf(snap, "question-map");
    const normalMap = mapCodesByPosition(await importItemFile(normal.content, normal.name), rows);
    const qmMap = mapCodesByPosition(await importItemFile(qm.content, qm.name), rows);
    const triples = (m: ItemAnalysisRow[]) => m.map((r) => `${r.code}|${r.order}|${r.order_in_master}`).sort();
    expect(triples(normalMap)).toEqual(triples(qmMap));
    expect(computeAverageResults(rows, normalMap, snap.questions).map((r) => r.Average_score)).toEqual(
      snap.expected.masterQuestions.map((m) => m.percentExcludingBlanks)
    );
  });
});

const LATEST = path.resolve(import.meta.dirname, "../sample_files/shuffler_latest");
describe.skipIf(!existsSync(LATEST))("real Shuffler v1.9.0 export (local only)", () => {
  const read = (name: string) => new Uint8Array(readFileSync(path.join(LATEST, name)));
  const s = settings({ students: 200 });

  it("its Question Map and Options Matrix give identical files, and both work in Step 3", async () => {
    const a = buildGradingCenterSnapshot(s, { fileName: "MATH201_Final_Exam_mapping.csv", bytes: read("MATH201_Final_Exam_mapping.csv") });
    const b = buildGradingCenterSnapshot(s, { fileName: "MATH201_Final_Exam_options_mapping.csv", bytes: read("MATH201_Final_Exam_options_mapping.csv") });
    expect(sheetRows(fileOf(a, "student-data").content as Uint8Array).rows).toEqual(
      sheetRows(fileOf(b, "student-data").content as Uint8Array).rows
    );
    expect(a.expected).toEqual(b.expected);

    const rows = await importStudentFile(a);
    const generated = fileOf(a, "question-map");
    const map = mapCodesByPosition(await importItemFile(generated.content, generated.name), rows);
    expect(validateCorrectAnswers(map, rows)).toBeNull();
    expectComprehensiveMatchesOracle(rows, map, a);
    for (const name of ["MATH201_Final_Exam_mapping.csv", "MATH201_Final_Exam_options_mapping.csv"]) {
      const original = mapCodesByPosition(await importItemFile(read(name), name), rows);
      expect(validateCorrectAnswers(original, rows), name).toBeNull();
    }
  });
});
