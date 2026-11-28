/**
 * Realistic grading-center exam files for the Step 1 "Download Template" dialog.
 *
 * Builds on the dummy-data generator (lib/dummy-data.ts). It simulates one exam,
 * either from the dialog settings or rebuilt from a Shuffler Question Map or
 * Options Matrix, and exports it in the layout of the KFUPM grading-center
 * answer files (form, ID, Section, Code, 1..125) as a one-sheet .xlsx.
 * Scan errors are optional.
 *
 * The module is pure and browser-safe. It returns one frozen snapshot of files;
 * the UI only offers them for download. Expected results are computed from the
 * EXPORTED data: final IDs, and responses as the app imports them (a
 * multiple mark "X" imports as a blank).
 *
 * Design and review: references/TEMPLATE_DIALOG_FEATURE.md (channel 005).
 */
import * as XLSX from "xlsx";
import { bindVersionCodes, findVersionPairs, normalizeVersionCode } from "./excel-utils";
import {
  buildDataset,
  createRng,
  datasetFromQuestionMap,
  expectedResults,
  LETTERS,
  normalTable,
  optionsMatrixTable,
  questionMapTable,
  toDelimited,
  toVersionLetter,
  type DummyDataset,
  type DummyStudent,
  type ExpectedResults,
  type Letter,
} from "./dummy-data";

/** Question columns in a grading-center file (only the first K are filled). */
export const GRADING_CENTER_COLUMNS = 125;
/**
 * Practical cap for in-browser generation. SheetJS writes .xlsx fast: 5000 x 125
 * takes about 1-2 s (the earlier .xls/BIFF8 writer took about 26 s; measured
 * 2026-11-28, Node 26).
 */
export const MAX_STUDENTS = 5000;
export const MAX_VERSIONS = 26;

export interface ScanErrorRates {
  /**
   * Per ANSWERED response (blanks are drawn first, by blankRate): printed as "X",
   * which imports as a blank. So the share of all responses is (1 - blankRate) x this.
   */
  multipleMark: number;
  /** Per student: one ID digit replaced by "@". */
  maskedId: number;
  /** Per student: section printed as "@@". */
  unreadableSection: number;
}

/** Illustrative rates, close to the two sample files; not a calibrated scanner model. */
export const SCAN_ERROR_PRESET: ScanErrorRates = { multipleMark: 0.0002, maskedId: 0.01, unreadableSection: 0.05 };

export interface GradingCenterSettings {
  students: number;
  /** Ignored when a Shuffler file is given (taken from the file). */
  questions: number;
  /** Ignored when a Shuffler file is given (taken from the file). */
  versions: number;
  sections: number;
  seed: number;
  /** Plant problem questions (generated exam: five kinds; Shuffler: three behavioural kinds). */
  plants: boolean;
  /** Shuffler mode only: give the student file one wrong key, to be corrected in Step 2. */
  plantMiskey: boolean;
  /** Per response: left blank. */
  blankRate: number;
  scanErrors: boolean;
  scanErrorRates: ScanErrorRates;
}

export const DEFAULT_GRADING_CENTER_SETTINGS: GradingCenterSettings = {
  students: 200,
  questions: 20,
  versions: 4,
  sections: 10,
  seed: 1,
  plants: true,
  plantMiskey: false,
  blankRate: 0.002,
  scanErrors: false,
  scanErrorRates: SCAN_ERROR_PRESET,
};

