import * as XLSX from "xlsx";
import { vi } from "vitest";
import { applyCodeBinding, bindVersionCodes, isSolutionRow } from "@/lib/excel-utils";
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
 * Bind item-analysis codes to student codes exactly as Step 3 does, using the
 * production binder (bindVersionCodes, P12): exact sets pass through, a unique
 * all-digit match by number is applied, and otherwise the mapping screen's
 * suggestion is accepted. (The name is historical: binding is no longer only
 * by position.)
 */
export function mapCodesByPosition(
  itemAnalysis: ItemAnalysisRow[],
  studentData: ExamRow[]
): ItemAnalysisRow[] {
  const studentCodes = studentData.filter((r) => !isSolutionRow(r)).map((r) => String(r.Code).trim());
  const binding = bindVersionCodes(studentCodes, itemAnalysis.map((ia) => String(ia.code).trim()));
  if (binding.kind === "exact") return itemAnalysis;
  if (binding.kind === "numeric") return applyCodeBinding(itemAnalysis, binding.itemToStudent);
  const reverse = new Map([...binding.suggestion].map(([student, item]) => [item, student]));
  return applyCodeBinding(itemAnalysis, reverse);
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
