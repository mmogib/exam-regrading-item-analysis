/**
 * LOCAL-ONLY regression comparison over the real files in sample_files/.
 *
 * sample_files/ is gitignored (it may contain real student data), so this suite
 * is skipped wherever the folder is absent (CI, Netlify, fresh clones). Results
 * are compared against file snapshots stored in sample_files/__baseline__/,
 * which is inside the ignored folder too.
 *
 *   First run on a known-good version: writes the baseline.
 *   Later runs:                         fail on any difference.
 *   Accept an explained difference:     npx vitest run tests/samples.local.test.ts -u
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { saveAs } from "file-saver";
import {
  applyColumnMapping,
  buildCorrectAnswersMap,
  computeAverageResults,
  computeCodeAverages,
  computeComprehensiveItemAnalysis,
  computeResults,
  exportToExcel,
  getAllQuestionCols,
  guessNumQuestions,
  normalizeItemAnalysis,
  parseWideFormat,
  readCSVFileWithDetection,
  readExamDataFileWithDetection,
  validateCorrectAnswers,
} from "@/lib/excel-utils";
import type { ExamRow, ItemAnalysisRow } from "@/types/exam";
import { blobToBytes, makeFile, mapCodesByPosition, readWorkbookSheets, stableJSON } from "./helpers";

vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

const SAMPLE_DIR = path.resolve(import.meta.dirname, "../sample_files");
const BASELINE_DIR = path.join(SAMPLE_DIR, "__baseline__");

/** Fixture manifest: the role of every sample file. Files not listed are reported. */
const MANIFEST = {
  studentData: ["test_data.csv", "imported_test_data.csv", "imported_test_data.xls"],
  itemAnalysis: [
    "mapping.csv",
    "Math 208_Final_Exam_mapping.csv",
    "QUESTIONS_MAP_Math 201_Final_Exam_mapping.csv",
    "OPTIONS_MATRIX_Math 201_Final_Exam_options_mapping.csv",
  ],
  // Previously generated reports: not inputs to any step; read only as workbooks
  reports: ["distractor_analysis.csv", "distractor_analysis.xlsx"],
};

const slug = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_");
const snapshot = (name: string) => path.join(BASELINE_DIR, `${slug(name)}.json`);

function loadFile(name: string): File {
  const bytes = readFileSync(path.join(SAMPLE_DIR, name));
  const isText = /\.(csv|txt)$/i.test(name);
  return makeFile(isText ? bytes.toString("utf8") : new Uint8Array(bytes), name);
}

/** Step 1: read + detect + map, exactly as the upload step does. */
async function loadStudentData(name: string) {
  const { rawData, detection } = await readExamDataFileWithDetection(loadFile(name));
  const data = detection.valid ? applyColumnMapping(rawData, detection) : null;
  return { rawData, detection, data };
}

/** Step 3: read + detect + parse an item-analysis CSV. */
async function loadItemAnalysis(name: string): Promise<{ format: string; rows: ItemAnalysisRow[] }> {
  const detection = await readCSVFileWithDetection(loadFile(name));
  if (detection.format === "WIDE") {
    return { format: detection.format, rows: parseWideFormat(detection.data, detection.columns) };
  }
  if (detection.format === "UNKNOWN") return { format: detection.format, rows: [] };
  return { format: detection.format, rows: normalizeItemAnalysis(detection.data, detection.format) };
}

/** Run a step and record either its result or its error message. */
function outcome<T>(fn: () => T): { ok: T } | { error: string } {
  try {
    return { ok: fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

describe.skipIf(!existsSync(SAMPLE_DIR))("sample_files regression comparison (local only)", () => {
  it("manifest covers every sample file", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const listed = new Set(Object.values(MANIFEST).flat());
    // Only top-level files are covered; subfolders (e.g. shuffler_latest/) hold other data sets
    const present = readdirSync(SAMPLE_DIR).filter(
      (f) => !f.startsWith("__") && statSync(path.join(SAMPLE_DIR, f)).isFile()
    );
    expect(present.filter((f) => !listed.has(f))).toEqual([]);
  });

  for (const name of MANIFEST.reports) {
    it(`report workbook reads identically: ${name}`, async () => {
      const bytes = new Uint8Array(readFileSync(path.join(SAMPLE_DIR, name)));
      await expect(stableJSON(readWorkbookSheets(bytes))).toMatchFileSnapshot(snapshot(`report__${name}`));
    });
  }

  for (const name of MANIFEST.studentData) {
    it(`student data: import, grading and re-export: ${name}`, async () => {
      const { rawData, detection, data } = await loadStudentData(name);
      const result: Record<string, unknown> = { detection, rawRowCount: rawData.length };

      if (data) {
        const numQuestions = guessNumQuestions(data);
        const qCols = getAllQuestionCols(data).slice(0, numQuestions);
        const correctMap = buildCorrectAnswersMap(data, qCols);
        result.numQuestions = numQuestions;
        result.normalizedData = data;
        result.correctMap = correctMap;
        result.grades = computeResults(data, qCols, correctMap);

        // Re-export (as Step 2's download does) and read the workbook back.
        // The read above set the module-level column order for this file.
        vi.mocked(saveAs).mockClear();
        exportToExcel(data, "regraded.xlsx", "Sheet1", data);
        const blob = vi.mocked(saveAs).mock.calls[0][0] as Blob;
        result.exportedWorkbook = readWorkbookSheets(await blobToBytes(blob));
      }

      await expect(stableJSON(result)).toMatchFileSnapshot(snapshot(`student__${name}`));
    });
  }

  for (const iaName of MANIFEST.itemAnalysis) {
    it(`item analysis: parse, and analyse against every student file: ${iaName}`, async () => {
      const { format, rows } = await loadItemAnalysis(iaName);
      const result: Record<string, unknown> = { format, parsedRows: rows, pairings: {} };

      for (const studentName of MANIFEST.studentData) {
        const { data } = await loadStudentData(studentName);
        if (!data || rows.length === 0) continue;
        const exam: ExamRow[] = data;
        const mapped = mapCodesByPosition(rows, exam);
        const numQuestions = guessNumQuestions(exam);
        const hasPermutation = mapped.some((r) => r.permutation);

        (result.pairings as Record<string, unknown>)[studentName] = {
          validation: validateCorrectAnswers(mapped, exam),
          masterQuestionStats: outcome(() => computeAverageResults(exam, mapped, numQuestions)),
          versionStats: outcome(() => computeCodeAverages(exam, mapped, numQuestions)),
          comprehensive: hasPermutation
            ? outcome(() => computeComprehensiveItemAnalysis(exam, mapped, numQuestions))
            : "skipped: no permutation data",
        };
      }

      await expect(stableJSON(result)).toMatchFileSnapshot(snapshot(`item__${iaName}`));
    });
  }
});
