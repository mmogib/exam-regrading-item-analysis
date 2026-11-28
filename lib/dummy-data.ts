/**
 * Dummy exam data generator.
 *
 * Builds one internally consistent synthetic exam (master + shuffled versions),
 * simulates student responses, and serialises them into every input form the
 * app accepts, together with independently computed expected results.
 *
 * Browser-safe: no filesystem or DOM access, so the same code backs the CLI
 * (scripts/generate-dummy-data.ts) and the in-app template downloads.
 * Expected results are computed here from master-coordinate responses and do
 * NOT call the app's grading/analysis functions (an independent oracle).
 *
 * Design and review: references/DUMMY_DATA_GENERATOR.md (channel 003).
 */
import * as XLSX from "xlsx";

export const GENERATOR_VERSION = "2";
export const POINTS_PER_QUESTION = 5; // the app's uniform default (types/exam.ts)

export type Letter = "A" | "B" | "C" | "D" | "E";
export const LETTERS: Letter[] = ["A", "B", "C", "D", "E"];

export type CodeStyle = "padded" | "plain" | "alpha";
export type PlantKind = "miskey" | "too-easy" | "dead-distractors" | "two-answers" | "low-discrimination";
export type KeyKind = "published" | "corrected";

export interface DummyParams {
  /** Total number of students (spread round-robin over versions). */
  students: number;
  questions: number;
  versions: number;
  seed: number;
  /** Student-file version codes: "001" (padded), "1" (plain) or "V1" (alpha). */
  codeStyle: CodeStyle;
  /** Plant the five problem questions (needs at least 5 questions). */
  plants: boolean;
  /** false: every version keeps master question order (option order is still shuffled). */
  shuffleQuestions: boolean;
  /** Probability that a response is left blank. */
  blankRate: number;
}

export const DEFAULT_PARAMS: DummyParams = {
  students: 200,
  questions: 20,
  versions: 4,
  seed: 42,
  codeStyle: "padded",
  plants: true,
  shuffleQuestions: true,
  blankRate: 0.02,
};

/** Clean, fixed dataset behind the four in-app template downloads. */
export const TEMPLATE_PRESET: DummyParams = {
  students: 20,
  questions: 20,
  versions: 4,
  seed: 2026,
  codeStyle: "padded",
  plants: false,
  shuffleQuestions: true,
  blankRate: 0,
};

export interface DummyQuestion {
  master: number; // 1-based master question number
  options: number; // number of answer options (2-5); letters beyond it do not exist
  a: number; // 2PL discrimination
  b: number; // 2PL difficulty
  trueAnswers: Letter[]; // master letters a knowledgeable student picks
  publishedKey: Letter[]; // master letters in the solution rows as published
  correctedKey: Letter[]; // master letters after re-grading
  weights: Partial<Record<Letter, number>>; // distractor attractiveness (0 = never chosen)
  plant?: PlantKind;
}

export interface DummyVersion {
  index: number; // logical version 1..V
  studentCode: string; // Code column in student files
  itemCode: string; // version code in item-analysis files
  order: number[]; // order[p - 1] = master question shown at version position p
  /** master question -> 5-letter permutation: version letter (index) -> master letter (value) */
  perms: Record<number, string>;
}

export interface DummyExam {
  params: DummyParams;
  source: "generated" | "shuffler";
  questions: DummyQuestion[];
  versions: DummyVersion[];
}

export interface DummyStudent {
  id: string;
  version: number; // logical version index
  theta: number;
  responses: (Letter | "")[]; // master coordinates; index = master question - 1
}

export interface DummyDataset {
  exam: DummyExam;
  students: DummyStudent[];
}

export interface Table {
  headers: string[];
  rows: string[][];
}

