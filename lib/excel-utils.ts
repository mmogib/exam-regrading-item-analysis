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
        const workbook = XLSX.read(text, { type: "string" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        // Detect format
        const detection = detectCSVFormat(jsonData);
        resolve(detection);
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
 * Detect CSV format by examining column names
 */
function detectCSVFormat(data: any[]): CSVDetectionResult {
  if (data.length === 0) {
    return { format: "UNKNOWN", columns: [], data };
  }

  const firstRow = data[0];
  const columns = Object.keys(firstRow);

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

  const hasVersionPairs = columns.some((col) => {
    const lower = col.toLowerCase().replace(/[_\s]/g, "");
    return /version\d+q/.test(lower) || /v\d+q/.test(lower);
  });

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

/**
 * Parse WIDE format CSV (one row per option per master question)
 * Converts to ItemAnalysisRow[] format with permutation strings
 * EXPORTED for use in Step 3
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

  // Extract version information from column names
  // Pattern: version_X_Q and version_X_Opt (or v_X_Q and v_X_Opt)
  const versionPattern = /(?:version|v)[_\s]*(\d+)[_\s]*(?:q|opt)/i;
  const versionNumbers = new Set<number>();
  const versionColumns: {
    [version: number]: { qCol: string; optCol: string };
  } = {};

  columns.forEach((col) => {
    const match = col.match(versionPattern);
    if (match) {
      const versionNum = parseInt(match[1]);
      versionNumbers.add(versionNum);

      if (!versionColumns[versionNum]) {
        versionColumns[versionNum] = { qCol: "", optCol: "" };
      }

      const lower = col.toLowerCase();
      if (lower.includes("_q") || lower.endsWith("q")) {
        versionColumns[versionNum].qCol = col;
      } else if (lower.includes("opt")) {
        versionColumns[versionNum].optCol = col;
      }
    }
  });

  // Sort version numbers and validate they're sequential
  const sortedVersions = Array.from(versionNumbers).sort((a, b) => a - b);

  if (sortedVersions.length === 0) {
    throw new Error("No version columns found in WIDE format");
  }

  // Validate sequential
  const startVersion = sortedVersions[0];
  for (let i = 0; i < sortedVersions.length; i++) {
    if (sortedVersions[i] !== startVersion + i) {
      throw new Error(
        `Version numbers must be sequential. Found: ${sortedVersions.join(
          ", "
        )}. ` +
          `Please ensure versions are numbered sequentially (e.g., 1,2,3,4 or 5,6,7,8).`
      );
    }
  }

  debug("Detected versions:", sortedVersions);

  // Group rows by master question
  const questionGroups: { [masterQ: number]: any[] } = {};
  data.forEach((row) => {
    const masterQ = parseInt(String(row[qCol]));
    if (!isNaN(masterQ)) {
      if (!questionGroups[masterQ]) {
        questionGroups[masterQ] = [];
      }
      questionGroups[masterQ].push(row);
    }
  });

  // Process each master question
  const result: ItemAnalysisRow[] = [];
  const masterQuestions = Object.keys(questionGroups)
    .map(Number)
    .sort((a, b) => a - b);
  debug("Detected questionGroups:", questionGroups);
  debug("Detected masterQuestions:", masterQuestions);
  masterQuestions.forEach((masterQ) => {
    const optionRows = questionGroups[masterQ];

    // Get all options for this question (A, B, C, D, E or fewer)
    const masterOptions: { [opt: string]: any } = {};
    let correctOption: string | null = null;

    optionRows.forEach((row) => {
      const opt = String(row[optCol]).trim().toUpperCase();
      masterOptions[opt] = row;

      // Check if this is the correct answer
      const isCorrect = String(row[correctCol]).trim().toUpperCase();
      if (
        isCorrect === "YES" ||
        isCorrect === "Y" ||
        isCorrect === "TRUE" ||
        isCorrect === "1"
      ) {
        correctOption = opt;
      }
    });
    // Process each version
    sortedVersions.forEach((versionNum) => {
      const { qCol: vQCol, optCol: vOptCol } = versionColumns[versionNum];

      if (!vQCol || !vOptCol) {
        debug(`Warning: Missing columns for version ${versionNum}`);
        return;
      }

      // Get question position for this version (from first option row)
      const firstRow = optionRows[0];
      const questionPosition = parseInt(String(firstRow[vQCol]));

      if (isNaN(questionPosition)) {
        return; // Skip if no valid position
      }

      // Build permutation string
      // Map master option (A-E) to version option (A-E)
      // Start with identity: A→A, B→B, C→C, D→D, E→E
      const permutationMap: { [masterOpt: string]: string } = {
        A: "A",
        B: "B",
        C: "C",
        D: "D",
        E: "E",
      };

      // Update mapping based on actual options in this question
      Object.keys(masterOptions).forEach((masterOpt) => {
        const row = masterOptions[masterOpt];
        const versionOpt = String(row[vOptCol]).trim().toUpperCase();
        if (versionOpt && /^[A-E]$/.test(versionOpt)) {
          permutationMap[versionOpt] = masterOpt;
        }
      });

      // Build permutation string: ABCDE → e.g., "BACDE" if A↔B swapped
      const permutation =
        permutationMap["A"] +
        permutationMap["B"] +
        permutationMap["C"] +
        permutationMap["D"] +
        permutationMap["E"];

      // Determine correct answer in this version
      let versionCorrect: string | undefined = undefined;
      if (correctOption) {
        versionCorrect = Object.keys(permutationMap).find(
          (key) => permutationMap[key] === correctOption
        );
        // versionCorrect = permutationMap[correctOption];
      }

      // Create ItemAnalysisRow
      result.push({
        code: versionNum,
        order: questionPosition,
        order_in_master: masterQ,
        permutation: permutation,
        correct: versionCorrect,
      });
    });
  });

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

      // Parse flexibly - handle strings and numbers
      // For code: try to parse as number, but keep as string if it's alphanumeric
      let code: string | number;
      if (typeof codeRaw === "number") {
        code = codeRaw;
      } else {
        const parsed = parseInt(String(codeRaw));
        code = isNaN(parsed) ? String(codeRaw).trim() : parsed;
      }

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
          revised[col] = letters.length > 0 ? letters.sort().join("") : "";
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
    "Distractor Efficiency (%)": item.DE.toFixed(1),
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
    "Top 25% (T1)": opt.T1,
    "Second 25% (T2)": opt.T2,
    "Third 25% (T3)": opt.T3,
    "Bottom 25% (T4)": opt.T4,
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
      Interpretation: "Correlation with rest score (corrected for item)",
    },
    {
      Metric: "Distractor Efficiency",
      "Ideal Range": "≥ 75%",
      Interpretation: "Percentage of distractors selected by ≥5% of students",
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
 * Classify students into quartiles based on total score
 * T1 = Top 25%, T2 = Second 25%, T3 = Third 25%, T4 = Bottom 25%
 * Handles ties at boundaries by assigning to the higher quartile
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

  // Calculate quartile boundaries
  const q1End = Math.ceil(totalStudents * 0.25);
  const q2End = Math.ceil(totalStudents * 0.5);
  const q3End = Math.ceil(totalStudents * 0.75);

  // Assign ranks with tie handling
  const ranked: StudentResultWithRank[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const student = sorted[i];
    let rank: "T1" | "T2" | "T3" | "T4";

    // Handle ties at boundaries by checking the score
    if (i < q1End) {
      rank = "T1";
    } else if (i === q1End && sorted[i].Tot === sorted[q1End - 1].Tot) {
      // Tie at T1/T2 boundary - assign to T1
      rank = "T1";
    } else if (i < q2End) {
      rank = "T2";
    } else if (i === q2End && sorted[i].Tot === sorted[q2End - 1].Tot) {
      // Tie at T2/T3 boundary - assign to T2
      rank = "T2";
    } else if (i < q3End) {
      rank = "T3";
    } else if (i === q3End && sorted[i].Tot === sorted[q3End - 1].Tot) {
      // Tie at T3/T4 boundary - assign to T3
      rank = "T3";
    } else {
      rank = "T4";
    }

    ranked.push({
      ...student,
      Rank: rank,
    });
  }

  return ranked;
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
        `Version ${code}, Q${ia.order}: QUESTIONS_MAP says '${ia.correct}', solution row has '${solutionAnswer}'`
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
  if (k === 0) return 0;

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

/**
 * Method C: Calculate distractor efficiency for each item
 * Requires permutation data to decode options
 */
function computeDistractorEfficiencyPerItem(
  students: StudentResultWithRank[],
  answersData: ExamRow[],
  itemAnalysis: ItemAnalysisRow[],
  masterQ: number
): number {
  const N = students.length;
  if (N === 0) return 0;

  // Get mappings for this master question
  const mappings = itemAnalysis.filter((ia) => ia.order_in_master === masterQ);
  if (mappings.length === 0) return 0;

  // Count how many students selected each option
  const optionCounts: { [option: string]: number } = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
  };

  students.forEach((student) => {
    const studentCode = String(student.Code);
    const mapping = mappings.find((m) => String(m.code) === studentCode);
    if (!mapping || !mapping.permutation) return;

    const examRow = answersData.find(
      (row) =>
        row.ID === student.ID &&
        row.Code === student.Code &&
        !isSolutionRow(row)
    );
    if (!examRow) return;

    const versionQuestionCol = String(mapping.order);
    const studentAnswer = examRow[versionQuestionCol];

    // Decode to master option
    const masterChoice = decodePermutation(studentAnswer, mapping.permutation);
    if (
      masterChoice &&
      masterChoice !== "Blank/Other" &&
      optionCounts[masterChoice] !== undefined
    ) {
      optionCounts[masterChoice]++;
    }
  });

  // Get correct answer in master terms by decoding through permutation
  let masterCorrect: string = "A";
  for (const mapping of mappings) {
    if (mapping.correct && mapping.permutation) {
      const choices = ["A", "B", "C", "D", "E"];
      const permArray = mapping.permutation.toUpperCase().split("");
      const correctIndex = choices.indexOf(mapping.correct.toUpperCase());
      if (correctIndex !== -1 && correctIndex < permArray.length) {
        masterCorrect = permArray[correctIndex];
        break;
      }
    }
  }

  // Count functional distractors (those selected by >= 5% of students)
  let functionalCount = 0;
  const threshold = N * 0.05;

  ["A", "B", "C", "D", "E"].forEach((option) => {
    if (option !== masterCorrect && optionCounts[option] >= threshold) {
      functionalCount++;
    }
  });

  // DE = (functional distractors / total distractors) * 100
  const totalDistractors = 4; // For 5-option questions
  const DE = (functionalCount / totalDistractors) * 100;

  return DE;
}

/**
 * Method I: Determine item decision (Keep/Revise/Investigate)
 */
function determineItemDecision(
  p_i: number,
  r_pb: number,
  D_i: number,
  DE: number
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
  if (p_i >= 0.3 && p_i <= 0.8 && r_pb >= 0.2 && DE >= 75) {
    return {
      decision: "KEEP",
      reason: "Good difficulty, discrimination, and distractor efficiency",
    };
  }

  // Revise if any issues
  const reasons: string[] = [];

  if (p_i > 0.8 && DE <= 50) {
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

  if (DE < 75) {
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
 * For a specific master question
 */
function computeOptionStatistics(
  students: StudentResultWithRank[],
  answersData: ExamRow[],
  itemAnalysis: ItemAnalysisRow[],
  masterQ: number
): import("@/types/exam").OptionStatistics[] {
  const N = students.length;
  if (N === 0) return [];

  // Get mappings for this master question
  const mappings = itemAnalysis.filter((ia) => ia.order_in_master === masterQ);
  if (mappings.length === 0) return [];

  // Determine the correct answer in master terms by decoding through permutation
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

  if (!masterCorrect) {
    masterCorrect = "A"; // Fallback
  }

  // Initialize option counts and quartile counts
  const optionData: {
    [option: string]: {
      count: number;
      T1: number;
      T2: number;
      T3: number;
      T4: number;
      studentsWhoSelected: StudentResultWithRank[];
    };
  } = {};

  ["A", "B", "C", "D", "E", "Blank/Other"].forEach((opt) => {
    optionData[opt] = {
      count: 0,
      T1: 0,
      T2: 0,
      T3: 0,
      T4: 0,
      studentsWhoSelected: [],
    };
  });

  // Count selections
  students.forEach((student) => {
    const studentCode = String(student.Code);
    const mapping = mappings.find((m) => String(m.code) === studentCode);
    if (!mapping || !mapping.permutation) return;

    const examRow = answersData.find(
      (row) =>
        row.ID === student.ID &&
        row.Code === student.Code &&
        !isSolutionRow(row)
    );
    if (!examRow) return;

    const versionQuestionCol = String(mapping.order);
    const studentAnswer = examRow[versionQuestionCol];

    // Decode to master option
    const masterChoice = decodePermutation(studentAnswer, mapping.permutation);

    if (optionData[masterChoice]) {
      optionData[masterChoice].count++;
      optionData[masterChoice][student.Rank]++;
      optionData[masterChoice].studentsWhoSelected.push(student);
    }
  });

  // Calculate upper-lower groups (27%)
  const sorted = [...students].sort((a, b) => b.Tot - a.Tot);
  const n = sorted.length;
  const cutoff = Math.ceil(n * 0.27);
  const upperGroup = sorted.slice(0, cutoff);
  const lowerGroup = sorted.slice(-cutoff);

  const totalAnswered = Object.values(optionData).reduce(
    (sum, d) => sum + d.count,
    0
  );

  // Build result for each option
  return ["A", "B", "C", "D", "E", "Blank/Other"].map((option) => {
    const data = optionData[option];
    const p_ij = totalAnswered > 0 ? data.count / totalAnswered : 0;

    // Calculate D_ij (upper-lower discrimination for this option)
    const upperSelected = data.studentsWhoSelected.filter((s) =>
      upperGroup.some((u) => u.ID === s.ID && u.Code === s.Code)
    ).length;
    const lowerSelected = data.studentsWhoSelected.filter((s) =>
      lowerGroup.some((l) => l.ID === s.ID && l.Code === s.Code)
    ).length;

    const pUpper =
      upperGroup.length > 0 ? upperSelected / upperGroup.length : 0;
    const pLower =
      lowerGroup.length > 0 ? lowerSelected / lowerGroup.length : 0;
    const D_ij = pUpper - pLower;

    // Calculate r_pb for this option (point-biserial with rest score)
    let r_pb = 0;
    if (
      data.studentsWhoSelected.length > 0 &&
      data.studentsWhoSelected.length < students.length
    ) {
      const restScoresSelected = data.studentsWhoSelected.map((s) => {
        // Rest score = total score (we don't subtract this option since we're measuring option selection, not correctness)
        return s.Tot;
      });
      const restScoresNotSelected = students
        .filter(
          (s) =>
            !data.studentsWhoSelected.some(
              (sel) => sel.ID === s.ID && sel.Code === s.Code
            )
        )
        .map((s) => s.Tot);

      const meanSelected = mean(restScoresSelected);
      const meanNotSelected = mean(restScoresNotSelected);
      const allScores = students.map((s) => s.Tot);
      const sd = stdDev(allScores);

      const p = data.studentsWhoSelected.length / students.length;
      const q = 1 - p;

      if (sd > 0) {
        r_pb = ((meanSelected - meanNotSelected) / sd) * Math.sqrt(p * q);
      }
    }

    const isFunctional =
      option !== "Blank/Other" && option !== masterCorrect && p_ij >= 0.05;

    return {
      questionNumber: masterQ,
      option,
      isCorrect: option === masterCorrect,
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
 * Main orchestrator: Compute comprehensive item analysis
 * This is the main exported function that the UI will call
 */
export function computeComprehensiveItemAnalysis(
  answersData: ExamRow[],
  itemAnalysisData: ItemAnalysisRow[],
  numQuestions: number
): import("@/types/exam").ComprehensiveItemAnalysisResult {
  // Get question columns and correct answers map
  const qCols = getAllQuestionCols(answersData).slice(0, numQuestions);
  const correctMap = buildCorrectAnswersMap(answersData, qCols);

  // Get student results with scores (always use POINTS_PER_Q for consistency)
  const studentResults = computeResults(answersData, qCols, correctMap);

  // Classify students into quartiles
  const rankedStudents = classifyStudentsByQuartile(studentResults);

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

    // Calculate distractor efficiency for this item
    const DE = computeDistractorEfficiencyPerItem(
      rankedStudents,
      answersData,
      itemAnalysisData,
      masterQ
    );

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
    const optionStats = computeOptionStatistics(
      rankedStudents,
      answersData,
      itemAnalysisData,
      masterQ
    );
    allOptionStatistics.push(...optionStats);
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
