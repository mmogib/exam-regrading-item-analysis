import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  ExamRow,
  StudentResult,
  StudentResultWithRank,
  CorrectAnswersMap,
  ItemAnalysisRow,
  AverageResult,
  CodeAverageResult,
  DistractorAnalysisResult,
  DistractorChoiceResult,
  ANS_CHOICES,
  POINTS_PER_Q,
  AnswerChoice,
  CSVDetectionResult,
  ColumnMapping,
  ColumnDetectionResult,
} from "@/types/exam";
import { debug, error as logError } from "./logger";

/**
 * Fuzzy column matching functions
 */

/**
 * Fuzzy match for ID column
 */
function fuzzyMatchID(colName: string): boolean {
  const normalized = colName.toLowerCase().replace(/[_\s-]/g, "");
  return (
    normalized === "id" ||
    normalized === "studentid" ||
    normalized.includes("stdid") ||
    normalized === "matric" ||
    normalized === "matriculation" ||
    normalized.includes("studentnumber")
  );
}

/**
 * Fuzzy match for Code column
 */
function fuzzyMatchCode(colName: string): boolean {
  const normalized = colName.toLowerCase().replace(/[_\s-]/g, "");
  return (
    normalized === "code" ||
    normalized === "version" ||
    normalized.includes("examcode") ||
    normalized.includes("formcode") ||
    normalized.includes("examversion")
  );
}

/**
 * Fuzzy match for Question column
 * Returns the question number if matched, null otherwise
 */
function fuzzyMatchQuestion(colName: string): number | null {
  const normalized = colName.trim();

  // Pure numeric: "1", "2", "3"
  if (/^\d+$/.test(normalized)) {
    return parseInt(normalized);
  }

  // Q1, Q2, Q3 (case insensitive)
  const qMatch = normalized.match(/^q\.?\s*(\d+)$/i);
  if (qMatch) return parseInt(qMatch[1]);

  // Question 1, Question 2 (case insensitive)
  const questionMatch = normalized.match(/^question\.?\s*(\d+)$/i);
  if (questionMatch) return parseInt(questionMatch[1]);

  // Ques 1, Ques1 (case insensitive)
  const quesMatch = normalized.match(/^ques\.?\s*(\d+)$/i);
  if (quesMatch) return parseInt(quesMatch[1]);

  return null; // Not a question column
}

/**
 * Detect and map columns using fuzzy matching
 */
export function detectColumns(data: any[]): ColumnDetectionResult {
  const errors: string[] = [];

  if (!data || data.length === 0) {
    return {
      idColumn: null,
      codeColumn: null,
      questionColumns: [],
      allColumns: [],
      valid: false,
      errors: ["File is empty"],
    };
  }

  const firstRow = data[0];
  const allColumns = Object.keys(firstRow);

  // Try to find ID column
  let idColumn: string | null = null;
  for (const col of allColumns) {
    if (fuzzyMatchID(col)) {
      idColumn = col;
      break;
    }
  }

  // Try to find Code column
  let codeColumn: string | null = null;
  for (const col of allColumns) {
    if (fuzzyMatchCode(col)) {
      codeColumn = col;
      break;
    }
  }

  // Try to find Question columns (only non-empty ones with valid answers)
  const questionColumns: { name: string; number: number }[] = [];
  for (const col of allColumns) {
    const questionNum = fuzzyMatchQuestion(col);
    if (questionNum !== null) {
      // Check if this column has any non-empty values with valid answer choices
      const hasValidData = data.some((row) => {
        const value = String(row[col] || "")
          .trim()
          .toUpperCase();
        return value.length > 0 && /^[A-E]+$/.test(value);
      });

      if (hasValidData) {
        questionColumns.push({ name: col, number: questionNum });
      }
    }
  }

  // Sort question columns by question number
  questionColumns.sort((a, b) => a.number - b.number);

  // Validate ID column
  if (!idColumn) {
    errors.push("Could not detect ID column. Please map it manually.");
  }

  // Validate Code column
  if (!codeColumn) {
    errors.push("Could not detect Code column. Please map it manually.");
  }

  // Validate question columns
  if (questionColumns.length === 0) {
    errors.push(
      "Could not detect any question columns. Please map them manually."
    );
  } else {
    // Check if questions are sequential (1, 2, 3, ..., N) with no gaps
    for (let i = 0; i < questionColumns.length; i++) {
      if (questionColumns[i].number !== i + 1) {
        errors.push(
          `Question columns are not sequential. Expected question ${
            i + 1
          }, found question ${questionColumns[i].number}. ` +
            "Please fix your file to have sequential question numbers (1, 2, 3, ...) with no gaps, then re-upload."
        );
        break;
      }
    }
  }

  return {
    idColumn,
    codeColumn,
    questionColumns,
    allColumns,
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Read Excel file and convert to ExamRow array
 */
// Store the original column order from the last read file
let originalColumnOrder: string[] = [];

export function getOriginalColumnOrder(): string[] {
  return originalColumnOrder;
}

export async function readExcelFile(file: File): Promise<ExamRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get the original column order from the sheet's range
        const range = XLSX.utils.decode_range(firstSheet["!ref"] || "A1");
        const headers: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
          const cell = firstSheet[cellAddress];
          if (cell && cell.v) {
            headers.push(String(cell.v));
          }
        }
        originalColumnOrder = headers;

        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

        // Validate BEFORE normalization to catch column name issues
        const validation = validateExamDataFormat(jsonData as any[]);
        if (!validation.valid) {
          reject(new Error(validation.errors.join("\n")));
          return;
        }

        const normalized = normalizeImportData(jsonData as any[]);
        resolve(normalized);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read exam data from CSV/TXT file
 * Supports both comma-delimited and tab-delimited formats
 */
export async function readExamDataFromCSV(file: File): Promise<ExamRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;

        // Auto-detect delimiter: try tab first, then comma
        // xlsx library's read function handles CSV parsing automatically
        const workbook = XLSX.read(text, {
          type: "string",
          raw: true, // Preserve original values
        });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get the original column order from the sheet's range
        const range = XLSX.utils.decode_range(firstSheet["!ref"] || "A1");
        const headers: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
          const cell = firstSheet[cellAddress];
          if (cell && cell.v) {
            headers.push(String(cell.v));
          }
        }
        originalColumnOrder = headers;

        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

        // Validate BEFORE normalization to catch column name issues
        const validation = validateExamDataFormat(jsonData as any[]);
        if (!validation.valid) {
          reject(new Error(validation.errors.join("\n")));
          return;
        }

        const normalized = normalizeImportData(jsonData as any[]);
        resolve(normalized);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Read exam data file with column detection (for mapping UI)
 * Returns raw data and detection results
 */
export async function readExamDataFileWithDetection(file: File): Promise<{
  rawData: any[];
  detection: ColumnDetectionResult;
}> {
  const fileName = file.name.toLowerCase();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        let workbook: XLSX.WorkBook;

        if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
          const text = e.target?.result as string;
          workbook = XLSX.read(text, { type: "string", raw: true });
        } else if (fileName.endsWith(".xls") || fileName.endsWith(".xlsx")) {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          workbook = XLSX.read(data, { type: "array" });
        } else {
          reject(
            new Error(
              "Unsupported file format. Please upload .xls, .xlsx, .csv, or .txt file."
            )
          );
          return;
        }

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get column order
        const range = XLSX.utils.decode_range(firstSheet["!ref"] || "A1");
        const headers: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
          const cell = firstSheet[cellAddress];
          if (cell && cell.v) {
            headers.push(String(cell.v));
          }
        }
        originalColumnOrder = headers;

        const rawData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
        const detection = detectColumns(rawData);

        resolve({ rawData, detection });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;

    if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

/**
 * Apply column mapping and normalize data
 */
export function applyColumnMapping(
  rawData: any[],
  detection: ColumnDetectionResult
): ExamRow[] {
  if (!detection.valid || !detection.idColumn || !detection.codeColumn) {
    throw new Error("Invalid column detection. Cannot normalize data.");
  }

  return normalizeImportData(rawData, {
    idColumn: detection.idColumn,
    codeColumn: detection.codeColumn,
    questionColumns: detection.questionColumns,
  });
}

/**
 * Read exam data file (auto-detect Excel or CSV/TXT)
 * DEPRECATED: Use readExamDataFileWithDetection for better column mapping support
 */
export async function readExamDataFile(file: File): Promise<ExamRow[]> {
  const { rawData, detection } = await readExamDataFileWithDetection(file);

  if (!detection.valid) {
    throw new Error(detection.errors.join("\n"));
  }

  return applyColumnMapping(rawData, detection);
}

/**
 * Validate exam data format using fuzzy column detection
 * Returns {valid: boolean, errors: string[]}
 */
export function validateExamDataFormat(data: any[]): {
  valid: boolean;
  errors: string[];
} {
  // Use the new column detection logic
  const detection = detectColumns(data);
  return {
    valid: detection.valid,
    errors: detection.errors,
  };
}

/**
 * Read CSV file and detect format (returns raw data for format detection)
 */
export async function readCSVFileWithDetection(
  file: File
): Promise<CSVDetectionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        resolve(detectCSVFormat(...readCsvTable(text)));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Read CSV file and convert to ItemAnalysisRow array (legacy - auto-detect)
 */
export async function readCSVFile(file: File): Promise<ItemAnalysisRow[]> {
  const detection = await readCSVFileWithDetection(file);

  if (detection.format === "UNKNOWN") {
    throw new Error("Unknown CSV format. Please map columns manually.");
  }

  if (detection.format === "WIDE") {
    return parseWideFormat(detection.data, detection.columns);
  }

  return normalizeItemAnalysis(detection.data, detection.format);
}

/**
 * Read an item-analysis CSV as text cells (P3, P12). Values are kept exactly as
 * written ("001", "1A", "0x1" stay text; SheetJS would otherwise turn them into
 * numbers). The column names come from the header row, and every data row gets
 * every column ("" for an empty cell), so a blank cell in the first row can no
 * longer hide a column. Repeated column names and files without data rows are
 * errors.
 */
export function readCsvTable(text: string): [Record<string, string>[], string[]] {
  const workbook = XLSX.read(text, { type: "string", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false })
    : [];
  if (grid.length === 0) throw new Error("The file is empty.");

  const headers = (grid[0] as unknown[]).map((h) => String(h ?? "").replace(/^﻿/, "").trim());
  const seen = new Map<string, string>();
  for (const h of headers) {
    if (h === "") continue;
    const key = h.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`The file has two columns named "${seen.get(key)}" and "${h}". Rename one of them.`);
    }
    seen.set(key, h);
  }

  const rows = grid.slice(1).filter((r) => (r as unknown[]).some((c) => String(c ?? "").trim() !== ""));
  if (rows.length === 0) throw new Error("The file has column names but no data rows.");

  const keys = headers.map((h, i) => h || `__EMPTY_${i}`);
  const data = rows.map((r) => {
    const cells = r as unknown[];
    const row: Record<string, string> = {};
    keys.forEach((k, i) => {
      row[k] = String(cells[i] ?? "");
    });
    return row;
  });
  return [data, headers.filter((h) => h !== "")];
}

