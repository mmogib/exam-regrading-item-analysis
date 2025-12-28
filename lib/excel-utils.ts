import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
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
  SOLUTION_ID,
  SOLUTION_SECTION,
  ANS_CHOICES,
  POINTS_PER_Q,
  AnswerChoice,
  CSVDetectionResult,
  ColumnMapping
} from '@/types/exam';
import { debug, error as logError } from './logger';

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
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get the original column order from the sheet's range
        const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
        const headers: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
          const cell = firstSheet[cellAddress];
          if (cell && cell.v) {
            headers.push(String(cell.v));
          }
        }
        originalColumnOrder = headers;

        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        // Validate BEFORE normalization to catch column name issues
        const validation = validateExamDataFormat(jsonData as any[]);
        if (!validation.valid) {
          reject(new Error(validation.errors.join('\n')));
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
          type: 'string',
          raw: true  // Preserve original values
        });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get the original column order from the sheet's range
        const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
        const headers: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
          const cell = firstSheet[cellAddress];
          if (cell && cell.v) {
            headers.push(String(cell.v));
          }
        }
        originalColumnOrder = headers;

        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        // Validate BEFORE normalization to catch column name issues
        const validation = validateExamDataFormat(jsonData as any[]);
        if (!validation.valid) {
          reject(new Error(validation.errors.join('\n')));
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
 * Read exam data file (auto-detect Excel or CSV/TXT)
 */
export async function readExamDataFile(file: File): Promise<ExamRow[]> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
    return readExamDataFromCSV(file);
  } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
    return readExcelFile(file);
  } else {
    throw new Error('Unsupported file format. Please upload .xls, .xlsx, .csv, or .txt file.');
  }
}

/**
 * Validate exam data format
 * Returns {valid: boolean, errors: string[]}
 */
export function validateExamDataFormat(data: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || data.length === 0) {
    errors.push('File is empty');
    return { valid: false, errors };
  }

  const firstRow = data[0];
  const actualColumns = Object.keys(firstRow);
  const requiredColumns = ['ID', 'Section', 'Code'];

  // Check for required columns with helpful suggestions
  requiredColumns.forEach(col => {
    if (!(col in firstRow)) {
      // Look for similar column names to provide helpful suggestions
      const similarCols = actualColumns.filter(actualCol =>
        actualCol.toLowerCase().includes(col.toLowerCase()) ||
        col.toLowerCase().includes(actualCol.toLowerCase())
      );

      if (similarCols.length > 0) {
        errors.push(`Missing required column: "${col}". Found similar column(s): ${similarCols.map(c => `"${c}"`).join(', ')}. Please use the exact column name "${col}".`);
      } else {
        errors.push(`Missing required column: "${col}".`);
      }
    }
  });

  // If there are missing required columns, add guidance
  if (errors.length > 0) {
    errors.push('');
    errors.push('Expected column format: ID, Section, Code, 1, 2, 3, ...');
    errors.push('Please download the template for the correct format or check your column names match exactly.');
  }

  // Check for at least one question column (numeric column)
  const questionCols = Object.keys(firstRow).filter(key =>
    !['form', 'ID', 'Section', 'Code'].includes(key) && /^\d+$/.test(key)
  );

  if (questionCols.length === 0) {
    errors.push('No question columns found. Expected numeric columns like 1, 2, 3, etc.');
  }

  // Check for solution rows (warning only - optional for some workflows)
  const solutionRows = data.filter(row => {
    const id = String(row.ID || '').trim();
    return id === '000000000' || id === '0';
  });

  // Solution rows are optional - don't error if missing
  // The app will still work for analysis, just not for re-grading

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Read CSV file and detect format (returns raw data for format detection)
 */
export async function readCSVFileWithDetection(file: File): Promise<CSVDetectionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const workbook = XLSX.read(text, { type: 'string' });
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
  
  if (detection.format === 'UNKNOWN') {
    throw new Error('Unknown CSV format. Please map columns manually.');
  }
  
  return normalizeItemAnalysis(detection.data, detection.format);
}

/**
 * Detect CSV format by examining column names
 */
