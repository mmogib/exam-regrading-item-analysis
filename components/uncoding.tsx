'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Calculator, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  readExcelFile,
  readCSVFileWithDetection,
  getAllQuestionCols,
  guessNumQuestions,
  computeAverageResults,
  exportToExcel,
  parseCSVWithMapping,
  normalizeItemAnalysis
} from '@/lib/excel-utils';
import { 
  ExamRow, 
  ItemAnalysisRow, 
  AverageResult, 
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
  const [loading, setLoading] = useState(false);
  const [usedCodes, setUsedCodes] = useState<string[]>([]);

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
    try {
      const examData = await readExcelFile(uploadedFile);
      const guessedNum = guessNumQuestions(examData);
      
      // Get codes used by students (not solution rows)
      const students = examData.filter(row => !(row.ID === SOLUTION_ID && row.Section === SOLUTION_SECTION));
      const codes = Array.from(new Set(students.map(s => s.Code))).sort();

      setAnswersFile(uploadedFile);
      setAnswersData(examData);
      setNumQuestions(guessedNum);
      setUsedCodes(codes);
      setAverageResults([]);
    } catch (error) {
      console.error('Error reading answers file:', error);
      alert('Error reading answers file. Please check the format.');
    } finally {
      setLoading(false);
    }
  };

  const handleItemAnalysisFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoading(true);
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
      alert('Error reading item analysis file. Please check the format.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyMapping = () => {
    if (!csvDetection || !columnMapping.code || !columnMapping.order || !columnMapping.orderInMaster) {
      alert('Please select all three required columns.');
      return;
    }

    setLoading(true);
    try {
      const parsedData = parseCSVWithMapping(csvDetection.data, columnMapping);
      setItemAnalysisData(parsedData);
      setShowMappingUI(false);
    } catch (error: any) {
      console.error('Error parsing with custom mapping:', error);
      alert(error.message || 'Error parsing CSV with custom mapping.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompute = () => {
    if (answersData.length === 0 || itemAnalysisData.length === 0 || numQuestions === 0) {
      alert('Please upload both files and set the number of questions.');
      return;
    }

    setLoading(true);
    try {
      const results = computeAverageResults(answersData, itemAnalysisData, numQuestions);
      setAverageResults(results);
    } catch (error: any) {
      console.error('Error computing averages:', error);
      alert(error.message || 'Error computing averages.');
    } finally {
      setLoading(false);
    }
  };

  const downloadAverageResults = () => {
    if (averageResults.length === 0) return;
    exportToExcel(averageResults, 'average_results.xlsx', 'average_results');
  };

  return (
    <div className="space-y-6 animate-fade-in">
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

              {usedCodes.length > 0 && (
                <div className="p-4 bg-muted/50 rounded-md">
                  <p className="text-sm">
                    <strong>Codes detected in answers:</strong>{' '}
                    {usedCodes.map((c, i) => (
                      <code key={i} className="text-xs bg-background px-1 py-0.5 rounded mx-0.5">
                        {c}
                      </code>
                    ))}
                  </p>
                </div>
              )}
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
        <Card>
          <CardHeader>
            <CardTitle>Average Results</CardTitle>
            <CardDescription>
              Average % correct per master question
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={downloadAverageResults} variant="default">
              <Download className="mr-2 h-4 w-4" />
              Download average_results.xlsx
            </Button>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Master Question</TableHead>
                    <TableHead className="text-right">Average Score (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {averageResults.map((row) => (
                    <TableRow key={row.Master_Question}>
                      <TableCell className="font-semibold">Q{row.Master_Question}</TableCell>
                      <TableCell className="text-right">
                        <span className={row.Average_score >= 70 ? 'text-green-600 font-semibold' : row.Average_score >= 50 ? 'text-yellow-600' : 'text-red-600'}>
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
    </div>
  );
}