/**
 * Detect CSV format by examining column names (taken from the header row)
 */
function detectCSVFormat(data: any[], headerColumns?: string[]): CSVDetectionResult {
  if (data.length === 0) {
    return { format: "UNKNOWN", columns: headerColumns ?? [], data };
  }

  const columns = headerColumns ?? Object.keys(data[0]);

  debug("Detected columns:", columns);

  // Check for WIDE format (Q, Option, Master_Correct, version_X_Q, version_X_Opt)
  const hasQColumn = columns.some((col) => {
    const lower = col.toLowerCase().replace(/[_\s]/g, "");
    return lower === "q" || lower === "question";
  });

  const hasOptionColumn = columns.some((col) => {
    const lower = col.toLowerCase().replace(/[_\s]/g, "");
    return lower === "option" || lower === "opt";
  });

  const hasMasterCorrectColumn = columns.some((col) => {
    const lower = col.toLowerCase().replace(/[_\s]/g, "");
    return (
      lower === "mastercorrect" ||
      lower === "correct" ||
      lower === "correctanswer"
    );
  });

  // Version column pairs, legacy (version_1_Q) or named (A_Q); see findVersionPairs
  const hasVersionPairs = columns.some((col) => classifyVersionHeader(col) !== null);

  const hasWideFormat =
    hasQColumn && hasOptionColumn && hasMasterCorrectColumn && hasVersionPairs;

  // Check for NEW format
  const hasNewFormat =
    columns.some(
      (col) =>
        col.toLowerCase().includes("version") &&
        !col.toLowerCase().includes("master")
    ) && columns.some((col) => col.toLowerCase().includes("master"));

  // Check for OLD format
  const hasOldFormat =
    columns.some(
      (col) =>
        col.toLowerCase() === "code" ||
        col.toLowerCase().replace(/[_\s]/g, "") === "code"
    ) &&
    columns.some(
      (col) =>
        col.toLowerCase().includes("order") &&
        col.toLowerCase().includes("master")
    );

  let format: "OLD" | "NEW" | "WIDE" | "UNKNOWN";

  if (hasWideFormat) {
    format = "WIDE";
    debug("Detected WIDE format");
  } else if (hasNewFormat) {
    format = "NEW";
    debug("Detected NEW format");
  } else if (hasOldFormat) {
    format = "OLD";
    debug("Detected OLD format");
  } else {
    format = "UNKNOWN";
    debug("Unknown format, manual mapping needed");
  }

  return { format, columns, data };
}

/* ------------------------------------------------------------------ */
/* Options Matrix version columns (P5) and version codes (P12)         */
/* ------------------------------------------------------------------ */

/** Legacy spellings: version_1_Q, version 1 Opt, v1_Q, v_2_opt, version1Q, ... */
const LEGACY_VERSION_HEADER = /^(?:version|v)[_\s]*(\d+)[_\s]*(q|opt)$/i;
/** Any other version name, as the Shuffler writes it: <name>_Q / <name>_Opt. */
const NAMED_VERSION_HEADER = /^(.+)_(q|opt)$/i;

type VersionHeader = { legacy: string | null; name: string; half: "q" | "opt" };

/** How a column name takes part in a version pair, or null if it does not. */
export function classifyVersionHeader(header: string): VersionHeader | null {
  const h = header.trim();
  const legacy = LEGACY_VERSION_HEADER.exec(h);
  if (legacy) {
    const half = legacy[2].toLowerCase() as "q" | "opt";
    const name = h.replace(/[_\s]*(q|opt)$/i, "");
    return { legacy: String(Number(legacy[1])), name, half };
  }
  const named = NAMED_VERSION_HEADER.exec(h);
  if (named && named[1].trim() !== "") {
    return { legacy: null, name: named[1].trim(), half: named[2].toLowerCase() as "q" | "opt" };
  }
  return null;
}

export interface VersionPairs {
  /** "legacy": every pair is version_N / vN, codes are the numbers. "named": codes are the names as written. */
  mode: "legacy" | "named";
  pairs: { code: string; qCol: string; optCol: string }[];
  /** Legacy mode only: the version numbers are consecutive (Step 3 requires it). */
  consecutive: boolean;
}

/**
 * The version column pairs of an Options Matrix (P5), one rule for Step 3 and
 * the template dialog. A file whose pairs are all legacy-named (version_N_Q,
 * vN_Opt, ...) keeps numeric codes; any other file keeps every name as written,
 * including names like "version_1". Both halves of every pair are required, and
 * two pairs may not name the same version. Null when the file has no pairs.
 */
export function findVersionPairs(headers: string[]): VersionPairs | null {
  const found = headers
    .map((header) => ({ header: header.trim(), v: classifyVersionHeader(header) }))
    .filter((x): x is { header: string; v: VersionHeader } => x.v !== null);
  if (found.length === 0) return null;

  const mode: VersionPairs["mode"] = found.every((x) => x.v.legacy !== null) ? "legacy" : "named";
  const byCode = new Map<string, { code: string; q?: string; opt?: string }>();
  for (const { header, v } of found) {
    const code = mode === "legacy" ? v.legacy! : v.name;
    const key = code.toLowerCase();
    const entry = byCode.get(key) ?? { code };
    if (entry[v.half] !== undefined) {
      throw new Error(`The Options Matrix has two columns for version "${entry.code}": "${entry[v.half]}" and "${header}".`);
    }
    entry[v.half] = header;
    byCode.set(key, entry);
  }
  const pairs: VersionPairs["pairs"] = [];
  for (const entry of byCode.values()) {
    if (!entry.q || !entry.opt) {
      const has = entry.q ?? entry.opt;
      const missing = entry.q ? "_Opt" : "_Q";
      throw new Error(`The Options Matrix has "${has}" but no matching ${missing} column for version "${entry.code}".`);
    }
    pairs.push({ code: entry.code, qCol: entry.q, optCol: entry.opt });
  }

  if (mode === "named") {
    assertDistinctVersionLabels(pairs.map((p) => p.code), "The Options Matrix");
  }

  let consecutive = true;
  if (mode === "legacy") {
    pairs.sort((a, b) => Number(a.code) - Number(b.code));
    consecutive = pairs.every((p, i) => i === 0 || Number(p.code) === Number(pairs[i - 1].code) + 1);
  }
  return { mode, pairs, consecutive };
}

/**
 * A version code as Step 3 stores it (P12): an all-digit label becomes a number
 * (001 -> 1); any other label stays its trimmed text ("1A", "0x1", "1e2"). An
 * all-digit label too long to be an exact number is an error, never merged.
 */
export function normalizeVersionCode(raw: unknown): string | number {
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw)) throw new Error(`Version code ${raw} is not a whole number the app can use.`);
    return raw;
  }
  const s = String(raw ?? "").trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) throw new Error(`Version code "${s}" is too long to use as a number. Use a shorter code.`);
    return n;
  }
  return s;
}

/** Identity for matching codes by number: an all-digit label without leading zeros; any other label as it is. */
export function versionCodeKey(code: string | number): string {
  const s = String(code).trim();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s;
}

/**
 * Reject two different spellings of one version number (for example "01" and
 * "1") before any code is converted: once converted they would silently merge
 * into one version (011 D3). Repeated rows with the same spelling are fine.
 */
export function assertDistinctVersionLabels(labels: unknown[], where = "The item analysis file"): void {
  const byKey = new Map<string, string>();
  for (const raw of labels) {
    const label = String(raw ?? "").trim();
    if (label === "") continue;
    const key = versionCodeKey(label);
    const seen = byKey.get(key);
    if (seen !== undefined && seen !== label) {
      throw new Error(
        `${where} uses both "${seen}" and "${label}" as version codes, which the app reads as the same number. Use one spelling for each version.`
      );
    }
    byKey.set(key, label);
  }
}

