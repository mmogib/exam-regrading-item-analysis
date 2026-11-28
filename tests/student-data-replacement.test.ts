/**
 * P11: a new Step 1 upload must not keep (or later receive) an item-analysis
 * file that was checked against other student data. Pure transitions first,
 * then the provider, then the real wizard with file reads held open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CSVDetectionResult, ExamRow, ItemAnalysisRow } from "@/types/exam";
import { examRow, makeFile } from "./helpers";

// Let individual tests hold a file read open; otherwise the real readers run
vi.mock("@/lib/excel-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/excel-utils")>();
  return {
    ...actual,
    readCSVFileWithDetection: vi.fn(actual.readCSVFileWithDetection),
    readExamDataFileWithDetection: vi.fn(actual.readExamDataFileWithDetection),
  };
});

const excel = await import("@/lib/excel-utils");
const {
  acceptItemAnalysisTransition,
  applyNewStudentData,
  applyRegradedKey,
  migrateStoredState,
  useWizard,
  WizardProvider,
} = await import("@/contexts/wizard-context");
type WizardState = import("@/contexts/wizard-context").WizardState;
const { ExamWizard } = await import("@/components/wizard/exam-wizard");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const examA: ExamRow[] = [examRow("0", "1", ["A", "B"]), examRow("s1", "1", ["A", "B"]), examRow("s2", "1", ["A", "C"])];
const examB: ExamRow[] = [examRow("0", "1", ["C", "D"]), examRow("t1", "1", ["C", "D"]), examRow("t2", "1", ["E", "D"])];
const mapA: ItemAnalysisRow[] = [
  { code: 1, order: 1, order_in_master: 1, permutation: "ABCDE", correct: "A" },
  { code: 1, order: 2, order_in_master: 2, permutation: "ABCDE", correct: "B" },
];

const loaded = (overrides: Partial<WizardState> = {}): WizardState => ({
  studentData: examA,
  studentDataFileName: "a.csv",
  numQuestions: 2,
  studentRevision: 3,
  correctAnswersMap: { "1": [["A"], ["B"]] },
  hasRegraded: true,
  itemAnalysisData: mapA,
  itemAnalysisFileName: "map-a.csv",
  hasPermutation: true,
  currentStep: 4,
  completedSteps: [1, 2, 3],
  notice: null,
  ...overrides,
});

const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/* ------------------------------------------------------------------ */
/* Pure transitions                                                    */
/* ------------------------------------------------------------------ */

describe("applyNewStudentData", () => {
  it("clears Steps 2 and 3, returns to Step 1 and names what was removed", () => {
    const prev = deepFreeze(loaded());
    const next = applyNewStudentData(prev, examB, 2, "b.csv");
    expect(next.studentData).toBe(examB); // the incoming rows, untouched
    expect([next.studentDataFileName, next.numQuestions, next.studentRevision]).toEqual(["b.csv", 2, 4]);
    expect([next.itemAnalysisData, next.itemAnalysisFileName, next.hasPermutation]).toEqual([null, null, false]);
    expect([next.correctAnswersMap, next.hasRegraded]).toEqual([null, false]);
    expect([next.currentStep, next.completedSteps]).toEqual([1, [1]]);
    expect(next.notice).toEqual({
      kind: "student-data-replaced",
      itemAnalysisRemoved: true,
      itemAnalysisFileName: "map-a.csv",
      regradeReset: true,
    });
  });

  it("does the same for identical rows (identical answers do not prove the same exam)", () => {
    const next = applyNewStudentData(loaded(), examA.map((r) => ({ ...r })), 2, "a.csv");
    expect(next.itemAnalysisData).toBeNull();
    expect(next.completedSteps).toEqual([1]);
    expect(next.studentRevision).toBe(4);
  });

  it("reports only what was actually removed", () => {
    const mapOnly = applyNewStudentData(loaded({ hasRegraded: false, correctAnswersMap: null }), examB, 2, "b.csv");
    expect([mapOnly.notice?.itemAnalysisRemoved, mapOnly.notice?.regradeReset]).toEqual([true, false]);
    const regradeOnly = applyNewStudentData(loaded({ itemAnalysisData: null, itemAnalysisFileName: null }), examB, 2, "b.csv");
    expect([regradeOnly.notice?.itemAnalysisRemoved, regradeOnly.notice?.itemAnalysisFileName, regradeOnly.notice?.regradeReset]).toEqual([
      false,
      null,
      true,
    ]);
    const neither = applyNewStudentData(
      loaded({ itemAnalysisData: null, itemAnalysisFileName: null, hasRegraded: false, correctAnswersMap: null }),
      examB,
      2,
      "b.csv"
    );
    expect(neither.notice).toBeNull();
  });

  it("two imports in a row keep the first one's notice", () => {
    const twice = applyNewStudentData(applyNewStudentData(loaded(), examB, 2, "b.csv"), examA, 2, "a2.csv");
    expect(twice.notice).toEqual({
      kind: "student-data-replaced",
      itemAnalysisRemoved: true,
      itemAnalysisFileName: "map-a.csv",
      regradeReset: true,
    });
    expect(twice.studentRevision).toBe(5);
  });
});