/** A fresh seed for the dialog; the seed is always shown, so a file can be regenerated. */
export const randomSeed = () => 1 + Math.floor(Math.random() * 999_999);

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/**
 * RFC 4180 CSV: BOM, quoted fields, doubled quotes, CRLF/LF/CR. Blank lines are
 * skipped. Malformed quoting (a quote inside an unquoted field, text after a
 * closing quote, an unclosed quote) is an error, never silently repaired.
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let line = 1;
  const bad = (what: string): never => {
    throw new Error(`CSV line ${line}: ${what}.`);
  };
  const endField = () => {
    row.push(field);
    field = "";
    state = "start";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (state === "quoted") {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          state = "closed";
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === ",") {
      endField();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endField();
      rows.push(row);
      row = [];
      line++;
    } else if (state === "closed") {
      bad("text after a closing quote");
    } else if (c === '"') {
      if (state === "start") state = "quoted";
      else bad("a quote inside an unquoted field");
    } else {
      field += c;
      state = "plain";
    }
  }
  if (state === "quoted") bad("unclosed quoted field");
  if (state !== "start" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/* ------------------------------------------------------------------ */
/* Shuffler files (Question Map or Options Matrix) -> one exam model   */
/* ------------------------------------------------------------------ */

export interface ShufflerEntry {
  /** Version code as written in the Shuffler file. */
  code: string;
  position: number;
  master: number;
  /** Version letter (index) -> master letter (value), one letter per option. */
  permutation: string;
  /** Correct answer as a version letter. */
  correct: Letter;
}

export interface ShufflerExam {
  kind: "question-map" | "options-matrix";
  questions: number;
  /** Source version codes, sorted as the generator sorts them. */
  versions: string[];
  entries: ShufflerEntry[];
  /** Why Step 3 cannot read the unchanged file (P3/P5); empty when it can. */
  step3Issues: string[];
}

const sortCodes = (codes: string[]) => [...codes].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
const isWholeNumber = (v: string) => /^\d+$/.test(v.trim());

/**
 * The code Step 3 stores for a version label: the shared normalizeVersionCode
 * rule (lib/excel-utils.ts, P12). An all-digit label is a number (001 -> 1);
 * any other label stays its text ("1A", "0x1", "1e2"). An all-digit label too
 * long to be an exact number throws.
 */
export const step3Code = (code: string) => String(normalizeVersionCode(code));

/** Grading-center version code for a source code: numeric codes are padded to 3 digits (1 -> 001). */
export const gradingCenterCode = (sourceCode: string) => (isWholeNumber(sourceCode) ? sourceCode.trim().padStart(3, "0") : sourceCode.trim());

function headerIndex(headers: string[]) {
  const norm = headers.map((h) => h.trim().toLowerCase());
  return (name: string) => norm.indexOf(name.toLowerCase());
}

/** Read a Shuffler Question Map or Options Matrix (current Shuffler direction) and validate it. */
export function readShufflerFile(text: string): ShufflerExam {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The file has no data rows.");
  const headers = rows[0];
  const at = headerIndex(headers);
  const body = rows.slice(1);

  let exam: ShufflerExam;
  if (at("Permutation") >= 0 && at("Master Q#") >= 0) {
    exam = readQuestionMap(headers, body);
  } else if (at("Option") >= 0 && at("Master_Correct") >= 0) {
    exam = readOptionsMatrix(headers, body);
  } else {
    throw new Error(
      "This is not a Shuffler Question Map (Version, Version Q#, Master Q#, Permutation, Correct) or Options Matrix (Q, Option, Master_Correct, <version>_Q, <version>_Opt)."
    );
  }
  validateShufflerExam(exam);
  return exam;
}

function readQuestionMap(headers: string[], body: string[][]): ShufflerExam {
  const at = headerIndex(headers);
  const col = (name: string) => {
    const i = at(name);
    if (i < 0) throw new Error(`The Question Map has no "${name}" column.`);
    return i;
  };
  const [cVersion, cPos, cMaster, cPerm, cCorrect] = ["Version", "Version Q#", "Master Q#", "Permutation", "Correct"].map(col);
  const entries = body.map((r, i): ShufflerEntry => {
    const line = i + 2;
    const position = Number(r[cPos]);
    const master = Number(r[cMaster]);
    if (!Number.isInteger(position) || !Number.isInteger(master)) {
      throw new Error(`Question Map line ${line}: "Version Q#" and "Master Q#" must be whole numbers.`);
    }
    return {
      code: (r[cVersion] ?? "").trim(),
      position,
      master,
      permutation: (r[cPerm] ?? "").trim().toUpperCase(),
      correct: (r[cCorrect] ?? "").trim().toUpperCase() as Letter,
    };
  });
  const versions = sortCodes(Array.from(new Set(entries.map((e) => e.code))));
  const questions = Math.max(0, ...entries.map((e) => e.master));
  // No known blocker; the dialog still makes no promise about the unchanged original (header
  // spellings and letter case this reader accepts can differ from what Step 3 accepts)
  return { kind: "question-map", questions, versions, entries, step3Issues: [] };
}

