/**
 * Smoke test of the Step 1 template dialog in jsdom: it opens, generates a
 * snapshot, lists its downloads, invalidates them when a setting changes, and
 * closes on Escape. Layout and real file choosers need a browser check.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TemplateDialog } from "@/components/wizard/template-dialog";
import { buildDataset, DEFAULT_PARAMS, questionMapTable, toDelimited } from "@/lib/dummy-data";
import { blobToBytes, captureLinkDownloads } from "./helpers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemplateDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(TemplateDialog)));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const button = (text: string | RegExp) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? "")
    );
  const setNumber = async (label: string, value: string) => {
    const input = [...dialog()!.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => dialog()!.querySelector(`label[for="${i.id}"]`)?.textContent === label
    )!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("opens, generates the files, and invalidates them on a change", async () => {
    expect(dialog()).toBeNull();
    await act(async () => button("Download Template")!.click());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toMatch(/Download a template/);

    await setNumber("Students", "40");
    await act(async () => {
      button("Generate files")!.click();
      await new Promise((r) => setTimeout(r, 50));
    });
    const items = [...dialog()!.querySelectorAll("li")].map((li) => li.querySelector("p")?.textContent);
    expect(items).toEqual([
      "Student data (.xlsx)",
      "Matching Question Map (.csv)",
      "Matching Options Matrix (.csv)",
      "Matching Normal file (.csv)",
      "Expected results (.json)",
    ]);
    expect(dialog()!.textContent).toMatch(/40 students, 20 questions, versions 001, 002, 003, 004/);

    await setNumber("Sections", "5");
    expect(dialog()!.querySelectorAll("li")).toHaveLength(0); // stale downloads are withdrawn
  });

  it("shows every settings problem instead of generating", async () => {
    await act(async () => button("Download Template")!.click());
    await setNumber("Students", "0");
    await setNumber("Sections", "100");
    await act(async () => {
      button("Generate files")!.click();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(dialog()!.textContent).toMatch(/Cannot generate/);
    expect(dialog()!.textContent).toMatch(/Students must be a whole number/);
    expect(dialog()!.textContent).toMatch(/Sections must be a whole number/);
  });

  it("closes on Escape", async () => {
    await act(async () => button("Download Template")!.click());
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(dialog()).toBeNull();
  });

  /* ---------------- 007 D1: pending reads, queued generation, closing ---------------- */

  // A Shuffler Question Map with 8 questions and versions 1..3
  const mapText = toDelimited(
    questionMapTable(buildDataset({ ...DEFAULT_PARAMS, questions: 8, versions: 3, plants: false, seed: 3 }).exam)
  );
  /** A file whose read finishes only when `resolve` is called. */
  const slowFile = (name: string) => {
    let resolve!: () => void;
    const ready = new Promise<void>((r) => (resolve = r));
    const file = new File([mapText], name);
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => {
        await ready;
        return new TextEncoder().encode(mapText).buffer;
      },
    });
    return { file, resolve: async () => act(async () => resolve()) };
  };
  const open = async () => act(async () => button("Download Template")!.click());
  const escape = () =>
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const choose = (file: File) => {
    const input = dialog()!.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 50)));
  const generateButton = () => button(/Generate files|Reading file|Generating/)!;
  const downloads = () => dialog()!.querySelectorAll("li");

  it("waits for a file that is still being read, then uses it", async () => {
    await open();
    await setNumber("Students", "40");
    const slow = slowFile("map.csv");
    await act(async () => choose(slow.file));
    expect(generateButton().disabled).toBe(true);
    expect(generateButton().textContent).toMatch(/Reading file/);
    await slow.resolve();
    expect(dialog()!.textContent).toMatch(/Using map\.csv/);
    expect(generateButton().disabled).toBe(false);
    await act(async () => generateButton().click());
    await settle();
    expect(dialog()!.textContent).toMatch(/40 students, 8 questions, versions 001, 002, 003/);
  });

  it("a file chosen while a generation is queued discards that generation", async () => {
    await open();
    const slow = slowFile("map.csv");
    await act(async () => {
      generateButton().click();
      choose(slow.file);
    });
    await slow.resolve();
    await settle();
    expect(downloads()).toHaveLength(0);
    expect(dialog()!.textContent).toMatch(/Using map\.csv/);
  });

  it("closing cancels a pending read", async () => {
    await open();
    const slow = slowFile("map.csv");
    await act(async () => choose(slow.file));
    await act(async () => escape());
    await slow.resolve();
    await open();
    expect(dialog()!.textContent).not.toMatch(/Using map\.csv/);
    expect(dialog()!.textContent).not.toMatch(/Reading/);
    expect(generateButton().disabled).toBe(false);
  });

  it("closing cancels a queued generation", async () => {
    await open();
    await act(async () => {
      generateButton().click();
      escape();
    });
    await settle();
    await open();
    expect(downloads()).toHaveLength(0);
    expect(generateButton().textContent).toBe("Generate files");
  });

  it("reads finishing out of order keep the newest file", async () => {
    await open();
    const a = slowFile("a.csv");
    const b = slowFile("b.csv");
    await act(async () => choose(a.file));
    await act(async () => choose(b.file));
    await b.resolve();
    await a.resolve();
    expect(dialog()!.textContent).toMatch(/Using b\.csv/);
  });

  it("downloads exactly the snapshot's files, in any order", async () => {
    await open();
    await setNumber("Students", "30");
    await act(async () => generateButton().click());
    await settle();
    const capture = captureLinkDownloads();
    const buttons = () => [...dialog()!.querySelectorAll("li button")] as HTMLButtonElement[];
    try {
      await act(async () => buttons().forEach((b) => b.click()));
      await act(async () => [...buttons()].reverse().forEach((b) => b.click()));
    } finally {
      capture.restore();
    }
    const n = buttons().length;
    const first = capture.downloads.slice(0, n);
    const second = capture.downloads.slice(n).reverse();
    expect(first.map((d) => d.filename)).toEqual(second.map((d) => d.filename));
    expect(first[0].filename).toMatch(/_grading_center\.xlsx$/);
    for (let i = 0; i < n; i++) {
      expect(await blobToBytes(first[i].blob)).toEqual(await blobToBytes(second[i].blob));
    }
  });
});
