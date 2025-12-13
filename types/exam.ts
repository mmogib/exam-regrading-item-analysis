export const SOLUTION_ID = "000000000";
export const SOLUTION_SECTION = "00";
export const ANS_CHOICES = ["A", "B", "C", "D", "E"] as const;
export const POINTS_PER_Q = 5;

export type AnswerChoice = typeof ANS_CHOICES[number];

export interface ExamRow {
  form: string;
  ID: string;
  Section: string;
  Code: string;
  [key: string]: string; // Question columns are dynamic
}

export interface StudentResult {
  ID: string;
  Section: string;
  Code: string;
  Tot: number;
  Per: number;
}

export interface CorrectAnswersMap {
  [code: string]: AnswerChoice[][];
}

export interface ItemAnalysisRow {
  code: number;
  order: number;
  order_in_master: number;
}

export interface AverageResult {
  Master_Question: number;
  Average_score: number;
}

// CSV format detection types
export interface CSVDetectionResult {
  format: 'OLD' | 'NEW' | 'UNKNOWN';
  columns: string[];
  data: any[];
}

export interface ColumnMapping {
  code: string;           // Which column maps to "code/version"
  order: string;          // Which column maps to "question order"
  orderInMaster: string;  // Which column maps to "master question"
}
