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
  const [pointsPerQuestion, setPointsPerQuestion] = useState<number>(5);

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
      const studentResults = computeResults(data, qCols, correctMap, pointsPerQuestion);
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
    exportToExcel(revisedData, 'import_test_data_revised.xlsx', 'import_test_data', data);
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

              <div className="flex items-center gap-4">
                <Label htmlFor="points-per-question">Points per question:</Label>
                <Input
                  id="points-per-question"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={pointsPerQuestion}
                  onChange={(e) => setPointsPerQuestion(parseFloat(e.target.value) || 5)}
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
                      const hasNoAnswer = currentAnswers.length === 0;
                      return (
                        <div key={qIdx} className={`flex items-center gap-2 pb-2 border-b last:border-b-0 ${hasNoAnswer ? 'bg-yellow-50 dark:bg-yellow-950/20 px-2 py-1 rounded' : ''}`}>
                          <span className="font-semibold w-12 text-sm">Q{qIdx + 1}</span>
                          <div className="flex gap-2 flex-1">
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
                            {hasNoAnswer && (
                              <span className="text-xs text-yellow-700 dark:text-yellow-500 ml-2 font-medium">⚠ No correct answer</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Warning for questions with no correct answers */}
            {(() => {
              const questionsWithNoAnswer: string[] = [];
              codes.forEach(code => {
                qCols.forEach((_, qIdx) => {
                  const currentAnswers = correctMap[code]?.[qIdx] || [];
                  if (currentAnswers.length === 0) {
                    questionsWithNoAnswer.push(`Code ${code}, Q${qIdx + 1}`);
                  }
                });
              });
              return questionsWithNoAnswer.length > 0 ? (
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-700 dark:text-yellow-500 text-lg">⚠</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400 mb-1">
                        Warning: {questionsWithNoAnswer.length} question(s) have no correct answer
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-500 mb-2">
                        These questions will award 0 points to all students. This effectively voids/cancels these questions.
                      </p>
                      <details className="text-xs text-yellow-700 dark:text-yellow-500">
                        <summary className="cursor-pointer hover:underline">Show affected questions</summary>
                        <ul className="mt-2 ml-4 list-disc">
                          {questionsWithNoAnswer.map((q, idx) => (
                            <li key={idx}>{q}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

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
        <Card className="border-2 border-green-200 dark:border-green-800">
          <CardHeader className="bg-green-50 dark:bg-green-950/30">
            <CardTitle className="text-green-900 dark:text-green-100 flex items-center gap-2">
              <Check className="h-6 w-6" />
              Re-grading Complete - Results Ready
            </CardTitle>
            <CardDescription className="text-green-700 dark:text-green-300">
              Successfully re-graded {results.length} student(s) with {pointsPerQuestion} point(s) per correct answer.
              Download the revised files below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Download Buttons Section */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Original Data File */}
              <div className="border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">1</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      Original Data (Revised)
                    </h3>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                      Contains all student answers with updated solution rows based on your corrections.
                      Same format as uploaded file.
                    </p>
                    <Button onClick={downloadImportRevised} className="w-full bg-blue-600 hover:bg-blue-700">
                      <Download className="mr-2 h-4 w-4" />
                      import_test_data_revised.xlsx
                    </Button>
                  </div>
                </div>
              </div>

              {/* Results File */}
              <div className="border-2 border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-purple-50 dark:bg-purple-950/20">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">2</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                      Student Results
                    </h3>
                    <p className="text-xs text-purple-700 dark:text-purple-300 mb-3">
                      Contains student scores and percentages. Includes ID, Section, Code, Total Score, and Percentage.
                    </p>
                    <Button onClick={downloadResultsRevised} className="w-full bg-purple-600 hover:bg-purple-700">
                      <Download className="mr-2 h-4 w-4" />
                      results_id_export_revised.xlsx
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Preview */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Preview: First 20 Students</h3>
              <div className="border-2 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-100 dark:bg-slate-800">
                    <TableRow>
                      <TableHead className="font-bold">Student ID</TableHead>
                      <TableHead className="font-bold">Section</TableHead>
                      <TableHead className="font-bold">Test Code</TableHead>
                      <TableHead className="text-right font-bold">Total Score</TableHead>
                      <TableHead className="text-right font-bold">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.slice(0, 20).map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <TableCell className="font-mono text-sm font-semibold">{row.ID}</TableCell>
                        <TableCell className="font-medium">{row.Section}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded text-sm font-semibold">
                            {row.Code}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold text-lg text-blue-600 dark:text-blue-400">
                            {row.Tot}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold text-lg ${
                            row.Per >= 90 ? 'text-green-600 dark:text-green-400' :
                            row.Per >= 80 ? 'text-blue-600 dark:text-blue-400' :
                            row.Per >= 70 ? 'text-yellow-600 dark:text-yellow-400' :
                            row.Per >= 60 ? 'text-orange-600 dark:text-orange-400' :
                            'text-red-600 dark:text-red-400'
                          }`}>
                            {row.Per}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
