"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  FileSpreadsheet,
  Download,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { FileDropZone } from "@/components/shared/file-drop-zone";
import {
  readCSVFileWithDetection,
  normalizeItemAnalysis,
  parseCSVWithMapping,
  parseWideFormat,
  validateCorrectAnswers,
  isSolutionRow,
  bindVersionCodes,
  applyCodeBinding,
} from "@/lib/excel-utils";
import {
  generateItemAnalysisNormalTemplate,
  generateItemAnalysisWithPermutationTemplate,
  generateItemAnalysisWideTemplate,
} from "@/lib/template-generator";
import { DOWNLOAD_FILENAMES } from "@/config/downloads";
import { useWizard } from "@/contexts/wizard-context";
import {
  ItemAnalysisRow,
  CSVDetectionResult,
  ColumnMapping,
} from "@/types/exam";
import { error as logError, debug as logDebug } from "@/lib/logger";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STALE_MESSAGE =
  "The student data changed while this file was being checked. Upload the item analysis file again.";

export function Step3UploadItemAnalysis() {
  const { state, acceptItemAnalysis } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [csvDetection, setCsvDetection] = useState<CSVDetectionResult | null>(
    null
  );
  const [showMappingUI, setShowMappingUI] = useState(false);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    code: "",
    order: "",
    orderInMaster: "",
  });

  // Code mapping states
  const [showCodeMappingUI, setShowCodeMappingUI] = useState(false);
  const [codeMapping, setCodeMapping] = useState<{
    [answerCode: string]: string;
  }>({});
  const [itemAnalysisCodes, setItemAnalysisCodes] = useState<string[]>([]);
  const [usedCodes, setUsedCodes] = useState<string[]>([]);
  const [tempItemAnalysisData, setTempItemAnalysisData] = useState<
    ItemAnalysisRow[] | null
  >(null);
  const [tempHasPermutation, setTempHasPermutation] = useState(false);
  const [tempFileName, setTempFileName] = useState("");
  // Student-data revision the pending mapping screen was built for (P11)
  const [tempRevision, setTempRevision] = useState<number | null>(null);
  // File attempt the pending code-mapping / column-mapping screen belongs to (011 D1)
  const [tempAttempt, setTempAttempt] = useState<number | null>(null);
  const [columnDraft, setColumnDraft] = useState<{ attempt: number; revision: number } | null>(null);
  // Every chosen file is a new attempt; anything from an older attempt is obsolete
  const attemptRef = useRef(0);

  // The latest student-data revision, for work that finishes after a render (P11)
  const latestRevision = useRef(state.studentRevision);
  useEffect(() => {
    latestRevision.current = state.studentRevision;
  }, [state.studentRevision]);

  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    data: ItemAnalysisRow[];
    hasPermutation: boolean;
    rowCount: number;
  } | null>(null);

  if (!state.studentData) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No Student Data</AlertTitle>
        <AlertDescription>
          Please go back to Step 1 and upload student data first.
        </AlertDescription>
      </Alert>
    );
  }

  const handleFileSelect = async (file: File) => {
    const attempt = ++attemptRef.current;
    const current = () => attempt === attemptRef.current;
    const revision = state.studentRevision;
    setLoading(true);
    setError(null);
    setWarning(null);
    setCodeNote(null);
    setUploadedFile(null);
    // A new file cancels any mapping screen still open for an earlier file
    setShowMappingUI(false);
    setColumnDraft(null);
    setShowCodeMappingUI(false);
    setTempItemAnalysisData(null);
    setTempAttempt(null);

    try {
      const detection = await readCSVFileWithDetection(file);
      if (!current()) return;
      setCsvDetection(detection);

      if (detection.format === "UNKNOWN") {
        // Show mapping UI, bound to this attempt and the revision it was read against
        setColumnDraft({ attempt, revision });
        setShowMappingUI(true);
        setColumnMapping({
          code: detection.columns[0] || "",
          order: detection.columns[1] || "",
          orderInMaster: detection.columns[2] || "",
        });
      } else if (detection.format === "WIDE") {
        // Parse WIDE format first
        const parsedData = parseWideFormat(detection.data, detection.columns);
        logDebug({ WIDE: parsedData });
        await processItemAnalysis(file.name, parsedData, "WIDE", revision, attempt);
      } else {
        // Auto-detected format (OLD or NEW) - parse immediately
        await processItemAnalysis(file.name, detection.data, detection.format, revision, attempt);
      }
    } catch (err: any) {
      if (!current()) return;
      logError("Error reading item analysis file:", err);
      setError(
        err.message ||
          "Error reading file. Please check the format and try again."
      );
    } finally {
      if (current()) setLoading(false);
    }
  };

  const handleApplyMapping = async () => {
    if (
      !csvDetection ||
      !columnMapping.code ||
      !columnMapping.order ||
      !columnMapping.orderInMaster
    ) {
      setError("Please select all three required columns.");
      return;
    }

    if (!columnDraft || columnDraft.attempt !== attemptRef.current) {
      setShowMappingUI(false);
      setError(STALE_MESSAGE);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const parsedData = parseCSVWithMapping(csvDetection.data, columnMapping);
      await processItemAnalysis("Custom mapped file", parsedData, "MAPPED", columnDraft.revision, columnDraft.attempt);
      setShowMappingUI(false);
    } catch (err: any) {
      logError("Error parsing with custom mapping:", err);
      setError(err.message || "Error parsing CSV. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Bind the item-analysis codes to the student codes (P12, bindVersionCodes):
   * exact matches pass through; all-digit codes that match one to one by number
   * (1 = 001) are rebound to the student codes, with a note; anything else opens
   * the code-mapping screen. Returns the rows to validate, or null while the
   * mapping screen waits for the user.
   */
  const checkCodeMismatch = (
    parsedData: ItemAnalysisRow[],
    hasPerm: boolean,
    fileName: string,
    revision: number,
    attempt: number
  ): ItemAnalysisRow[] | null => {
    const students = state.studentData!.filter((row) => !isSolutionRow(row));
    const answerCodes = students.map((s) => String(s.Code).trim());
    const itemCodes = parsedData.map((ia) => String(ia.code).trim());
    const binding = bindVersionCodes(answerCodes, itemCodes);

    if (binding.kind === "exact") return parsedData;

    if (binding.kind === "numeric") {
      const pairs = [...binding.itemToStudent.entries()]
        .map(([item, student]) => `${item} = ${student}`)
        .join(", ");
      setCodeNote(`Version codes matched by number: ${pairs}.`);
      return applyCodeBinding(parsedData, binding.itemToStudent);
    }

    // Store temp data and show code mapping UI
    setTempItemAnalysisData(parsedData);
    setTempHasPermutation(hasPerm);
    setTempFileName(fileName);
    setTempRevision(revision);
    setTempAttempt(attempt);
    setCodeMapping(Object.fromEntries(binding.suggestion));
    setItemAnalysisCodes(binding.itemCodes);
    setUsedCodes(binding.studentCodes);
    setShowCodeMappingUI(true);
    return null; // Not ready to complete
  };

  const processItemAnalysis = async (
    fileName: string,
    data: any[],
    format: string,
    revision: number,
    attempt: number
  ) => {
    let parsedData: ItemAnalysisRow[];

    if (format === "MAPPED") {
      parsedData = data;
    } else if (format === "WIDE") {
      // WIDE format is already parsed by readCSVFileWithDetection
      parsedData = data;
    } else {
      parsedData = normalizeItemAnalysis(data, format as "OLD" | "NEW");
    }

    if (parsedData.length === 0) {
      setError(
        "No valid rows found in item analysis file. Please check your data."
      );
      return;
    }

    // Check permutation
    const hasPerm = parsedData.some((ia) => ia.permutation);

    if (!hasPerm) {
      setWarning(
        "Permutation data not detected. Comprehensive psychometric analysis will not be available. Only cross-version analysis will be computed."
      );
    }

    // Bind the codes FIRST (before validation)
    const bound = checkCodeMismatch(parsedData, hasPerm, fileName, revision, attempt);
    if (!bound) {
      // Code mapping UI is shown, wait for user confirmation
      return;
    }
    parsedData = bound;

    // Codes match - now validate correct answers
    const validationError = validateCorrectAnswers(
      parsedData,
      state.studentData!
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    // Validation passed - complete the step
    completeStep(parsedData, hasPerm, fileName, revision, attempt);
  };

  const handleAcceptCodeMapping = () => {
    if (!tempItemAnalysisData || tempAttempt === null) return;
    if (tempAttempt !== attemptRef.current) {
      // A newer file was chosen since this screen opened
      setShowCodeMappingUI(false);
      return;
    }
    if (tempRevision !== state.studentRevision) {
      setShowCodeMappingUI(false);
      setError(STALE_MESSAGE);
      return;
    }

    // Apply code mapping
    const reverseMapping = new Map<string, string>();
    Object.entries(codeMapping).forEach(([answerCode, itemCode]) => {
      reverseMapping.set(String(itemCode).trim(), String(answerCode).trim());
    });

    // Map item analysis codes to match answer codes
    const mappedItemAnalysis = applyCodeBinding(tempItemAnalysisData, reverseMapping);

    // Validate correct answers AFTER mapping codes
    const validationError = validateCorrectAnswers(
      mappedItemAnalysis,
      state.studentData!
    );
    if (validationError) {
      setShowCodeMappingUI(false);
      setError(validationError);
      return;
    }

    setShowCodeMappingUI(false);
    completeStep(mappedItemAnalysis, tempHasPermutation, tempFileName, tempRevision, tempAttempt);
  };

  const completeStep = (
    parsedData: ItemAnalysisRow[],
    hasPerm: boolean,
    fileName: string,
    revision: number,
    attempt: number
  ) => {
    // A result from an older file attempt never replaces a newer one
    if (attempt !== attemptRef.current) return;
    if (revision !== latestRevision.current) {
      setError(STALE_MESSAGE);
      return;
    }
    setUploadedFile({
      name: fileName,
      data: parsedData,
      hasPermutation: hasPerm,
      rowCount: parsedData.length,
    });

    // Accept the file and complete Step 3 in one step, bound to the validated revision
    acceptItemAnalysis(parsedData, hasPerm, fileName, revision);
  };

  return (
    <div className="space-y-6">
      {/* Loaded Files Info */}
      {state.studentDataFileName && (
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <FileSpreadsheet className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 dark:text-blue-100">
            Loaded Files
          </AlertTitle>
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            <div className="flex items-center gap-2 mt-1">
              <FileSpreadsheet className="h-3 w-3" />
              <span className="font-semibold">Student Data:</span>
              <span className="font-mono text-sm">
                {state.studentDataFileName}
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-orange-600" />
            <CardTitle>Upload Item Analysis File</CardTitle>
          </div>
          <CardDescription>
            Upload the CSV file mapping questions across exam versions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Format Selection Guide */}
          <Card className="border-blue-200 dark:border-blue-800">
            <Accordion type="single" collapsible>
              <AccordionItem value="format-guide" className="border-0">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-semibold text-blue-900 dark:text-blue-100">
                      Which Format Should I Use?
                    </span>
                    <span className="text-sm text-muted-foreground ml-2">
                      (Click to expand)
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4">
                  <div className="space-y-4">
                    {/* Normal Format */}
                    <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold">
                          1
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm mb-2">Normal Format</h4>
                          <ul className="text-sm space-y-1 text-muted-foreground">
                            <li><strong>Use when:</strong> You only have question order mapping (no option shuffling)</li>
                            <li><strong>Provides:</strong> Cross-version analysis only</li>
                            <li><strong>Example:</strong> Version 1 Q1 = Master Q3</li>
                            <li><strong>File structure:</strong> Version, Version Q#, Master Q#</li>
                            <li className="text-green-700 dark:text-green-400">✓ Simplest | ✓ No permutation needed</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Question Map Format */}
                    <div className="border-2 border-green-300 dark:border-green-700 rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-200 dark:bg-green-700 flex items-center justify-center text-sm font-bold">
                          2
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-sm">Question Map (With Permutation)</h4>
                            <span className="text-xs px-2 py-0.5 rounded bg-green-600 text-white font-semibold">
                              Recommended
                            </span>
                          </div>
                          <ul className="text-sm space-y-1 text-muted-foreground">
                            <li><strong>Use when:</strong> You have option shuffling data</li>
                            <li><strong>Provides:</strong> Full psychometric analysis + KR-20 reliability</li>
                            <li><strong>Example:</strong> Version 1 Q1 options = BCDEA (rotated)</li>
                            <li><strong>File structure:</strong> Version, Version Q#, Master Q#, Permutation, Correct</li>
                            <li className="text-green-700 dark:text-green-400">✓ Most common | ✓ Best for comprehensive analysis</li>
                            <li className="flex items-center gap-1 text-blue-700 dark:text-blue-400 mt-2">
                              <ExternalLink className="h-3 w-3" />
                              <span>Usually output from the </span>
                              <a
                                href={DOWNLOAD_FILENAMES.externalLinks.shufflerTool}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:no-underline font-semibold"
                              >
                                Shuffler Tool
                              </a>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Options Matrix Format */}
                    <div className="border rounded-lg p-4 bg-purple-50 dark:bg-purple-900/20">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-200 dark:bg-purple-700 flex items-center justify-center text-sm font-bold">
                          3
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-sm">Options Matrix (WIDE Format)</h4>
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-600 text-white font-semibold">
                              Advanced
                            </span>
                          </div>
                          <ul className="text-sm space-y-1 text-muted-foreground">
                            <li><strong>Use when:</strong> You track each option&apos;s position individually</li>
                            <li><strong>Provides:</strong> Same as Question Map (auto-generates permutation)</li>
                            <li><strong>Example:</strong> Master Q1 Option A → Version 1 Q4 Option B</li>
                            <li><strong>File structure:</strong> Q, Option, Master_Correct, version_X_Q, version_X_Opt</li>
                            <li className="text-purple-700 dark:text-purple-400">✓ Most detailed | ✓ For complex randomization</li>
                            <li className="flex items-center gap-1 text-blue-700 dark:text-blue-400 mt-2">
                              <ExternalLink className="h-3 w-3" />
                              <span>Usually output from the </span>
                              <a
                                href={DOWNLOAD_FILENAMES.externalLinks.shufflerTool}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:no-underline font-semibold"
                              >
                                Shuffler Tool
                              </a>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Quick Decision */}
                    <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-900 dark:text-blue-100">Quick Decision</AlertTitle>
                      <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                        <strong>Not sure?</strong> If you used the Shuffler Tool, download <strong>Question Map</strong> or <strong>Options Matrix</strong>.
                        If you manually created the exam without option shuffling, use <strong>Normal</strong> format.
                      </AlertDescription>
                    </Alert>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>

          {/* Template Download Buttons */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold">Fixed Example Files</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Small fixed examples that match the fixed example in Step 1. For an exam generated with
                  Step 1&apos;s Download Template, use the files generated with it.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={generateItemAnalysisNormalTemplate}
                className="gap-2 justify-start"
              >
                <Download className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-semibold">Normal</div>
                  <div className="text-xs text-muted-foreground">Basic format</div>
                </div>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={generateItemAnalysisWithPermutationTemplate}
                className="gap-2 justify-start"
              >
                <Download className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-semibold">Question Map</div>
                  <div className="text-xs text-muted-foreground">Full analysis</div>
                </div>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={generateItemAnalysisWideTemplate}
                className="gap-2 justify-start"
              >
                <Download className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-semibold">Options Matrix</div>
                  <div className="text-xs text-muted-foreground">Option-level</div>
                </div>
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload Error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {codeNote && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Version codes matched</AlertTitle>
              <AlertDescription>{codeNote}</AlertDescription>
            </Alert>
          )}

          {warning && (
            <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertTitle className="text-yellow-900 dark:text-yellow-100">
                Warning
              </AlertTitle>
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                {warning}
              </AlertDescription>
            </Alert>
          )}

          <FileDropZone
            onFileSelect={handleFileSelect}
            accept=".csv"
            title="Upload Item Analysis CSV"
            description="QUESTIONS_MAP or item analysis CSV file"
            disabled={loading}
          />

          {loading && (
            <div className="text-center text-sm text-muted-foreground">
              Processing file...
            </div>
          )}

          {uploadedFile && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-900 dark:text-green-100">
                File Uploaded Successfully
              </AlertTitle>
              <AlertDescription className="text-green-800 dark:text-green-200">
                <div className="mt-2 space-y-1">
                  <div>
                    <strong>File:</strong> {uploadedFile.name}
                  </div>
                  <div>
                    <strong>Rows:</strong> {uploadedFile.rowCount}
                  </div>
                  <div>
                    <strong>Permutation Data:</strong>{" "}
                    {uploadedFile.hasPermutation ? "✓ Yes" : "✗ No"}
                  </div>
                  {uploadedFile.hasPermutation && (
                    <div className="text-xs mt-2">
                      Comprehensive psychometric analysis will be available.
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Column Mapping UI */}
      {showMappingUI && csvDetection && (
        <Card className="border-2 border-yellow-500/50">
          <CardHeader className="bg-yellow-50/50 dark:bg-yellow-950/20">
            <AlertCircle className="h-6 w-6 text-yellow-600 mt-0.5" />
            <CardTitle>Map Your CSV Columns</CardTitle>
            <CardDescription>
              We couldn&apos;t auto-detect your CSV format. Please map your columns
              below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="p-4 bg-muted/50 rounded-md">
              <p className="text-sm font-semibold mb-2">Detected columns:</p>
              <div className="flex flex-wrap gap-2">
                {csvDetection.columns.map((col, idx) => (
                  <code
                    key={idx}
                    className="text-xs bg-background px-2 py-1 rounded"
                  >
                    {col}
                  </code>
                ))}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Code / Version</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={columnMapping.code}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, code: e.target.value })
                  }
                >
                  <option value="">-- Select Column --</option>
                  {csvDetection.columns.map((col, idx) => (
                    <option key={idx} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Question Order</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={columnMapping.order}
                  onChange={(e) =>
                    setColumnMapping({
                      ...columnMapping,
                      order: e.target.value,
                    })
                  }
                >
                  <option value="">-- Select Column --</option>
                  {csvDetection.columns.map((col, idx) => (
                    <option key={idx} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">
                  Master Question #
                </label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={columnMapping.orderInMaster}
                  onChange={(e) =>
                    setColumnMapping({
                      ...columnMapping,
                      orderInMaster: e.target.value,
                    })
                  }
                >
                  <option value="">-- Select Column --</option>
                  {csvDetection.columns.map((col, idx) => (
                    <option key={idx} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={handleApplyMapping}
              disabled={
                !columnMapping.code ||
                !columnMapping.order ||
                !columnMapping.orderInMaster ||
                loading
              }
              size="lg"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Apply Mapping
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Code Mapping UI */}
      {showCodeMappingUI && (
        <Card className="border-2 border-red-500/50">
          <CardHeader className="bg-red-50/50 dark:bg-red-950/20">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <CardTitle className="text-red-900 dark:text-red-100">
              Code Mismatch Detected
            </CardTitle>
            <CardDescription className="text-red-700 dark:text-red-300">
              The exam version codes in your item analysis file don&apos;t match the
              codes from your student data file. Please map them below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Critical Warning */}
            <Alert
              variant="destructive"
              className="border-red-300 bg-red-50 dark:bg-red-950/30"
            >
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="text-lg">⚠️ CRITICAL WARNING</AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <p className="font-semibold">
                  Incorrect code mapping will produce WRONG GRADES and INCORRECT
                  ANALYSIS.
                </p>
                <p className="text-sm">
                  Please verify each mapping carefully. Each student data code
                  must be mapped to the corresponding item analysis code.
                </p>
              </AlertDescription>
            </Alert>

            {/* Mapping Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-bold">
                      Student Data Code
                    </TableHead>
                    <TableHead className="font-bold">Maps To →</TableHead>
                    <TableHead className="font-bold">
                      Item Analysis Code
                    </TableHead>
                    <TableHead className="font-bold text-right">
                      Students
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usedCodes.map((answerCode) => {
                    const studentCount = state
                      .studentData!.filter((row) => !isSolutionRow(row))
                      .filter(
                        (s) => String(s.Code).trim() === answerCode
                      ).length;

                    return (
                      <TableRow key={answerCode}>
                        <TableCell className="font-mono font-semibold">
                          {answerCode}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          →
                        </TableCell>
                        <TableCell>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                            value={codeMapping[answerCode] || ""}
                            onChange={(e) => {
                              setCodeMapping({
                                ...codeMapping,
                                [answerCode]: e.target.value,
                              });
                            }}
                          >
                            <option value="">-- Select Code --</option>
                            {itemAnalysisCodes.map((itemCode) => (
                              <option key={itemCode} value={itemCode}>
                                {itemCode}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {studentCount}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Button
                onClick={handleAcceptCodeMapping}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
                disabled={
                  Object.keys(codeMapping).length !== usedCodes.length ||
                  Object.values(codeMapping).some((v) => !v)
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Accept Mapping & Continue
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setShowCodeMappingUI(false);
                  setTempItemAnalysisData(null);
                  setError(
                    "Code mapping cancelled. Please re-upload your item analysis file with matching codes, or map them again."
                  );
                }}
              >
                Cancel & Re-upload Files
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