function detectCSVFormat(data: any[]): CSVDetectionResult {
  if (data.length === 0) {
    return { format: 'UNKNOWN', columns: [], data };
  }

  const firstRow = data[0];
  const columns = Object.keys(firstRow);

  debug('Detected columns:', columns);

  // Check for NEW format
  const hasNewFormat = columns.some(col => 
    col.toLowerCase().includes('version') && !col.toLowerCase().includes('master')
  ) && columns.some(col => 
    col.toLowerCase().includes('master')
  );

  // Check for OLD format
  const hasOldFormat = columns.some(col => 
    col.toLowerCase() === 'code' || col.toLowerCase().replace(/[_\s]/g, '') === 'code'
  ) && columns.some(col => 
    col.toLowerCase().includes('order') && col.toLowerCase().includes('master')
  );

  let format: 'OLD' | 'NEW' | 'UNKNOWN';

  if (hasNewFormat) {
    format = 'NEW';
    debug('Detected NEW format');
  } else if (hasOldFormat) {
    format = 'OLD';
    debug('Detected OLD format');
  } else {
    format = 'UNKNOWN';
    debug('Unknown format, manual mapping needed');
  }

  return { format, columns, data };
}

/**
 * Normalize import_test_data
 */
function normalizeImportData(data: any[]): ExamRow[] {
  if (data.length === 0) throw new Error('Empty file');

  return data.map((row, idx) => {
    const normalized: ExamRow = {
      form: String(row.form || ''),
      ID: String(row.ID || ''),
      Section: String(row.Section || ''),
      Code: String(row.Code || ''),
    };

    // Pad IDs and Sections only if they're purely numeric
    if (/^\d+$/.test(normalized.ID)) {
      normalized.ID = normalized.ID.padStart(9, '0');
    }
    if (/^\d+$/.test(normalized.Section)) {
      normalized.Section = normalized.Section.padStart(2, '0');
    }

    // Process question columns
    Object.keys(row).forEach(key => {
      if (!['form', 'ID', 'Section', 'Code'].includes(key)) {
        let value = String(row[key] || '').toUpperCase();
        // Keep only A-E letters (solutions may be concatenated like "ABE")
        if (value && /^[A-E]+$/.test(value)) {
          normalized[key] = value;
        } else {
          normalized[key] = '';
        }
      }
    });

    return normalized;
  });
}

/**
 * Normalize item_analysis with format detection or custom mapping
 * EXPORTED for use in uncoding component
 */
export function normalizeItemAnalysis(
  data: any[],
  format: 'OLD' | 'NEW' = 'NEW',
  customMapping?: ColumnMapping
): ItemAnalysisRow[] {
  debug('Normalizing with format:', format);
  debug('Custom mapping:', customMapping);

  const normalized = data.map(row => {
    let codeRaw, orderRaw, orderInMasterRaw;

    if (customMapping) {
      // Use custom mapping provided by user
      codeRaw = row[customMapping.code];
      orderRaw = row[customMapping.order];
      orderInMasterRaw = row[customMapping.orderInMaster];
    } else if (format === 'NEW') {
      // NEW FORMAT: Version, Version Q#, Master Q#
      codeRaw = row.Version || row.version || row.VERSION;
      orderRaw = row['Version Q#'] || row['version q#'] || row['VERSION Q#'];
      orderInMasterRaw = row['Master Q#'] || row['master q#'] || row['MASTER Q#'];
    } else {
      // OLD FORMAT: code, order, order in master
      codeRaw = row.code || row.Code || row.CODE;
      orderRaw = row.order || row.Order || row.ORDER;
      orderInMasterRaw = row['order in master'] || row['Order in Master'] ||
                         row.order_in_master || row.ORDER_IN_MASTER;
    }

    // Parse flexibly - handle strings and numbers
    // For code: try to parse as number, but keep as string if it's alphanumeric
    let code: string | number;
    if (typeof codeRaw === 'number') {
      code = codeRaw;
    } else {
      const parsed = parseInt(String(codeRaw));
      code = isNaN(parsed) ? String(codeRaw).trim() : parsed;
    }

    const order = typeof orderRaw === 'number' ? orderRaw : parseInt(String(orderRaw));
    const orderInMaster = typeof orderInMasterRaw === 'number' ? orderInMasterRaw : parseInt(String(orderInMasterRaw));

    // Extract optional fields from QUESTIONS_MAP format
    const permutationRaw = row.Permutation || row.permutation || row.PERMUTATION;
    const correctRaw = row.Correct || row.correct || row.CORRECT;
    const pointsRaw = row.Points || row.points || row.POINTS;
    const groupRaw = row.Group || row.group || row.GROUP;

    const result: ItemAnalysisRow = { code, order, order_in_master: orderInMaster };

    // Add optional fields if they exist
    if (permutationRaw !== undefined && permutationRaw !== null && String(permutationRaw).trim() !== '') {
      result.permutation = String(permutationRaw).trim();
    }
    if (correctRaw !== undefined && correctRaw !== null && String(correctRaw).trim() !== '') {
      result.correct = String(correctRaw).trim();
    }
    if (pointsRaw !== undefined && pointsRaw !== null) {
      const points = typeof pointsRaw === 'number' ? pointsRaw : parseFloat(String(pointsRaw));
      if (!isNaN(points)) {
        result.points = points;
      }
    }
    if (groupRaw !== undefined && groupRaw !== null && String(groupRaw).trim() !== '') {
      const groupNum = parseInt(String(groupRaw));
      result.group = isNaN(groupNum) ? String(groupRaw).trim() : groupNum;
    }

    return result;
  }).filter(row => {
    // Filter out rows with missing/invalid data, but allow alphanumeric codes
    const hasValidCode = row.code !== '' && row.code !== null && row.code !== undefined;
    return hasValidCode && !isNaN(row.order) && !isNaN(row.order_in_master);
  });

  debug('Normalized rows:', normalized.length);
  debug('Sample:', normalized.slice(0, 3));

  return normalized;
}

