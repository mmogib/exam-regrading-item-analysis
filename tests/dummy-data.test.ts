import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  applyColumnMapping,
  buildCorrectAnswersMap,
  computeAverageResults,
  computeCodeAverages,
  computeComprehensiveItemAnalysis,
  computeResults,
  getAllQuestionCols,
  guessNumQuestions,
  normalizeItemAnalysis,
  parseCSVWithMapping,
  parseWideFormat,
  readCSVFileWithDetection,
  readExamDataFileWithDetection,
  reviseSolutionRows,
  validateCorrectAnswers,
} from "@/lib/excel-utils";
import {
  buildBundle,
  buildDataset,
  datasetFromQuestionMap,
  DEFAULT_PARAMS,
  expectedResults,
  questionMapTable,
  toDelimited,
  UNKNOWN_HEADERS_MAPPING,
  type BundleFile,
  type DummyParams,
} from "@/lib/dummy-data";
import type { ExamRow, ItemAnalysisRow } from "@/types/exam";
import { makeFile, mapCodesByPosition } from "./helpers";

const params: DummyParams = { ...DEFAULT_PARAMS }; // 200 students, 20 questions, 4 versions, seed 42
const ds = buildDataset(params);
const bundle = buildBundle(ds);
const expected = expectedResults(ds);
const file = (name: string): BundleFile => {
  const f = bundle.find((b) => b.name === name);
  if (!f) throw new Error(`bundle has no ${name}`);
  return f;
};
const asFile = (f: BundleFile) => makeFile(f.content, f.name);

/** Step 1 exactly as the UI does it, including the manual ID/Code mapping. */
async function importStudents(f: BundleFile, manual?: { idColumn: string; codeColumn: string }): Promise<ExamRow[]> {
  const { rawData, detection } = await readExamDataFileWithDetection(asFile(f));
  if (manual) {
    expect(detection.valid).toBe(false);
    return applyColumnMapping(rawData, { ...detection, ...manual, valid: true, errors: [] });
  }
  expect(detection.valid, detection.errors.join("; ")).toBe(true);
  return applyColumnMapping(rawData, detection);
}

/** Step 3: detect, parse, and bind codes as the UI suggests. */
async function importItemAnalysis(f: BundleFile, exam: ExamRow[]) {
  const detection = await readCSVFileWithDetection(asFile(f));
  let rows: ItemAnalysisRow[];
  if (detection.format === "WIDE") rows = parseWideFormat(detection.data, detection.columns);
  else if (detection.format === "UNKNOWN") rows = parseCSVWithMapping(detection.data, { ...UNKNOWN_HEADERS_MAPPING });
  else rows = normalizeItemAnalysis(detection.data, detection.format);
  return { format: detection.format, rows: mapCodesByPosition(rows, exam) };
}

const grades = (data: ExamRow[]) => {
  const qCols = getAllQuestionCols(data).slice(0, guessNumQuestions(data));
  return computeResults(data, qCols, buildCorrectAnswersMap(data, qCols));
};
const common = (r: ItemAnalysisRow) => `${r.code}|${r.order}|${r.order_in_master}|${r.permutation ?? ""}|${r.correct ?? ""}`;

describe("generator basics", () => {
  it("is deterministic per seed and varies across seeds", () => {
    const again = buildBundle(buildDataset(params));
    const csv = (b: BundleFile[]) => b.filter((f) => typeof f.content === "string").map((f) => f.content);
    expect(csv(again)).toEqual(csv(bundle));
    expect(csv(buildBundle(buildDataset({ ...params, seed: 7 })))).not.toEqual(csv(bundle));
  });

  it("rejects impossible parameters", () => {
    expect(() => buildDataset({ ...params, students: 3 })).toThrow(/per version/);
    expect(() => buildDataset({ ...params, questions: 4 })).toThrow(/five planted/);
    expect(() => buildDataset({ ...params, questions: 1, plants: false })).toThrow(/at least 2 questions/);
  });

  it("puts students in every version and plants five distinct questions", () => {
    expect(expected.binding.map((b) => b.students)).toEqual([50, 50, 50, 50]);
    const planted = expected.planted.map((p) => p.master);
    expect(new Set(planted).size).toBe(5);
    expect(expected.planted.map((p) => p.kind).sort()).toEqual(
      ["dead-distractors", "low-discrimination", "miskey", "too-easy", "two-answers"]
    );
  });

  it("produces believable reliability for the default dataset", () => {
    expect(expected.reliability.KR20).toBeGreaterThan(0.6);
    expect(expected.reliability.KR20).toBeLessThan(0.95);
  });
});

