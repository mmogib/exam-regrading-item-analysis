'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  readExamDataFile,
  readCSVFileWithDetection,
  getAllQuestionCols,
  guessNumQuestions,
  parseCSVWithMapping,
  normalizeItemAnalysis,
  isSolutionRow
} from '@/lib/excel-utils';
import { debug, error as logError } from '@/lib/logger';
import {
  ExamRow,
  ItemAnalysisRow,
  CSVDetectionResult,
  ColumnMapping
} from '@/types/exam';

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Helper function to format timestamp
const formatTimestamp = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

interface AnalysisDataUploaderProps {
  onDataReady: (data: {
    answersData: ExamRow[];
    itemAnalysisData: ItemAnalysisRow[];
    numQuestions: number;
    hasPermutation: boolean;
  }) => void;
  onDataChange?: () => void; // Called when data becomes invalid/incomplete
  helpDialog?: React.ReactNode; // Optional help dialog component
}

export function AnalysisDataUploader({ onDataReady, onDataChange, helpDialog }: AnalysisDataUploaderProps) {
  const [answersFile, setAnswersFile] = useState<File | null>(null);
  const [itemAnalysisFile, setItemAnalysisFile] = useState<File | null>(null);
  const [answersFileMetadata, setAnswersFileMetadata] = useState<{size: number, timestamp: Date} | null>(null);
  const [itemAnalysisFileMetadata, setItemAnalysisFileMetadata] = useState<{size: number, timestamp: Date} | null>(null);
  const [answersData, setAnswersData] = useState<ExamRow[]>([]);
  const [itemAnalysisData, setItemAnalysisData] = useState<ItemAnalysisRow[]>([]);
  const [numQuestions, setNumQuestions] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [usedCodes, setUsedCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // CSV format detection states
  const [csvDetection, setCsvDetection] = useState<CSVDetectionResult | null>(null);
  const [showMappingUI, setShowMappingUI] = useState(false);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    code: '',
    order: '',
    orderInMaster: ''
  });

  // Code mapping states
  const [showCodeMappingUI, setShowCodeMappingUI] = useState(false);
  const [codeMapping, setCodeMapping] = useState<{[answerCode: string]: string}>({});
  const [itemAnalysisCodes, setItemAnalysisCodes] = useState<string[]>([]);

  // Item analysis processing stats
  const [itemAnalysisStats, setItemAnalysisStats] = useState<{total: number, valid: number, skipped: number} | null>(null);

  // Permutation detection
  const [hasPermutation, setHasPermutation] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // Helper function to detect code mismatch and suggest mapping
  const checkCodeMismatch = (answerCodes: string[], itemCodes: string[]) => {
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
    const codesMatch = sortedAnswerCodes.length === sortedItemCodes.length &&
      sortedAnswerCodes.every((code, idx) => code === sortedItemCodes[idx]);

    if (!codesMatch) {
      // Create suggested mapping by position
      const suggested: {[key: string]: string} = {};
      const minLength = Math.min(sortedAnswerCodes.length, sortedItemCodes.length);

      for (let i = 0; i < minLength; i++) {
        suggested[sortedAnswerCodes[i]] = sortedItemCodes[i];
      }

      setCodeMapping(suggested);
      setItemAnalysisCodes(sortedItemCodes);
      setShowCodeMappingUI(true);
    } else {
      setShowCodeMappingUI(false);
      setCodeMapping({});
    }
  };

  const handleAnswersFileClick = () => {
    // Reset errors and mapping UI when user clicks to upload new file
    setError(null);
    setWarning(null);
    setShowMappingUI(false);
    setShowCodeMappingUI(false);
  };

  const handleAnswersFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoading(true);
    setError(null);
    try {
      const examData = await readExamDataFile(uploadedFile);
      const guessedNum = guessNumQuestions(examData);

      // Get codes used by students (not solution rows)
      const students = examData.filter(row => !isSolutionRow(row));
      const codes = Array.from(new Set(students.map(s => s.Code))).sort();

      setAnswersFile(uploadedFile);
      setAnswersFileMetadata({ size: uploadedFile.size, timestamp: new Date() });
      setAnswersData(examData);
      setNumQuestions(guessedNum);
      setUsedCodes(codes);

      // Clear the input to allow re-selecting the same file
      e.target.value = '';

      // Check for code mismatch if item analysis is already loaded
      if (itemAnalysisData.length > 0) {
        const itemCodes = Array.from(new Set(
          itemAnalysisData.map(ia => String(ia.code))
        )).sort();

        if (itemCodes.length > 0) {
          checkCodeMismatch(codes, itemCodes);
        }
      }
    } catch (error: any) {
      logError('Error reading answers file:', error);
      const errorMessage = error.message || 'Error reading answers file. Please check the format and try again.';
      setError(`File format validation failed:\n\n${errorMessage}\n\nPlease check the template and format requirements.`);
    } finally {
      setLoading(false);
    }
  };

  const handleItemAnalysisFileClick = () => {
    // Reset errors and mapping UI when user clicks to upload new file
    setError(null);
    setWarning(null);
    setShowMappingUI(false);
    setShowCodeMappingUI(false);
  };

  const handleItemAnalysisFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoading(true);
    setError(null);
    try {
      const detection = await readCSVFileWithDetection(uploadedFile);
      setCsvDetection(detection);
      setItemAnalysisFile(uploadedFile);
      setItemAnalysisFileMetadata({ size: uploadedFile.size, timestamp: new Date() });

      // Clear the input to allow re-selecting the same file
      e.target.value = '';

      if (detection.format === 'UNKNOWN') {
        // Show mapping UI
        setShowMappingUI(true);
        // Initialize mapping with first column as default
        setColumnMapping({
          code: detection.columns[0] || '',
          order: detection.columns[1] || '',
          orderInMaster: detection.columns[2] || ''
        });
      } else {
        // Auto-detected format (OLD or NEW) - parse immediately
        const totalRows = detection.data.length;
        const parsedData = normalizeItemAnalysis(detection.data, detection.format);
        const validRows = parsedData.length;
        const skippedRows = totalRows - validRows;

        // Check if we have any valid data
        if (validRows === 0) {
          setError(`No valid rows found in item analysis CSV.\n\nAll ${totalRows} rows were skipped due to missing or invalid values.\n\nPlease check that your CSV has valid data in the code, order, and master question columns.`);
          setItemAnalysisFile(null);
          setItemAnalysisFileMetadata(null);
          setCsvDetection(null);
          return;
        }

        setItemAnalysisData(parsedData);
        setItemAnalysisStats({ total: totalRows, valid: validRows, skipped: skippedRows });
        setShowMappingUI(false);

        // Check if permutation data exists
        const hasPerm = parsedData.some(ia => ia.permutation);
        setHasPermutation(hasPerm);
        if (!hasPerm) {
          setWarning('Item analysis file does not contain permutation data. Distractor analysis will not be available.');
        } else {
          setWarning(null);
        }

        // Check for code mismatch if answers file is already loaded
        if (usedCodes.length > 0) {
          const itemCodes = Array.from(new Set(
            parsedData.map(ia => String(ia.code))
          )).sort();

          if (itemCodes.length > 0) {
            checkCodeMismatch(usedCodes, itemCodes);
          }
        }
      }
    } catch (error) {
      logError('Error reading item analysis file:', error);
      setError('Error reading item analysis file. Please check the format and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyMapping = () => {
    if (!csvDetection || !columnMapping.code || !columnMapping.order || !columnMapping.orderInMaster) {
      setError('Please select all three required columns.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const totalRows = csvDetection.data.length;
      const parsedData = parseCSVWithMapping(csvDetection.data, columnMapping);
      const validRows = parsedData.length;
      const skippedRows = totalRows - validRows;

      // Check if we have any valid data
      if (validRows === 0) {
        setError(`No valid rows found in item analysis CSV.\n\nAll ${totalRows} rows were skipped due to missing or invalid values.\n\nPlease check that your CSV has valid data in the mapped columns.`);
        return;
      }

      setItemAnalysisData(parsedData);
      setItemAnalysisStats({ total: totalRows, valid: validRows, skipped: skippedRows });
      setShowMappingUI(false);

      // Check if permutation data exists
      const hasPerm = parsedData.some(ia => ia.permutation);
      setHasPermutation(hasPerm);
      if (!hasPerm) {
        setWarning('Item analysis file does not contain permutation data. Distractor analysis will not be available.');
      } else {
        setWarning(null);
      }

      // Check for code mismatch if answers file is already loaded
      if (usedCodes.length > 0) {
        const itemCodes = Array.from(new Set(
          parsedData.map(ia => String(ia.code))
        )).sort();

        if (itemCodes.length > 0) {
          checkCodeMismatch(usedCodes, itemCodes);
        }
      }
    } catch (error: any) {
      logError('Error parsing with custom mapping:', error);
      setError(error.message || 'Error parsing CSV with custom mapping. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Notify parent when data is ready
  useEffect(() => {
    if (answersData.length > 0 && itemAnalysisData.length > 0 && !showMappingUI && !showCodeMappingUI) {
      // Apply code mapping if it exists
      let mappedItemAnalysis = itemAnalysisData;
      if (Object.keys(codeMapping).length > 0) {
        // Create reverse mapping: itemCode -> answerCode
        // Normalize all codes (trim and convert to string)
        const reverseMapping: {[itemCode: string]: string} = {};
        Object.entries(codeMapping).forEach(([answerCode, itemCode]) => {
          const normalizedItemCode = String(itemCode).trim();
          const normalizedAnswerCode = String(answerCode).trim();
          reverseMapping[normalizedItemCode] = normalizedAnswerCode;
        });

        // Map item analysis codes to match answer codes
        mappedItemAnalysis = itemAnalysisData.map(ia => {
          const normalizedIaCode = String(ia.code).trim();
          const mappedCode = reverseMapping[normalizedIaCode];
          return {
            ...ia,
            code: mappedCode || ia.code
          };
        });

        debug('Code mapping (answer -> item):', codeMapping);
        debug('Reverse mapping (item -> answer):', reverseMapping);
        debug('Original item analysis codes:', itemAnalysisData.slice(0, 5).map(ia => ia.code));
        debug('Mapped item analysis codes:', mappedItemAnalysis.slice(0, 5).map(ia => ia.code));
      }

      onDataReady({
        answersData,
        itemAnalysisData: mappedItemAnalysis,
        numQuestions,
        hasPermutation
      });
    } else if (onDataChange) {
      onDataChange();
    }
  }, [answersData, itemAnalysisData, numQuestions, showMappingUI, showCodeMappingUI, codeMapping, hasPermutation]);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive" className="relative">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-6 w-6 p-0"
            onClick={() => setError(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {warning && (
        <Alert className="relative border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/10 dark:text-yellow-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-6 w-6 p-0"
            onClick={() => setWarning(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>
                Upload both the answer sheet (.xls/.xlsx/.csv/.txt) and the item analysis file (.csv)
              </CardDescription>
            </div>
            {helpDialog}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="answers-file">Answers File (.xls/.xlsx/.csv/.txt)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="answers-file"
                  type="file"
                  accept=".xls,.xlsx,.csv,.txt"
                  onClick={handleAnswersFileClick}
                  onChange={handleAnswersFileUpload}
                  disabled={loading}
                />
                <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
              {answersFile && answersFileMetadata && (
                <p className="text-xs text-muted-foreground">
                  ✓ Loaded: {answersFile.name} ({formatFileSize(answersFileMetadata.size)}) at {formatTimestamp(answersFileMetadata.timestamp)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ia-file">Item Analysis File (.csv)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ia-file"
                  type="file"
                  accept=".csv"
                  onClick={handleItemAnalysisFileClick}
                  onChange={handleItemAnalysisFileUpload}
                  disabled={loading}
                />
                <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
              {itemAnalysisFile && csvDetection && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    ✓ Loaded: {itemAnalysisFile.name} {itemAnalysisFileMetadata && `(${formatFileSize(itemAnalysisFileMetadata.size)}) at ${formatTimestamp(itemAnalysisFileMetadata.timestamp)}`}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    {csvDetection.format === 'UNKNOWN' ? (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    <span className={csvDetection.format === 'UNKNOWN' ? 'text-yellow-600' : 'text-green-600'}>
                      {csvDetection.format === 'UNKNOWN'
                        ? 'Unknown format - mapping required'
                        : 'Format: auto-detected'}
                    </span>
                  </div>
                  {itemAnalysisStats && (
                    <p className="text-xs text-muted-foreground">
                      Processed: {itemAnalysisStats.valid} row{itemAnalysisStats.valid !== 1 ? 's' : ''}
                      {itemAnalysisStats.skipped > 0 && (
                        <span className="text-yellow-600 dark:text-yellow-500">
                          {' '}({itemAnalysisStats.skipped} skipped due to missing values)
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {answersData.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="num-questions-uncode">Number of questions (master order):</Label>
                <Input
                  id="num-questions-uncode"
                  type="number"
                  min={1}
                  max={getAllQuestionCols(answersData).length}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
              </div>

              {/* Student Statistics Card */}
              <div className="border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
                <div className="space-y-4">
                  {/* Total Students */}
                  <div className="flex items-center justify-between pb-4 border-b border-blue-200 dark:border-blue-800">
                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Total Students:</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {answersData.filter(row => !isSolutionRow(row)).length}
                    </span>
                  </div>

                  {/* Students per Code */}
                  {usedCodes.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">Students per Code:</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {usedCodes.map((code) => {
                          const count = answersData.filter(
                            row => row.Code === code && !isSolutionRow(row)
                          ).length;
                          return (
                            <div
                              key={code}
                              className="bg-white dark:bg-slate-800 rounded-lg p-3 border-2 border-blue-300 dark:border-blue-700 shadow-sm hover:shadow-md transition-shadow"
                            >
                              <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Code</div>
                              <div className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-1">{code}</div>
                              <div className="text-sm text-blue-600 dark:text-blue-400">
                                {count} {count === 1 ? 'student' : 'students'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column Mapping UI */}
      {showMappingUI && csvDetection && (
        <Card className="border-2 border-yellow-500/50">
          <CardHeader className="bg-yellow-50/50">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-yellow-600 mt-0.5" />
              <div>
                <CardTitle>Map Your CSV Columns</CardTitle>
                <CardDescription>
                  We couldn't auto-detect your CSV format. Please map your columns to the required fields below.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="p-4 bg-muted/50 rounded-md">
              <p className="text-sm font-semibold mb-2">Detected columns in your CSV:</p>
              <div className="flex flex-wrap gap-2">
                {csvDetection.columns.map((col, idx) => (
                  <code key={idx} className="text-xs bg-background px-2 py-1 rounded">
                    {col}
                  </code>
                ))}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="map-code" className="font-semibold">
                  Code / Version
                  <span className="block text-xs font-normal text-muted-foreground mt-1">
                    Exam version number (e.g., 1, 2, 3)
                  </span>
                </Label>
                <select
                  id="map-code"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={columnMapping.code}
                  onChange={(e) => setColumnMapping({ ...columnMapping, code: e.target.value })}
                >
                  <option value="">-- Select Column --</option>
                  {csvDetection.columns.map((col, idx) => (
                    <option key={idx} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="map-order" className="font-semibold">
                  Question Order
                  <span className="block text-xs font-normal text-muted-foreground mt-1">
                    Question number in that version
                  </span>
                </Label>
                <select
                  id="map-order"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={columnMapping.order}
                  onChange={(e) => setColumnMapping({ ...columnMapping, order: e.target.value })}
                >
                  <option value="">-- Select Column --</option>
                  {csvDetection.columns.map((col, idx) => (
                    <option key={idx} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="map-master" className="font-semibold">
                  Master Question #
                  <span className="block text-xs font-normal text-muted-foreground mt-1">
                    Position in master question order
                  </span>
                </Label>
                <select
                  id="map-master"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={columnMapping.orderInMaster}
                  onChange={(e) => setColumnMapping({ ...columnMapping, orderInMaster: e.target.value })}
                >
                  <option value="">-- Select Column --</option>
                  {csvDetection.columns.map((col, idx) => (
                    <option key={idx} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-4 border-t">
              <Button
                onClick={handleApplyMapping}
                disabled={!columnMapping.code || !columnMapping.order || !columnMapping.orderInMaster || loading}
                size="lg"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Apply Mapping
              </Button>
              <Button
                onClick={() => {
                  setShowMappingUI(false);
                  setItemAnalysisFile(null);
                  setCsvDetection(null);
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Code Mapping UI */}
      {showCodeMappingUI && answersData.length > 0 && itemAnalysisData.length > 0 && !showMappingUI && (
        <Card className="border-2 border-orange-500/50">
          <CardHeader className="bg-orange-50/50 dark:bg-orange-950/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-orange-600 mt-0.5" />
              <div className="flex-1">
                <CardTitle className="text-orange-900 dark:text-orange-100">Code Mismatch Detected</CardTitle>
                <CardDescription className="text-orange-700 dark:text-orange-300">
                  The version codes don't match between the answers file and item analysis CSV.
                  Review and adjust the suggested mapping below.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Warning if counts don't match */}
            {usedCodes.length !== itemAnalysisCodes.length && (
              <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-900 dark:text-yellow-100">Warning: Count Mismatch</AlertTitle>
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  Answers file has <strong>{usedCodes.length}</strong> code(s), but item analysis has <strong>{itemAnalysisCodes.length}</strong> code(s).
                  {usedCodes.length > itemAnalysisCodes.length
                    ? ' Some answer codes will not be mapped.'
                    : ' Some item analysis codes will not be used.'}
                </AlertDescription>
              </Alert>
            )}

            {/* Mapping Table */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Suggested Code Mapping (by sort order):</h3>
              <div className="border-2 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">Answers File Code</th>
                      <th className="px-4 py-3 text-center font-bold">→</th>
                      <th className="px-4 py-3 text-left font-bold">Item Analysis Code</th>
                      <th className="px-4 py-3 text-right font-bold">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usedCodes.map((answerCode) => {
                      const studentCount = answersData.filter(
                        row => row.Code === answerCode && !isSolutionRow(row)
                      ).length;

                      return (
                        <tr key={answerCode} className="border-t hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-3">
                            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 rounded font-bold text-lg">
                              {answerCode}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xl">→</td>
                          <td className="px-4 py-3">
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              value={codeMapping[answerCode] || ''}
                              onChange={(e) => setCodeMapping({ ...codeMapping, [answerCode]: e.target.value })}
                            >
                              <option value="">-- Not Mapped --</option>
                              {itemAnalysisCodes.map((itemCode) => (
                                <option key={itemCode} value={itemCode}>{itemCode}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              {studentCount} {studentCount === 1 ? 'student' : 'students'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Critical Warning */}
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>CRITICAL WARNING</AlertTitle>
              <AlertDescription>
                Incorrect code mapping will produce <strong>WRONG GRADES</strong> for all students.
                Please verify that these codes represent the same exam versions before proceeding.
                <br /><br />
                Double-check:
                <ul className="list-disc ml-5 mt-2">
                  <li>Code mappings match the actual exam versions</li>
                  <li>Student counts make sense for each version</li>
                  <li>Both files are from the same exam session</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-4 pt-4 border-t">
              <Button
                onClick={() => setShowCodeMappingUI(false)}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Accept Mapping & Continue
              </Button>
              <Button
                onClick={() => {
                  setShowCodeMappingUI(false);
                  setCodeMapping({});
                  setItemAnalysisFile(null);
                  setItemAnalysisData([]);
                }}
                variant="outline"
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
