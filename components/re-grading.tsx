'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Check } from 'lucide-react';
import {
  readExcelFile,
  getAllQuestionCols,
  guessNumQuestions,
  getSolutionCodes,
  buildCorrectAnswersMap,
  computeResults,
  reviseSolutionRows,
  exportToExcel,
  parseSolutionCell
} from '@/lib/excel-utils';
import { ExamRow, CorrectAnswersMap, StudentResult, ANS_CHOICES, AnswerChoice } from '@/types/exam';

export function RegradingTab() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ExamRow[]>([]);
  const [numQuestions, setNumQuestions] = useState<number>(0);
  const [qCols, setQCols] = useState<string[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [correctMap, setCorrectMap] = useState<CorrectAnswersMap>({});
  const [results, setResults] = useState<StudentResult[]>([]);
  const [revisedData, setRevisedData] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoading(true);
    try {
      const examData = await readExcelFile(uploadedFile);
      const allQCols = getAllQuestionCols(examData);
      const guessedNum = guessNumQuestions(examData);
      const detectedCodes = getSolutionCodes(examData);
      const selectedQCols = allQCols.slice(0, guessedNum);

      // Build initial correct map from solution rows
      const initialMap = buildCorrectAnswersMap(examData, selectedQCols);

      setFile(uploadedFile);
      setData(examData);
      setQCols(selectedQCols);
      setNumQuestions(guessedNum);
      setCodes(detectedCodes);
      setCorrectMap(initialMap);
      setResults([]);
      setRevisedData([]);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Error reading file. Please check the format.');
    } finally {
      setLoading(false);
    }
  };

  const handleNumQuestionsChange = (newNum: number) => {
    const allQCols = getAllQuestionCols(data);
    const newQCols = allQCols.slice(0, newNum);
    const newMap = buildCorrectAnswersMap(data, newQCols);
    
    setNumQuestions(newNum);
    setQCols(newQCols);
    setCorrectMap(newMap);
  };

  const toggleAnswer = (code: string, questionIdx: number, answer: AnswerChoice) => {
    setCorrectMap(prev => {
      const newMap = { ...prev };
      const codeAnswers = [...(newMap[code] || [])];
      const qAnswers = new Set(codeAnswers[questionIdx] || []);
      
      if (qAnswers.has(answer)) {
        qAnswers.delete(answer);
      } else {
        qAnswers.add(answer);
      }
      
      codeAnswers[questionIdx] = Array.from(qAnswers);
      newMap[code] = codeAnswers;
      return newMap;
    });
  };

  const handleRegrade = () => {
    setLoading(true);
    try {
      const studentResults = computeResults(data, qCols, correctMap);
      const revisedImport = reviseSolutionRows(data, qCols, correctMap);
      
      setResults(studentResults);
      setRevisedData(revisedImport);
    } catch (error) {
      console.error('Error computing results:', error);
      alert('Error computing results.');
    } finally {
      setLoading(false);
    }
  };

  const downloadImportRevised = () => {
    if (revisedData.length === 0) return;
    exportToExcel(revisedData, 'import_test_data_revised.xlsx', 'import_test_data');
  };

  const downloadResultsRevised = () => {
    if (results.length === 0) return;
    exportToExcel(results, 'results_id_export_revised.xlsx', 'results_id_export');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle>Upload Exam Data</CardTitle>
          <CardDescription>
            Upload the original <code className="text-xs bg-muted px-1 py-0.5 rounded">import_test_data.xls</code> file (answers for all students and solutions)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              id="file-upload"
              type="file"
              accept=".xls,.xlsx"
              onChange={handleFileUpload}
              className="flex-1"
              disabled={loading}
            />
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>

          {file && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="num-questions">Number of questions in the exam:</Label>
                <Input
                  id="num-questions"
                  type="number"
                  min={1}
                  max={qCols.length}
                  value={numQuestions}
                  onChange={(e) => handleNumQuestionsChange(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
              </div>

              <div className="p-4 bg-muted/50 rounded-md">
                <p className="text-sm">
                  <strong>Detected:</strong> {codes.length} version(s). You selected <strong>{numQuestions}</strong> question(s).
                  {codes.length > 0 && (
                    <>
                      {' '}Solution rows found for codes:{' '}
                      {codes.map((c, i) => (
                        <code key={i} className="text-xs bg-background px-1 py-0.5 rounded mx-0.5">
                          {c}
                        </code>
                      ))}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {codes.length > 0 && numQuestions > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Correct Answers</CardTitle>
            <CardDescription>
              Select all correct answers for each question in each version. Multiple answers can be marked as correct.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {codes.map((code, codeIdx) => (
                <div key={code} className="border rounded-lg p-4 bg-card">
                  <h4 className="font-semibold mb-4 text-center text-lg">Code {code}</h4>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                    {qCols.map((_, qIdx) => {
                      const currentAnswers = correctMap[code]?.[qIdx] || [];
                      return (
                        <div key={qIdx} className="flex items-center gap-2 pb-2 border-b last:border-b-0">
                          <span className="font-semibold w-12 text-sm">Q{qIdx + 1}</span>
                          <div className="flex gap-2">
                            {ANS_CHOICES.map((choice) => (
                              <div key={choice} className="flex items-center gap-1">
                                <Checkbox
                                  id={`${code}-${qIdx}-${choice}`}
                                  checked={currentAnswers.includes(choice)}
                                  onCheckedChange={() => toggleAnswer(code, qIdx, choice)}
                                />
                                <Label
                                  htmlFor={`${code}-${qIdx}-${choice}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {choice}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-4">
              <Button onClick={handleRegrade} disabled={loading} size="lg">
                <Check className="mr-2 h-4 w-4" />
                Re-grade Exam
              </Button>
              <p className="text-xs text-muted-foreground">
                Multiple checked options are all considered correct. Solutions display concatenated letters (e.g., ABE).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Preview of re-graded results (first 20 rows). Each correct answer = 5 points.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={downloadImportRevised} variant="default">
                <Download className="mr-2 h-4 w-4" />
                Download import_test_data_revised.xlsx
              </Button>
              <Button onClick={downloadResultsRevised} variant="default">
                <Download className="mr-2 h-4 w-4" />
                Download results_id_export_revised.xlsx
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Percentage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.slice(0, 20).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">{row.ID}</TableCell>
                      <TableCell>{row.Section}</TableCell>
                      <TableCell>{row.Code}</TableCell>
                      <TableCell className="text-right font-semibold">{row.Tot}</TableCell>
                      <TableCell className="text-right">{row.Per}%</TableCell>
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
