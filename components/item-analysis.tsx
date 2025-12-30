'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Calculator, AlertCircle, X } from 'lucide-react';
import { AnalysisDataUploader } from './shared/analysis-data-uploader';
import {
  getAllQuestionCols,
  buildCorrectAnswersMap,
  computeResults,
  classifyStudentsByQuartile,
  validateCorrectAnswers,
  computeDistractorAnalysis,
  exportToExcel
} from '@/lib/excel-utils';
import { error as logError } from '@/lib/logger';
import { DOWNLOAD_FILENAMES } from '@/config/downloads';
import {
  ExamRow,
  ItemAnalysisRow,
  DistractorAnalysisResult
} from '@/types/exam';

export function ItemAnalysisTab() {
  const [uploadedData, setUploadedData] = useState<{
    answersData: ExamRow[];
    itemAnalysisData: ItemAnalysisRow[];
    numQuestions: number;
    hasPermutation: boolean;
  } | null>(null);

  const [distractorResults, setDistractorResults] = useState<DistractorAnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDataReady = (data: {
    answersData: ExamRow[];
    itemAnalysisData: ItemAnalysisRow[];
    numQuestions: number;
    hasPermutation: boolean;
  }) => {
    setUploadedData(data);
    setDistractorResults([]);
    setError(null);
  };

  const handleDataChange = () => {
    setDistractorResults([]);
  };

  const handleCompute = () => {
    if (!uploadedData) {
      setError('Please upload both files and complete the configuration.');
      return;
    }

    if (!uploadedData.hasPermutation) {
      setError('Item analysis file does not contain permutation data. Distractor analysis requires the QUESTIONS_MAP format with Permutation column.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Validate correct answers first
      const validationError = validateCorrectAnswers(uploadedData.itemAnalysisData, uploadedData.answersData);
      if (validationError) {
        setError(validationError);
        setDistractorResults([]);
        return;
      }

      // Get student results with scores
      const qCols = getAllQuestionCols(uploadedData.answersData).slice(0, uploadedData.numQuestions);
      const correctMap = buildCorrectAnswersMap(uploadedData.answersData, qCols);
      const studentResults = computeResults(uploadedData.answersData, qCols, correctMap);

      // Classify students into quartiles
      const rankedStudents = classifyStudentsByQuartile(studentResults);

      // Compute distractor analysis
      const distractorAnalysis = computeDistractorAnalysis(
        uploadedData.answersData,
        uploadedData.itemAnalysisData,
        rankedStudents
      );
      setDistractorResults(distractorAnalysis);
    } catch (error: any) {
      logError('Error computing distractor analysis:', error);
      setError(`Error computing distractor analysis: ${error.message}`);
      setDistractorResults([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadDistractorAnalysis = () => {
    if (distractorResults.length === 0) return;

    // Flatten distractor results for Excel export
    const flattenedResults = distractorResults.flatMap(result =>
      result.choices.map(choice => ({
        'Master Question': result.masterQuestion,
        'Choice': choice.isCorrect ? `${choice.choice}*` : choice.choice,
        'Count': choice.count,
        'Percentage': `${choice.percentage}%`,
        'TOP 25%': choice.T1,
        'SECOND 25%': choice.T2,
        'THIRD 25%': choice.T3,
        'BOTTOM 25%': choice.T4
      }))
    );

    exportToExcel(flattenedResults, DOWNLOAD_FILENAMES.crossVersionAnalysis.distractorAnalysis, 'distractor_analysis');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <AnalysisDataUploader
        onDataReady={handleDataReady}
        onDataChange={handleDataChange}
      />

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

      {uploadedData && (
        <Card>
          <CardHeader>
            <CardTitle>Compute Item Analysis</CardTitle>
            <CardDescription>
              Analyze answer choice patterns across student performance quartiles.
              {!uploadedData.hasPermutation && (
                <span className="block mt-2 text-yellow-600 dark:text-yellow-500">
                  ⚠️ Warning: Permutation data not detected. Please upload a QUESTIONS_MAP format file for distractor analysis.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleCompute}
              disabled={loading || !uploadedData.hasPermutation}
              size="lg"
            >
              <Calculator className="mr-2 h-4 w-4" />
              Compute Distractor Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Distractor Analysis Results */}
      {distractorResults.length > 0 && (
        <Card className="border-2 border-orange-200 dark:border-orange-800">
          <CardHeader className="bg-orange-50 dark:bg-orange-950/30">
            <CardTitle className="text-orange-900 dark:text-orange-100">Distractor Analysis</CardTitle>
            <CardDescription className="text-orange-700 dark:text-orange-300">
              Analysis of answer choices selected by students in each quartile. Asterisk (*) indicates the correct answer.
              Students are ranked globally by total score and divided into four equal groups (T1=Top 25%, T2=Second 25%, T3=Third 25%, T4=Bottom 25%).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <Button onClick={downloadDistractorAnalysis} className="bg-orange-600 hover:bg-orange-700">
              <Download className="mr-2 h-4 w-4" />
              Download {DOWNLOAD_FILENAMES.crossVersionAnalysis.distractorAnalysis}
            </Button>

            <Accordion type="single" collapsible className="w-full">
              {distractorResults.map((result) => (
                <AccordionItem key={result.masterQuestion} value={`q-${result.masterQuestion}`}>
                  <AccordionTrigger className="hover:bg-orange-50 dark:hover:bg-orange-950/20 px-4">
                    <span className="font-semibold">Master Question {result.masterQuestion}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pt-2">
                    <div className="border-2 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-100 dark:bg-slate-800">
                          <TableRow>
                            <TableHead className="font-bold">Choice</TableHead>
                            <TableHead className="text-right font-bold">Count</TableHead>
                            <TableHead className="text-right font-bold">Percentage</TableHead>
                            <TableHead className="text-right font-bold">TOP 25%</TableHead>
                            <TableHead className="text-right font-bold">SECOND 25%</TableHead>
                            <TableHead className="text-right font-bold">THIRD 25%</TableHead>
                            <TableHead className="text-right font-bold">BOTTOM 25%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.choices.map((choice) => (
                            <TableRow
                              key={choice.choice}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 ${
                                choice.isCorrect ? 'bg-green-50 dark:bg-green-950/20' : ''
                              }`}
                            >
                              <TableCell className="font-semibold">
                                {choice.isCorrect ? `${choice.choice}*` : choice.choice}
                              </TableCell>
                              <TableCell className="text-right">{choice.count}</TableCell>
                              <TableCell className="text-right">{choice.percentage.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">{choice.T1}</TableCell>
                              <TableCell className="text-right">{choice.T2}</TableCell>
                              <TableCell className="text-right">{choice.T3}</TableCell>
                              <TableCell className="text-right">{choice.T4}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