describe("revision-bound acceptance", () => {
  it("accepts a file for the revision it was checked against, with Step 3 completion", () => {
    const prev = loaded({ itemAnalysisData: null, itemAnalysisFileName: null, completedSteps: [1, 2] });
    const next = acceptItemAnalysisTransition(prev, mapA, true, "map-a.csv", 3);
    expect([next.itemAnalysisData, next.itemAnalysisFileName, next.hasPermutation]).toEqual([mapA, "map-a.csv", true]);
    expect(next.completedSteps).toEqual([1, 2, 3]);
  });

  it("drops a file checked against an older revision, and its Step 3 completion", () => {
    const replaced = applyNewStudentData(loaded(), examB, 2, "b.csv");
    expect(acceptItemAnalysisTransition(replaced, mapA, true, "map-a.csv", 3)).toBe(replaced);
  });

  it("a re-grade that changes the key moves the revision on; an unchanged key does not", () => {
    const solved = (key: string[]) => [examRow("0", "1", key), ...examA.slice(1)];
    expect(applyRegradedKey(loaded(), solved(["C", "B"]), { "1": [["C"], ["B"]] }).state.studentRevision).toBe(4);
    expect(applyRegradedKey(loaded(), solved(["A", "B"]), { "1": [["A"], ["B"]] }).state.studentRevision).toBe(3);
  });
});