describe("Step 1: every student-data form imports and grades as the oracle says", () => {
  const variants: [string, { idColumn: string; codeColumn: string }?][] = [
    ["student_data.xlsx"],
    ["student_data.xls"],
    ["student_data.csv"],
    ["student_data.txt"],
    ["student_data_semicolon.csv"],
    ["student_data_fuzzy-headers.xlsx"],
    ["student_data_legacy-solution-ids.csv"],
    ["student_data_empty-solution-ids.csv"],
    ["student_data_manual-mapping.xlsx", { idColumn: "Learner", codeColumn: "Paper" }],
  ];

  for (const [name, manual] of variants) {
    it(name, async () => {
      const data = await importStudents(file(name), manual);
      expect(guessNumQuestions(data)).toBe(params.questions);
      expect(grades(data)).toEqual(expected.grades.published);
    });
  }

  it("the corrected-key file grades as the corrected oracle", async () => {
    expect(grades(await importStudents(file("student_data_corrected-key.csv")))).toEqual(expected.grades.corrected);
  });
});

describe("Step 3: every item-analysis form parses to the same mapping", () => {
  it("detects each format and agrees on every common field", async () => {
    const exam = await importStudents(file("student_data.csv"));
    const parsed = {
      normal: await importItemAnalysis(file("item_analysis_normal.csv"), exam),
      old: await importItemAnalysis(file("item_analysis_old.csv"), exam),
      questionMap: await importItemAnalysis(file("item_analysis_question-map.csv"), exam),
      optionsMatrix: await importItemAnalysis(file("item_analysis_options-matrix.csv"), exam),
      unknown: await importItemAnalysis(file("item_analysis_unknown-headers.csv"), exam),
    };
    expect(Object.values(parsed).map((p) => p.format)).toEqual(["NEW", "OLD", "NEW", "WIDE", "UNKNOWN"]);

    // Full coverage: every (version, position) of every student code, nothing silently skipped
    const codes = ["001", "002", "003", "004"];
    const coverage = (rows: ItemAnalysisRow[]) => rows.map((r) => `${r.code}-${r.order}`).sort();
    const all = codes.flatMap((c) => Array.from({ length: params.questions }, (_, i) => `${c}-${i + 1}`)).sort();
    for (const p of Object.values(parsed)) expect(coverage(p.rows)).toEqual(all);

    const reference = parsed.questionMap.rows.map(common).sort();
    for (const key of ["old", "optionsMatrix", "unknown"] as const) {
      expect(parsed[key].rows.map(common).sort(), key).toEqual(reference);
      expect(validateCorrectAnswers(parsed[key].rows, exam), key).toBeNull();
    }
    expect(validateCorrectAnswers(parsed.questionMap.rows, exam)).toBeNull();
  });

  it("the true-key Question Map is rejected until the miskey is corrected (P4 demo)", async () => {
    const exam = await importStudents(file("student_data.csv"));
    const { rows } = await importItemAnalysis(file("item_analysis_question-map_true-key.csv"), exam);
    const miskey = expected.planted.find((p) => p.kind === "miskey")!;
    const error = validateCorrectAnswers(rows, exam);
    expect(error).toMatch(/Correct answer mismatch/);
    expect(error!.split("\n")).toHaveLength(1 + params.versions); // one mismatch per version, all the miskeyed question

    const corrected = await importStudents(file("student_data_corrected-key.csv"));
    const qCols = getAllQuestionCols(exam).slice(0, params.questions);
    const revised = reviseSolutionRows(exam, qCols, buildCorrectAnswersMap(corrected, qCols));
    expect(validateCorrectAnswers(rows, revised)).toBeNull();
    expect(grades(revised)).toEqual(expected.grades.corrected);
    expect(miskey.correctedKey).not.toEqual(miskey.publishedKey);
  });
});

