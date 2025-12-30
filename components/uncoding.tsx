'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Calculator } from 'lucide-react';
import { CrossVersionHelpDialog } from './cross-version-help-dialog';
import { AnalysisDataUploader } from './shared/analysis-data-uploader';
import {
  computeAverageResults,
  computeCodeAverages,
  exportToExcel
} from '@/lib/excel-utils';
import { DOWNLOAD_FILENAMES } from '@/config/downloads';
import {
  ExamRow,
  ItemAnalysisRow,
  AverageResult,
  CodeAverageResult
} from '@/types/exam';

export function UncodingTab() {
  const [uploadedData, setUploadedData] = useState<{
    answersData: ExamRow[];
    itemAnalysisData: ItemAnalysisRow[];
    numQuestions: number;
    hasPermutation: boolean;
  } | null>(null);

  const [averageResults, setAverageResults] = useState<AverageResult[]>([]);
  const [codeAverages, setCodeAverages] = useState<CodeAverageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDataReady = (data: {
    answersData: ExamRow[];
    itemAnalysisData: ItemAnalysisRow[];
    numQuestions: number;
    hasPermutation: boolean;
  }) => {
    setUploadedData(data);
    setAverageResults([]);
    setCodeAverages([]);
    setError(null);
  };

  const handleDataChange = () => {
    setAverageResults([]);
    setCodeAverages([]);
  };

  const handleCompute = () => {
    if (!uploadedData) {
      setError('Please upload both files and complete the configuration.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = computeAverageResults(
        uploadedData.answersData,
        uploadedData.itemAnalysisData,
        uploadedData.numQuestions
      );
      const codeResults = computeCodeAverages(
        uploadedData.answersData,
        uploadedData.itemAnalysisData,
        uploadedData.numQuestions
      );
      setAverageResults(results);
      setCodeAverages(codeResults);
    } catch (error: any) {
      setError(error.message || 'Error computing averages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadAverageResults = () => {
    if (averageResults.length === 0) return;

    // Flatten codeStats for Excel export with grouped code columns
    const flattenedResults = averageResults.map(row => {
      const flattened: any = {
        Master_Question: row.Master_Question,
        Average_score: row.Average_score
      };

      // Get all codes sorted numerically
      const codes = Object.keys(row.codeStats).sort((a, b) => parseInt(a) - parseInt(b));

      // Add code stats as separate columns grouped together: Position, Count, Avg for each code
      codes.forEach(code => {
        const position = row.positions[code];
        flattened[`Code ${code} - Position`] = position || '';
        flattened[`Code ${code} - Count`] = row.codeStats[code].count;
        flattened[`Code ${code} - Avg`] = row.codeStats[code].average;
      });

      return flattened;
    });

    exportToExcel(flattenedResults, DOWNLOAD_FILENAMES.crossVersionAnalysis.masterQuestionStats, 'average_results');
  };

  const downloadCodeAverages = () => {
    if (codeAverages.length === 0) return;
    exportToExcel(codeAverages, DOWNLOAD_FILENAMES.crossVersionAnalysis.examVersionStats, 'code_averages');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <AnalysisDataUploader
        onDataReady={handleDataReady}
        onDataChange={handleDataChange}
        helpDialog={<CrossVersionHelpDialog />}
      />

      {uploadedData && (
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
              Compute
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
                Performance statistics for each master question across all exam versions. Note: The same master question may appear at different positions in each exam version (e.g., Master Q1 might be Q7 in Code 1, Q12 in Code 2). Position numbers are shown in parentheses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Button onClick={downloadAverageResults} className="bg-purple-600 hover:bg-purple-700">
                <Download className="mr-2 h-4 w-4" />
                Download {DOWNLOAD_FILENAMES.crossVersionAnalysis.masterQuestionStats}
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
                          {codes.flatMap(code => {
                            const position = row.positions[code];
                            return [
                              <TableCell key={`${code}-count`} className="text-right">
                                <span className="text-sm text-slate-600 dark:text-slate-400">
                                  {row.codeStats[code].count}
                                </span>
                                {position && (
                                  <span className="text-xs text-slate-500 dark:text-slate-500 ml-1">
                                    (Q{position})
                                  </span>
                                )}
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
                            ];
                          })}
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
                  Download {DOWNLOAD_FILENAMES.crossVersionAnalysis.examVersionStats}
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