describe("migrateStoredState", () => {
  it("version 1: keeps the student data (with any corrected key), drops the item analysis, returns to Step 1", () => {
    const stale = { ...loaded({ studentData: examB, studentDataFileName: "b.csv" }) } as Partial<WizardState>;
    delete stale.studentRevision;
    delete stale.notice;
    const migrated = migrateStoredState({ version: 1, state: stale })!;
    expect(migrated.studentData).toEqual(examB);
    expect([migrated.studentDataFileName, migrated.numQuestions]).toEqual(["b.csv", 2]);
    expect([migrated.itemAnalysisData, migrated.hasRegraded, migrated.correctAnswersMap]).toEqual([null, false, null]);
    expect([migrated.currentStep, migrated.completedSteps]).toEqual([1, [1]]);
    expect(migrated.notice).toEqual({
      kind: "session-upgraded",
      itemAnalysisRemoved: true,
      itemAnalysisFileName: "map-a.csv",
      regradeReset: true,
    });
  });

  it("version 1 without student data starts empty; version 2 is restored as saved, without a notice", () => {
    expect(migrateStoredState({ version: 1, state: { currentStep: 3 } })!.studentData).toBeNull();
    const saved = loaded({ notice: { kind: "student-data-replaced", itemAnalysisRemoved: true, itemAnalysisFileName: null, regradeReset: false } });
    const restored = migrateStoredState({ version: 2, state: saved })!;
    expect(restored.itemAnalysisData).toEqual(mapA);
    expect(restored.notice).toBeNull();
  });

  it("anything else is discarded", () => {
    expect(migrateStoredState({ version: 99, state: loaded() })).toBeNull();
    expect(migrateStoredState(null)).toBeNull();
    expect(migrateStoredState("x")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Provider and wizard                                                 */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "kfupm_exam_wizard_v1";
let container: HTMLDivElement;
let root: Root;
let wizard: ReturnType<typeof useWizard>;

/** Reports the latest context value after every render (from an effect, not during render). */
function Probe({ onValue }: { onValue: (value: ReturnType<typeof useWizard>) => void }) {
  const value = useWizard();
  useEffect(() => {
    onValue(value);
  });
  return null;
}

async function mount(withWizard = false) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const probe = createElement(Probe, { onValue: (value) => (wizard = value) });
  await act(async () => {
    root.render(createElement(WizardProvider, null, probe, withWizard ? createElement(ExamWizard) : null));
  });
}

beforeEach(() => localStorage.clear());
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.mocked(excel.readCSVFileWithDetection).mockClear();
  vi.mocked(excel.readExamDataFileWithDetection).mockClear();
});

describe("provider", () => {
  it("a late acceptance for the previous data is dropped", async () => {
    await mount();
    await act(async () => wizard.updateStudentData(examA, 2, "a.csv"));
    const checkedAgainst = wizard.state.studentRevision;
    await act(async () => wizard.updateStudentData(examB, 2, "b.csv"));
    await act(async () => wizard.acceptItemAnalysis(mapA, true, "map-a.csv", checkedAgainst));
    expect(wizard.state.studentData).toBe(examB);
    expect(wizard.state.itemAnalysisData).toBeNull();
    expect(wizard.state.completedSteps).toEqual([1]);
  });

  it("Start Over does not let an earlier revision match again", async () => {
    await mount();
    await act(async () => wizard.updateStudentData(examA, 2, "a.csv"));
    const checkedAgainst = wizard.state.studentRevision;
    await act(async () => wizard.resetWizard());
    await act(async () => wizard.updateStudentData(examB, 2, "b.csv"));
    expect(wizard.state.studentRevision).not.toBe(checkedAgainst);
    await act(async () => wizard.acceptItemAnalysis(mapA, true, "map-a.csv", checkedAgainst));
    expect(wizard.state.itemAnalysisData).toBeNull();
  });

  it("queued updates in one batch end in a consistent state", async () => {
    await mount();
    await act(async () => wizard.updateStudentData(examA, 2, "a.csv"));
    const rev = wizard.state.studentRevision;
    await act(async () => wizard.acceptItemAnalysis(mapA, true, "map-a.csv", rev));
    expect(wizard.state.itemAnalysisData).toEqual(mapA);
    await act(async () => {
      wizard.updateStudentData(examB, 2, "b.csv");
      wizard.acceptItemAnalysis(mapA, true, "map-a.csv", rev); // same batch, already stale
      wizard.updateStudentData(examA, 2, "a2.csv");
    });
    expect(wizard.state.studentDataFileName).toBe("a2.csv");
    expect(wizard.state.itemAnalysisData).toBeNull();
    expect(wizard.state.notice?.itemAnalysisFileName).toBe("map-a.csv");
  });

  it("saves version 2 without the notice, and moving on dismisses the notice", async () => {
    await mount();
    await act(async () => wizard.updateStudentData(examA, 2, "a.csv"));
    const rev = wizard.state.studentRevision;
    await act(async () => wizard.acceptItemAnalysis(mapA, true, "map-a.csv", rev));
    await act(async () => wizard.updateStudentData(examB, 2, "b.csv"));
    expect(wizard.state.notice).not.toBeNull();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.version).toBe(2);
    expect(saved.state.notice).toBeNull();
    expect(saved.state.itemAnalysisData).toBeNull();
    await act(async () => wizard.setCurrentStep(2));
    expect(wizard.state.notice).toBeNull();
  });

  it("migrates a stale version-1 session once, and restores a version-2 session as saved", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { ...loaded({ studentData: examB }), studentRevision: undefined, notice: undefined } })
    );
    await mount();
    expect(wizard.state.studentData).toEqual(examB);
    expect(wizard.state.itemAnalysisData).toBeNull();
    expect(wizard.state.currentStep).toBe(1);
    expect(wizard.state.notice?.kind).toBe("session-upgraded");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(2);

    // A fresh, valid version-2 session keeps its accepted map on reload
    await act(async () => wizard.acceptItemAnalysis(mapA, true, "map-a.csv", wizard.state.studentRevision));
    await act(async () => root.unmount());
    container.remove();
    await mount();
    expect(wizard.state.itemAnalysisData).toEqual(mapA);
  });
});

