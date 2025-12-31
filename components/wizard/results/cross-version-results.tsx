'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { DOWNLOAD_FILENAMES } from '@/config/downloads';
import { AverageResult, CodeAverageResult } from '@/types/exam';

interface CrossVersionResultsProps {
  averageResults: AverageResult[];
  codeAverages: CodeAverageResult[];
  onDownloadAverage: () => void;
  onDownloadCode: () => void;
}

export function CrossVersionResults({
  averageResults,
  codeAverages,
  onDownloadAverage,
  onDownloadCode,
}: CrossVersionResultsProps) {
  return (
    <>
      {/* Master Question Statistics */}
      <Card className="border-2 border-purple-200 dark:border-purple-800">
        <CardHeader className="bg-purple-50 dark:bg-purple-950/30">
          <CardTitle className="text-purple-900 dark:text-purple-100">
            Master Question Statistics
          </CardTitle>
          <CardDescription className="text-purple-700 dark:text-purple-300">
            Performance statistics for each master question across all exam versions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <Button
            onClick={onDownloadAverage}
            className="bg-purple-600 hover:bg-purple-700"
          >
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
                    const codes = averageResults.length > 0
                      ? Object.keys(averageResults[0].codeStats).sort((a, b) => parseInt(a) - parseInt(b))
                      : [];
                    return codes.flatMap((code) => [
                      <TableHead key={`${code}-count`} className="text-right font-bold">
                        Code {code} - Count
                      </TableHead>,
                      <TableHead key={`${code}-avg`} className="text-right font-bold">
                        Code {code} - Avg (%)
                      </TableHead>,
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
                          row.Average_score >= 70
                            ? "text-green-600 dark:text-green-400"
                            : row.Average_score >= 50
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {row.Average_score.toFixed(2)}%
                        </span>
                      </TableCell>
                      {codes.flatMap((code) => {
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
                              row.codeStats[code].average >= 70
                                ? "text-green-600 dark:text-green-400"
                                : row.codeStats[code].average >= 50
                                ? "text-yellow-600 dark:text-yellow-400"
                                : "text-red-600 dark:text-red-400"
                            }`}>
                              {row.codeStats[code].average.toFixed(2)}%
                            </span>
                          </TableCell>,
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
            <CardTitle className="text-blue-900 dark:text-blue-100">
              Exam Version Statistics
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-300">
              Performance statistics for each exam code/version
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <Button
              onClick={onDownloadCode}
              className="bg-blue-600 hover:bg-blue-700"
            >
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
                          row.Average_score >= 70
                            ? "text-green-600 dark:text-green-400"
                            : row.Average_score >= 50
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400"
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
  );
}