describe("Step 4: analyses agree with the independent oracle", () => {
  it("cross-version averages (blanks excluded, the app convention)", async () => {
    const exam = await importStudents(file("student_data.csv"));
    const { rows } = await importItemAnalysis(file("item_analysis_question-map.csv"), exam);
    const app = computeAverageResults(exam, rows, params.questions);
    expect(app.map((r) => r.Average_score)).toEqual(expected.masterQuestions.map((m) => m.percentExcludingBlanks));
    expect(computeCodeAverages(exam, rows, params.questions).map((r) => r.Average_score)).toEqual(
      expected.versionAverages.map((v) => v.percentExcludingBlanks)
    );
  });

  // Identity question order (options still shuffled): a control for the shuffled tests below
  const identityParams: DummyParams = { ...params, students: 400, shuffleQuestions: false, seed: 11 };
  const identity = buildDataset(identityParams);
  const identityExpected = expectedResults(identity);

  const expectMatchesOracle = (
    app: ReturnType<typeof computeComprehensiveItemAnalysis>,
    oracle: ReturnType<typeof expectedResults>
  ) => {
    app.itemStatistics.forEach((s, i) => {
      expect(s.questionNumber).toBe(oracle.masterQuestions[i].master);
      expect(s.p_i).toBeCloseTo(oracle.masterQuestions[i].p, 10);
      expect(s.D_i).toBeCloseTo(oracle.masterQuestions[i].D, 10);
      expect(s.r_pb).toBeCloseTo(oracle.masterQuestions[i].rpb, 10);
    });
    expect(app.testSummary.KR20).toBeCloseTo(oracle.reliability.KR20, 10);
  };

  it("comprehensive p, D, r_pb and KR-20 match the oracle on identity question order", async () => {
    const b = buildBundle(identity);
    const exam = await importStudents(b.find((f) => f.name === "student_data.csv")!);
    const { rows } = await importItemAnalysis(b.find((f) => f.name === "item_analysis_question-map.csv")!, exam);
    expectMatchesOracle(computeComprehensiveItemAnalysis(exam, rows, identityParams.questions), identityExpected);
  });

  it("flags the planted questions (fixed seed, identity order)", async () => {
    const b = buildBundle(identity);
    const exam = await importStudents(b.find((f) => f.name === "student_data.csv")!);
    const { rows } = await importItemAnalysis(b.find((f) => f.name === "item_analysis_question-map.csv")!, exam);
    const items = computeComprehensiveItemAnalysis(exam, rows, identityParams.questions).itemStatistics;
    const item = (kind: string) => items[identityExpected.planted.find((p) => p.kind === kind)!.master - 1];

    expect(item("miskey").decision).toBe("INVESTIGATE");
    expect(item("too-easy").decision).toBe("REVISE");
    expect(item("too-easy").decisionReason).toMatch(/Too easy/);
    expect(item("dead-distractors").DE).toBeLessThanOrEqual(50);
    expect(item("dead-distractors").decision).not.toBe("KEEP");
    expect(item("low-discrimination").decision).not.toBe("KEEP");
    expect(Math.abs(item("low-discrimination").D_i)).toBeLessThan(0.2);
  });

  // P2 (fixed in 1.8.1): with shuffled question order the comprehensive item
  // statistics are per master question, not per version position.
  it("P2: comprehensive p, D, r_pb and KR-20 match the oracle when question order is shuffled", async () => {
    const exam = await importStudents(file("student_data.csv"));
    const { rows } = await importItemAnalysis(file("item_analysis_question-map.csv"), exam);
    expectMatchesOracle(computeComprehensiveItemAnalysis(exam, rows, params.questions), expected);
  });

  it("P2: with the corrected key (after Step 2), shuffled order matches the corrected-key oracle", async () => {
    const exam = await importStudents(file("student_data_corrected-key.csv"));
    const { rows } = await importItemAnalysis(file("item_analysis_question-map_true-key.csv"), exam);
    expect(validateCorrectAnswers(rows, exam)).toBeNull();
    const oracle = expectedResults(ds, "corrected");
    expect(oracle.itemStatisticsKey).toBe("corrected");
    expectMatchesOracle(computeComprehensiveItemAnalysis(exam, rows, params.questions), oracle);
  });

  it("P2: the planted miskey is flagged under shuffled order (fixed seed)", async () => {
    const exam = await importStudents(file("student_data.csv"));
    const { rows } = await importItemAnalysis(file("item_analysis_question-map.csv"), exam);
    const items = computeComprehensiveItemAnalysis(exam, rows, params.questions).itemStatistics;
    const miskey = expected.planted.find((p) => p.kind === "miskey")!;
    expect(items[miskey.master - 1].decision).toBe("INVESTIGATE");
  });
});