/** Deterministic display order: all-digit codes by value, then other codes (numeric-aware), ties by the full code. */
export function sortVersionCodes(codes: string[]): string[] {
  const digits = (s: string) => /^\d+$/.test(s);
  return [...codes].sort((a, b) => {
    const da = digits(a);
    const db = digits(b);
    if (da && db) {
      const ka = versionCodeKey(a);
      const kb = versionCodeKey(b);
      if (ka.length !== kb.length) return ka.length - kb.length;
      if (ka !== kb) return ka < kb ? -1 : 1;
    } else if (da !== db) {
      return da ? -1 : 1;
    } else {
      const c = a.localeCompare(b, undefined, { numeric: true });
      if (c !== 0) return c;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export type CodeBinding =
  | { kind: "exact" }
  | { kind: "numeric"; itemToStudent: Map<string, string> }
  | { kind: "manual"; studentCodes: string[]; itemCodes: string[]; suggestion: Map<string, string> };

/**
 * How Step 3 binds the item-analysis codes to the student codes (P12):
 * - "exact": the two code sets are equal (in any order);
 * - "numeric": both sets are all-digit, each side has no two codes with the same
 *   number, and the numbers match one to one (1 = 001): bind by number;
 * - "manual": anything else; the user confirms a mapping (suggested by position
 *   in the deterministic order).
 */
export function bindVersionCodes(studentCodes: string[], itemCodes: string[]): CodeBinding {
  const s = Array.from(new Set(studentCodes.map((c) => String(c).trim())));
  const i = Array.from(new Set(itemCodes.map((c) => String(c).trim())));
  const sSet = new Set(s);
  if (s.length === i.length && i.every((c) => sSet.has(c))) return { kind: "exact" };

  const allDigits = (xs: string[]) => xs.length > 0 && xs.every((x) => /^\d+$/.test(x));
  if (allDigits(s) && allDigits(i)) {
    const sKeys = new Map(s.map((c) => [versionCodeKey(c), c]));
    const iKeys = new Map(i.map((c) => [versionCodeKey(c), c]));
    if (sKeys.size === s.length && iKeys.size === i.length && sKeys.size === iKeys.size && [...iKeys.keys()].every((k) => sKeys.has(k))) {
      return { kind: "numeric", itemToStudent: new Map(i.map((c) => [c, sKeys.get(versionCodeKey(c))!])) };
    }
  }

  const studentSorted = sortVersionCodes(s);
  const itemSorted = sortVersionCodes(i);
  const suggestion = new Map<string, string>();
  for (let k = 0; k < Math.min(studentSorted.length, itemSorted.length); k++) suggestion.set(studentSorted[k], itemSorted[k]);
  return { kind: "manual", studentCodes: studentSorted, itemCodes: itemSorted, suggestion };
}

/** Rewrite item-analysis codes to student codes (item code -> student code). Rows without a binding keep their code. */
export function applyCodeBinding(rows: ItemAnalysisRow[], itemToStudent: Map<string, string>): ItemAnalysisRow[] {
  return rows.map((ia) => {
    const bound = itemToStudent.get(String(ia.code).trim());
    return bound === undefined ? ia : { ...ia, code: bound };
  });
}

/**
 * Parse WIDE format CSV (one row per option per master question)
 * Converts to ItemAnalysisRow[] format with permutation strings
 * EXPORTED for use in Step 3
 *
 * Strict (P5, P7): each master question has 2-5 option rows labelled A..n, each
 * once, with exactly one Master_Correct flag; for every version its rows give
 * one position and a one-to-one shuffle of A..n. The permutation has n letters
 * (index = version letter, value = master letter); nothing is padded.
 */
export function parseWideFormat(
  data: any[],
  columns: string[]
): ItemAnalysisRow[] {
  // Find column names (case-insensitive)
  const qCol = columns.find((col) => {
    const lower = col.toLowerCase().replace(/[_\s]/g, "");
    return lower === "q" || lower === "question";
  });

  const optCol = columns.find((col) => {
    const lower = col.toLowerCase().replace(/[_\s]/g, "");
    return lower === "option" || lower === "opt";
  });

  const correctCol = columns.find((col) => {
    const lower = col.toLowerCase().replace(/[_\s]/g, "");
    return (
      lower === "mastercorrect" ||
      lower === "correct" ||
      lower === "correctanswer"
    );
  });

  if (!qCol || !optCol || !correctCol) {
    throw new Error(
      "WIDE format missing required columns: Q, Option, Master_Correct"
    );
  }

  const versions = findVersionPairs(columns);
  if (!versions) {
    throw new Error("No version columns found in WIDE format");
  }
  if (versions.mode === "legacy" && !versions.consecutive) {
    const found = versions.pairs.map((p) => p.code).join(", ");
    throw new Error(
      `Version numbers must be sequential. Found: ${found}. ` +
        `Please ensure versions are numbered sequentially (e.g., 1,2,3,4 or 5,6,7,8).`
    );
  }
  debug("Detected versions:", versions.pairs.map((p) => p.code));

  const LETTERS = "ABCDE";
  const isYes = (v: unknown) => /^(yes|y|true|1)$/i.test(String(v ?? "").trim());

  // Group rows by master question
  const questionGroups = new Map<number, any[]>();
  data.forEach((row, i) => {
    const rawQ = String(row[qCol] ?? "").trim();
    const masterQ = Number(rawQ);
    if (!/^\d+$/.test(rawQ) || masterQ < 1) {
      throw new Error(`Options Matrix row ${i + 2}: "${qCol}" must be a whole number (found "${rawQ}").`);
    }
    if (!questionGroups.has(masterQ)) questionGroups.set(masterQ, []);
    questionGroups.get(masterQ)!.push(row);
  });

  const result: ItemAnalysisRow[] = [];
  const masterQuestions = [...questionGroups.keys()].sort((a, b) => a - b);
  for (const masterQ of masterQuestions) {
    const optionRows = questionGroups.get(masterQ)!;
    const options = optionRows.map((row) => String(row[optCol] ?? "").trim().toUpperCase());
    const n = options.length;
    const allowed = LETTERS.slice(0, n);
    if (n < 2 || n > 5 || new Set(options).size !== n || !options.every((o) => o.length === 1 && allowed.includes(o))) {
      throw new Error(
        `Options Matrix, master Q${masterQ}: each option row needs one letter, A to ${LETTERS[Math.min(Math.max(n, 2), 5) - 1]}, each used once (found ${options.map((o) => o || "(blank)").join(", ")}).`
      );
    }
    const flagged = optionRows.filter((row) => isYes(row[correctCol]));
    if (flagged.length !== 1) {
      throw new Error(`Options Matrix, master Q${masterQ}: exactly one option must be marked as ${correctCol} (found ${flagged.length}).`);
    }
    const correctMaster = String(flagged[0][optCol]).trim().toUpperCase();

    for (const pair of versions.pairs) {
      const positions = new Set(optionRows.map((row) => String(row[pair.qCol] ?? "").trim()));
      const rawPosition = [...positions][0];
      if (positions.size !== 1 || !/^\d+$/.test(rawPosition) || Number(rawPosition) < 1) {
        throw new Error(`Options Matrix, master Q${masterQ}, version ${pair.code}: the option rows must give one whole-number position in "${pair.qCol}".`);
      }
      const perm: string[] = new Array(n).fill("");
      let versionCorrect = "";
      for (const row of optionRows) {
        const masterLetter = String(row[optCol]).trim().toUpperCase();
        const versionLetter = String(row[pair.optCol] ?? "").trim().toUpperCase();
        const idx = LETTERS.indexOf(versionLetter);
        if (versionLetter.length !== 1 || idx < 0 || idx >= n || perm[idx] !== "") {
          throw new Error(
            `Options Matrix, master Q${masterQ}, version ${pair.code}: the letters in "${pair.optCol}" must be a one-to-one shuffle of A to ${LETTERS[n - 1]}.`
          );
        }
        perm[idx] = masterLetter;
        if (masterLetter === correctMaster) versionCorrect = versionLetter;
      }
      result.push({
        code: versions.mode === "legacy" ? Number(pair.code) : normalizeVersionCode(pair.code),
        order: Number(rawPosition),
        order_in_master: masterQ,
        permutation: perm.join(""),
        correct: versionCorrect,
      });
    }
  }

  debug("Parsed WIDE format:", result.length, "rows");
  return result;
}


/**
 * Normalize import_test_data with column mapping
 */
function normalizeImportData(
  data: any[],
  columnMapping?: {
    idColumn: string;
    codeColumn: string;
    questionColumns: { name: string; number: number }[];
  }
): ExamRow[] {
  if (data.length === 0) throw new Error("Empty file");

  return data.map((row, idx) => {
    const normalized: ExamRow = {
      ID: columnMapping
        ? String(row[columnMapping.idColumn] || "")
        : String(row.ID || ""),
      Code: columnMapping
        ? String(row[columnMapping.codeColumn] || "")
        : String(row.Code || ""),
    };

    // Pad IDs only if they're purely numeric
    if (/^\d+$/.test(normalized.ID)) {
      normalized.ID = normalized.ID.padStart(9, "0");
    }

    // Process question columns
    if (columnMapping && columnMapping.questionColumns.length > 0) {
      // Use mapped question columns - normalize column names to sequential numbers
      columnMapping.questionColumns.forEach(({ name, number }) => {
        const questionKey = String(number); // Use question number as key (1, 2, 3, ...)
        let value = String(row[name] || "").toUpperCase();
        // Keep only A-E letters (solutions may be concatenated like "ABE")
        if (value && /^[A-E]+$/.test(value)) {
          normalized[questionKey] = value;
        } else {
          normalized[questionKey] = "";
        }
      });
    } else {
      // Fallback: process numeric column names only (old behavior for backwards compatibility)
      Object.keys(row).forEach((key) => {
        if (!["ID", "Code"].includes(key) && /^\d+$/.test(key)) {
          let value = String(row[key] || "").toUpperCase();
          // Keep only A-E letters (solutions may be concatenated like "ABE")
          if (value && /^[A-E]+$/.test(value)) {
            normalized[key] = value;
          } else {
            normalized[key] = "";
          }
        }
      });
    }

    return normalized;
  });
}

/**
 * Normalize item_analysis with format detection or custom mapping
 * EXPORTED for use in uncoding component
 */
export function normalizeItemAnalysis(
  data: any[],
  format: "OLD" | "NEW" = "NEW",
  customMapping?: ColumnMapping
): ItemAnalysisRow[] {
  debug("Normalizing with format:", format);
  debug("Custom mapping:", customMapping);

  // The version code of a row, before conversion (the same choice as below)
  const rawCode = (row: any) =>
    customMapping
      ? row[customMapping.code]
      : format === "NEW"
        ? row.Version || row.version || row.VERSION
        : row.code || row.Code || row.CODE;
  assertDistinctVersionLabels(data.map(rawCode));

  const normalized = data
    .map((row) => {
      let codeRaw, orderRaw, orderInMasterRaw;

      if (customMapping) {
        // Use custom mapping provided by user
        codeRaw = row[customMapping.code];
        orderRaw = row[customMapping.order];
        orderInMasterRaw = row[customMapping.orderInMaster];
      } else if (format === "NEW") {
        // NEW FORMAT: Version, Version Q#, Master Q#
        codeRaw = row.Version || row.version || row.VERSION;
        orderRaw = row["Version Q#"] || row["version q#"] || row["VERSION Q#"];
        orderInMasterRaw =
          row["Master Q#"] || row["master q#"] || row["MASTER Q#"];
      } else {
        // OLD FORMAT: code, order, order in master
        codeRaw = row.code || row.Code || row.CODE;
        orderRaw = row.order || row.Order || row.ORDER;
        orderInMasterRaw =
          row["order in master"] ||
          row["Order in Master"] ||
          row.order_in_master ||
          row.ORDER_IN_MASTER;
      }

      // Version code (P12): all-digit labels become numbers, anything else stays text
      const code = normalizeVersionCode(codeRaw);

      const order =
        typeof orderRaw === "number" ? orderRaw : parseInt(String(orderRaw));
      const orderInMaster =
        typeof orderInMasterRaw === "number"
          ? orderInMasterRaw
          : parseInt(String(orderInMasterRaw));

      // Extract optional fields from QUESTIONS_MAP format
      const permutationRaw =
        row.Permutation || row.permutation || row.PERMUTATION;
      const correctRaw = row.Correct || row.correct || row.CORRECT;
      const pointsRaw = row.Points || row.points || row.POINTS;
      const groupRaw = row.Group || row.group || row.GROUP;

      const result: ItemAnalysisRow = {
        code,
        order,
        order_in_master: orderInMaster,
      };

      // Add optional fields if they exist
      if (
        permutationRaw !== undefined &&
        permutationRaw !== null &&
        String(permutationRaw).trim() !== ""
      ) {
        result.permutation = String(permutationRaw).trim();
      }
      if (
        correctRaw !== undefined &&
        correctRaw !== null &&
        String(correctRaw).trim() !== ""
      ) {
        result.correct = String(correctRaw).trim();
      }
      if (pointsRaw !== undefined && pointsRaw !== null) {
        const points =
          typeof pointsRaw === "number"
            ? pointsRaw
            : parseFloat(String(pointsRaw));
        if (!isNaN(points)) {
          result.points = points;
        }
      }
      if (
        groupRaw !== undefined &&
        groupRaw !== null &&
        String(groupRaw).trim() !== ""
      ) {
        const groupNum = parseInt(String(groupRaw));
        result.group = isNaN(groupNum) ? String(groupRaw).trim() : groupNum;
      }

      return result;
    })
    .filter((row) => {
      // Filter out rows with missing/invalid data, but allow alphanumeric codes
      const hasValidCode =
        row.code !== "" && row.code !== null && row.code !== undefined;
      return hasValidCode && !isNaN(row.order) && !isNaN(row.order_in_master);
    });

  debug("Normalized rows:", normalized.length);
  debug("Sample:", normalized.slice(0, 3));

  return normalized;
}

/**
 * Parse CSV with custom column mapping
 */
export function parseCSVWithMapping(
  data: any[],
  mapping: ColumnMapping
): ItemAnalysisRow[] {
  return normalizeItemAnalysis(data, "NEW", mapping);
}

/**
 * Get all question column names from data
 */
export function getAllQuestionCols(data: ExamRow[]): string[] {
  if (data.length === 0) return [];
  const firstRow = data[0];
  const qCols = Object.keys(firstRow).filter(
    (key) => !["ID", "Code"].includes(key)
  );

  // Try to sort numerically
  const sorted = qCols.sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  return sorted;
}

/**
 * Parse solution cell (e.g., "ABE" -> ["A", "B", "E"])
 */
export function parseSolutionCell(value: string): AnswerChoice[] {
  if (!value || value === "") return [];
  const letters = value
    .split("")
    .filter((c) => ANS_CHOICES.includes(c as AnswerChoice));
  return Array.from(new Set(letters)) as AnswerChoice[];
}

/**
 * Guess number of questions from solution rows
 */
export function guessNumQuestions(data: ExamRow[]): number {
  const qCols = getAllQuestionCols(data);
  const solutions = data.filter((row) => isSolutionRow(row));

  if (solutions.length === 0) return qCols.length;

  let validCount = 0;
  for (const col of qCols) {
    const hasValid = solutions.some((sol) => {
      const val = sol[col];
      return val && /^[A-E]+$/.test(val);
    });
    if (hasValid) validCount++;
  }

  return validCount > 0 ? validCount : qCols.length;
}

/**
 * Check if a row is a solution row
 * Solution rows are identified by Code column being a variation of "0" (0, 00, 000, 0000, etc.)
 * OR by ID being "000000000", "0", or empty (for backwards compatibility)
 * EXPORTED for use in components
 */
export function isSolutionRow(row: ExamRow): boolean {
  const code = String(row.Code || "").trim();
  const id = String(row.ID || "").trim();

  // Check Code first (new format): Code = "0", "00", "000", etc.
  if (/^0+$/.test(code)) {
    return true;
  }

  // Fallback to ID check (old format): ID = "000000000", "0", or empty
  if (id === "000000000" || id === "0" || id === "") {
    return true;
  }

  return false;
}

/**
 * Get unique codes from solution rows, sorted numerically
 */
export function getSolutionCodes(data: ExamRow[]): string[] {
  const solutions = data.filter((row) => isSolutionRow(row));
  const codes = Array.from(new Set(solutions.map((s) => s.Code)));

  // Sort codes: numeric codes first (by value), then alphabetic
  return codes.sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Validate that all student codes have corresponding solution rows
 * Returns array of codes that are missing solutions
 */
export function validateCodesHaveSolutions(data: ExamRow[]): string[] {
  // Get all codes from students (non-solution rows)
  const students = data.filter((row) => !isSolutionRow(row));
  const studentCodes = Array.from(new Set(students.map((s) => s.Code)));

  // Get all codes from solution rows
  const solutionCodes = getSolutionCodes(data);

  // Find codes that have students but no solution
  const codesWithoutSolution = studentCodes.filter(
    (code) => !solutionCodes.includes(code)
  );

  return codesWithoutSolution.sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Build correct answers map from solution rows
 */
export function buildCorrectAnswersMap(
  data: ExamRow[],
  qCols: string[]
): CorrectAnswersMap {
  const solutions = data.filter((row) => isSolutionRow(row));
  const map: CorrectAnswersMap = {};

  solutions.forEach((sol) => {
    const code = sol.Code;
    map[code] = qCols.map((col) => parseSolutionCell(sol[col]));
  });

  return map;
}

/**
 * Compute results for all students
 */
export function computeResults(
  data: ExamRow[],
  qCols: string[],
  correctMap: CorrectAnswersMap,
  pointsPerQuestion: number = POINTS_PER_Q
): StudentResult[] {
  const students = data.filter((row) => !isSolutionRow(row));

  return students.map((student) => {
    const code = student.Code;
    const correctAnswers = correctMap[code] || [];

    let totalScore = 0;
    qCols.forEach((col, idx) => {
      const studentAnswer = parseSolutionCell(student[col] || "");
      const correctAnswer = correctAnswers[idx] || [];

      // Student gets points if their answer is one of the correct answers
      // For questions with multiple correct answers (e.g., ["A", "B", "E"]),
      // student gets points if they answered any one of them
      if (studentAnswer.length > 0) {
        const studentAnswerStr = studentAnswer[0]; // Student can only answer one choice
        if (correctAnswer.includes(studentAnswerStr)) {
          totalScore += pointsPerQuestion;
        }
      }
    });

    const percentage = (100 * totalScore) / (pointsPerQuestion * qCols.length);

    return {
      ID: student.ID,
      Code: student.Code,
      Tot: totalScore,
      Per: Math.round(percentage * 100) / 100,
    };
  });
}

/**
 * Revise solution rows with new correct answers
 */
export function reviseSolutionRows(
  data: ExamRow[],
  qCols: string[],
  correctMap: CorrectAnswersMap
): ExamRow[] {
  return data.map((row) => {
    // Only update solution rows
    if (isSolutionRow(row)) {
      const code = row.Code;
      const correctAnswers = correctMap[code];

      if (correctAnswers) {
        const revised = { ...row };

        // Replace question columns with the correct answers from correctMap
        qCols.forEach((col, idx) => {
          const letters = correctAnswers[idx];
          revised[col] = letters.length > 0 ? [...letters].sort().join("") : "";
        });

        return revised;
      }
    }

    // Return all other rows (student rows) unchanged
    return row;
  });
}

/**
 * Export data to Excel file with preserved column order
 */
export function exportToExcel(
  data: any[],
  filename: string,
  sheetName: string,
  originalData?: any[]
) {
  let worksheet: XLSX.WorkSheet;

  // Use the stored original column order from readExcelFile
  const headers = getOriginalColumnOrder();

  if (headers.length > 0 && originalData && originalData.length > 0) {
    // Reorder data to match the original column order
    const reorderedData = data.map((row) => {
      const orderedRow: any = {};
      headers.forEach((header) => {
        orderedRow[header] = row[header] !== undefined ? row[header] : "";
      });
      return orderedRow;
    });

    worksheet = XLSX.utils.json_to_sheet(reorderedData, { header: headers });
  } else {
    worksheet = XLSX.utils.json_to_sheet(data);
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, filename);
}

/**
 * Export comprehensive item analysis to multi-sheet Excel file
 */
export function exportComprehensiveAnalysisToExcel(
  results: import("@/types/exam").ComprehensiveItemAnalysisResult,
  filename: string
) {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Test Summary
  const summaryData = [
    { Metric: "Total Items", Value: results.testSummary.totalItems },
    { Metric: "Total Students", Value: results.testSummary.totalStudents },
    { Metric: "Mean Score", Value: results.testSummary.meanScore.toFixed(2) },
    {
      Metric: "Std Dev Score",
      Value: results.testSummary.stdDevScore.toFixed(2),
    },
    {
      Metric: "Mean Difficulty (p)",
      Value: results.testSummary.meanDifficulty.toFixed(3),
    },
    {
      Metric: "Mean Discrimination (D)",
      Value: results.testSummary.meanDiscrimination.toFixed(3),
    },
    { Metric: "KR-20 Reliability", Value: results.testSummary.KR20.toFixed(3) },
    { Metric: "", Value: "" },
    { Metric: "Items to Keep", Value: results.testSummary.itemsToKeep },
    { Metric: "Items to Revise", Value: results.testSummary.itemsToRevise },
    {
      Metric: "Items to Investigate",
      Value: results.testSummary.itemsToInvestigate,
    },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // Sheet 2: Item Statistics
  const itemData = results.itemStatistics.map((item) => ({
    Question: item.questionNumber,
    "Difficulty (p)": item.p_i.toFixed(3),
    "Discrimination (D)": item.D_i.toFixed(3),
    "Point-Biserial (r_pb)": item.r_pb.toFixed(3),
    "Distractor Efficiency (%)": item.DE === null ? "N/A" : item.DE.toFixed(1),
    Decision: item.decision,
    Reason: item.decisionReason || "",
  }));
  const itemSheet = XLSX.utils.json_to_sheet(itemData);
  XLSX.utils.book_append_sheet(workbook, itemSheet, "Item Statistics");

  // Sheet 3: Option Statistics
  const optionData = results.optionStatistics.map((opt) => ({
    Question: opt.questionNumber,
    Option: opt.isCorrect ? `${opt.option}*` : opt.option,
    Count: opt.count,
    "Proportion (p_ij)": opt.p_ij.toFixed(3),
    Percentage: `${opt.percentage.toFixed(1)}%`,
    "Discrimination (D_ij)": opt.D_ij.toFixed(3),
    "Point-Biserial (r_pb)": opt.r_pb.toFixed(3),
    "Top group (T1)": opt.T1,
    "Second group (T2)": opt.T2,
    "Third group (T3)": opt.T3,
    "Bottom group (T4)": opt.T4,
    Functional: opt.isFunctional
      ? "Yes"
      : opt.option === "Blank/Other"
      ? "N/A"
      : "No",
  }));
  const optionSheet = XLSX.utils.json_to_sheet(optionData);
  XLSX.utils.book_append_sheet(workbook, optionSheet, "Option Analysis");

  // Sheet 4: Decision Guide
  const guideData = [
    {
      Metric: "Difficulty (p)",
      "Ideal Range": "0.30 - 0.80",
      Interpretation: "Proportion of students answering correctly",
    },
    {
      Metric: "Discrimination (D)",
      "Ideal Range": "≥ 0.20",
      Interpretation: "Difference between top 27% and bottom 27%",
    },
    {
      Metric: "Point-Biserial (r_pb)",
      "Ideal Range": "≥ 0.20",
      Interpretation:
        "Item: correlation between answering correctly and the rest score (total without this item). Option: correlation between choosing that option and the same rest score",
    },
    {
      Metric: "Distractor Efficiency",
      "Ideal Range": "≥ 75%",
      Interpretation:
        "Percentage of distractors (options the key does not accept) selected by ≥5% of all students; N/A when every option is accepted",
    },
    {
      Metric: "Score groups (T1-T4)",
      "Ideal Range": "",
      Interpretation:
        "Top to bottom, nominally a quarter each; equal totals share a group (ties go to the higher group), so groups can be unequal or empty",
    },
    {
      Metric: "Top/bottom 27% (for D)",
      "Ideal Range": "",
      Interpretation: "Fixed size ceil(27% of students); ties are broken by row order; in very small classes the groups can overlap",
    },
    {
      Metric: "KR-20 Reliability",
      "Ideal Range": "≥ 0.70",
      Interpretation: "Internal consistency of test (0.80+ is good)",
    },
    { Metric: "", "Ideal Range": "", Interpretation: "" },
    {
      Metric: "KEEP Decision",
      "Ideal Range": "",
      Interpretation:
        "Good difficulty, discrimination, and distractor efficiency",
    },
    {
      Metric: "REVISE Decision",
      "Ideal Range": "",
      Interpretation: "Too easy/hard, weak discrimination, or poor distractors",
    },
    {
      Metric: "INVESTIGATE Decision",
      "Ideal Range": "",
      Interpretation:
        "Negative discrimination or correlation (possible wrong key)",
    },
  ];
  const guideSheet = XLSX.utils.json_to_sheet(guideData);
  XLSX.utils.book_append_sheet(workbook, guideSheet, "Interpretation Guide");

  // Export workbook
  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, filename);
}

/**
 * Compute average scores per master question (for uncoding)
 */
export function computeAverageResults(
  answersData: ExamRow[],
  itemAnalysisData: ItemAnalysisRow[],
  numQuestions: number
): AverageResult[] {
  const qCols = getAllQuestionCols(answersData).slice(0, numQuestions);

  // Get solution rows and build correct answers map
  const solutions = answersData.filter((row) => isSolutionRow(row));
  if (solutions.length === 0) {
    throw new Error("No solution rows found");
  }

  // Get students (non-solution rows)
  const students = answersData.filter((row) => !isSolutionRow(row));
  if (students.length === 0) {
    throw new Error("No student rows found");
  }

  // Get codes used by students (keep as strings to support alphanumeric codes)
  const usedCodes = Array.from(new Set(students.map((s) => s.Code)));

  debug("Used codes from answers:", usedCodes);
  debug("Item analysis data sample:", itemAnalysisData.slice(0, 5));
  debug("Number of questions:", numQuestions);

  // Build correct answers sets per code
  const correctSets: { [code: string]: AnswerChoice[][] } = {};
  solutions.forEach((sol) => {
    const code = sol.Code;
    if (usedCodes.includes(code)) {
      correctSets[code] = qCols.map((col) => parseSolutionCell(sol[col]));
    }
  });

  // Filter item analysis for used codes only
  // Convert both to strings for comparison to handle mixed types
  const iaUsed = itemAnalysisData.filter(
    (ia) =>
      usedCodes.includes(String(ia.code)) &&
      ia.order >= 1 &&
      ia.order_in_master >= 1
  );

  debug("Filtered item analysis rows:", iaUsed.length);
  debug("Item analysis sample after filter:", iaUsed.slice(0, 10));

  if (iaUsed.length === 0) {
    const availableCodes = Array.from(
      new Set(itemAnalysisData.map((ia) => ia.code))
    );
    throw new Error(
      `No usable rows in item_analysis.csv.\n\n` +
        `Codes in answers file: ${usedCodes.join(", ")}\n` +
        `Codes in item_analysis.csv: ${availableCodes.join(", ")}\n\n` +
        `Make sure the code/version columns match between files.`
    );
  }

  // Create mapping: (code, order) -> order_in_master
  const orderMap: { [key: string]: number } = {};
  // Create reverse mapping: (master_question, code) -> position
  const positionMap: { [key: string]: number } = {};
  iaUsed.forEach((ia) => {
    orderMap[`${ia.code}-${ia.order}`] = ia.order_in_master;
    positionMap[`${ia.order_in_master}-${ia.code}`] = ia.order;
  });

  // Process all student answers
  interface MappedAnswer {
    code: string;
    order: number;
    order_in_master: number;
    answer: string;
    is_correct: number;
  }

  const mappedAnswers: MappedAnswer[] = [];

  students.forEach((student) => {
    const code = student.Code;
    if (!code) return;

    qCols.forEach((col, idx) => {
      const order = idx + 1;
      const orderInMaster = orderMap[`${code}-${order}`];
      if (!orderInMaster) return;

      const answer = student[col];
      if (!answer) return;

      // Check correctness using multi-correct sets
      const correctSet = correctSets[code]?.[idx] || [];
      const isCorrect = correctSet.includes(answer as AnswerChoice) ? 1 : 0;

      mappedAnswers.push({
        code,
        order,
        order_in_master: orderInMaster,
        answer,
        is_correct: isCorrect,
      });
    });
  });

  debug("Total mapped answers:", mappedAnswers.length);

  // Calculate averages per master question and per code
  const masterQuestionScores: { [masterQ: number]: number[] } = {};
  const masterQuestionCodeScores: {
    [masterQ: number]: {
      [code: string]: number[];
    };
  } = {};

  mappedAnswers.forEach((ma) => {
    // Overall scores per master question
    if (!masterQuestionScores[ma.order_in_master]) {
      masterQuestionScores[ma.order_in_master] = [];
    }
    masterQuestionScores[ma.order_in_master].push(ma.is_correct);

    // Per-code scores per master question
    if (!masterQuestionCodeScores[ma.order_in_master]) {
      masterQuestionCodeScores[ma.order_in_master] = {};
    }
    if (!masterQuestionCodeScores[ma.order_in_master][ma.code]) {
      masterQuestionCodeScores[ma.order_in_master][ma.code] = [];
    }
    masterQuestionCodeScores[ma.order_in_master][ma.code].push(ma.is_correct);
  });

  const results: AverageResult[] = [];
  const maxMasterQ = Math.max(
    ...Object.keys(masterQuestionScores).map(Number),
    numQuestions
  );

  for (let masterQ = 1; masterQ <= maxMasterQ; masterQ++) {
    const scores = masterQuestionScores[masterQ] || [];

    // Calculate overall average
    const avg =
      scores.length > 0
        ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
        : 0;

    // Calculate per-code statistics
    const codeStats: { [code: string]: { count: number; average: number } } =
      {};
    const positions: { [code: string]: number } = {};
    const codeScores = masterQuestionCodeScores[masterQ] || {};

    Object.keys(codeScores).forEach((codeStr) => {
      const codeAnswers = codeScores[codeStr];
      const codeAvg =
        codeAnswers.length > 0
          ? (codeAnswers.reduce((a, b) => a + b, 0) / codeAnswers.length) * 100
          : 0;

      codeStats[codeStr] = {
        count: codeAnswers.length,
        average: Math.round(codeAvg * 100) / 100,
      };

      // Get the position of this master question in this code's exam
      const position = positionMap[`${masterQ}-${codeStr}`];
      if (position) {
        positions[codeStr] = position;
      }
    });

    results.push({
      Master_Question: masterQ,
      Average_score: Math.round(avg * 100) / 100,
      codeStats,
      positions,
    });
  }

  return results;
}

/**
 * Compute average scores per code/version (for uncoding)
 */
export function computeCodeAverages(
  answersData: ExamRow[],
  itemAnalysisData: ItemAnalysisRow[],
  numQuestions: number
): CodeAverageResult[] {
  const qCols = getAllQuestionCols(answersData).slice(0, numQuestions);

  // Get solution rows and build correct answers map
  const solutions = answersData.filter((row) => isSolutionRow(row));
  if (solutions.length === 0) {
    throw new Error("No solution rows found");
  }

  // Get students (non-solution rows)
  const students = answersData.filter((row) => !isSolutionRow(row));
  if (students.length === 0) {
    throw new Error("No student rows found");
  }

  // Get codes used by students (keep as strings to support alphanumeric codes)
  const usedCodes = Array.from(new Set(students.map((s) => s.Code))).sort(
    (a, b) => {
      // Sort codes: numeric first (by value), then alphabetic
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;
      return a.localeCompare(b);
    }
  );

  // Build correct answers sets per code
  const correctSets: { [code: string]: AnswerChoice[][] } = {};
  solutions.forEach((sol) => {
    const code = sol.Code;
    if (usedCodes.includes(code)) {
      correctSets[code] = qCols.map((col) => parseSolutionCell(sol[col]));
    }
  });

  // Group scores by code
  const codeScores: { [code: string]: number[] } = {};
  usedCodes.forEach((code) => {
    codeScores[code] = [];
  });

  students.forEach((student) => {
    const code = student.Code;
    if (!code || !usedCodes.includes(code)) return;

    qCols.forEach((col, idx) => {
      const answer = student[col];
      if (!answer) return;

      const correctSet = correctSets[code]?.[idx] || [];
      const isCorrect = correctSet.includes(answer as AnswerChoice) ? 1 : 0;
      codeScores[code].push(isCorrect);
    });
  });

  // Calculate statistics per code
  const results: CodeAverageResult[] = usedCodes.map((code) => {
    const scores = codeScores[code] || [];

    // Calculate average
    const avg =
      scores.length > 0
        ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
        : 0;

    return {
      Code: code,
      Average_score: Math.round(avg * 100) / 100,
    };
  });

  return results;
}

/**
 * Classify students into quartile score groups based on total score
 * T1 = top, T2 = second, T3 = third, T4 = bottom (nominally 25% each).
 * Ties: students with equal totals always share a group; a tie at a cutoff
 * goes to the higher group, so groups can be unequal or empty (P10).
 * Returns the students sorted by total, highest first (stable for ties).
 */
export function classifyStudentsByQuartile(
  results: StudentResult[]
): StudentResultWithRank[] {
  // Filter out solution rows
  // Check if Code is "0", "00", "000" OR ID is "000000000", "0", or empty
  const students = results.filter((r) => {
    const code = String(r.Code || "").trim();
    const id = String(r.ID || "").trim();

    // Exclude if Code is all zeros
    if (/^0+$/.test(code)) {
      return false;
    }

    // Exclude if ID is solution pattern or empty
    if (id === "000000000" || id === "0" || id === "") {
      return false;
    }

    return true;
  });

  // Sort by total score descending (highest scores first)
  const sorted = [...students].sort((a, b) => b.Tot - a.Tot);

  const totalStudents = sorted.length;
  if (totalStudents === 0) return [];

  // Quartile score groups (P10). The nominal ends ceil(25%), ceil(50%) and
  // ceil(75%) of N are computed once; the scores at those positions are the
  // cutoffs. Each student goes to the highest group whose cutoff they reach, so
  // students with equal totals always share a group (a tie block moves up as a
  // whole, even across several cutoffs). Groups can be unequal or empty.
  const cutoff = (fraction: number) => sorted[Math.ceil(totalStudents * fraction) - 1].Tot;
  const [cut1, cut2, cut3] = [cutoff(0.25), cutoff(0.5), cutoff(0.75)];

  // Keep the sorted (stable) order: the 27% D groups rely on it
  return sorted.map((student) => ({
    ...student,
    Rank: student.Tot >= cut1 ? "T1" : student.Tot >= cut2 ? "T2" : student.Tot >= cut3 ? "T3" : "T4",
  }));
}

/**
 * Validate that correct answers from QUESTIONS_MAP match solution rows
 * Returns error message if mismatch found, null otherwise
 */
export function validateCorrectAnswers(
  itemAnalysis: ItemAnalysisRow[],
  examData: ExamRow[]
): string | null {
  // Check if we have permutation data
  const hasPermutation = itemAnalysis.some((ia) => ia.permutation);
  if (!hasPermutation) {
    return null; // No validation needed without permutation data
  }

  // Get solution rows by code
  const solutionRows: { [code: string]: ExamRow } = {};
  examData.forEach((row) => {
    if (isSolutionRow(row)) {
      // Normalize code: trim and convert to string
      const normalizedCode = String(row.Code).trim();
      solutionRows[normalizedCode] = row;
    }
  });

  const errors: string[] = [];
  const skippedCodes = new Set<string>();

  // Debug: log available solution codes
  const availableCodes = Object.keys(solutionRows);
  debug("Available solution codes:", availableCodes);

  // Get unique codes from item analysis
  const itemAnalysisCodes = Array.from(
    new Set(itemAnalysis.map((ia) => String(ia.code).trim()))
  );
  debug("Item analysis codes:", itemAnalysisCodes);

  // For each mapping entry with correct answer
  itemAnalysis.forEach((ia) => {
    if (!ia.correct) return;

    // Normalize code: trim and convert to string
    const code = String(ia.code).trim();
    const solutionRow = solutionRows[code];

    if (!solutionRow) {
      // Skip validation for codes without solution rows (they may be from other exams or unmapped)
      if (!skippedCodes.has(code)) {
        skippedCodes.add(code);
        debug(
          `Skipping validation for code "${code}" - no solution row found. Available codes: ${availableCodes.join(
            ", "
          )}`
        );
      }
      return;
    }

    debug(`Validating code: "${code}"`);

    // Get the answer from solution row at the version question position
    const versionQuestionCol = String(ia.order);
    const solutionAnswer = solutionRow[versionQuestionCol];

    if (!solutionAnswer.includes(ia.correct)) {
      errors.push(
        `Version ${code}, Q${ia.order}: the item analysis file says '${ia.correct}', solution row has '${solutionAnswer}'`
      );
    }
  });

  // Log summary of validation
  if (skippedCodes.size > 0) {
    debug(
      `Validation summary: ${
        skippedCodes.size
      } code(s) skipped (no solution rows): ${Array.from(skippedCodes).join(
        ", "
      )}`
    );
  }
  debug(`Validation summary: ${errors.length} error(s) found`);

  if (errors.length > 0) {
    return `Correct answer mismatch detected:\n${errors.join("\n")}`;
  }

  return null;
}

/**
 * Compute distractor analysis for all master questions
 */
export function computeDistractorAnalysis(
  examData: ExamRow[],
  itemAnalysis: ItemAnalysisRow[],
  rankedStudents: StudentResultWithRank[]
): DistractorAnalysisResult[] {
  // Check if we have permutation data
  const hasPermutation = itemAnalysis.some((ia) => ia.permutation);
  if (!hasPermutation) {
    throw new Error(
      "Distractor analysis requires permutation data in the item analysis file"
    );
  }

  // Create student rank map for quick lookup
  const studentRankMap = new Map<string, "T1" | "T2" | "T3" | "T4">();
  rankedStudents.forEach((s) => {
    studentRankMap.set(s.ID, s.Rank);
  });

  // Get all unique master questions
  const masterQuestions = Array.from(
    new Set(itemAnalysis.map((ia) => ia.order_in_master))
  ).sort((a, b) => a - b);

  // Helper function to decode permutation
  const decodePermutation = (
    studentChoice: string,
    permutation: string
  ): string => {
    if (!studentChoice || !permutation) return "Blank/Other";

    const choices = ["A", "B", "C", "D", "E"];
    const choiceIndex = choices.indexOf(studentChoice.toUpperCase());

    if (choiceIndex === -1) return "Blank/Other";

    const permArray = permutation.toUpperCase().split("");
    if (choiceIndex >= permArray.length) return "Blank/Other";

    return permArray[choiceIndex];
  };

  // Compute distractor analysis for each master question
  const results: DistractorAnalysisResult[] = masterQuestions.map((masterQ) => {
    // Find all versions/mappings for this master question
    const mappings = itemAnalysis.filter(
      (ia) => ia.order_in_master === masterQ
    );

    // Determine the correct answer in master terms
    let masterCorrect: string | null = null;
    for (const mapping of mappings) {
      if (mapping.correct && mapping.permutation) {
        // Find which master option corresponds to the correct answer in this version
        const choices = ["A", "B", "C", "D", "E"];
        const permArray = mapping.permutation.toUpperCase().split("");
        const correctIndex = choices.indexOf(mapping.correct.toUpperCase());
        if (correctIndex !== -1 && correctIndex < permArray.length) {
          masterCorrect = permArray[correctIndex];
          break;
        }
      }
    }

    // Count choices across all students for this master question
    const choiceCounts: {
      [choice: string]: {
        count: number;
        T1: number;
        T2: number;
        T3: number;
        T4: number;
      };
    } = {
      A: { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      B: { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      C: { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      D: { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      E: { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      "Blank/Other": { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
    };

    // Process each student's answer
    const students = examData.filter((row) => !isSolutionRow(row));
    students.forEach((student) => {
      const rank = studentRankMap.get(student.ID);
      if (!rank) return; // Skip if student not ranked

      // Find which version this student took
      const studentCode = String(student.Code);
      const mapping = mappings.find((m) => String(m.code) === studentCode);
      if (!mapping || !mapping.permutation) return;

      // Get student's answer for this question in their version
      const versionQuestionCol = String(mapping.order);
      const studentAnswer = student[versionQuestionCol];

      // Decode to master option
      const masterChoice = decodePermutation(
        studentAnswer,
        mapping.permutation
      );

      // Count the choice
      choiceCounts[masterChoice].count++;
      choiceCounts[masterChoice][rank]++;
    });

    // Calculate total students who answered
    const totalAnswered = Object.values(choiceCounts).reduce(
      (sum, c) => sum + c.count,
      0
    );

    // Convert to result format
    const choices: DistractorChoiceResult[] = [
      "A",
      "B",
      "C",
      "D",
      "E",
      "Blank/Other",
    ].map((choice) => ({
      choice,
      isCorrect: choice === masterCorrect,
      count: choiceCounts[choice].count,
      percentage:
        totalAnswered > 0
          ? Math.round((choiceCounts[choice].count / totalAnswered) * 10000) /
            100
          : 0,
      T1: choiceCounts[choice].T1,
      T2: choiceCounts[choice].T2,
      T3: choiceCounts[choice].T3,
      T4: choiceCounts[choice].T4,
    }));

    return {
      masterQuestion: masterQ,
      choices,
    };
  });

  return results;
}

/**
 * ==========================================================================
 * COMPREHENSIVE ITEM ANALYSIS - Psychometric Calculations
 * ==========================================================================
 */

/**
 * Helper: Decode permutation to get master option from student's answer
 */
function decodePermutation(studentChoice: string, permutation: string): string {
  if (!studentChoice || !permutation) return "Blank/Other";

  const choices = ["A", "B", "C", "D", "E"];
  const choiceIndex = choices.indexOf(studentChoice.toUpperCase());

  if (choiceIndex === -1) return "Blank/Other";

  const permArray = permutation.toUpperCase().split("");
  if (choiceIndex >= permArray.length) return "Blank/Other";

  return permArray[choiceIndex];
}

/**
 * Helper: Calculate mean of array
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Helper: Calculate standard deviation
 */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  const variance = mean(squareDiffs);
  return Math.sqrt(variance);
}

/**
 * Helper: Calculate proportion correct for each item
 * Returns array where index i corresponds to question i (0-indexed)
 */
function calculateItemProportions(
  students: StudentResultWithRank[],
  answersData: ExamRow[],
  qCols: string[],
  correctMap: CorrectAnswersMap
): number[] {
  return qCols.map((qCol, idx) => {
    let correct = 0;
    let total = 0;

    students.forEach((student) => {
      const examRow = answersData.find(
        (row) =>
          row.ID === student.ID &&
          row.Code === student.Code &&
          !isSolutionRow(row)
      );
      if (!examRow) return;

      total++;
      const answer = examRow[qCol];
      const code = String(student.Code);
      const correctAnswers = correctMap[code]?.[idx] || [];

      if (correctAnswers.some((ca) => ca === answer)) {
        correct++;
      }
    });

    return total > 0 ? correct / total : 0;
  });
}

/**
 * Method A: Calculate item difficulty (p-value) for each question
 * p_i = proportion of students answering item i correctly
 */
function computeItemDifficulty(
  students: StudentResultWithRank[],
  answersData: ExamRow[],
  qCols: string[],
  correctMap: CorrectAnswersMap
): number[] {
  return calculateItemProportions(students, answersData, qCols, correctMap);
}

/**
 * Method D: Calculate upper-lower discrimination index (D_i) for each item
 * Uses top 27% and bottom 27% of students
 */
function computeUpperLowerDiscrimination(
  students: StudentResultWithRank[],
  answersData: ExamRow[],
  qCols: string[],
  correctMap: CorrectAnswersMap
): number[] {
  // Sort students by total score
  const sorted = [...students].sort((a, b) => b.Tot - a.Tot);
  const n = sorted.length;
  const cutoff = Math.ceil(n * 0.27);

  const upperGroup = sorted.slice(0, cutoff);
  const lowerGroup = sorted.slice(-cutoff);

  return qCols.map((qCol, idx) => {
    // Count correct in upper group
    let upperCorrect = 0;
    upperGroup.forEach((student) => {
      const examRow = answersData.find(
        (row) =>
          row.ID === student.ID &&
          row.Code === student.Code &&
          !isSolutionRow(row)
      );
      if (!examRow) return;

      const answer = examRow[qCol];
      const code = String(student.Code);
      const correctAnswers = correctMap[code]?.[idx] || [];

      if (correctAnswers.some((ca) => ca === answer)) {
        upperCorrect++;
      }
    });

    // Count correct in lower group
    let lowerCorrect = 0;
    lowerGroup.forEach((student) => {
      const examRow = answersData.find(
        (row) =>
          row.ID === student.ID &&
          row.Code === student.Code &&
          !isSolutionRow(row)
      );
      if (!examRow) return;

      const answer = examRow[qCol];
      const code = String(student.Code);
      const correctAnswers = correctMap[code]?.[idx] || [];

      if (correctAnswers.some((ca) => ca === answer)) {
        lowerCorrect++;
      }
    });

    const pUpper = upperGroup.length > 0 ? upperCorrect / upperGroup.length : 0;
    const pLower = lowerGroup.length > 0 ? lowerCorrect / lowerGroup.length : 0;

    return pUpper - pLower;
  });
}

/**
 * Method F: Calculate point-biserial correlation for each item
 * Uses rest score (total score minus item score) to avoid part-whole inflation
 */
function computeItemPointBiserial(
  students: StudentResultWithRank[],
  answersData: ExamRow[],
  qCols: string[],
  correctMap: CorrectAnswersMap
): number[] {
  return qCols.map((qCol, idx) => {
    // Calculate rest scores for all students
    const dataPoints: { correct: boolean; restScore: number }[] = [];

    students.forEach((student) => {
      const examRow = answersData.find(
        (row) =>
          row.ID === student.ID &&
          row.Code === student.Code &&
          !isSolutionRow(row)
      );
      if (!examRow) return;

      const answer = examRow[qCol];
      const code = String(student.Code);
      const correctAnswers = correctMap[code]?.[idx] || [];
      const isCorrect = correctAnswers.some((ca) => ca === answer);

      // Rest score = total score - this item's score
      const restScore = student.Tot - (isCorrect ? POINTS_PER_Q : 0);

      dataPoints.push({ correct: isCorrect, restScore });
    });

    if (dataPoints.length === 0) return 0;

    // Separate into correct and incorrect groups
    const correctGroup = dataPoints
      .filter((d) => d.correct)
      .map((d) => d.restScore);
    const incorrectGroup = dataPoints
      .filter((d) => !d.correct)
      .map((d) => d.restScore);

    if (correctGroup.length === 0 || incorrectGroup.length === 0) return 0;

    const p = correctGroup.length / dataPoints.length;
    const q = 1 - p;

    const meanCorrect = mean(correctGroup);
    const meanIncorrect = mean(incorrectGroup);
    const allRestScores = dataPoints.map((d) => d.restScore);
    const sd = stdDev(allRestScores);

    if (sd === 0) return 0;

    // Point-biserial formula
    const r_pb = ((meanCorrect - meanIncorrect) / sd) * Math.sqrt(p * q);

    return r_pb;
  });
}

/**
 * Method H: Calculate KR-20 reliability for the test
 */
function computeKR20(
  students: StudentResultWithRank[],
  itemProportions: number[],
  pointsPerQuestion: number = POINTS_PER_Q
): number {
  const k = itemProportions.length;
  // KR-20 needs k >= 2 (k / (k - 1)); the comprehensive preflight rejects K < 2 first (P8)
  if (k < 2) return 0;

  // Calculate variance of number of items correct (not total points)
  // Convert Tot (in points) to number of items correct
  const numCorrectScores = students.map((s) => s.Tot / pointsPerQuestion);
  const varianceTotal = Math.pow(stdDev(numCorrectScores), 2);

  if (varianceTotal === 0) return 0;

  // Sum of p * q for all items
  const sumPQ = itemProportions.reduce((sum, p) => sum + p * (1 - p), 0);

  // KR-20 formula
  const kr20 = (k / (k - 1)) * (1 - sumPQ / varianceTotal);

  return kr20;
}

/** Master-level metadata of one question, the same in every version that has students (P6, P7). */
interface MasterMeta {
  /** Accepted answers in master letters: the working key from the solution rows. */
  accepted: string[];
  /** Number of real options, A..n (the permutation length). */
  options: number;
}

type ChoiceOf = (student: StudentResultWithRank, masterQ: number) => string | null;
type RestScoreOf = (student: StudentResultWithRank, masterQ: number) => number;

/**
 * Method C: Calculate distractor efficiency for each item (P6, P7)
 * Distractors are the real options (A..n) that the working key does not accept;
 * one is functional when at least 5% of all students choose it. DE is null
 * (shown as N/A) when every option is accepted, so there are no distractors.
 */
function computeDistractorEfficiencyPerItem(
  students: StudentResultWithRank[],
  masterQ: number,
  meta: MasterMeta,
  choiceOf: ChoiceOf
): number | null {
  const distractors = "ABCDE".slice(0, meta.options).split("").filter((o) => !meta.accepted.includes(o));
  if (distractors.length === 0) return null;
  const N = students.length;
  if (N === 0) return 0;

  const counts = new Map<string, number>();
  students.forEach((student) => {
    const choice = choiceOf(student, masterQ);
    if (choice !== null) counts.set(choice, (counts.get(choice) ?? 0) + 1);
  });
  const functional = distractors.filter((o) => (counts.get(o) ?? 0) >= N * 0.05).length;
  return (functional / distractors.length) * 100;
}

/**
 * Method I: Determine item decision (Keep/Revise/Investigate)
 * With DE null (no distractors), the distractor criteria are skipped.
 */
function determineItemDecision(
  p_i: number,
  r_pb: number,
  D_i: number,
  DE: number | null
): { decision: "KEEP" | "REVISE" | "INVESTIGATE"; reason: string } {
  // Investigate immediately if r_pb or D_i is negative
  if (r_pb < 0 || D_i < 0) {
    return {
      decision: "INVESTIGATE",
      reason:
        r_pb < 0
          ? "Negative point-biserial (possible wrong key or flawed item)"
          : "Negative discrimination (low scorers outperform high scorers)",
    };
  }

  // Keep if good stats
  if (p_i >= 0.3 && p_i <= 0.8 && r_pb >= 0.2 && (DE === null || DE >= 75)) {
    return {
      decision: "KEEP",
      reason:
        DE === null
          ? "Good difficulty and discrimination (no distractors: every option is accepted)"
          : "Good difficulty, discrimination, and distractor efficiency",
    };
  }

  // Revise if any issues
  const reasons: string[] = [];

  if (p_i > 0.8 && DE !== null && DE <= 50) {
    reasons.push("Too easy with weak distractors");
  } else if (p_i > 0.8) {
    reasons.push("Too easy");
  }

  if (p_i < 0.3) {
    reasons.push("Too difficult");
  }

  if (r_pb < 0.2) {
    reasons.push("Weak discrimination");
  }

  if (DE !== null && DE < 75) {
    reasons.push("Poor distractor efficiency");
  }

  if (reasons.length > 0) {
    return {
      decision: "REVISE",
      reason: reasons.join("; "),
    };
  }

  return {
    decision: "KEEP",
    reason: "Acceptable performance",
  };
}

/**
 * Method E & G: Calculate option-level statistics (D_ij and r_pb for each option)
 * For a specific master question. Options are the real ones, A..n, plus
 * Blank/Other (a blank, an invalid mark or a letter beyond n). An option is
 * correct when the working key accepts it (P6). Option r_pb correlates choosing
 * the option with the item's rest score R = total - points x (item correct),
 * the same R as the item r_pb (P9).
 */
function computeOptionStatistics(
  students: StudentResultWithRank[],
  masterQ: number,
  meta: MasterMeta,
  choiceOf: ChoiceOf,
  restScoreOf: RestScoreOf
): import("@/types/exam").OptionStatistics[] {
  const N = students.length;
  if (N === 0) return [];

  const options = [..."ABCDE".slice(0, meta.options).split(""), "Blank/Other"];
  const keyOf = (s: StudentResultWithRank) => `${s.Code}\u0000${s.ID}`;
  const optionData = new Map(
    options.map((o) => [o, { count: 0, T1: 0, T2: 0, T3: 0, T4: 0, selected: new Set<string>() }])
  );

  // Count selections
  students.forEach((student) => {
    const choice = choiceOf(student, masterQ);
    if (choice === null) return;
    const data = optionData.get(options.includes(choice) ? choice : "Blank/Other")!;
    data.count++;
    data[student.Rank]++;
    data.selected.add(keyOf(student));
  });

  // Upper-lower groups (27%), stable order on ties
  const sorted = [...students].sort((a, b) => b.Tot - a.Tot);
  const cutoff = Math.ceil(sorted.length * 0.27);
  const upperGroup = new Set(sorted.slice(0, cutoff).map(keyOf));
  const lowerGroup = new Set(sorted.slice(-cutoff).map(keyOf));

  const totalAnswered = [...optionData.values()].reduce((sum, d) => sum + d.count, 0);

  // The item's rest score for every student (P9)
  const rest = students.map((s) => restScoreOf(s, masterQ));
  const sdRest = stdDev(rest);

  return options.map((option) => {
    const data = optionData.get(option)!;
    const p_ij = totalAnswered > 0 ? data.count / totalAnswered : 0;

    // D_ij: upper-lower discrimination for this option
    const upperSelected = [...data.selected].filter((k) => upperGroup.has(k)).length;
    const lowerSelected = [...data.selected].filter((k) => lowerGroup.has(k)).length;
    const pUpper = upperGroup.size > 0 ? upperSelected / upperGroup.size : 0;
    const pLower = lowerGroup.size > 0 ? lowerSelected / lowerGroup.size : 0;
    const D_ij = pUpper - pLower;

    // r_pb: choosing this option against the item's rest score (0 when either is constant)
    let r_pb = 0;
    const k = data.selected.size;
    if (k > 0 && k < N && sdRest > 0) {
      const chose = students.map((s) => data.selected.has(keyOf(s)));
      const meanChose = mean(rest.filter((_, i) => chose[i]));
      const meanOther = mean(rest.filter((_, i) => !chose[i]));
      const p = k / N;
      r_pb = ((meanChose - meanOther) / sdRest) * Math.sqrt(p * (1 - p));
    }

    const isCorrect = meta.accepted.includes(option);
    const isFunctional = option !== "Blank/Other" && !isCorrect && p_ij >= 0.05;

    return {
      questionNumber: masterQ,
      option,
      isCorrect,
      p_ij,
      D_ij,
      r_pb,
      count: data.count,
      percentage: totalAnswered > 0 ? (data.count / totalAnswered) * 100 : 0,
      T1: data.T1,
      T2: data.T2,
      T3: data.T3,
      T4: data.T4,
      isFunctional,
    };
  });
}

/**
 * Put every answer in MASTER question order before the comprehensive analysis
 * (fix for P2: item statistics used to be computed per version position).
 *
 * First checks, for every version that has students:
 * - the exam has at least 2 questions (P8);
 * - the item-analysis rows map master questions 1..K one-to-one onto positions
 *   1..K, each with a valid option permutation (A..n, 2 <= n <= 5) and a single
 *   correct letter that the version's solution row accepts;
 * - the solution rows exist, agree, and accept only real options;
 * - every student row has every mapped question.
 * Across those versions, each master question must have the same number of
 * options and the same accepted answers in master letters (P6, P7): the
 * comprehensive report pools versions, so it needs one key per question.
 * Throws a clear error otherwise, rather than producing a partial or mixed report.
 *
 * Returns copies (the inputs are not modified; row order is kept):
 * - rows: in each mapped version, column "m" holds the answer to master
 *   question m. Solution rows are reordered the same way and keep their full
 *   accepted-answer cell. Answer letters stay version letters.
 * - mappings: order := order_in_master. Option permutations are unchanged.
 * - masters: per master question (index m - 1), its accepted answers and option count.
 */
function projectToMasterOrder(
  answersData: ExamRow[],
  itemAnalysisData: ItemAnalysisRow[],
  K: number
): { rows: ExamRow[]; mappings: ItemAnalysisRow[]; masters: MasterMeta[] } {
  const fail = (message: string): never => {
    throw new Error(`Comprehensive analysis cannot run: ${message}`);
  };
  const codeOf = (value: unknown) => String(value ?? "").trim();
  const LETTERS = "ABCDE";

  if (!Number.isInteger(K) || K < 2) {
    fail(`it needs at least 2 questions (found ${K}). With one question, item statistics and KR-20 are not defined.`);
  }

  const studentRows = answersData.filter((row) => !isSolutionRow(row));
  const solutionRows = answersData.filter((row) => isSolutionRow(row));
  if (studentRows.length === 0) fail("the student file has no students.");

  // The per-item helpers look students up by (ID, Code), so each pair must be unique
  const seen = new Set<string>();
  for (const row of studentRows) {
    const key = `${codeOf(row.Code)}\u0000${codeOf(row.ID)}`;
    if (seen.has(key)) {
      fail(`student ID "${codeOf(row.ID)}" appears more than once in version ${codeOf(row.Code)}.`);
    }
    seen.add(key);
  }

  const activeCodes = Array.from(new Set(studentRows.map((row) => codeOf(row.Code))));
  const positionsByCode = new Map<string, Map<number, number>>(); // code -> master -> position
  const masterMeta = new Map<number, MasterMeta & { key: string; code: string }>();

  for (const code of activeCodes) {
    const solutions = solutionRows.filter((row) => codeOf(row.Code) === code);
    if (solutions.length === 0) fail(`version ${code} has students but no solution row.`);

    const entries = itemAnalysisData.filter((ia) => codeOf(ia.code) === code);
    if (entries.length === 0) fail(`the item analysis file has no entries for version ${code}.`);

    const byMaster = new Map<number, number>();
    const byPosition = new Map<number, number>();
    const mapping = new Map<number, { perm: string; correct: string }>();
    for (const ia of entries) {
      const master = Number(ia.order_in_master);
      const position = Number(ia.order);
      if (!Number.isInteger(master) || master < 1 || master > K) {
        fail(`version ${code}: master question "${ia.order_in_master}" is not a whole number from 1 to ${K}.`);
      }
      if (!Number.isInteger(position) || position < 1 || position > K) {
        fail(`version ${code}, master Q${master}: position "${ia.order}" is not a whole number from 1 to ${K}.`);
      }
      if (byMaster.has(master)) fail(`version ${code}: master Q${master} is listed more than once.`);
      if (byPosition.has(position)) {
        fail(`version ${code}: position ${position} is given to both master Q${byPosition.get(position)} and master Q${master}.`);
      }
      byMaster.set(master, position);
      byPosition.set(position, master);

      const perm = String(ia.permutation ?? "").trim().toUpperCase();
      const n = perm.length;
      if (n < 2 || n > 5 || perm.split("").sort().join("") !== LETTERS.slice(0, n)) {
        fail(`version ${code}, master Q${master}: the option permutation "${ia.permutation ?? ""}" is missing or invalid.`);
      }
      const correct = String(ia.correct ?? "").trim().toUpperCase();
      if (correct.length > 1) {
        fail(
          `version ${code}, master Q${master}: the item analysis "Correct" value "${ia.correct}" must be one option letter; multiple accepted answers belong in the solution row.`
        );
      }
      const index = LETTERS.indexOf(correct);
      if (correct.length !== 1 || index < 0 || index >= n) {
        fail(`version ${code}, master Q${master}: the correct answer "${ia.correct ?? ""}" is missing or not one of its ${n} options.`);
      }
      mapping.set(master, { perm, correct });
    }

    for (let m = 1; m <= K; m++) {
      if (!byMaster.has(m)) fail(`version ${code} has no position for master Q${m}.`);
    }

    // Every row of this version must have every mapped question; an empty cell
    // ("") is a blank answer, a missing value is missing data
    for (let p = 1; p <= K; p++) {
      const col = String(p);
      solutions.forEach((sol) => {
        if (sol[col] === undefined || sol[col] === null) fail(`version ${code}: the solution row has no question ${p}.`);
      });
      if (solutions.length > 1) {
        const keyOf = (sol: ExamRow) => [...parseSolutionCell(String(sol[col]))].sort().join("");
        if (solutions.some((sol) => keyOf(sol) !== keyOf(solutions[0]))) {
          fail(`version ${code} has ${solutions.length} solution rows with different answers for question ${p}.`);
        }
      }
    }
    for (const row of studentRows) {
      if (codeOf(row.Code) !== code) continue;
      for (let p = 1; p <= K; p++) {
        const value = row[String(p)];
        if (value === undefined || value === null) {
          fail(`version ${code}: student "${codeOf(row.ID)}" has no value for question ${p} (a blank answer is an empty cell).`);
        }
        // Grading counts only the first letter of a compound mark such as "AB", while the item
        // statistics compare whole answers; the two would disagree (011 D4)
        const answer = String(value).trim();
        if (answer.length > 1) {
          fail(
            `version ${code}: student "${codeOf(row.ID)}" has "${answer}" for question ${p}. The comprehensive analysis needs one response per question; correct the mark in the student file.`
          );
        }
      }
    }

    // The working key of every master question, in master letters (P6, P7)
    for (let m = 1; m <= K; m++) {
      const p = byMaster.get(m)!;
      const { perm, correct } = mapping.get(m)!;
      const n = perm.length;
      const cell = String(solutions[0][String(p)] ?? "").trim();
      const accepted = Array.from(new Set(parseSolutionCell(cell)));
      if (accepted.length === 0) {
        fail(`version ${code}, master Q${m}: the solution row has no answer for question ${p}.`);
      }
      for (const letter of accepted) {
        if (LETTERS.indexOf(letter) >= n) {
          fail(`version ${code}, master Q${m}: the solution row accepts "${letter}", which is not one of its ${n} options.`);
        }
      }
      if (!accepted.includes(correct as AnswerChoice)) {
        fail(`version ${code}, master Q${m}: the item analysis file's correct answer "${correct}" is not accepted by the solution row ("${cell}").`);
      }
      const masterAccepted = accepted.map((letter) => perm[LETTERS.indexOf(letter)]).sort();
      const key = masterAccepted.join("");
      const known = masterMeta.get(m);
      if (known && known.options !== n) {
        fail(`master Q${m}: versions ${known.code} and ${code} give it different numbers of options (${known.options} and ${n}).`);
      }
      if (known && known.key !== key) {
        fail(
          `master Q${m}: versions ${known.code} and ${code} accept different answers (master options ${known.key} and ${key}). Make the answer keys agree in Step 2, or analyse those versions separately.`
        );
      }
      masterMeta.set(m, { accepted: masterAccepted, options: n, key, code });
    }
    positionsByCode.set(code, byMaster);
  }

  // Copies with the codes, permutations and correct letters exactly as checked,
  // so every downstream helper matches them the same way
  const rows = answersData.map((row) => {
    const out: ExamRow = { ...row, Code: codeOf(row.Code) };
    const byMaster = positionsByCode.get(codeOf(row.Code));
    if (byMaster) {
      for (let m = 1; m <= K; m++) out[String(m)] = row[String(byMaster.get(m))];
    }
    return out;
  });
  const mappings = itemAnalysisData.map((ia) => ({
    ...ia,
    code: codeOf(ia.code),
    order: ia.order_in_master,
    ...(ia.permutation !== undefined ? { permutation: String(ia.permutation).trim().toUpperCase() } : {}),
    ...(ia.correct !== undefined ? { correct: String(ia.correct).trim().toUpperCase() } : {}),
  }));
  const masters = Array.from({ length: K }, (_, i) => {
    const { accepted, options } = masterMeta.get(i + 1)!;
    return { accepted, options };
  });
  return { rows, mappings, masters };
}

/**
 * Main orchestrator: Compute comprehensive item analysis
 * This is the main exported function that the UI will call.
 * All item statistics are per MASTER question (see projectToMasterOrder).
 */
export function computeComprehensiveItemAnalysis(
  originalAnswersData: ExamRow[],
  originalItemAnalysisData: ItemAnalysisRow[],
  numQuestions: number
): import("@/types/exam").ComprehensiveItemAnalysisResult {
  const { rows: answersData, mappings: itemAnalysisData, masters } = projectToMasterOrder(
    originalAnswersData,
    originalItemAnalysisData,
    numQuestions
  );

  // Get question columns and correct answers map (now in master order)
  const qCols = getAllQuestionCols(answersData).slice(0, numQuestions);
  const correctMap = buildCorrectAnswersMap(answersData, qCols);

  // Get student results with scores (always use POINTS_PER_Q for consistency)
  const studentResults = computeResults(answersData, qCols, correctMap);

  // Classify students into quartiles
  const rankedStudents = classifyStudentsByQuartile(studentResults);

  // Lookups for the option-level helpers
  const pairKey = (a: unknown, b: unknown) => `${a}\u0000${b}`;
  const rowByStudent = new Map(
    answersData.filter((row) => !isSolutionRow(row)).map((row) => [pairKey(row.Code, row.ID), row])
  );
  const mappingByMaster = new Map(itemAnalysisData.map((ia) => [pairKey(ia.code, ia.order_in_master), ia]));
  /** The student's choice on master question m, as a master letter (or Blank/Other). */
  const choiceOf: ChoiceOf = (student, m) => {
    const row = rowByStudent.get(pairKey(student.Code, student.ID));
    const mapping = mappingByMaster.get(pairKey(student.Code, m));
    if (!row || !mapping?.permutation) return null;
    return decodePermutation(String(row[String(mapping.order)] ?? ""), mapping.permutation);
  };
  /** Total score minus this item's points, under the full working key (P9). */
  const restScoreOf: RestScoreOf = (student, m) => {
    const answer = rowByStudent.get(pairKey(student.Code, student.ID))?.[String(m)];
    const accepted = correctMap[String(student.Code)]?.[m - 1] ?? [];
    return student.Tot - (accepted.some((ca) => ca === answer) ? POINTS_PER_Q : 0);
  };

  // Calculate item-level metrics
  const itemProportions = computeItemDifficulty(
    rankedStudents,
    answersData,
    qCols,
    correctMap
  );
  const discriminationIndices = computeUpperLowerDiscrimination(
    rankedStudents,
    answersData,
    qCols,
    correctMap
  );
  const pointBiserials = computeItemPointBiserial(
    rankedStudents,
    answersData,
    qCols,
    correctMap
  );

  // Calculate KR-20 (always use POINTS_PER_Q to convert scores to number of items correct)
  const kr20 = computeKR20(rankedStudents, itemProportions, POINTS_PER_Q);

  // Build item statistics
  const itemStatistics: import("@/types/exam").ItemStatistics[] = [];
  const allOptionStatistics: import("@/types/exam").OptionStatistics[] = [];

  for (let i = 0; i < numQuestions; i++) {
    const masterQ = i + 1;
    const p_i = itemProportions[i];
    const D_i = discriminationIndices[i];
    const r_pb = pointBiserials[i];

    // Calculate distractor efficiency for this item (null when there are no distractors)
    const DE = computeDistractorEfficiencyPerItem(rankedStudents, masterQ, masters[i], choiceOf);

    // Determine decision
    const { decision, reason } = determineItemDecision(p_i, r_pb, D_i, DE);

    itemStatistics.push({
      questionNumber: masterQ,
      p_i,
      D_i,
      r_pb,
      DE,
      decision,
      decisionReason: reason,
    });

    // Compute option-level statistics
    allOptionStatistics.push(...computeOptionStatistics(rankedStudents, masterQ, masters[i], choiceOf, restScoreOf));
  }

  // Calculate test summary
  const totalScores = rankedStudents.map((s) => s.Tot);
  const testSummary: import("@/types/exam").TestSummary = {
    totalItems: numQuestions,
    totalStudents: rankedStudents.length,
    meanScore: mean(totalScores),
    stdDevScore: stdDev(totalScores),
    meanDifficulty: mean(itemProportions),
    meanDiscrimination: mean(discriminationIndices),
    KR20: kr20,
    itemsToKeep: itemStatistics.filter((s) => s.decision === "KEEP").length,
    itemsToRevise: itemStatistics.filter((s) => s.decision === "REVISE").length,
    itemsToInvestigate: itemStatistics.filter(
      (s) => s.decision === "INVESTIGATE"
    ).length,
  };

  return {
    testSummary,
    itemStatistics,
    optionStatistics: allOptionStatistics,
  };
}