describe("the wizard with file reads held open", () => {
  const csv = (rows: ExamRow[]) =>
    ["ID,Code,1,2", ...rows.map((r) => [r.ID, r.Code, r["1"], r["2"]].join(","))].join("\n") + "\n";
  const button = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
  const choose = async (file: File) => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 30)));
  const uploadStudents = async (rows: ExamRow[], name: string) => {
    await choose(makeFile(csv(rows), name));
    await settle();
  };
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };
  const mapDetection: CSVDetectionResult = {
    format: "NEW",
    columns: ["Version", "Version Q#", "Master Q#", "Permutation", "Correct"],
    data: [
      { Version: "1", "Version Q#": "1", "Master Q#": "1", Permutation: "ABCDE", Correct: "A" },
      { Version: "1", "Version Q#": "2", "Master Q#": "2", Permutation: "ABCDE", Correct: "B" },
    ],
  };

  it("a map read for exam A that finishes after exam B was loaded is dropped", async () => {
    await mount(true);
    await uploadStudents(examA, "a.csv");
    expect(wizard.state.studentDataFileName).toBe("a.csv");
    await act(async () => button("Next")!.click()); // Step 2
    await act(async () => button("Continue to Item Analysis")!.click()); // Step 3

    const held = deferred<CSVDetectionResult>();
    vi.mocked(excel.readCSVFileWithDetection).mockImplementationOnce(() => held.promise);
    await choose(makeFile("held", "map-a.csv"));

    await act(async () => button("Back")!.click()); // Step 2
    await act(async () => button("Back")!.click()); // Step 1
    await uploadStudents(examB, "b.csv");
    expect(wizard.state.studentDataFileName).toBe("b.csv");

    await act(async () => held.resolve(mapDetection));
    await settle();
    expect(wizard.state.itemAnalysisData).toBeNull();
    expect(wizard.state.completedSteps).toEqual([1]);

    // Step 3 offers no way on to Step 4 until a map is accepted for B
    await act(async () => button("Next")!.click());
    await act(async () => button("Continue to Item Analysis")!.click());
    expect(wizard.state.currentStep).toBe(3);
    expect(button("Next")).toBeUndefined();
  });

  it("the normal path still accepts a map checked against the current data", async () => {
    await mount(true);
    await uploadStudents(examA, "a.csv");
    await act(async () => button("Next")!.click());
    await act(async () => button("Continue to Item Analysis")!.click());
    vi.mocked(excel.readCSVFileWithDetection).mockImplementationOnce(async () => mapDetection);
    await choose(makeFile("map", "map-a.csv"));
    await settle();
    expect(wizard.state.itemAnalysisFileName).toBe("map-a.csv");
    expect(wizard.state.completedSteps).toEqual([1, 3]);
    expect(button("Next")).toBeDefined();
  });

  it("a Step 1 read that finishes after leaving Step 1 is ignored", async () => {
    await mount(true);
    await uploadStudents(examA, "a.csv");
    const held = deferred<Awaited<ReturnType<typeof excel.readExamDataFileWithDetection>>>();
    vi.mocked(excel.readExamDataFileWithDetection).mockImplementationOnce(() => held.promise);
    await choose(makeFile(csv(examB), "b.csv"));
    await act(async () => button("Next")!.click()); // leave Step 1 while B is still being read
    const real = await vi
      .mocked(excel.readExamDataFileWithDetection)
      .getMockImplementation()!(makeFile(csv(examB), "b.csv"));
    await act(async () => held.resolve(real));
    await settle();
    expect(wizard.state.studentDataFileName).toBe("a.csv");
    expect(wizard.state.currentStep).toBe(2);
  });

  it("a failed Step 1 upload keeps the current data and map", async () => {
    await mount(true);
    await uploadStudents(examA, "a.csv");
    await act(async () => wizard.acceptItemAnalysis(mapA, true, "map-a.csv", wizard.state.studentRevision));
    vi.mocked(excel.readExamDataFileWithDetection).mockImplementationOnce(async () => {
      throw new Error("unreadable");
    });
    await choose(makeFile("garbage", "bad.csv"));
    await settle();
    expect(container.textContent).toMatch(/unreadable/);
    expect(wizard.state.studentDataFileName).toBe("a.csv");
    expect(wizard.state.itemAnalysisData).toEqual(mapA);
  });

  it("after a replacement, Step 1 shows what was removed", async () => {
    await mount(true);
    await uploadStudents(examA, "a.csv");
    await act(async () => wizard.acceptItemAnalysis(mapA, true, "map-a.csv", wizard.state.studentRevision));
    await uploadStudents(examB, "b.csv");
    expect(container.textContent).toMatch(/Later steps were reset/);
    expect(container.textContent).toMatch(/The item analysis file "map-a\.csv" was removed/);
  });
});