/**
 * Parse CSV with custom column mapping
 */
export function parseCSVWithMapping(data: any[], mapping: ColumnMapping): ItemAnalysisRow[] {
  return normalizeItemAnalysis(data, 'NEW', mapping);
}

/**
 * Get all question column names from data
 */
export function getAllQuestionCols(data: ExamRow[]): string[] {
  if (data.length === 0) return [];
  const firstRow = data[0];
  const qCols = Object.keys(firstRow).filter(
    key => !['form', 'ID', 'Section', 'Code'].includes(key)
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
  if (!value || value === '') return [];
  const letters = value.split('').filter(c => ANS_CHOICES.includes(c as AnswerChoice));
  return Array.from(new Set(letters)) as AnswerChoice[];
}

/**
 * Guess number of questions from solution rows
 */
export function guessNumQuestions(data: ExamRow[]): number {
  const qCols = getAllQuestionCols(data);
  const solutions = data.filter(row => isSolutionRow(row));
  
  if (solutions.length === 0) return qCols.length;

  let validCount = 0;
  for (const col of qCols) {
    const hasValid = solutions.some(sol => {
      const val = sol[col];
      return val && /^[A-E]+$/.test(val);
    });
    if (hasValid) validCount++;
  }

  return validCount > 0 ? validCount : qCols.length;
}

/**
 * Check if a row is a solution row
 * Solution rows are identified by:
 * - ID = "000000000" (ITC format) OR empty ID (custom format)
 * - Section field is NOT checked to avoid issues with typos
 * EXPORTED for use in components
 */
export function isSolutionRow(row: ExamRow): boolean {
  const id = row.ID.trim();
  return id === SOLUTION_ID || id === '' || id === '0';
}

/**
 * Get unique codes from solution rows, sorted numerically
 */
export function getSolutionCodes(data: ExamRow[]): string[] {
  const solutions = data.filter(row => isSolutionRow(row));
  const codes = Array.from(new Set(solutions.map(s => s.Code)));

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
  const students = data.filter(row => !isSolutionRow(row));
  const studentCodes = Array.from(new Set(students.map(s => s.Code)));

  // Get all codes from solution rows
  const solutionCodes = getSolutionCodes(data);

  // Find codes that have students but no solution
  const codesWithoutSolution = studentCodes.filter(code => !solutionCodes.includes(code));

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
  const solutions = data.filter(row => isSolutionRow(row));
  const map: CorrectAnswersMap = {};

  solutions.forEach(sol => {
    const code = sol.Code;
    map[code] = qCols.map(col => parseSolutionCell(sol[col]));
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
  const students = data.filter(row => !isSolutionRow(row));

  return students.map(student => {
    const code = student.Code;
    const correctAnswers = correctMap[code] || [];

    let totalScore = 0;
    qCols.forEach((col, idx) => {
      const studentAnswer = parseSolutionCell(student[col] || '');
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
      Section: student.Section,
      Code: student.Code,
      Tot: totalScore,
      Per: Math.round(percentage * 100) / 100
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
  return data.map(row => {
    // Only update solution rows
    if (isSolutionRow(row)) {
      const code = row.Code;
      const correctAnswers = correctMap[code];

      if (correctAnswers) {
        const revised = { ...row };

        // Replace question columns with the correct answers from correctMap
        qCols.forEach((col, idx) => {
          const letters = correctAnswers[idx];
          revised[col] = letters.length > 0 ? letters.sort().join('') : '';
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
export function exportToExcel(data: any[], filename: string, sheetName: string, originalData?: any[]) {
  let worksheet: XLSX.WorkSheet;

  // Use the stored original column order from readExcelFile
  const headers = getOriginalColumnOrder();

  if (headers.length > 0 && originalData && originalData.length > 0) {
    // Reorder data to match the original column order
    const reorderedData = data.map(row => {
      const orderedRow: any = {};
      headers.forEach(header => {
        orderedRow[header] = row[header] !== undefined ? row[header] : '';
      });
      return orderedRow;
    });

    worksheet = XLSX.utils.json_to_sheet(reorderedData, { header: headers });
  } else {
    worksheet = XLSX.utils.json_to_sheet(data);
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
  const solutions = answersData.filter(row => isSolutionRow(row));
  if (solutions.length === 0) {
    throw new Error('No solution rows found');
  }

  // Get students (non-solution rows)
  const students = answersData.filter(row => !isSolutionRow(row));
  if (students.length === 0) {
    throw new Error('No student rows found');
  }

  // Get codes used by students (keep as strings to support alphanumeric codes)
  const usedCodes = Array.from(new Set(
    students.map(s => s.Code)
  ));

  debug('Used codes from answers:', usedCodes);
  debug('Item analysis data sample:', itemAnalysisData.slice(0, 5));
  debug('Number of questions:', numQuestions);

  // Build correct answers sets per code
  const correctSets: { [code: string]: AnswerChoice[][] } = {};
  solutions.forEach(sol => {
    const code = sol.Code;
    if (usedCodes.includes(code)) {
      correctSets[code] = qCols.map(col => parseSolutionCell(sol[col]));
    }
  });

  // Filter item analysis for used codes only
  // Convert both to strings for comparison to handle mixed types
  const iaUsed = itemAnalysisData.filter(
    ia => usedCodes.includes(String(ia.code)) &&
          ia.order >= 1 &&
          ia.order_in_master >= 1
  );

  debug('Filtered item analysis rows:', iaUsed.length);
  debug('Item analysis sample after filter:', iaUsed.slice(0, 10));

  if (iaUsed.length === 0) {
    const availableCodes = Array.from(new Set(itemAnalysisData.map(ia => ia.code)));
    throw new Error(
      `No usable rows in item_analysis.csv.\n\n` +
      `Codes in answers file: ${usedCodes.join(', ')}\n` +
      `Codes in item_analysis.csv: ${availableCodes.join(', ')}\n\n` +
      `Make sure the code/version columns match between files.`
    );
  }

  // Create mapping: (code, order) -> order_in_master
  const orderMap: { [key: string]: number } = {};
  // Create reverse mapping: (master_question, code) -> position
  const positionMap: { [key: string]: number } = {};
  iaUsed.forEach(ia => {
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

  students.forEach(student => {
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
        is_correct: isCorrect
      });
    });
  });

  debug('Total mapped answers:', mappedAnswers.length);

  // Calculate averages per master question and per code
  const masterQuestionScores: { [masterQ: number]: number[] } = {};
  const masterQuestionCodeScores: {
    [masterQ: number]: {
      [code: string]: number[]
    }
  } = {};

  mappedAnswers.forEach(ma => {
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
  const maxMasterQ = Math.max(...Object.keys(masterQuestionScores).map(Number), numQuestions);

  for (let masterQ = 1; masterQ <= maxMasterQ; masterQ++) {
    const scores = masterQuestionScores[masterQ] || [];

    // Calculate overall average
    const avg = scores.length > 0
      ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
      : 0;

    // Calculate per-code statistics
    const codeStats: { [code: string]: { count: number; average: number } } = {};
    const positions: { [code: string]: number } = {};
    const codeScores = masterQuestionCodeScores[masterQ] || {};

    Object.keys(codeScores).forEach(codeStr => {
      const codeAnswers = codeScores[codeStr];
      const codeAvg = codeAnswers.length > 0
        ? (codeAnswers.reduce((a, b) => a + b, 0) / codeAnswers.length) * 100
        : 0;

      codeStats[codeStr] = {
        count: codeAnswers.length,
        average: Math.round(codeAvg * 100) / 100
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
      positions
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
  const solutions = answersData.filter(row => isSolutionRow(row));
  if (solutions.length === 0) {
    throw new Error('No solution rows found');
  }

  // Get students (non-solution rows)
  const students = answersData.filter(row => !isSolutionRow(row));
  if (students.length === 0) {
    throw new Error('No student rows found');
  }

  // Get codes used by students (keep as strings to support alphanumeric codes)
  const usedCodes = Array.from(new Set(
    students.map(s => s.Code)
  )).sort((a, b) => {
    // Sort codes: numeric first (by value), then alphabetic
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return a.localeCompare(b);
  });

  // Build correct answers sets per code
  const correctSets: { [code: string]: AnswerChoice[][] } = {};
  solutions.forEach(sol => {
    const code = sol.Code;
    if (usedCodes.includes(code)) {
      correctSets[code] = qCols.map(col => parseSolutionCell(sol[col]));
    }
  });

  // Group scores by code
  const codeScores: { [code: string]: number[] } = {};
  usedCodes.forEach(code => {
    codeScores[code] = [];
  });

  students.forEach(student => {
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
  const results: CodeAverageResult[] = usedCodes.map(code => {
    const scores = codeScores[code] || [];

    // Calculate average
    const avg = scores.length > 0
      ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
      : 0;

    return {
      Code: code,
      Average_score: Math.round(avg * 100) / 100
    };
  });

  return results;
}

/**
 * Classify students into quartiles based on total score
 * T1 = Top 25%, T2 = Second 25%, T3 = Third 25%, T4 = Bottom 25%
 * Handles ties at boundaries by assigning to the higher quartile
 */
export function classifyStudentsByQuartile(results: StudentResult[]): StudentResultWithRank[] {
  // Filter out solution rows
  const students = results.filter(r =>
    r.ID !== SOLUTION_ID &&
    r.ID !== '0' &&
    r.ID.trim() !== ''
  );

  // Sort by total score descending (highest scores first)
  const sorted = [...students].sort((a, b) => b.Tot - a.Tot);

  const totalStudents = sorted.length;
  if (totalStudents === 0) return [];

  // Calculate quartile boundaries
  const q1End = Math.ceil(totalStudents * 0.25);
  const q2End = Math.ceil(totalStudents * 0.50);
  const q3End = Math.ceil(totalStudents * 0.75);

  // Assign ranks with tie handling
  const ranked: StudentResultWithRank[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const student = sorted[i];
    let rank: 'T1' | 'T2' | 'T3' | 'T4';

    // Handle ties at boundaries by checking the score
    if (i < q1End) {
      rank = 'T1';
    } else if (i === q1End && sorted[i].Tot === sorted[q1End - 1].Tot) {
      // Tie at T1/T2 boundary - assign to T1
      rank = 'T1';
    } else if (i < q2End) {
      rank = 'T2';
    } else if (i === q2End && sorted[i].Tot === sorted[q2End - 1].Tot) {
      // Tie at T2/T3 boundary - assign to T2
      rank = 'T2';
    } else if (i < q3End) {
      rank = 'T3';
    } else if (i === q3End && sorted[i].Tot === sorted[q3End - 1].Tot) {
      // Tie at T3/T4 boundary - assign to T3
      rank = 'T3';
    } else {
      rank = 'T4';
    }

    ranked.push({
      ...student,
      Rank: rank
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
  const hasPermutation = itemAnalysis.some(ia => ia.permutation);
  if (!hasPermutation) {
    return null; // No validation needed without permutation data
  }

  // Get solution rows by code
  const solutionRows: { [code: string]: ExamRow } = {};
  examData.forEach(row => {
    if (isSolutionRow(row)) {
      solutionRows[String(row.Code)] = row;
    }
  });

  const errors: string[] = [];

  // For each mapping entry with correct answer
  itemAnalysis.forEach(ia => {
    if (!ia.correct) return;

    const code = String(ia.code);
    const solutionRow = solutionRows[code];

    if (!solutionRow) {
      errors.push(`Version ${code}: No solution row found`);
      return;
    }

    // Get the answer from solution row at the version question position
    const versionQuestionCol = String(ia.order);
    const solutionAnswer = solutionRow[versionQuestionCol];

    if (solutionAnswer !== ia.correct) {
      errors.push(
        `Version ${code}, Q${ia.order}: QUESTIONS_MAP says '${ia.correct}', solution row has '${solutionAnswer}'`
      );
    }
  });

  if (errors.length > 0) {
    return `Correct answer mismatch detected:\n${errors.join('\n')}`;
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
  const hasPermutation = itemAnalysis.some(ia => ia.permutation);
  if (!hasPermutation) {
    throw new Error('Distractor analysis requires permutation data in the item analysis file');
  }

  // Create student rank map for quick lookup
  const studentRankMap = new Map<string, 'T1' | 'T2' | 'T3' | 'T4'>();
  rankedStudents.forEach(s => {
    studentRankMap.set(s.ID, s.Rank);
  });

  // Get all unique master questions
  const masterQuestions = Array.from(new Set(itemAnalysis.map(ia => ia.order_in_master))).sort((a, b) => a - b);

  // Helper function to decode permutation
  const decodePermutation = (studentChoice: string, permutation: string): string => {
    if (!studentChoice || !permutation) return 'Blank/Other';

    const choices = ['A', 'B', 'C', 'D', 'E'];
    const choiceIndex = choices.indexOf(studentChoice.toUpperCase());

    if (choiceIndex === -1) return 'Blank/Other';

    const permArray = permutation.toUpperCase().split('');
    if (choiceIndex >= permArray.length) return 'Blank/Other';

    return permArray[choiceIndex];
  };

  // Compute distractor analysis for each master question
  const results: DistractorAnalysisResult[] = masterQuestions.map(masterQ => {
    // Find all versions/mappings for this master question
    const mappings = itemAnalysis.filter(ia => ia.order_in_master === masterQ);

    // Determine the correct answer in master terms
    let masterCorrect: string | null = null;
    for (const mapping of mappings) {
      if (mapping.correct && mapping.permutation) {
        // Find which master option corresponds to the correct answer in this version
        const choices = ['A', 'B', 'C', 'D', 'E'];
        const permArray = mapping.permutation.toUpperCase().split('');
        const correctIndex = choices.indexOf(mapping.correct.toUpperCase());
        if (correctIndex !== -1 && correctIndex < permArray.length) {
          masterCorrect = permArray[correctIndex];
          break;
        }
      }
    }

    // Count choices across all students for this master question
    const choiceCounts: { [choice: string]: { count: number; T1: number; T2: number; T3: number; T4: number } } = {
      'A': { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      'B': { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      'C': { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      'D': { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      'E': { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 },
      'Blank/Other': { count: 0, T1: 0, T2: 0, T3: 0, T4: 0 }
    };

    // Process each student's answer
    const students = examData.filter(row => !isSolutionRow(row));
    students.forEach(student => {
      const rank = studentRankMap.get(student.ID);
      if (!rank) return; // Skip if student not ranked

      // Find which version this student took
      const studentCode = String(student.Code);
      const mapping = mappings.find(m => String(m.code) === studentCode);
      if (!mapping || !mapping.permutation) return;

      // Get student's answer for this question in their version
      const versionQuestionCol = String(mapping.order);
      const studentAnswer = student[versionQuestionCol];

      // Decode to master option
      const masterChoice = decodePermutation(studentAnswer, mapping.permutation);

      // Count the choice
      choiceCounts[masterChoice].count++;
      choiceCounts[masterChoice][rank]++;
    });

    // Calculate total students who answered
    const totalAnswered = Object.values(choiceCounts).reduce((sum, c) => sum + c.count, 0);

    // Convert to result format
    const choices: DistractorChoiceResult[] = ['A', 'B', 'C', 'D', 'E', 'Blank/Other'].map(choice => ({
      choice,
      isCorrect: choice === masterCorrect,
      count: choiceCounts[choice].count,
      percentage: totalAnswered > 0 ? Math.round((choiceCounts[choice].count / totalAnswered) * 10000) / 100 : 0,
      T1: choiceCounts[choice].T1,
      T2: choiceCounts[choice].T2,
      T3: choiceCounts[choice].T3,
      T4: choiceCounts[choice].T4
    }));

    return {
      masterQuestion: masterQ,
      choices
    };
  });

  return results;
}
