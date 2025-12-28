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
  code: string | number;
  order: number;
  order_in_master: number;
  permutation?: string;      // Optional - only from QUESTIONS_MAP format
  correct?: string;          // Optional - only from QUESTIONS_MAP format
  points?: number;           // Optional - only from QUESTIONS_MAP format
  group?: string | number;   // Optional - only from QUESTIONS_MAP format
}

export interface AverageResult {
  Master_Question: number;
  Average_score: number;
  codeStats: {
    [code: string]: {
      count: number;
      average: number;
    };
  };
  positions: {
    [code: string]: number; // Maps code to question position (e.g., {"1": 7} means Master Q1 is Q7 in Code 1)
  };
}

export interface CodeAverageResult {
  Code: string | number;
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

// Distractor analysis types
export interface StudentResultWithRank extends StudentResult {
  Rank: 'T1' | 'T2' | 'T3' | 'T4';  // Quartile rank
}

export interface DistractorChoiceResult {
  choice: string;           // A, B, C, D, E, or "Blank/Other"
  isCorrect: boolean;       // Whether this is the correct answer
  count: number;            // Total students who chose this
  percentage: number;       // Percentage of students who chose this
  T1: number;               // Count from top 25%
  T2: number;               // Count from second 25%
  T3: number;               // Count from third 25%
  T4: number;               // Count from bottom 25%
}

export interface DistractorAnalysisResult {
  masterQuestion: number;
  choices: DistractorChoiceResult[];
}
