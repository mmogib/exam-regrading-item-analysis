import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  ExamRow,
  StudentResult,
  CorrectAnswersMap,
  ItemAnalysisRow,
  AverageResult,
  CodeAverageResult,
  SOLUTION_ID,
  SOLUTION_SECTION,
  ANS_CHOICES,
  POINTS_PER_Q,
  AnswerChoice,
  CSVDetectionResult,
  ColumnMapping
} from '@/types/exam';

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

  console.log('DEBUG - Detected columns:', columns);

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
    console.log('DEBUG - Detected NEW format');
  } else if (hasOldFormat) {
    format = 'OLD';
    console.log('DEBUG - Detected OLD format');
  } else {
    format = 'UNKNOWN';
    console.log('DEBUG - Unknown format, manual mapping needed');
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
  console.log('DEBUG - Normalizing with format:', format);
  console.log('DEBUG - Custom mapping:', customMapping);
  
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
    const code = typeof codeRaw === 'number' ? codeRaw : parseInt(String(codeRaw));
    const order = typeof orderRaw === 'number' ? orderRaw : parseInt(String(orderRaw));
    const orderInMaster = typeof orderInMasterRaw === 'number' ? orderInMasterRaw : parseInt(String(orderInMasterRaw));

    return { code, order, order_in_master: orderInMaster };
  }).filter(row => !isNaN(row.code) && !isNaN(row.order) && !isNaN(row.order_in_master));

  console.log('DEBUG - Normalized rows:', normalized.length);
  console.log('DEBUG - Sample:', normalized.slice(0, 3));
  
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

  // Get codes used by students
  const usedCodes = Array.from(new Set(
    students.map(s => parseInt(s.Code)).filter(c => !isNaN(c))
  ));

  console.log('DEBUG - Used codes from answers:', usedCodes);
  console.log('DEBUG - Item analysis data sample:', itemAnalysisData.slice(0, 5));
  console.log('DEBUG - Number of questions:', numQuestions);

  // Build correct answers sets per code
  const correctSets: { [code: string]: AnswerChoice[][] } = {};
  solutions.forEach(sol => {
    const code = parseInt(sol.Code);
    if (usedCodes.includes(code)) {
      correctSets[String(code)] = qCols.map(col => parseSolutionCell(sol[col]));
    }
  });

  // Filter item analysis for used codes only
  const iaUsed = itemAnalysisData.filter(
    ia => usedCodes.includes(ia.code) &&
          ia.order >= 1 && 
          ia.order_in_master >= 1
  );

  console.log('DEBUG - Filtered item analysis rows:', iaUsed.length);
  console.log('DEBUG - Item analysis sample after filter:', iaUsed.slice(0, 10));

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
  iaUsed.forEach(ia => {
    orderMap[`${ia.code}-${ia.order}`] = ia.order_in_master;
  });

  // Process all student answers
  interface MappedAnswer {
    code: number;
    order: number;
    order_in_master: number;
    answer: string;
    is_correct: number;
  }

  const mappedAnswers: MappedAnswer[] = [];

  students.forEach(student => {
    const code = parseInt(student.Code);
    if (isNaN(code)) return;

    qCols.forEach((col, idx) => {
      const order = idx + 1;
      const orderInMaster = orderMap[`${code}-${order}`];
      if (!orderInMaster) return;

      const answer = student[col];
      if (!answer) return;

      // Check correctness using multi-correct sets
      const correctSet = correctSets[String(code)]?.[idx] || [];
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

  console.log('DEBUG - Total mapped answers:', mappedAnswers.length);

  // Calculate averages per master question and per code
  const masterQuestionScores: { [masterQ: number]: number[] } = {};
  const masterQuestionCodeScores: {
    [masterQ: number]: {
      [code: number]: number[]
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
    const codeScores = masterQuestionCodeScores[masterQ] || {};

    Object.keys(codeScores).forEach(codeStr => {
      const code = parseInt(codeStr);
      const codeAnswers = codeScores[code];
      const codeAvg = codeAnswers.length > 0
        ? (codeAnswers.reduce((a, b) => a + b, 0) / codeAnswers.length) * 100
        : 0;

      codeStats[codeStr] = {
        count: codeAnswers.length,
        average: Math.round(codeAvg * 100) / 100
      };
    });

    results.push({
      Master_Question: masterQ,
      Average_score: Math.round(avg * 100) / 100,
      codeStats
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

  // Get codes used by students
  const usedCodes = Array.from(new Set(
    students.map(s => parseInt(s.Code)).filter(c => !isNaN(c))
  )).sort((a, b) => a - b);

  // Build correct answers sets per code
  const correctSets: { [code: string]: AnswerChoice[][] } = {};
  solutions.forEach(sol => {
    const code = parseInt(sol.Code);
    if (usedCodes.includes(code)) {
      correctSets[String(code)] = qCols.map(col => parseSolutionCell(sol[col]));
    }
  });

  // Group scores by code
  const codeScores: { [code: number]: number[] } = {};
  usedCodes.forEach(code => {
    codeScores[code] = [];
  });

  students.forEach(student => {
    const code = parseInt(student.Code);
    if (isNaN(code) || !usedCodes.includes(code)) return;

    qCols.forEach((col, idx) => {
      const answer = student[col];
      if (!answer) return;

      const correctSet = correctSets[String(code)]?.[idx] || [];
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
