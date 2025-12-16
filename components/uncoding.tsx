'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, Download, Calculator, AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  readExcelFile,
  readCSVFileWithDetection,
  getAllQuestionCols,
  guessNumQuestions,
  computeAverageResults,
  computeCodeAverages,
  exportToExcel,
  parseCSVWithMapping,
  normalizeItemAnalysis,
  isSolutionRow
} from '@/lib/excel-utils';
import {
  ExamRow,
  ItemAnalysisRow,
  AverageResult,
  CodeAverageResult,
  SOLUTION_ID,
  SOLUTION_SECTION,
  CSVDetectionResult,
  ColumnMapping
} from '@/types/exam';

export function UncodingTab() {
  const [answersFile, setAnswersFile] = useState<File | null>(null);
  const [itemAnalysisFile, setItemAnalysisFile] = useState<File | null>(null);
  const [answersData, setAnswersData] = useState<ExamRow[]>([]);
  const [itemAnalysisData, setItemAnalysisData] = useState<ItemAnalysisRow[]>([]);
  const [numQuestions, setNumQuestions] = useState<number>(0);
  const [averageResults, setAverageResults] = useState<AverageResult[]>([]);
  const [codeAverages, setCodeAverages] = useState<CodeAverageResult[]>([]);
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

  const handleAnswersFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoading(true);
    setError(null);
    try {
      const examData = await readExcelFile(uploadedFile);
      const guessedNum = guessNumQuestions(examData);

      // Get codes used by students (not solution rows)
      const students = examData.filter(row => !isSolutionRow(row));
      const codes = Array.from(new Set(students.map(s => s.Code))).sort();

      setAnswersFile(uploadedFile);
      setAnswersData(examData);
      setNumQuestions(guessedNum);
      setUsedCodes(codes);
      setAverageResults([]);
    } catch (error) {
      console.error('Error reading answers file:', error);
      setError('Error reading answers file. Please check the format and try again.');
    } finally {
      setLoading(false);
    }
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
      setAverageResults([]);

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
        const parsedData = normalizeItemAnalysis(detection.data, detection.format);
        setItemAnalysisData(parsedData);
        setShowMappingUI(false);
      }
    } catch (error) {
      console.error('Error reading item analysis file:', error);
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
      const parsedData = parseCSVWithMapping(csvDetection.data, columnMapping);
      setItemAnalysisData(parsedData);
      setShowMappingUI(false);
    } catch (error: any) {
      console.error('Error parsing with custom mapping:', error);
      setError(error.message || 'Error parsing CSV with custom mapping. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompute = () => {
    if (answersData.length === 0 || itemAnalysisData.length === 0 || numQuestions === 0) {
      setError('Please upload both files and set the number of questions.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = computeAverageResults(answersData, itemAnalysisData, numQuestions);
      const codeResults = computeCodeAverages(answersData, itemAnalysisData, numQuestions);
      setAverageResults(results);
      setCodeAverages(codeResults);
    } catch (error: any) {
      console.error('Error computing averages:', error);
      setError(error.message || 'Error computing averages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadAverageResults = () => {
    if (averageResults.length === 0) return;

    // Flatten codeStats for Excel export
    const flattenedResults = averageResults.map(row => {
      const flattened: any = {
        Master_Question: row.Master_Question,
        Average_score: row.Average_score
      };

      // Get all codes sorted numerically
      const codes = Object.keys(row.codeStats).sort((a, b) => parseInt(a) - parseInt(b));

      // Add code stats as separate columns
      codes.forEach(code => {
        flattened[`Code ${code} - Count`] = row.codeStats[code].count;
        flattened[`Code ${code} - Avg`] = row.codeStats[code].average;
      });

      return flattened;
    });

    exportToExcel(flattenedResults, 'average_results.xlsx', 'average_results');
  };

  const downloadCodeAverages = () => {
    if (codeAverages.length === 0) return;
    exportToExcel(codeAverages, 'code_averages.xlsx', 'code_averages');
  };

  return (
    <div className="space-y-6 animate-fade-in">
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

      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>
            Upload both the answer sheet (<code className="text-xs bg-muted px-1 py-0.5 rounded">import_test_data.xls/.xlsx</code> or revised)
            and the <code className="text-xs bg-muted px-1 py-0.5 rounded">item_analysis.csv</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="answers-file">Answers File (.xls/.xlsx)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="answers-file"
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleAnswersFileUpload}
                  disabled={loading}
                />
                <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
              {answersFile && (
                <p className="text-xs text-muted-foreground">
                  ✓ Loaded: {answersFile.name}
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
                  onChange={handleItemAnalysisFileUpload}
                  disabled={loading}
                />
                <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
              {itemAnalysisFile && csvDetection && (
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

      {answersData.length > 0 && itemAnalysisData.length > 0 && !showMappingUI && (
        <Card>
          <CardHeader>
            <CardTitle>Compute Master-Order Averages</CardTitle>
            <CardDescription>
              Calculate average % correct per master question. Multi-correct answers from solution rows are supported.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCompute} disabled={loading} size="lg">
              <Calculator className="mr-2 h-4 w-4" />
              Compute Averages
            </Button>
          </CardContent>
        </Card>
      )}

      {averageResults.length > 0 && (
        <>
          {/* Master Question Statistics */}
          <Card className="border-2 border-purple-200 dark:border-purple-800">
            <CardHeader className="bg-purple-50 dark:bg-purple-950/30">
              <CardTitle className="text-purple-900 dark:text-purple-100">Master Question Statistics</CardTitle>
              <CardDescription className="text-purple-700 dark:text-purple-300">
                Performance statistics for each master question across all exam versions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Button onClick={downloadAverageResults} className="bg-purple-600 hover:bg-purple-700">
                <Download className="mr-2 h-4 w-4" />
                Download average_results.xlsx
              </Button>

              <div className="border-2 rounded-lg overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100 dark:bg-slate-800">
                    <TableRow>
                      <TableHead className="font-bold">Master Question</TableHead>
                      <TableHead className="text-right font-bold">Average (%)</TableHead>
                      {(() => {
                        // Get all unique codes from the first result's codeStats
                        const codes = averageResults.length > 0
                          ? Object.keys(averageResults[0].codeStats).sort((a, b) => parseInt(a) - parseInt(b))
                          : [];
                        return codes.flatMap(code => [
                          <TableHead key={`${code}-count`} className="text-right font-bold">Code {code} - Count</TableHead>,
                          <TableHead key={`${code}-avg`} className="text-right font-bold">Code {code} - Avg (%)</TableHead>
                        ]);
                      })()}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {averageResults.map((row) => {
                      const codes = Object.keys(row.codeStats).sort((a, b) => parseInt(a) - parseInt(b));
                      return (
                        <TableRow key={row.Master_Question} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <TableCell className="font-semibold">Q{row.Master_Question}</TableCell>
                          <TableCell className="text-right">
                            <span className={`font-bold text-lg ${
                              row.Average_score >= 70 ? 'text-green-600 dark:text-green-400' :
                              row.Average_score >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {row.Average_score.toFixed(2)}%
                            </span>
                          </TableCell>
                          {codes.flatMap(code => [
                            <TableCell key={`${code}-count`} className="text-right">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {row.codeStats[code].count}
                              </span>
                            </TableCell>,
                            <TableCell key={`${code}-avg`} className="text-right">
                              <span className={`font-semibold ${
                                row.codeStats[code].average >= 70 ? 'text-green-600 dark:text-green-400' :
                                row.codeStats[code].average >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-600 dark:text-red-400'
                              }`}>
                                {row.codeStats[code].average.toFixed(2)}%
                              </span>
                            </TableCell>
                          ])}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Code/Version Statistics */}
          {codeAverages.length > 0 && (
            <Card className="border-2 border-blue-200 dark:border-blue-800">
              <CardHeader className="bg-blue-50 dark:bg-blue-950/30">
                <CardTitle className="text-blue-900 dark:text-blue-100">Exam Version Statistics</CardTitle>
                <CardDescription className="text-blue-700 dark:text-blue-300">
                  Performance statistics for each exam code/version
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <Button onClick={downloadCodeAverages} className="bg-blue-600 hover:bg-blue-700">
                  <Download className="mr-2 h-4 w-4" />
                  Download code_averages.xlsx
                </Button>

                <div className="border-2 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-100 dark:bg-slate-800">
                      <TableRow>
                        <TableHead className="font-bold">Code/Version</TableHead>
                        <TableHead className="text-right font-bold">Average (%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {codeAverages.map((row) => (
                        <TableRow key={row.Code} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <TableCell>
                            <span className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded font-bold text-lg">
                              {row.Code}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-bold text-lg ${
                              row.Average_score >= 70 ? 'text-green-600 dark:text-green-400' :
                              row.Average_score >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {row.Average_score.toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
