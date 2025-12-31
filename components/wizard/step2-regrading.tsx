'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Check, AlertTriangle, Info } from 'lucide-react';
import {
  getAllQuestionCols,
  getSolutionCodes,
  buildCorrectAnswersMap,
  computeResults,
  reviseSolutionRows,
  exportToExcel,
} from '@/lib/excel-utils';
import { CorrectAnswersMap, StudentResult, ANS_CHOICES, AnswerChoice } from '@/types/exam';
import { error as logError } from '@/lib/logger';
import { DOWNLOAD_FILENAMES } from '@/config/downloads';
import { useWizard } from '@/contexts/wizard-context';

export function Step2Regrading() {
  const { state, updateCorrectAnswers, markStepComplete } = useWizard();
  const [codes, setCodes] = useState<string[]>([]);
  const [qCols, setQCols] = useState<string[]>([]);
  const [correctMap, setCorrectMap] = useState<CorrectAnswersMap>({});
  const [pointsPerQuestion, setPointsPerQuestion] = useState<number>(5);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [revisedData, setRevisedData] = useState<any[]>([]);
  const [hasModified, setHasModified] = useState(false);

  useEffect(() => {
    if (state.studentData) {
      const allQCols = getAllQuestionCols(state.studentData);
      const selectedQCols = allQCols.slice(0, state.numQuestions);
      const detectedCodes = getSolutionCodes(state.studentData);
      const initialMap = buildCorrectAnswersMap(state.studentData, selectedQCols);

      setQCols(selectedQCols);
      setCodes(detectedCodes);
      setCorrectMap(initialMap);
    }
  }, [state.studentData, state.numQuestions]);

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
    setHasModified(true);
  };

  const handleRegrade = () => {
    if (!state.studentData) return;

    try {
      const studentResults = computeResults(state.studentData, qCols, correctMap, pointsPerQuestion);
      const revisedImport = reviseSolutionRows(state.studentData, qCols, correctMap);

      setResults(studentResults);
      setRevisedData(revisedImport);

      // Update wizard state
      updateCorrectAnswers(correctMap, true);
      markStepComplete(2);
    } catch (error) {
      logError('Error computing results:', error);
    }
  };

  const downloadRevisedData = () => {
    if (revisedData.length === 0) return;
    exportToExcel(revisedData, DOWNLOAD_FILENAMES.reGrading.examDataRevised, 'import_test_data', state.studentData || []);
  };

  const downloadResults = () => {
    if (results.length === 0) return;
    exportToExcel(results, DOWNLOAD_FILENAMES.reGrading.studentResults, 'results_id_export');
  };

  if (!state.studentData) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>Please go back to Step 1 and upload student data first.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900 dark:text-blue-100">Re-grading (Optional)</AlertTitle>
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          Review and modify correct answers below. If you don't need to change anything, you can skip to the next step.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Correct Answers Summary</CardTitle>
          <CardDescription>
            Current solution rows for all exam versions. Click checkboxes to modify.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="points-per-q">Points per Question:</Label>
            <Input
              id="points-per-q"
              type="number"
              min={1}
              max={10}
              value={pointsPerQuestion}
              onChange={(e) => setPointsPerQuestion(parseInt(e.target.value) || 5)}
              className="w-24"
            />
          </div>

          <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              <strong>Note:</strong> Questions with no correct answer selected are highlighted in yellow. Make sure each question has at least one correct answer.
            </AlertDescription>
          </Alert>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  {qCols.map((_, idx) => (
                    <TableHead key={idx} className="text-center">
                      Q{idx + 1}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((code) => (
                  <TableRow key={code}>
                    <TableCell className="font-semibold bg-slate-50 dark:bg-slate-900">
                      {code}
                    </TableCell>
                    {qCols.map((_, questionIdx) => {
                      const answers = correctMap[code]?.[questionIdx] || [];
                      const hasNoAnswer = answers.length === 0;
                      return (
                        <TableCell
                          key={questionIdx}
                          className={`p-2 ${hasNoAnswer ? 'bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600' : ''}`}
                        >
                          <div className="flex flex-col gap-1 items-start">
                            {ANS_CHOICES.map((choice) => (
                              <div key={choice} className="flex items-center">
                                <Checkbox
                                  id={`${code}-${questionIdx}-${choice}`}
                                  checked={answers.includes(choice)}
                                  onCheckedChange={() => toggleAnswer(code, questionIdx, choice)}
                                  className="mr-1"
                                />
                                <label
                                  htmlFor={`${code}-${questionIdx}-${choice}`}
                                  className="text-xs cursor-pointer"
                                >
                                  {choice}
                                </label>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={handleRegrade}
              disabled={!hasModified}
              size="lg"
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="mr-2 h-4 w-4" />
              Re-grade with New Answers
            </Button>
            {hasModified && !results.length && (
              <Alert className="flex-1 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  You've modified answers. Click "Re-grade" to apply changes.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-green-900 dark:text-green-100">Re-grading Complete</CardTitle>
            <CardDescription className="text-green-700 dark:text-green-300">
              {results.length} students re-graded successfully
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={downloadRevisedData} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download Revised Exam Data
              </Button>
              <Button onClick={downloadResults} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download Student Results
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
