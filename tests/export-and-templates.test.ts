import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveAs } from "file-saver";
import {
  applyColumnMapping,
  computeAverageResults,
  computeComprehensiveItemAnalysis,
  exportComprehensiveAnalysisToExcel,
  exportToExcel,
  getSolutionCodes,
  guessNumQuestions,
  isSolutionRow,
  normalizeItemAnalysis,
  parseWideFormat,
  readCSVFileWithDetection,
  readExamDataFileWithDetection,
  validateCorrectAnswers,
} from "@/lib/excel-utils";
import {
  generateExamTemplate,
  generateItemAnalysisNormalTemplate,
  generateItemAnalysisWideTemplate,
  generateItemAnalysisWithPermutationTemplate,
} from "@/lib/template-generator";
import { DOWNLOAD_FILENAMES } from "@/config/downloads";
import type { ItemAnalysisRow } from "@/types/exam";
import {
  blobToBytes,
  blobToText,
  captureLinkDownloads,
  examRow,
  makeFile,
  mapCodesByPosition,
  readWorkbookSheets,
} from "./helpers";

vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

const savedBlob = (call = 0): Blob => vi.mocked(saveAs).mock.calls[call][0] as Blob;

beforeEach(() => vi.mocked(saveAs).mockClear());

describe("exportToExcel", () => {
  it("preserves the uploaded file's column order and cell values", async () => {
    // Code before ID, as in some faculty files
    const csv = "Code,ID,1,2,3\n001,0,A,BC,D\n001,123,A,B,E\n";
    const { rawData, detection } = await readExamDataFileWithDetection(makeFile(csv, "exam.csv"));
    const data = applyColumnMapping(rawData, detection);

    exportToExcel(data, "out.xlsx", "Exam Data", data);

    expect(vi.mocked(saveAs).mock.calls[0][1]).toBe("out.xlsx");
    const sheets = readWorkbookSheets(await blobToBytes(savedBlob()));
    expect(Object.keys(sheets)).toEqual(["Exam Data"]);
    expect(sheets["Exam Data"]).toEqual([
      ["Code", "ID", "1", "2", "3"],
      ["001", "000000000", "A", "BC", "D"],
      ["001", "000000123", "A", "B", "E"],
    ]);
  });
});

describe("exportComprehensiveAnalysisToExcel", () => {
  it("writes the four report sheets with formatted values", async () => {
    const answers = [
      examRow("0", "001", ["A", "B", "C"]),
      examRow("201900001", "001", ["A", "B", "C"]),
      examRow("201900002", "001", ["A", "B", "D"]),
      examRow("201900003", "001", ["A", "E", "E"]),
      examRow("201900004", "001", ["B", "E", "E"]),
    ];
    const ia: ItemAnalysisRow[] = ["A", "B", "C"].map((correct, i) => ({
      code: "001",
      order: i + 1,
      order_in_master: i + 1,
      permutation: "ABCDE",
      correct,
    }));
    exportComprehensiveAnalysisToExcel(computeComprehensiveItemAnalysis(answers, ia, 3), "report.xlsx");

    const sheets = readWorkbookSheets(await blobToBytes(savedBlob()));
    expect(Object.keys(sheets)).toEqual(["Summary", "Item Statistics", "Option Analysis", "Interpretation Guide"]);
    expect(sheets["Summary"]).toContainEqual(["KR-20 Reliability", "0.750"]);
    expect(sheets["Summary"]).toContainEqual(["Total Students", 4]);
    expect(sheets["Item Statistics"][0]).toEqual([
      "Question",
      "Difficulty (p)",
      "Discrimination (D)",
      "Point-Biserial (r_pb)",
      "Distractor Efficiency (%)",
      "Decision",
      "Reason",
    ]);
    expect(sheets["Item Statistics"][1]).toEqual([1, "0.750", "0.500", "0.522", "25.0", "REVISE", "Poor distractor efficiency"]);
    // Correct option is starred; 6 rows per question + header
    expect(sheets["Option Analysis"]).toHaveLength(1 + 3 * 6);
    expect(sheets["Option Analysis"][1].slice(0, 3)).toEqual([1, "A*", 3]);
  });
});

describe("templates round-trip through the import pipeline", () => {
  let capture: ReturnType<typeof captureLinkDownloads>;
  beforeEach(() => {
    capture = captureLinkDownloads();
  });
  afterEach(() => capture.restore());

  async function loadExamTemplate() {
    generateExamTemplate();
    const { filename, blob } = capture.downloads.at(-1)!;
    expect(filename).toBe(DOWNLOAD_FILENAMES.templates.examDataTemplate);
    const file = makeFile(await blobToBytes(blob), filename);
    const { rawData, detection } = await readExamDataFileWithDetection(file);
    expect(detection.valid).toBe(true);
    return applyColumnMapping(rawData, detection);
  }

  async function loadItemTemplate(generate: () => void) {
    generate();
    const { filename, blob } = capture.downloads.at(-1)!;
    return { filename, detection: await readCSVFileWithDetection(makeFile(await blobToText(blob), filename)) };
  }

  it("exam template imports with 4 versions and 20 questions", async () => {
    const data = await loadExamTemplate();
    expect(getSolutionCodes(data)).toEqual(["001", "002", "003", "004"]);
    expect(guessNumQuestions(data)).toBe(20);
    expect(data.filter((r) => !isSolutionRow(r)).length).toBeGreaterThan(0);
  });

  it("Normal template is detected as NEW without permutation data", async () => {
    const { filename, detection } = await loadItemTemplate(generateItemAnalysisNormalTemplate);
    expect(filename).toBe(DOWNLOAD_FILENAMES.templates.itemAnalysisNormal);
    expect(detection.format).toBe("NEW");
    const rows = normalizeItemAnalysis(detection.data, "NEW");
    expect(rows).toHaveLength(40);
    expect(rows.some((r) => r.permutation)).toBe(false);
  });

  it("Question Map template pairs with the exam template and passes validation", async () => {
    const exam = await loadExamTemplate();
    const { filename, detection } = await loadItemTemplate(generateItemAnalysisWithPermutationTemplate);
    expect(filename).toBe(DOWNLOAD_FILENAMES.templates.itemAnalysisWithPermutation);
    expect(detection.format).toBe("NEW");

    const mapped = mapCodesByPosition(normalizeItemAnalysis(detection.data, "NEW"), exam);
    expect(mapped.every((r) => r.permutation)).toBe(true);
    expect(validateCorrectAnswers(mapped, exam)).toBeNull();

    const numQ = guessNumQuestions(exam);
    expect(computeAverageResults(exam, mapped, numQ).length).toBeGreaterThan(0);
    expect(computeComprehensiveItemAnalysis(exam, mapped, numQ).itemStatistics).toHaveLength(numQ);
  });

  it("Options Matrix template is detected as WIDE and parses", async () => {
    const { filename, detection } = await loadItemTemplate(generateItemAnalysisWideTemplate);
    expect(filename).toBe(DOWNLOAD_FILENAMES.templates.itemAnalysisWide);
    expect(detection.format).toBe("WIDE");
    const rows = parseWideFormat(detection.data, detection.columns);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.permutation && r.permutation.length === 5)).toBe(true);
  });
});