/* ------------------------------------------------------------------ */
/* Deterministic randomness: independent streams per stage            */
/* ------------------------------------------------------------------ */

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded from (seed, stream name). */
export function createRng(seed: number, stream: string): () => number {
  let a = hash32(`${seed}:${stream}`);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uniform = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();
const standardNormal = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

function shuffled<T>(r: () => number, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = <T,>(r: () => number, items: T[]): T => items[Math.floor(r() * items.length)];

/* ------------------------------------------------------------------ */
/* Letter mapping (canonical permutation: version letter -> master)    */
/* ------------------------------------------------------------------ */

export const toMasterLetter = (perm: string, versionLetter: Letter): Letter =>
  perm[LETTERS.indexOf(versionLetter)] as Letter;

export const toVersionLetter = (perm: string, masterLetter: Letter): Letter =>
  LETTERS[perm.indexOf(masterLetter)];

/** Version-coordinate key cell, e.g. master ["A","C"] -> "BE" (sorted). */
const keyCell = (perm: string, masterLetters: Letter[]) =>
  masterLetters.map((m) => toVersionLetter(perm, m)).sort().join("");

/* ------------------------------------------------------------------ */
/* Exam construction                                                   */
/* ------------------------------------------------------------------ */

function assertParams(p: DummyParams) {
  const positiveInt = (n: number) => Number.isInteger(n) && n > 0;
  if (!positiveInt(p.students) || !positiveInt(p.questions) || !positiveInt(p.versions)) {
    throw new Error("students, questions and versions must be positive integers");
  }
  if (p.questions < 2) throw new Error("at least 2 questions are needed (KR-20 needs k >= 2)");
  if (p.students < p.versions) throw new Error("need at least one student per version (students >= versions)");
  if (p.plants && p.questions < 5) throw new Error("the five planted problem questions need at least 5 questions");
  if (!(p.blankRate >= 0 && p.blankRate < 1)) throw new Error("blankRate must be in [0, 1)");
}

export function makeStudentCode(style: CodeStyle, k: number): string {
  if (style === "plain") return String(k);
  if (style === "alpha") return `V${k}`;
  return String(k).padStart(3, "0");
}

function regularQuestion(r: () => number, master: number, options = 5, correct?: Letter): DummyQuestion {
  const available = LETTERS.slice(0, options);
  const answer = correct ?? pick(r, available);
  const weights: Partial<Record<Letter, number>> = {};
  for (const l of available) if (l !== answer) weights[l] = uniform(r, 0.5, 1.5);
  return {
    master,
    options,
    a: uniform(r, 0.8, 1.5),
    b: uniform(r, -1.5, 1.5),
    trueAnswers: [answer],
    publishedKey: [answer],
    correctedKey: [answer],
    weights,
  };
}

function applyPlant(r: () => number, q: DummyQuestion, kind: PlantKind) {
  q.plant = kind;
  const distractors = LETTERS.slice(0, q.options).filter((l) => !q.trueAnswers.includes(l));
  switch (kind) {
    case "miskey": {
      // Solution rows were published with a distractor as the key; the true answer is restored on re-grading
      q.publishedKey = [pick(r, distractors)];
      break;
    }
    case "too-easy":
      q.a = 1.2;
      q.b = -3;
      break;
    case "dead-distractors":
      // Two distractors nobody picks: DE drops to 50% (one alone gives 75%, which can still be KEEP)
      for (const l of shuffled(r, distractors).slice(0, 2)) q.weights[l] = 0;
      break;
    case "two-answers": {
      const second = pick(r, distractors);
      q.trueAnswers = [...q.trueAnswers, second].sort() as Letter[];
      q.publishedKey = [...q.trueAnswers];
      q.correctedKey = [...q.trueAnswers];
      delete q.weights[second];
      break;
    }
    case "low-discrimination":
      q.a = 0.05;
      q.b = 0;
      break;
  }
}

const PLANT_ORDER: PlantKind[] = ["miskey", "too-easy", "dead-distractors", "two-answers", "low-discrimination"];

export function buildExam(params: DummyParams): DummyExam {
  assertParams(params);
  const r = createRng(params.seed, "exam");
  const masters = Array.from({ length: params.questions }, (_, i) => i + 1);
  const questions = masters.map((m) => regularQuestion(r, m));

  if (params.plants) {
    const targets = shuffled(r, masters).slice(0, PLANT_ORDER.length);
    targets.forEach((m, i) => applyPlant(r, questions[m - 1], PLANT_ORDER[i]));
  }

  const versions: DummyVersion[] = [];
  for (let k = 1; k <= params.versions; k++) {
    const order = params.shuffleQuestions ? shuffled(r, masters) : [...masters];
    const perms: Record<number, string> = {};
    for (const q of questions) {
      const used = shuffled(r, LETTERS.slice(0, q.options));
      perms[q.master] = [...used, ...LETTERS.slice(q.options)].join("");
    }
    versions.push({ index: k, studentCode: makeStudentCode(params.codeStyle, k), itemCode: String(k), order, perms });
  }

  return { params, source: "generated", questions, versions };
}

export function simulateStudents(exam: DummyExam): DummyStudent[] {
  const { params } = exam;
  const r = createRng(params.seed, "students");
  const students: DummyStudent[] = [];
  for (let i = 0; i < params.students; i++) {
    const theta = standardNormal(r);
    const responses = exam.questions.map((q): Letter | "" => {
      // Draw order: blank first, then correct-vs-incorrect, then which option
      if (r() < params.blankRate) return "";
      const pCorrect = 1 / (1 + Math.exp(-q.a * (theta - q.b)));
      if (r() < pCorrect) return pick(r, q.trueAnswers);
      const candidates = (Object.entries(q.weights) as [Letter, number][]).filter(([, w]) => w > 0);
      if (candidates.length === 0) return pick(r, q.trueAnswers);
      let x = r() * candidates.reduce((s, [, w]) => s + w, 0);
      for (const [letter, w] of candidates) {
        x -= w;
        if (x <= 0) return letter;
      }
      return candidates[candidates.length - 1][0];
    });
    students.push({
      id: `2026${String(i + 1).padStart(5, "0")}`,
      version: (i % params.versions) + 1, // round-robin: every version represented, no ability bias
      theta,
      responses,
    });
  }
  return students;
}

export function buildDataset(params: DummyParams): DummyDataset {
  const exam = buildExam(params);
  return { exam, students: simulateStudents(exam) };
}

/* ------------------------------------------------------------------ */
/* From a Shuffler Question Map                                        */
/* ------------------------------------------------------------------ */

function parseSimpleCsv(text: string): Table {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const split = (l: string) => l.split(",").map((c) => c.trim());
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

/**
 * Rebuild the exam structure from a Shuffler Question Map and simulate students for it.
 * The map's key is taken as truth (an explicit assumption, not an audit). Only
 * behavioural plants are possible (too-easy, dead distractors, low discrimination);
 * with `plantMiskey` the student files get one wrong key, which Step 3 is expected
 * to reject until it is corrected in Step 2.
 */
export function datasetFromQuestionMap(
  csvText: string,
  opts: Pick<DummyParams, "students" | "seed" | "codeStyle" | "blankRate"> & { plants: boolean; plantMiskey?: boolean }
): DummyDataset {
  const { headers, rows } = parseSimpleCsv(csvText);
  const col = (name: string) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Question Map is missing the "${name}" column`);
    return i;
  };
  const [cMaster, cVersion, cPos, cPerm, cCorrect] = ["Master Q#", "Version", "Version Q#", "Permutation", "Correct"].map(col);

  const byVersion = new Map<string, { pos: number; master: number; perm: string; correct: string }[]>();
  for (const row of rows) {
    const v = row[cVersion];
    if (!byVersion.has(v)) byVersion.set(v, []);
    byVersion.get(v)!.push({ pos: Number(row[cPos]), master: Number(row[cMaster]), perm: row[cPerm].toUpperCase(), correct: row[cCorrect].toUpperCase() });
  }
  const versionCodes = [...byVersion.keys()].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
  const K = byVersion.get(versionCodes[0])!.length;
  const masters = Array.from({ length: K }, (_, i) => i + 1);

  const masterKey = new Map<number, { letter: Letter; options: number }>();
  const versions: DummyVersion[] = versionCodes.map((code, i) => {
    const entries = byVersion.get(code)!;
    const sameSet = (xs: number[]) => [...xs].sort((a, b) => a - b).join() === masters.join();
    if (entries.length !== K || !sameSet(entries.map((e) => e.pos)) || !sameSet(entries.map((e) => e.master))) {
      throw new Error(`Version ${code}: positions and master questions must each be exactly 1..${K}`);
    }
    const order: number[] = [];
    const perms: Record<number, string> = {};
    for (const e of entries) {
      const n = e.perm.length;
      if (n < 2 || n > 5 || [...e.perm].sort().join("") !== LETTERS.slice(0, n).join("")) {
        throw new Error(`Version ${code}, Q${e.pos}: "${e.perm}" is not a permutation of A..${LETTERS[n - 1] ?? "?"}`);
      }
      if (!LETTERS.slice(0, n).includes(e.correct as Letter)) {
        throw new Error(`Version ${code}, Q${e.pos}: correct letter "${e.correct}" is not one of the ${n} options`);
      }
      const perm = e.perm + LETTERS.slice(n).join("");
      const letter = toMasterLetter(perm, e.correct as Letter);
      const known = masterKey.get(e.master);
      if (known && (known.letter !== letter || known.options !== n)) {
        throw new Error(`Master Q${e.master}: versions disagree on the master key or option count`);
      }
      masterKey.set(e.master, { letter, options: n });
      order[e.pos - 1] = e.master;
      perms[e.master] = perm;
    }
    return { index: i + 1, studentCode: makeStudentCode(opts.codeStyle, i + 1), itemCode: code, order, perms };
  });

  const params: DummyParams = {
    students: opts.students,
    questions: K,
    versions: versions.length,
    seed: opts.seed,
    codeStyle: opts.codeStyle,
    plants: opts.plants,
    shuffleQuestions: true,
    blankRate: opts.blankRate,
  };
  assertParams({ ...params, plants: false });

  const r = createRng(opts.seed, "exam");
  const questions = masters.map((m) => {
    const { letter, options } = masterKey.get(m)!;
    return regularQuestion(r, m, options, letter);
  });
  const kinds: PlantKind[] = [
    ...(opts.plantMiskey ? (["miskey"] as PlantKind[]) : []),
    ...(opts.plants ? (["too-easy", "dead-distractors", "low-discrimination"] as PlantKind[]) : []),
  ];
  if (kinds.length > K) throw new Error(`not enough questions for ${kinds.length} planted problems`);
  shuffled(r, masters)
    .slice(0, kinds.length)
    .forEach((m, i) => applyPlant(r, questions[m - 1], kinds[i]));

  const exam: DummyExam = { params, source: "shuffler", questions, versions };
  return { exam, students: simulateStudents(exam) };
}

/* ------------------------------------------------------------------ */
/* Tables (one dataset, many serialisations; no randomness below)      */
/* ------------------------------------------------------------------ */

export interface StudentTableOptions {
  key?: KeyKind;
  idHeader?: string;
  codeHeader?: string;
  questionHeader?: (n: number) => string;
  solutionId?: string; // "0" (current), "000000000" (legacy) or "" (empty)
  extraColumns?: { header: string; value: (row: { id: string; code: string; isSolution: boolean }) => string }[];
}

const versionOf = (exam: DummyExam, index: number) => exam.versions[index - 1];
const keyOf = (q: DummyQuestion, key: KeyKind) => (key === "published" ? q.publishedKey : q.correctedKey);

/** Student answer sheet: solution rows first, then students in ID order. */
export function studentTable(ds: DummyDataset, o: StudentTableOptions = {}): Table {
  const { exam } = ds;
  const key = o.key ?? "published";
  const K = exam.params.questions;
  const extras = o.extraColumns ?? [];
  const headers = [
    o.idHeader ?? "ID",
    o.codeHeader ?? "Code",
    ...extras.map((e) => e.header),
    ...Array.from({ length: K }, (_, i) => (o.questionHeader ?? String)(i + 1)),
  ];
  const rows: string[][] = [];
  for (const v of exam.versions) {
    const id = o.solutionId ?? "0";
    rows.push([
      id,
      v.studentCode,
      ...extras.map((e) => e.value({ id, code: v.studentCode, isSolution: true })),
      ...v.order.map((m) => keyCell(v.perms[m], keyOf(exam.questions[m - 1], key))),
    ]);
  }
  for (const s of ds.students) {
    const v = versionOf(exam, s.version);
    rows.push([
      s.id,
      v.studentCode,
      ...extras.map((e) => e.value({ id: s.id, code: v.studentCode, isSolution: false })),
      ...v.order.map((m) => {
        const resp = s.responses[m - 1];
        return resp ? toVersionLetter(v.perms[m], resp) : "";
      }),
    ]);
  }
  return { headers, rows };
}

/** Rows per (version, position), in version then position order. */
function mappingRows(exam: DummyExam, key: KeyKind) {
  return exam.versions.flatMap((v) =>
    v.order.map((m, i) => {
      const perm = v.perms[m];
      const q = exam.questions[m - 1];
      return { v, pos: i + 1, master: m, perm: perm.slice(0, q.options), correct: toVersionLetter(perm, keyOf(q, key)[0]) };
    })
  );
}

/** Normal / NEW format: Version, Version Q#, Master Q#. */
export function normalTable(exam: DummyExam): Table {
  return {
    headers: ["Version", "Version Q#", "Master Q#"],
    rows: mappingRows(exam, "published").map((r) => [r.v.itemCode, String(r.pos), String(r.master)]),
  };
}

/** Question Map, column order as exported by the Shuffler. */
export function questionMapTable(exam: DummyExam, key: KeyKind = "published"): Table {
  return {
    headers: ["Group", "Master Q#", "Version", "Version Q#", "Permutation", "Correct", "Points"],
    rows: mappingRows(exam, key).map((r) => ["1", String(r.master), r.v.itemCode, String(r.pos), r.perm, r.correct, "1"]),
  };
}

/** OLD format, carrying the optional Permutation/Correct metadata. */
export function oldTable(exam: DummyExam): Table {
  return {
    headers: ["code", "order", "order in master", "Permutation", "Correct"],
    rows: mappingRows(exam, "published").map((r) => [r.v.itemCode, String(r.pos), String(r.master), r.perm, r.correct]),
  };
}

/** Headers the app cannot detect; the required columns must be mapped by hand. */
export const UNKNOWN_HEADERS_MAPPING = { code: "Form", order: "Item", orderInMaster: "Source Item" } as const;

export function unknownHeadersTable(exam: DummyExam): Table {
  return {
    headers: ["Form", "Item", "Source Item", "Permutation", "Correct"],
    rows: mappingRows(exam, "published").map((r) => [r.v.itemCode, String(r.pos), String(r.master), r.perm, r.correct]),
  };
}

/**
 * Options Matrix in the current Shuffler direction: one row per master option;
 * version_k_Opt is the letter that master option became in version k.
 * Master_Correct is YES/NO on every row so the first row never drops the column
 * (see P3). Multi-answer keys are scalar here: the first accepted answer is flagged.
 * Version columns use the logical version number k; item codes are k as well.
 */
export function optionsMatrixTable(exam: DummyExam): Table {
  const headers = ["Q", "Option", "Master_Correct", ...exam.versions.flatMap((v) => [`version_${v.index}_Q`, `version_${v.index}_Opt`])];
  const rows: string[][] = [];
  for (const q of exam.questions) {
    const flagged = q.publishedKey[0];
    for (const m of LETTERS.slice(0, q.options)) {
      rows.push([
        String(q.master),
        m,
        m === flagged ? "YES" : "NO",
        ...exam.versions.flatMap((v) => [String(v.order.indexOf(q.master) + 1), toVersionLetter(v.perms[q.master], m)]),
      ]);
    }
  }
  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/* Serialisers                                                         */
/* ------------------------------------------------------------------ */

export function toDelimited(table: Table, delimiter = ","): string {
  const needsQuote = new RegExp(`["\\r\\n${delimiter === "\t" ? "\\t" : delimiter}]`);
  const cell = (v: string) => (needsQuote.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [table.headers, ...table.rows].map((r) => r.map(cell).join(delimiter)).join("\n") + "\n";
}

/** Workbook bytes; every cell is text so leading zeros in IDs and codes survive. */
export function toWorkbookBytes(table: Table, bookType: "xlsx" | "biff8" = "xlsx", sheetName = "Sheet1"): Uint8Array<ArrayBuffer> {
  const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return new Uint8Array(XLSX.write(book, { bookType, type: "array" }) as ArrayBuffer);
}

/* ------------------------------------------------------------------ */
/* Expected results (independent oracle)                               */
/* ------------------------------------------------------------------ */

const round2 = (x: number) => Math.round(x * 100) / 100;

export interface ExpectedGrade {
  ID: string;
  Code: string;
  Tot: number;
  Per: number;
}

export interface ExpectedResults {
  generator: { version: string; source: DummyExam["source"]; params: DummyParams };
  scoring: string;
  binding: { version: number; studentCode: string; itemCode: string; students: number }[];
  grades: { published: ExpectedGrade[]; corrected: ExpectedGrade[] };
  masterQuestions: {
    master: number;
    answered: number;
    blanks: number;
    correct: number;
    /** App convention for cross-version averages: blanks are left out of the denominator. */
    percentExcludingBlanks: number;
    percentBlankAsWrong: number;
    /** Reference item statistics in master coordinates, scored with `itemStatisticsKey`. */
    p: number;
    D: number;
    /** Pearson correlation of correct (0/1) with the rest score (items correct minus this item); 0 when either is constant. */
    rpb: number;
  }[];
  /** Key used for masterQuestions p/D/rpb, versionAverages and reliability. */
  itemStatisticsKey: KeyKind;
  versionAverages: { code: string; percentExcludingBlanks: number }[];
  reliability: { KR20: number };
  planted: { kind: PlantKind; master: number; trueAnswers: Letter[]; publishedKey: Letter[]; correctedKey: Letter[]; p: number; D: number; expectedSignal: string }[];
}

const PLANT_SIGNAL: Record<PlantKind, string> = {
  miskey: "Strong students avoid the published key: negative discrimination, typically INVESTIGATE. Re-grading with the corrected key fixes it.",
  "too-easy": "Very high difficulty index (p near 1): typically REVISE as too easy.",
  "dead-distractors": "Two options never chosen: distractor efficiency at most 50%, typically REVISE.",
  "two-answers": "Two accepted answers; both score. Option analysis reports only one of them as correct.",
  "low-discrimination": "Discrimination near zero: typically REVISE for weak discrimination (sign may vary with the seed).",
};

export function expectedResults(ds: DummyDataset, statsKey: KeyKind = "published"): ExpectedResults {
  const { exam, students } = ds;
  const K = exam.params.questions;
  const isCorrect = (s: DummyStudent, m: number, key: KeyKind) => {
    const r = s.responses[m - 1];
    return r !== "" && keyOf(exam.questions[m - 1], key).includes(r);
  };
  const grade = (key: KeyKind): ExpectedGrade[] =>
    students.map((s) => {
      let n = 0;
      for (let m = 1; m <= K; m++) if (isCorrect(s, m, key)) n++;
      return {
        ID: s.id,
        Code: versionOf(exam, s.version).studentCode,
        Tot: n * POINTS_PER_QUESTION,
        Per: round2((100 * n) / K),
      };
    });

  const published = grade("published");
  const scored = statsKey === "published" ? published : grade(statsKey);
  const itemsCorrect = scored.map((g) => g.Tot / POINTS_PER_QUESTION);

  // Upper/lower 27% groups by total score (stable order on ties), as the app does
  const ranked = students.map((s, i) => ({ s, t: itemsCorrect[i] })).sort((a, b) => b.t - a.t);
  const cut = Math.ceil(students.length * 0.27);
  const upper = ranked.slice(0, cut).map((x) => x.s);
  const lower = ranked.slice(-cut).map((x) => x.s);
  const share = (group: DummyStudent[], m: number) => group.filter((s) => isCorrect(s, m, statsKey)).length / group.length;

  // Point-biserial as a plain Pearson correlation of 0/1 correctness with the rest score
  const pearson = (xs: number[], ys: number[]) => {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  };
  const restCorrelation = (m: number) => {
    const xs = students.map((s) => (isCorrect(s, m, statsKey) ? 1 : 0));
    return pearson(xs, xs.map((x, i) => itemsCorrect[i] - x));
  };

  const masterQuestions = exam.questions.map((q) => {
    const answered = students.filter((s) => s.responses[q.master - 1] !== "").length;
    const correct = students.filter((s) => isCorrect(s, q.master, statsKey)).length;
    return {
      master: q.master,
      answered,
      blanks: students.length - answered,
      correct,
      percentExcludingBlanks: answered ? round2((100 * correct) / answered) : 0,
      percentBlankAsWrong: round2((100 * correct) / students.length),
      p: correct / students.length,
      D: share(upper, q.master) - share(lower, q.master),
      rpb: restCorrelation(q.master),
    };
  });

  const versionAverages = exam.versions.map((v) => {
    const group = students.filter((s) => s.version === v.index);
    let answered = 0;
    let correct = 0;
    for (const s of group) {
      for (let m = 1; m <= K; m++) {
        if (s.responses[m - 1] === "") continue;
        answered++;
        if (isCorrect(s, m, statsKey)) correct++;
      }
    }
    return { code: v.studentCode, percentExcludingBlanks: answered ? round2((100 * correct) / answered) : 0 };
  });

  // KR-20 with population variance of items-correct, as the app does
  const mean = itemsCorrect.reduce((a, b) => a + b, 0) / itemsCorrect.length;
  const variance = itemsCorrect.reduce((a, x) => a + (x - mean) ** 2, 0) / itemsCorrect.length;
  const sumPQ = masterQuestions.reduce((a, mq) => a + mq.p * (1 - mq.p), 0);
  const KR20 = variance === 0 ? 0 : (K / (K - 1)) * (1 - sumPQ / variance);

  return {
    generator: { version: GENERATOR_VERSION, source: exam.source, params: exam.params },
    scoring: `${POINTS_PER_QUESTION} points per question answered with any accepted answer; blanks and other answers score 0; Per rounded to 2 decimals.`,
    binding: exam.versions.map((v) => ({
      version: v.index,
      studentCode: v.studentCode,
      itemCode: v.itemCode,
      students: students.filter((s) => s.version === v.index).length,
    })),
    grades: { published, corrected: grade("corrected") },
    masterQuestions,
    itemStatisticsKey: statsKey,
    versionAverages,
    reliability: { KR20 },
    planted: exam.questions
      .filter((q) => q.plant)
      .map((q) => {
        const mq = masterQuestions[q.master - 1];
        return {
          kind: q.plant!,
          master: q.master,
          trueAnswers: q.trueAnswers,
          publishedKey: q.publishedKey,
          correctedKey: q.correctedKey,
          p: mq.p,
          D: mq.D,
          expectedSignal: PLANT_SIGNAL[q.plant!],
        };
      }),
  };
}

/* ------------------------------------------------------------------ */
/* The full file bundle                                                */
/* ------------------------------------------------------------------ */

export interface BundleFile {
  name: string;
  content: string | Uint8Array<ArrayBuffer>;
  step: 1 | 3 | 0; // wizard step the file is uploaded in (0 = reference only)
  expected: string; // what the app should do with it
}

const fuzzyHeaders: StudentTableOptions = {
  idHeader: "Student ID",
  codeHeader: "Exam Version",
  questionHeader: (n) => `Q${n}`,
  extraColumns: [{ header: "Section", value: ({ isSolution }) => (isSolution ? "00" : "01") }],
};

/** Every artifact for one dataset. Item-analysis files are omitted for Shuffler-sourced data. */
export function buildBundle(ds: DummyDataset): BundleFile[] {
  const { exam } = ds;
  const std = studentTable(ds);
  const files: BundleFile[] = [
    { name: "student_data.xlsx", content: toWorkbookBytes(std), step: 1, expected: "Auto-detected; imports directly." },
    { name: "student_data.xls", content: toWorkbookBytes(std, "biff8"), step: 1, expected: "Legacy Excel; auto-detected." },
    { name: "student_data.csv", content: toDelimited(std), step: 1, expected: "Comma-separated; auto-detected." },
    { name: "student_data.txt", content: toDelimited(std, "\t"), step: 1, expected: "Tab-separated text; auto-detected." },
    { name: "student_data_semicolon.csv", content: toDelimited(std, ";"), step: 1, expected: "Semicolon-separated; auto-detected." },
    {
      name: "student_data_fuzzy-headers.xlsx",
      content: toWorkbookBytes(studentTable(ds, fuzzyHeaders)),
      step: 1,
      expected: 'Headers "Student ID", "Exam Version", "Q1.."; an ignored "Section" column; auto-detected.',
    },
    {
      name: "student_data_legacy-solution-ids.csv",
      content: toDelimited(studentTable(ds, { solutionId: "000000000" })),
      step: 1,
      expected: 'Old solution-row format, ID = "000000000"; recognised as solution rows.',
    },
    {
      name: "student_data_empty-solution-ids.csv",
      content: toDelimited(studentTable(ds, { solutionId: "" })),
      step: 1,
      expected: "Solution rows with an empty ID; recognised as solution rows.",
    },
    {
      name: "student_data_manual-mapping.xlsx",
      content: toWorkbookBytes(studentTable(ds, { idHeader: "Learner", codeHeader: "Paper", questionHeader: (n) => `Question ${n}` })),
      step: 1,
      expected: 'ID and Code are not detected: the mapping screen appears. Map "Learner" to ID and "Paper" to Code.',
    },
  ];

  if (exam.questions.some((q) => q.plant === "miskey")) {
    files.push({
      name: "student_data_corrected-key.csv",
      content: toDelimited(studentTable(ds, { key: "corrected" })),
      step: 1,
      expected: "Same students with the corrected key, i.e. what Step 2 should produce after fixing the miskeyed question.",
    });
  }

  if (exam.source === "generated") {
    const mapping = exam.versions.some((v) => v.itemCode !== v.studentCode)
      ? " Codes differ from the student file, so the code-mapping screen appears; accept the suggested mapping."
      : "";
    files.push(
      { name: "item_analysis_normal.csv", content: toDelimited(normalTable(exam)), step: 3, expected: `Normal format; cross-version analysis only.${mapping}` },
      { name: "item_analysis_old.csv", content: toDelimited(oldTable(exam)), step: 3, expected: `OLD format with permutation metadata.${mapping}` },
      { name: "item_analysis_question-map.csv", content: toDelimited(questionMapTable(exam)), step: 3, expected: `Question Map; validates against the published key; full analysis.${mapping}` },
      { name: "item_analysis_options-matrix.csv", content: toDelimited(optionsMatrixTable(exam)), step: 3, expected: `Options Matrix; parses to the same mapping as the Question Map.${mapping}` },
      {
        name: "item_analysis_unknown-headers.csv",
        content: toDelimited(unknownHeadersTable(exam)),
        step: 3,
        expected: `Not detected: map "Form" to code, "Item" to order and "Source Item" to master order.${mapping}`,
      }
    );
    if (exam.questions.some((q) => q.plant === "miskey")) {
      files.push({
        name: "item_analysis_question-map_true-key.csv",
        content: toDelimited(questionMapTable(exam, "corrected")),
        step: 3,
        expected: "Question Map with the TRUE key, as the Shuffler would export it: Step 3 rejects the published student data (miskeyed question) until the key is corrected in Step 2.",
      });
    }
  }

  const expected = expectedResults(ds);
  const gradesCsv = (g: ExpectedGrade[]) =>
    toDelimited({ headers: ["ID", "Code", "Tot", "Per"], rows: g.map((x) => [x.ID, x.Code, String(x.Tot), String(x.Per)]) });
  files.push(
    { name: "expected_results.json", content: JSON.stringify(expected, null, 2) + "\n", step: 0, expected: "Reference results (independent of the app)." },
    { name: "expected_grades.csv", content: gradesCsv(expected.grades.published), step: 0, expected: "Grades with the published key (Step 2 before re-grading)." },
    { name: "expected_grades_corrected.csv", content: gradesCsv(expected.grades.corrected), step: 0, expected: "Grades with the corrected key (Step 2 after re-grading)." }
  );
  files.push({ name: "README.md", content: bundleReadme(ds, expected, files), step: 0, expected: "This description." });
  return files;
}

function bundleReadme(ds: DummyDataset, expected: ExpectedResults, files: BundleFile[]): string {
  const { exam } = ds;
  const p = exam.params;
  const lines = [
    "# Dummy exam dataset",
    "",
    `Generated by \`npm run gen:dummy\` (generator v${GENERATOR_VERSION}). **Synthetic data only.** No real students.`,
    "",
    `- Source: ${exam.source === "shuffler" ? "a Shuffler Question Map (its key taken as the true key)" : "generated exam"}`,
    `- Students: ${p.students} | Questions: ${p.questions} | Versions: ${p.versions} | Seed: ${p.seed}`,
    `- Question order shuffled per version: ${p.shuffleQuestions ? "yes" : "no"} | Blank rate: ${p.blankRate}`,
    `- Reference KR-20 (published key): ${expected.reliability.KR20.toFixed(3)}`,
    "",
    "## Version codes",
    "",
    "| Version | Student-file Code | Item-analysis code | Students |",
    "|---|---|---|---|",
    ...expected.binding.map((b) => `| ${b.version} | ${b.studentCode} | ${b.itemCode} | ${b.students} |`),
    "",
    "## Files",
    "",
    "| File | Step | What to expect |",
    "|---|---|---|",
    ...files.map((f) => `| \`${f.name}\` | ${f.step || "-"} | ${f.expected} |`),
    "| `README.md` | - | This description. |",
    "",
  ];
  if (expected.planted.length) {
    lines.push(
      "## Planted problem questions",
      "",
      "| Master Q | Problem | True / published / corrected key | Reference p | Reference D | Expected signal |",
      "|---|---|---|---|---|---|",
      ...expected.planted.map(
        (x) =>
          `| ${x.master} | ${x.kind} | ${x.trueAnswers.join("")} / ${x.publishedKey.join("")} / ${x.correctedKey.join("")} | ${x.p.toFixed(2)} | ${x.D.toFixed(2)} | ${x.expectedSignal} |`
      ),
      "",
      "Signals are typical, not guaranteed: the responses are random draws, so a different seed or size can move an item across a decision threshold.",
      ""
    );
  }
  lines.push("## Notes", "");
  if (exam.source === "shuffler") {
    lines.push(
      "- **Item analysis (Step 3):** use your own Shuffler files. The CLI copies them next to this README, unchanged. The student files use codes 001, 002 and so on, so accept the code-mapping screen."
    );
  }
  lines.push(
    "- Expected results are computed by the generator from the simulated answers. They do not reuse the app's code.",
    "- Cross-version percentages leave blanks out of the denominator, as the app does. `percentBlankAsWrong` in `expected_results.json` counts blanks as wrong.",
    "- The reference `p`, `D` and `rpb` are per master question, as the app computes them from v1.8.1. Earlier versions computed them per version position (P2), which mixes questions when the order is shuffled.",
    ""
  );
  return lines.join("\n");
}
