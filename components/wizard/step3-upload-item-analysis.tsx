"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  FileSpreadsheet,
} from "lucide-react";
import { FileDropZone } from "@/components/shared/file-drop-zone";
import {
  readCSVFileWithDetection,
  normalizeItemAnalysis,
  parseCSVWithMapping,
  parseWideFormat,
  validateCorrectAnswers,
  isSolutionRow,
} from "@/lib/excel-utils";
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

export function Step3UploadItemAnalysis() {
  const { state, updateItemAnalysis, markStepComplete } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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
    setLoading(true);
    setError(null);
    setWarning(null);
    setUploadedFile(null);

    try {
      const detection = await readCSVFileWithDetection(file);
      setCsvDetection(detection);

      if (detection.format === "UNKNOWN") {
        // Show mapping UI
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
        await processItemAnalysis(file.name, parsedData, "WIDE");
      } else {
        // Auto-detected format (OLD or NEW) - parse immediately
        await processItemAnalysis(file.name, detection.data, detection.format);
      }
    } catch (err: any) {
      logError("Error reading item analysis file:", err);
      setError(
        err.message ||
          "Error reading file. Please check the format and try again."
      );
    } finally {
      setLoading(false);
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

    setLoading(true);
    setError(null);
    try {
      const parsedData = parseCSVWithMapping(csvDetection.data, columnMapping);
      await processItemAnalysis("Custom mapped file", parsedData, "MAPPED");
      setShowMappingUI(false);
    } catch (err: any) {
      logError("Error parsing with custom mapping:", err);
      setError(err.message || "Error parsing CSV. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const checkCodeMismatch = (
    parsedData: ItemAnalysisRow[],
    hasPerm: boolean,
    fileName: string
  ) => {
    // Get codes from student data (from Step 1)
    const students = state.studentData!.filter((row) => !isSolutionRow(row));
    const answerCodes = Array.from(new Set(students.map((s) => s.Code)));

    // Get codes from item analysis
    const itemCodes = Array.from(
      new Set(parsedData.map((ia) => String(ia.code)))
    );

    // Normalize codes: trim whitespace
    const normalizeCode = (code: string) => String(code).trim();
    const normalizedAnswerCodes = answerCodes.map(normalizeCode);
    const normalizedItemCodes = itemCodes.map(normalizeCode);

    // Sort codes: numeric first (by value), then alphabetic
    const sortCodes = (codes: string[]) => {
      return [...codes].sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        return a.localeCompare(b);
      });
    };

    const sortedAnswerCodes = sortCodes(normalizedAnswerCodes);
    const sortedItemCodes = sortCodes(normalizedItemCodes);

    // Check if codes match exactly
    const codesMatch =
      sortedAnswerCodes.length === sortedItemCodes.length &&
      sortedAnswerCodes.every((code, idx) => code === sortedItemCodes[idx]);

    if (!codesMatch) {
      // Create suggested mapping by position
      const suggested: { [key: string]: string } = {};
      const minLength = Math.min(
        sortedAnswerCodes.length,
        sortedItemCodes.length
      );

      for (let i = 0; i < minLength; i++) {
        suggested[sortedAnswerCodes[i]] = sortedItemCodes[i];
      }

      // Store temp data and show code mapping UI
      setTempItemAnalysisData(parsedData);
      setTempHasPermutation(hasPerm);
      setTempFileName(fileName);
      setCodeMapping(suggested);
      setItemAnalysisCodes(sortedItemCodes);
      setUsedCodes(sortedAnswerCodes);
      setShowCodeMappingUI(true);
      return false; // Not ready to complete
    }

    return true; // Codes match, ready to complete
  };

  const processItemAnalysis = async (
    fileName: string,
    data: any[],
    format: string
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

    // Check for code mismatch FIRST (before validation)
    const codesMatch = checkCodeMismatch(parsedData, hasPerm, fileName);
    if (!codesMatch) {
      // Code mapping UI is shown, wait for user confirmation
      return;
    }

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
    completeStep(parsedData, hasPerm, fileName);
  };

  const handleAcceptCodeMapping = () => {
    if (!tempItemAnalysisData) return;

    // Apply code mapping
    const reverseMapping: { [itemCode: string]: string } = {};
    Object.entries(codeMapping).forEach(([answerCode, itemCode]) => {
      const normalizedItemCode = String(itemCode).trim();
      const normalizedAnswerCode = String(answerCode).trim();
      reverseMapping[normalizedItemCode] = normalizedAnswerCode;
    });

    // Map item analysis codes to match answer codes
    const mappedItemAnalysis = tempItemAnalysisData.map((ia) => {
      const normalizedIaCode = String(ia.code).trim();
      const mappedCode = reverseMapping[normalizedIaCode];
      return {
        ...ia,
        code: mappedCode || ia.code,
      };
    });

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
    completeStep(mappedItemAnalysis, tempHasPermutation, tempFileName);
  };

  const completeStep = (
    parsedData: ItemAnalysisRow[],
    hasPerm: boolean,
    fileName: string
  ) => {
    setUploadedFile({
      name: fileName,
      data: parsedData,
      hasPermutation: hasPerm,
      rowCount: parsedData.length,
    });

    // Update wizard state
    updateItemAnalysis(parsedData, hasPerm, fileName);
    markStepComplete(3);
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
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload Error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">
                {error}
              </AlertDescription>
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
              We couldn't auto-detect your CSV format. Please map your columns
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
              The exam version codes in your item analysis file don't match the
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