function readOptionsMatrix(headers: string[], body: string[][]): ShufflerExam {
  const at = headerIndex(headers);
  const cQ = at("Q");
  const cOption = at("Option");
  const cFlag = at("Master_Correct");
  if (cQ < 0) throw new Error('The Options Matrix has no "Q" column.');

  const names = headers.map((h) => h.trim());
  if (new Set(names.map((h) => h.toLowerCase())).size !== names.length) {
    throw new Error("The Options Matrix repeats a column name.");
  }

  // Version column pairs, by the same rule as Step 3 (findVersionPairs): all
  // legacy-named (version_N_Q, vN_Opt, ...) -> numeric codes; otherwise every
  // name as written. Both halves are required; versions may not repeat.
  const versionPairs = findVersionPairs(names);
  if (!versionPairs) throw new Error("The Options Matrix has no <version>_Q / <version>_Opt column pairs.");
  const pairs = versionPairs.pairs.map((p) => ({ code: p.code, q: names.indexOf(p.qCol), opt: names.indexOf(p.optCol) }));

  // Group option rows by master question
  const byMaster = new Map<number, string[][]>();
  body.forEach((r, i) => {
    const master = Number(r[cQ]);
    if (!Number.isInteger(master) || master < 1) throw new Error(`Options Matrix line ${i + 2}: "Q" must be a whole number.`);
    if (!byMaster.has(master)) byMaster.set(master, []);
    byMaster.get(master)!.push(r);
  });

  const isYes = (v: string | undefined) => /^(yes|y|true|1)$/i.test((v ?? "").trim());
  const entries: ShufflerEntry[] = [];
  for (const [master, optionRows] of byMaster) {
    const options = optionRows.map((r) => (r[cOption] ?? "").trim().toUpperCase());
    const n = options.length;
    const allowed: string[] = LETTERS.slice(0, n);
    const valid = n >= 2 && n <= 5 && new Set(options).size === n && options.every((o) => o.length === 1 && allowed.includes(o));
    if (!valid) {
      throw new Error(
        `Options Matrix, master Q${master}: each option row needs one letter, A to ${LETTERS[Math.min(Math.max(n, 2), 5) - 1]}, each used once (found ${options.map((o) => o || "(blank)").join(", ")}).`
      );
    }
    const flagged = optionRows.filter((r) => isYes(r[cFlag]));
    if (flagged.length !== 1) throw new Error(`Options Matrix, master Q${master}: exactly one option must be marked as Master_Correct (found ${flagged.length}).`);
    const correctMaster = (flagged[0][cOption] ?? "").trim().toUpperCase() as Letter;

    for (const p of pairs) {
      const positions = new Set(optionRows.map((r) => (r[p.q] ?? "").trim()));
      if (positions.size !== 1) throw new Error(`Options Matrix, master Q${master}, version ${p.code}: the option rows give different positions.`);
      const position = Number([...positions][0]);
      if (!Number.isInteger(position)) throw new Error(`Options Matrix, master Q${master}, version ${p.code}: the position is not a whole number.`);
      // Master option -> version letter; invert to version letter -> master letter
      const perm: string[] = new Array(n).fill("");
      let correct: Letter | undefined;
      optionRows.forEach((r) => {
        const masterLetter = (r[cOption] ?? "").trim().toUpperCase() as Letter;
        const versionLetter = (r[p.opt] ?? "").trim().toUpperCase() as Letter;
        const idx = LETTERS.indexOf(versionLetter);
        if (idx < 0 || idx >= n || perm[idx] !== "") {
          throw new Error(`Options Matrix, master Q${master}, version ${p.code}: the option letters are not a one-to-one shuffle of A to ${LETTERS[n - 1]}.`);
        }
        perm[idx] = masterLetter;
        if (masterLetter === correctMaster) correct = versionLetter;
      });
      entries.push({ code: p.code, position, master, permutation: perm.join(""), correct: correct! });
    }
  }
  // What stops Step 3 from reading this file unchanged. Since 1.9.1 Step 3 reads
  // named versions (P5) and blank first-row cells (P3); it still requires
  // consecutive numbers for legacy version_N names.
  const step3Issues: string[] = [];
  if (versionPairs.mode === "legacy" && !versionPairs.consecutive) {
    step3Issues.push("its version numbers are not consecutive");
  }

  return {
    kind: "options-matrix",
    questions: Math.max(0, ...byMaster.keys()),
    versions: sortCodes(pairs.map((p) => p.code)),
    entries,
    step3Issues,
  };
}