describe("from a Shuffler Question Map", () => {
  const mapCsv = toDelimited(questionMapTable(ds.exam));

  it("rebuilds the exam structure and key from the map", () => {
    const fromMap = datasetFromQuestionMap(mapCsv, { students: 40, seed: 5, codeStyle: "padded", blankRate: 0, plants: false });
    expect(fromMap.exam.versions.map((v) => v.order)).toEqual(ds.exam.versions.map((v) => v.order));
    expect(fromMap.exam.versions.map((v) => v.perms)).toEqual(ds.exam.versions.map((v) => v.perms));
    expect(fromMap.exam.questions.map((q) => q.publishedKey[0])).toEqual(ds.exam.questions.map((q) => q.publishedKey[0]));
  });

  it("its student data validates against the map; a planted miskey is rejected", async () => {
    const mapFile = makeFile(mapCsv, "map.csv");
    for (const plantMiskey of [false, true]) {
      const fromMap = datasetFromQuestionMap(mapCsv, { students: 40, seed: 5, codeStyle: "padded", blankRate: 0.02, plants: true, plantMiskey });
      const bundleFromMap = buildBundle(fromMap);
      expect(bundleFromMap.some((f) => f.name.startsWith("item_analysis_"))).toBe(false);
      const exam = await importStudents(bundleFromMap.find((f) => f.name === "student_data.csv")!);
      const rows = mapCodesByPosition(normalizeItemAnalysis((await readCSVFileWithDetection(mapFile)).data, "NEW"), exam);
      const result = validateCorrectAnswers(rows, exam);
      if (plantMiskey) expect(result).toMatch(/Correct answer mismatch/);
      else expect(result).toBeNull();
      expect(grades(exam)).toEqual(expectedResults(fromMap).grades.published);
    }
  });

  it("rejects incomplete or inconsistent maps", () => {
    const lines = mapCsv.trim().split("\n");
    const opts = { students: 40, seed: 5, codeStyle: "padded" as const, blankRate: 0, plants: false };
    // duplicate a row of version 1 in place of another (position missing)
    const dup = [lines[0], lines[1], lines[1], ...lines.slice(3)].join("\n");
    expect(() => datasetFromQuestionMap(dup, opts)).toThrow(/exactly 1\.\./);
    // change one version's correct letter so the decoded master key disagrees
    const cells = lines[1].split(",");
    cells[5] = cells[5] === "A" ? "B" : "A";
    const bad = [lines[0], cells.join(","), ...lines.slice(2)].join("\n");
    expect(() => datasetFromQuestionMap(bad, opts)).toThrow(/disagree/);
    expect(() => datasetFromQuestionMap("Version,Correct\n1,A", opts)).toThrow(/missing/);
  });

  const latest = path.resolve(import.meta.dirname, "../sample_files/shuffler_latest/MATH201_Final_Exam_mapping.csv");
  it.skipIf(!existsSync(latest))("LOCAL: students generated for the real Shuffler export validate against it", async () => {
    const csv = readFileSync(latest, "utf8");
    const fromMap = datasetFromQuestionMap(csv, { students: 120, seed: 1, codeStyle: "padded", blankRate: 0.02, plants: true });
    const exam = await importStudents(buildBundle(fromMap).find((f) => f.name === "student_data.xlsx")!);
    const rows = mapCodesByPosition(normalizeItemAnalysis((await readCSVFileWithDetection(makeFile(csv, "m.csv"))).data, "NEW"), exam);
    expect(validateCorrectAnswers(rows, exam)).toBeNull();
    expect(grades(exam)).toEqual(expectedResults(fromMap).grades.published);
  });
});
