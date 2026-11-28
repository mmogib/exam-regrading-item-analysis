/**
 * Downloadable templates (Step 1 and Step 3 buttons).
 *
 * All four templates come from ONE generated dataset (TEMPLATE_PRESET in
 * lib/dummy-data.ts), so the exam template and the three item-analysis
 * templates describe the same exam and validate against each other.
 * The preset is fixed, so every download is identical regardless of order.
 */
import { DOWNLOAD_FILENAMES } from "@/config/downloads";
import {
  buildDataset,
  normalTable,
  optionsMatrixTable,
  questionMapTable,
  studentTable,
  TEMPLATE_PRESET,
  toDelimited,
  toWorkbookBytes,
  type DummyDataset,
} from "./dummy-data";

let templateDataset: DummyDataset | null = null;
const dataset = () => (templateDataset ??= buildDataset(TEMPLATE_PRESET));

/** Save content as a file through a temporary link (also used by the template dialog). */
export function downloadFile(content: BlobPart, type: string, filename: string): void {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

const CSV = "text/csv;charset=utf-8;";

/** Student answer sheet with solution rows: 4 versions, 20 questions, 5 students per version. */
export function generateExamTemplate(): void {
  downloadFile(toWorkbookBytes(studentTable(dataset())), "application/octet-stream", DOWNLOAD_FILENAMES.templates.examDataTemplate);
}

/** Normal format (question mapping only): cross-version analysis. */
export function generateItemAnalysisNormalTemplate(): void {
  downloadFile(toDelimited(normalTable(dataset().exam)), CSV, DOWNLOAD_FILENAMES.templates.itemAnalysisNormal);
}

/** Question Map (with permutation and key): full psychometric analysis. */
export function generateItemAnalysisWithPermutationTemplate(): void {
  downloadFile(toDelimited(questionMapTable(dataset().exam)), CSV, DOWNLOAD_FILENAMES.templates.itemAnalysisWithPermutation);
}

/** Options Matrix (current Shuffler direction): full psychometric analysis. */
export function generateItemAnalysisWideTemplate(): void {
  downloadFile(toDelimited(optionsMatrixTable(dataset().exam)), CSV, DOWNLOAD_FILENAMES.templates.itemAnalysisWide);
}