/** Every version must map masters 1..K one-to-one onto positions 1..K, with consistent keys. */
function validateShufflerExam(exam: ShufflerExam) {
  const K = exam.questions;
  if (K < 2) throw new Error("The file must describe at least 2 questions.");
  if (K > GRADING_CENTER_COLUMNS) throw new Error(`The file has ${K} questions; a grading-center file holds at most ${GRADING_CENTER_COLUMNS}.`);
  if (exam.versions.length > MAX_VERSIONS) throw new Error(`The file has ${exam.versions.length} versions; the limit is ${MAX_VERSIONS}.`);

  const gcCodes = new Set<string>();
  const step3Codes = new Map<string, string>();
  for (const code of exam.versions) {
    if (code === "") throw new Error("A row has an empty version code.");
    if (/^0+$/.test(code)) throw new Error(`Version code "${code}" is reserved for solution rows.`);
    if (/[",\r\n]/.test(code)) throw new Error(`Version code "${code}" contains a comma, quote or line break.`);
    // Step 3's code mapping keeps codes as keys of plain objects, so these names break it
    if (code in Object.prototype) throw new Error(`Version name "${code}" cannot be used: the app uses it internally. Rename it.`);
    const gc = gradingCenterCode(code);
    if (gcCodes.has(gc)) throw new Error(`Versions "${code}" and another version both become code ${gc}.`);
    gcCodes.add(gc);
    // Step 3 reads all-digit labels as numbers, so such labels must stay distinct
    const seen = step3Codes.get(step3Code(code));
    if (seen !== undefined) {
      throw new Error(
        `Versions "${seen}" and "${code}" would both be read as ${step3Code(code)} in Step 3, which reads all-digit version codes as numbers. Rename them, for example 1 and 2, or A and B.`
      );
    }
    step3Codes.set(step3Code(code), code);
  }

  const masterKey = new Map<number, { letter: string; options: number; code: string }>();
  for (const code of exam.versions) {
    const entries = exam.entries.filter((e) => e.code === code);
    const masters = new Set<number>();
    const positions = new Set<number>();
    for (const e of entries) {
      const where = `Version ${code}, master Q${e.master}`;
      if (e.master < 1 || e.master > K) throw new Error(`${where}: master question out of range 1..${K}.`);
      if (e.position < 1 || e.position > K) throw new Error(`${where}: position ${e.position} is out of range 1..${K}.`);
      if (masters.has(e.master)) throw new Error(`${where}: listed more than once.`);
      if (positions.has(e.position)) throw new Error(`Version ${code}: position ${e.position} is used twice.`);
      masters.add(e.master);
      positions.add(e.position);
      const n = e.permutation.length;
      if (n < 2 || n > 5 || e.permutation.split("").sort().join("") !== LETTERS.slice(0, n).join("")) {
        throw new Error(`${where}: "${e.permutation}" is not a shuffle of the option letters.`);
      }
      const idx = LETTERS.indexOf(e.correct);
      if (idx < 0 || idx >= n) throw new Error(`${where}: correct answer "${e.correct}" is not one of its ${n} options.`);
      const letter = e.permutation[idx];
      const known = masterKey.get(e.master);
      if (known && (known.letter !== letter || known.options !== n)) {
        throw new Error(`Master Q${e.master}: versions ${known.code} and ${code} disagree on its key or number of options.`);
      }
      masterKey.set(e.master, { letter, options: n, code });
    }
    for (let m = 1; m <= K; m++) if (!masters.has(m)) throw new Error(`Version ${code} has no position for master Q${m}.`);
  }
}

/** The exam as a plain Question Map CSV, the input the generator's Shuffler mode reads. */
function canonicalQuestionMapCsv(exam: ShufflerExam): string {
  return toDelimited({
    headers: ["Version", "Version Q#", "Master Q#", "Permutation", "Correct"],
    rows: exam.entries.map((e) => [e.code, String(e.position), String(e.master), e.permutation, e.correct]),
  });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/** All problems with the settings (and file), as messages; empty when generation can run. */
export function validateSettings(s: GradingCenterSettings, shuffler?: ShufflerExam): string[] {
  const errors: string[] = [];
  const whole = (v: number) => Number.isInteger(v);
  const K = shuffler ? shuffler.questions : s.questions;
  const V = shuffler ? shuffler.versions.length : s.versions;

  if (!whole(s.students) || s.students < 1 || s.students > MAX_STUDENTS) errors.push(`Students must be a whole number from 1 to ${MAX_STUDENTS}.`);
  if (!shuffler) {
    if (!whole(s.questions) || s.questions < 2 || s.questions > GRADING_CENTER_COLUMNS) errors.push(`Questions must be a whole number from 2 to ${GRADING_CENTER_COLUMNS}.`);
    if (!whole(s.versions) || s.versions < 1 || s.versions > MAX_VERSIONS) errors.push(`Versions must be a whole number from 1 to ${MAX_VERSIONS}.`);
  }
  if (whole(s.students) && whole(V) && s.students < V) errors.push(`Students must be at least the number of versions (${V}).`);
  if (!whole(s.sections) || s.sections < 1 || s.sections > 99) errors.push("Sections must be a whole number from 1 to 99.");
  if (!whole(s.seed) || s.seed < 0 || s.seed > 2 ** 31) errors.push("Seed must be a whole number from 0 to 2147483648.");
  if (!(s.blankRate >= 0 && s.blankRate <= 0.5)) errors.push("Blank responses must be between 0% and 50%.");
  if (s.scanErrors) {
    const r = s.scanErrorRates;
    for (const [label, v] of [["Multiple marks", r.multipleMark], ["Unreadable IDs", r.maskedId], ["Unreadable sections", r.unreadableSection]] as const) {
      if (!(v >= 0 && v <= 1)) errors.push(`${label} must be between 0% and 100%.`);
    }
  }
  const planted = shuffler ? (s.plants ? 3 : 0) + (s.plantMiskey ? 1 : 0) : s.plants ? 5 : 0;
  if (planted > 0 && whole(K) && K < planted) errors.push(`Planted problem questions need at least ${planted} questions.`);
  return errors;
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

export type DownloadKind = "student-data" | "expected-results" | "question-map" | "options-matrix" | "normal" | "original";

export interface DownloadFile {
  kind: DownloadKind;
  name: string;
  label: string;
  description: string;
  mime: string;
  content: Uint8Array<ArrayBuffer> | string;
}

export interface RealizedScanErrors {
  blanks: number;
  multipleMarks: number;
  maskedIds: number;
  unreadableSections: number;
}

export interface GradingCenterSnapshot {
  settings: GradingCenterSettings;
  source: { fileName: string; kind: ShufflerExam["kind"] } | null;
  questions: number;
  /** Version codes in the generated files (001, 002, ... for numeric sources). */
  versions: string[];
  /** The same versions' codes as written in the Shuffler file; null without a file. */
  sourceVersions: string[] | null;
  students: number;
  realized: RealizedScanErrors;
  /** The exported dataset: final IDs, X as blank. Expected results are computed from it. */
  dataset: DummyDataset;
  expected: ExpectedResults;
  files: DownloadFile[];
}

export interface ShufflerSource {
  fileName: string;
  bytes: Uint8Array;
}

const CSV_MIME = "text/csv;charset=utf-8;";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Generate one exam and every file the dialog offers. Pure: the same settings
 * and source bytes give the same content. Throws with all problems listed when
 * the settings or the Shuffler file cannot be used.
 */
export function buildGradingCenterSnapshot(settings: GradingCenterSettings, source?: ShufflerSource): GradingCenterSnapshot {
  const shuffler = source ? readShufflerFile(new TextDecoder("utf-8").decode(source.bytes)) : undefined;
  const errors = validateSettings(settings, shuffler);
  if (errors.length) throw new Error(errors.join("\n"));

  const { dataset: base, sourceCodes } = shuffler
    ? fromShuffler(shuffler, settings)
    : { dataset: fromSettings(settings), sourceCodes: null };
  const { dataset, table, realized } = layOut(base, settings);
  const { exam } = dataset;
  const expected = expectedResults(dataset);
  const keysDiffer = exam.questions.some((q) => q.publishedKey.join("") !== q.correctedKey.join(""));
  const corrected = keysDiffer ? expectedResults(dataset, "corrected") : null;

  const K = exam.params.questions;
  const stem = `synthetic_${K}q_${exam.versions.length}v_${settings.students}s_seed${settings.seed}`;
  const expectedJson = {
    notice: "Synthetic data generated by the exam grading app. No real students.",
    settings,
    source: source ? { fileName: source.fileName, kind: shuffler!.kind } : null,
    // "source": the code in the Shuffler file; "file": the code in the generated files
    versionCodes: exam.versions.map((v, i) => ({ source: sourceCodes ? sourceCodes[i] : null, file: v.studentCode })),
    realizedScanErrors: realized,
    importNotes: [
      'A multiple mark "X" is imported as a blank, so it scores 0 and counts as unanswered.',
      `The "X" rate applies to answered responses only (blanks are drawn first), so its share of all responses is (1 - blankRate) x multipleMark.`,
      "IDs and sections with @ are kept as printed.",
    ],
    expected,
    ...(corrected ? { afterCorrectingTheKey: { masterQuestions: corrected.masterQuestions, reliability: corrected.reliability } } : {}),
  };

  // How Step 3 will bind a companion's codes to the student file's codes
  const studentCodes = exam.versions.map((v) => v.studentCode);
  const bindingNote = (itemCodes: string[]) => {
    const kind = bindVersionCodes(studentCodes, itemCodes.map((c) => step3Code(c))).kind;
    return kind === "exact"
      ? ""
      : kind === "numeric"
        ? " Step 3 matches its codes to the student file's by number by itself."
        : " Accept the suggested code mapping in Step 3.";
  };
  const miskeyNote = shuffler && settings.plantMiskey
    ? " The student file has a planted wrong key: Step 3 rejects it until you correct that question in Step 2."
    : "";
  const files: DownloadFile[] = [
    {
      kind: "student-data",
      name: `${stem}_grading_center.xlsx`,
      label: "Student data (.xlsx)",
      description: "Upload in Step 1.",
      mime: XLSX_MIME,
      content: workbookBytes(table),
    },
    {
      kind: "question-map",
      name: `${stem}_question_map.csv`,
      label: "Matching Question Map (.csv)",
      description: shuffler
        ? `Your exam's map with codes ${studentCodes.join(", ")}. Upload it in Step 3.${bindingNote(exam.versions.map((v) => v.itemCode))}${miskeyNote}`
        : `Upload in Step 3 for the full analysis.${bindingNote(exam.versions.map((v) => v.itemCode))}`,
      mime: CSV_MIME,
      content: toDelimited(questionMapTable(exam, shuffler ? "corrected" : "published")),
    },
  ];
  if (!shuffler) {
    files.push(
      {
        kind: "options-matrix",
        name: `${stem}_options_matrix.csv`,
        label: "Matching Options Matrix (.csv)",
        description: `Alternative for Step 3 (versions named version_1, version_2, ...).${bindingNote(exam.versions.map((v) => String(v.index)))}`,
        mime: CSV_MIME,
        content: toDelimited(optionsMatrixTable(exam)),
      },
      {
        kind: "normal",
        name: `${stem}_normal.csv`,
        label: "Matching Normal file (.csv)",
        description: "Question mapping only: cross-version analysis.",
        mime: CSV_MIME,
        content: toDelimited(normalTable(exam)),
      }
    );
  } else {
    files.push({
      kind: "original",
      name: source!.fileName,
      label: "Your uploaded file (unchanged)",
      // Only known blockers are reported; there is no promise that the original works in Step 3
      description:
        (shuffler.step3Issues.length
          ? `For your records. Step 3 cannot read this file as it is: ${shuffler.step3Issues.join("; ")}. Use the matching Question Map above.`
          : "For your records. For Step 3, use the matching Question Map above.") + miskeyNote,
      mime: CSV_MIME,
      content: new Uint8Array(source!.bytes),
    });
  }
  files.push({
    kind: "expected-results",
    name: `${stem}_expected_results.json`,
    label: "Expected results (.json)",
    description: "Grades and item statistics the app should compute, for checking.",
    mime: "application/json",
    content: JSON.stringify(expectedJson, null, 2) + "\n",
  });

  return {
    settings,
    source: source ? { fileName: source.fileName, kind: shuffler!.kind } : null,
    questions: K,
    versions: exam.versions.map((v) => v.studentCode),
    sourceVersions: sourceCodes,
    students: dataset.students.length,
    realized,
    dataset,
    expected,
    files,
  };
}

function fromSettings(s: GradingCenterSettings): DummyDataset {
  const ds = buildDataset({
    students: s.students,
    questions: s.questions,
    versions: s.versions,
    seed: s.seed,
    codeStyle: "padded",
    plants: s.plants,
    shuffleQuestions: true,
    blankRate: s.blankRate,
  });
  // Item-analysis companions use the same codes as the student file (001, 002, ...)
  return { ...ds, exam: { ...ds.exam, versions: ds.exam.versions.map((v) => ({ ...v, itemCode: v.studentCode })) } };
}

/**
 * Simulate students for the Shuffler exam. The generated files use grading-center
 * codes (numeric sources padded: 1 -> 001; an accepted design change, see the
 * topic note); the true source codes are returned alongside, in version order.
 */
function fromShuffler(shuffler: ShufflerExam, s: GradingCenterSettings): { dataset: DummyDataset; sourceCodes: string[] } {
  const ds = datasetFromQuestionMap(canonicalQuestionMapCsv(shuffler), {
    students: s.students,
    seed: s.seed,
    codeStyle: "padded",
    blankRate: s.blankRate,
    plants: s.plants,
    plantMiskey: s.plantMiskey,
  });
  // datasetFromQuestionMap keeps each version's source code as itemCode
  const sourceCodes = ds.exam.versions.map((v) => v.itemCode);
  const dataset = {
    ...ds,
    exam: {
      ...ds.exam,
      versions: ds.exam.versions.map((v) => {
        const code = gradingCenterCode(v.itemCode);
        return { ...v, studentCode: code, itemCode: code };
      }),
    },
  };
  return { dataset, sourceCodes };
}

/**
 * Replace one character of `id` with "@", trying positions from `start` onwards;
 * the first variant that `isTaken` does not reject wins. Null when all are taken.
 */
export function maskOneDigit(id: string, start: number, isTaken: (masked: string) => boolean): string | null {
  for (let k = 0; k < id.length; k++) {
    const pos = (start + k) % id.length;
    const masked = id.slice(0, pos) + "@" + id.slice(pos + 1);
    if (!isTaken(masked)) return masked;
  }
  return null;
}

/** Assign IDs and sections, apply scan errors, and build the grading-center table. */
function layOut(base: DummyDataset, s: GradingCenterSettings) {
  const { exam } = base;
  const r = createRng(s.seed, "grading-center");
  const scan = s.scanErrors ? s.scanErrorRates : { multipleMark: 0, maskedId: 0, unreadableSection: 0 };
  const sectionLabels = Array.from({ length: s.sections }, (_, i) => String(i + 1).padStart(2, "0"));
  const codeOf = (st: DummyStudent) => exam.versions[st.version - 1].studentCode;

  // Unique synthetic 9-digit IDs
  const used = new Set<string>();
  const ids = base.students.map(() => {
    for (;;) {
      const id = "2" + String(Math.floor(r() * 1e8)).padStart(8, "0");
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  });

  const realized: RealizedScanErrors = { blanks: 0, multipleMarks: 0, maskedIds: 0, unreadableSections: 0 };
  const finalKeys = new Set(base.students.map((st, i) => `${codeOf(st)}|${ids[i]}`));
  const records = base.students.map((st, i) => {
    let id = ids[i];
    if (r() < scan.maskedId) {
      // Replace one digit with "@"; keep (Code, ID) unique after masking (else leave it readable)
      const code = codeOf(st);
      const masked = maskOneDigit(id, Math.floor(r() * 9), (x) => finalKeys.has(`${code}|${x}`));
      if (masked) {
        finalKeys.delete(`${code}|${id}`);
        finalKeys.add(`${code}|${masked}`);
        id = masked;
        realized.maskedIds++;
      }
    }
    const section = r() < scan.unreadableSection ? "@@" : sectionLabels[Math.floor(r() * sectionLabels.length)];
    if (section === "@@") realized.unreadableSections++;
    const marks = new Set<number>();
    const responses = st.responses.map((resp, m) => {
      if (resp === "") {
        realized.blanks++;
        return resp;
      }
      if (r() < scan.multipleMark) {
        marks.add(m + 1);
        realized.multipleMarks++;
        return "" as const; // "X" imports as a blank
      }
      return resp;
    });
    return { student: { ...st, id, responses } as DummyStudent, section, marks };
  });

  // Rows: solutions (one per version), then students by section ("@@" last), then ID
  const sectionRank = (sec: string) => (sec === "@@" ? 1000 : Number(sec));
  records.sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.student.id.localeCompare(b.student.id));

  const headers = ["form", "ID", "Section", "Code", ...Array.from({ length: GRADING_CENTER_COLUMNS }, (_, i) => String(i + 1))];
  const rows: (string | number)[][] = [];
  for (const v of exam.versions) {
    rows.push([
      rows.length + 1,
      "000000000",
      "00",
      v.studentCode,
      ...v.order.map((m) =>
        exam.questions[m - 1].publishedKey.map((l) => toVersionLetter(v.perms[m], l)).sort().join("")
      ),
    ]);
  }
  for (const { student, section, marks } of records) {
    const v = exam.versions[student.version - 1];
    rows.push([
      rows.length + 1,
      student.id,
      section,
      v.studentCode,
      ...v.order.map((m) => {
        if (marks.has(m)) return "X";
        const resp = student.responses[m - 1];
        return resp ? toVersionLetter(v.perms[m], resp) : "";
      }),
    ]);
  }

  return {
    dataset: { exam, students: records.map((x) => x.student) },
    table: { headers, rows },
    realized,
  };
}

/** One-sheet .xlsx: form is numeric; ID, Section, Code and answers are text. */
function workbookBytes(table: { headers: string[]; rows: (string | number)[][] }): Uint8Array<ArrayBuffer> {
  const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}
