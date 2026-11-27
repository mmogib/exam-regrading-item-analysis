import * as XLSX from "xlsx";
import { vi } from "vitest";
import { isSolutionRow } from "@/lib/excel-utils";
import type { ExamRow, ItemAnalysisRow } from "@/types/exam";

/** Build an ExamRow with question columns "1".."n" from an answer list. */
export function examRow(ID: string, Code: string, answers: string[]): ExamRow {
  const row: ExamRow = { ID, Code };
  answers.forEach((answer, i) => {
    row[String(i + 1)] = answer;
  });
  return row;
}

/** Create a browser File from text or bytes (as an upload would provide). */
export function makeFile(content: string | Uint8Array, name: string): File {
  const part = typeof content === "string" ? content : new Uint8Array(content);
  return new File([part], name);
}

/** Read a Blob's bytes through FileReader, as the browser code does. */
export function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Read a Blob as text through FileReader. */
export function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Parse workbook bytes into { sheetName: rows-as-arrays } (header row first). */
export function readWorkbookSheets(bytes: Uint8Array): Record<string, unknown[][]> {
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheets: Record<string, unknown[][]> = {};
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: "",
    });
  }
  return sheets;
}

/**
 * Capture downloads made through `URL.createObjectURL` + `<a>.click()`
 * (the template generators). Returns the captured blobs with their filenames.
 */
export function captureLinkDownloads() {
  const blobs: Blob[] = [];
  const downloads: { filename: string; blob: Blob }[] = [];

  const createSpy = vi.fn((obj: Blob | MediaSource) => {
    blobs.push(obj as Blob);
    return `blob:mock/${blobs.length - 1}`;
  });
  Object.defineProperty(URL, "createObjectURL", { value: createSpy, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });

  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      const index = Number(this.href.split("/").pop());
      downloads.push({ filename: this.download, blob: blobs[index] });
    });

  return {
    downloads,
    restore: () => clickSpy.mockRestore(),
  };
}

/**
 * Apply the same code mapping the Step 3 UI suggests when item-analysis codes
 * differ from student codes: pair both code lists sorted numerically-then-
 * alphabetically, by position (see step3-upload-item-analysis.tsx).
 */
export function mapCodesByPosition(
  itemAnalysis: ItemAnalysisRow[],
  studentData: ExamRow[]
): ItemAnalysisRow[] {
  const sortCodes = (codes: string[]) =>
    [...codes].sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;
      return a.localeCompare(b);
    });

  const answerCodes = sortCodes(
    Array.from(
      new Set(studentData.filter((r) => !isSolutionRow(r)).map((r) => String(r.Code).trim()))
    )
  );
  const itemCodes = sortCodes(
    Array.from(new Set(itemAnalysis.map((ia) => String(ia.code).trim())))
  );

  const reverse: Record<string, string> = {};
  for (let i = 0; i < Math.min(answerCodes.length, itemCodes.length); i++) {
    reverse[itemCodes[i]] = answerCodes[i];
  }
  return itemAnalysis.map((ia) => ({
    ...ia,
    code: reverse[String(ia.code).trim()] || ia.code,
  }));
}

/**
 * JSON with non-finite numbers made explicit (JSON.stringify would silently
 * turn NaN/Infinity into null).
 */
export function stableJSON(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "number" && !Number.isFinite(v)) return `__${String(v)}__`;
      return v;
    },
    2
  );
}
