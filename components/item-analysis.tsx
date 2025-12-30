'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Calculator, AlertCircle, X, TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { AnalysisDataUploader } from './shared/analysis-data-uploader';
import {
  validateCorrectAnswers,
  computeComprehensiveItemAnalysis,
  exportComprehensiveAnalysisToExcel
} from '@/lib/excel-utils';
import { error as logError } from '@/lib/logger';
import { DOWNLOAD_FILENAMES } from '@/config/downloads';
import {
  ExamRow,
  ItemAnalysisRow,
  ComprehensiveItemAnalysisResult,
  ItemStatistics
} from '@/types/exam';

export function ItemAnalysisTab() {
  const [uploadedData, setUploadedData] = useState<{
    answersData: ExamRow[];
    itemAnalysisData: ItemAnalysisRow[];
    numQuestions: number;
    hasPermutation: boolean;
  } | null>(null);

  const [comprehensiveResults, setComprehensiveResults] = useState<ComprehensiveItemAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ItemStatistics; direction: 'asc' | 'desc' } | null>(null);

  const handleDataReady = (data: {
    answersData: ExamRow[];
    itemAnalysisData: ItemAnalysisRow[];
    numQuestions: number;
    hasPermutation: boolean;
  }) => {
    setUploadedData(data);
    setComprehensiveResults(null);
    setError(null);
  };

  const handleDataChange = () => {
    setComprehensiveResults(null);
  };

  const handleCompute = () => {
    if (!uploadedData) {
      setError('Please upload both files and complete the configuration.');
      return;
    }

    if (!uploadedData.hasPermutation) {
      setError('Item analysis file does not contain permutation data. Comprehensive analysis requires the QUESTIONS_MAP format with Permutation column.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Validate correct answers first
      const validationError = validateCorrectAnswers(uploadedData.itemAnalysisData, uploadedData.answersData);
      if (validationError) {
        setError(validationError);
        setComprehensiveResults(null);
        return;
      }

      // Compute comprehensive analysis
      const results = computeComprehensiveItemAnalysis(
        uploadedData.answersData,
        uploadedData.itemAnalysisData,
        uploadedData.numQuestions
      );
      setComprehensiveResults(results);
    } catch (error: any) {
      logError('Error computing comprehensive item analysis:', error);
      setError(`Error computing comprehensive item analysis: ${error.message}`);
      setComprehensiveResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: keyof ItemStatistics) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedItems = () => {
    if (!comprehensiveResults || !sortConfig) return comprehensiveResults?.itemStatistics || [];

    const sorted = [...comprehensiveResults.itemStatistics].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === undefined || bValue === undefined) return 0;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return 0;
    });

    return sorted;
  };

  const downloadComprehensiveAnalysis = () => {
    if (!comprehensiveResults) return;

    exportComprehensiveAnalysisToExcel(
      comprehensiveResults,
      'item-analysis-comprehensive.xlsx'
    );
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'KEEP':
        return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'REVISE':
        return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
      case 'INVESTIGATE':
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'KEEP':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20';
      case 'REVISE':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20';
      case 'INVESTIGATE':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20';
      default:
        return '';
    }
  };

  const getReliabilityLabel = (kr20: number) => {
    if (kr20 >= 0.90) return { label: 'Excellent', color: 'text-green-600 dark:text-green-400' };
    if (kr20 >= 0.80) return { label: 'Good', color: 'text-blue-600 dark:text-blue-400' };
    if (kr20 >= 0.70) return { label: 'Acceptable', color: 'text-yellow-600 dark:text-yellow-400' };
    return { label: 'Poor', color: 'text-red-600 dark:text-red-400' };
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
            <CardTitle>Compute Comprehensive Item Analysis</CardTitle>
            <CardDescription>
              Comprehensive psychometric analysis including item difficulty, discrimination, point-biserial correlations, distractor efficiency, and test reliability (KR-20).
              {!uploadedData.hasPermutation && (
                <span className="block mt-2 text-yellow-600 dark:text-yellow-500">
                  ⚠️ Warning: Permutation data not detected. Please upload a QUESTIONS_MAP format file for comprehensive analysis.
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
              {loading ? 'Computing...' : 'Compute Analysis'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Test Summary Card */}
      {comprehensiveResults && (
        <>
          <Card className="border-2 border-blue-200 dark:border-blue-800">
            <CardHeader className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
              <CardTitle className="text-blue-900 dark:text-blue-100">Test Summary</CardTitle>
              <CardDescription className="text-blue-700 dark:text-blue-300">
                Overall test quality and reliability metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* KR-20 Reliability */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">KR-20 Reliability</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {comprehensiveResults.testSummary.KR20.toFixed(3)}
                    </span>
                    <span className={`text-sm font-semibold ${getReliabilityLabel(comprehensiveResults.testSummary.KR20).color}`}>
                      {getReliabilityLabel(comprehensiveResults.testSummary.KR20).label}
                    </span>
                  </div>
                </div>

                {/* Mean Score */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Mean Score</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">
                      {comprehensiveResults.testSummary.meanScore.toFixed(1)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ± {comprehensiveResults.testSummary.stdDevScore.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Mean Difficulty */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Mean Difficulty (p)</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">
                      {comprehensiveResults.testSummary.meanDifficulty.toFixed(3)}
                    </span>
                  </div>
                </div>

                {/* Mean Discrimination */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Mean Discrimination (D)</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">
                      {comprehensiveResults.testSummary.meanDiscrimination.toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Items to Keep */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {comprehensiveResults.testSummary.itemsToKeep}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">Items to Keep</p>
                  </div>
                </div>

                {/* Items to Revise */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                  <AlertTriangle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                      {comprehensiveResults.testSummary.itemsToRevise}
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">Items to Revise</p>
                  </div>
                </div>

                {/* Items to Investigate */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                  <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="text-2xl font-bold text-red-900 dark:text-red-100">
                      {comprehensiveResults.testSummary.itemsToInvestigate}
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300">Items to Investigate</p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <Button onClick={downloadComprehensiveAnalysis} className="bg-blue-600 hover:bg-blue-700">
                  <Download className="mr-2 h-4 w-4" />
                  Download Comprehensive Analysis
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Decision Criteria Legend */}
          <Card className="border-2 border-slate-200 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Decision Criteria & Metrics
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                <strong>p (Difficulty):</strong> Proportion of students who answered correctly (0.00-1.00). Higher = easier.
                <br />
                <strong>r<sub>pb</sub> (Point-Biserial):</strong> Measures if high-scoring students tend to get this question right. Higher = better discrimination.
                <br />
                <strong>D (Discrimination Index):</strong> Difference between top 27% and bottom 27% performance. Positive = good item.
                <br />
                <strong>DE (Distractor Efficiency):</strong> Percentage of wrong answer choices that attract at least 5% of students. Higher = distractors are working.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* KEEP */}
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                    <CheckCircle className="h-3.5 w-3.5" />
                    KEEP
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Good psychometric quality</p>
                  <p className="text-slate-600 dark:text-slate-400">
                    <strong>Criteria:</strong> 0.30 ≤ p ≤ 0.80, r<sub>pb</sub> ≥ 0.20, DE ≥ 75%
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 italic">
                    Question has moderate difficulty, good students answer correctly, and wrong answers are effective distractors.
                  </p>
                </div>
              </div>

              {/* REVISE */}
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    REVISE
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Needs improvement</p>
                  <p className="text-slate-600 dark:text-slate-400">
                    <strong>Criteria:</strong> p &gt; 0.80 or p &lt; 0.30 or r<sub>pb</sub> &lt; 0.20 or DE &lt; 75%
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 italic">
                    Question may be too easy/hard, doesn't distinguish between strong and weak students, or has ineffective distractors.
                  </p>
                </div>
              </div>

              {/* INVESTIGATE */}
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                    <XCircle className="h-3.5 w-3.5" />
                    INVESTIGATE
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Critical issues detected</p>
                  <p className="text-slate-600 dark:text-slate-400">
                    <strong>Criteria:</strong> D &lt; 0 or r<sub>pb</sub> &lt; 0
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 italic">
                    Weak students answer correctly MORE often than strong students. Likely indicates wrong answer key or fundamentally flawed question.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Item Overview Table */}
          <Card className="border-2 border-purple-200 dark:border-purple-800">
            <CardHeader className="bg-purple-50 dark:bg-purple-950/30">
              <CardTitle className="text-purple-900 dark:text-purple-100">Item Statistics Overview</CardTitle>
              <CardDescription className="text-purple-700 dark:text-purple-300">
                Click column headers to sort. Color-coded by decision: Green (Keep), Yellow (Revise), Red (Investigate).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="border-2 rounded-lg overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100 dark:bg-slate-800">
                    <TableRow>
                      <TableHead className="font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => handleSort('questionNumber')}>
                        Q# {sortConfig?.key === 'questionNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="text-right font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => handleSort('p_i')}>
                        p (Difficulty) {sortConfig?.key === 'p_i' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="text-right font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => handleSort('D_i')}>
                        D (Discrim.) {sortConfig?.key === 'D_i' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="text-right font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => handleSort('r_pb')}>
                        r_pb {sortConfig?.key === 'r_pb' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="text-right font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => handleSort('DE')}>
                        DE (%) {sortConfig?.key === 'DE' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => handleSort('decision')}>
                        Decision {sortConfig?.key === 'decision' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getSortedItems().map((item) => (
                      <TableRow key={item.questionNumber} className={`hover:bg-slate-50 dark:hover:bg-slate-900/50`}>
                        <TableCell className="font-semibold">Q{item.questionNumber}</TableCell>
                        <TableCell className="text-right">
                          <span className={item.p_i < 0.30 || item.p_i > 0.80 ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}>
                            {item.p_i.toFixed(3)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={item.D_i < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : item.D_i < 0.20 ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}>
                            {item.D_i.toFixed(3)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={item.r_pb < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : item.r_pb < 0.20 ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}>
                            {item.r_pb.toFixed(3)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={item.DE < 50 ? 'text-red-600 dark:text-red-400 font-semibold' : item.DE < 75 ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}>
                            {item.DE.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${getDecisionColor(item.decision)}`}>
                            {getDecisionIcon(item.decision)}
                            <span className="font-semibold text-sm">{item.decision}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Item Analysis Accordion */}
          <Card className="border-2 border-orange-200 dark:border-orange-800">
            <CardHeader className="bg-orange-50 dark:bg-orange-950/30">
              <CardTitle className="text-orange-900 dark:text-orange-100">Detailed Option Analysis</CardTitle>
              <CardDescription className="text-orange-700 dark:text-orange-300">
                Click each item to view comprehensive option-level statistics. Asterisk (*) indicates correct answer. Negative r_pb or D values for correct answers suggest problems.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Accordion type="single" collapsible className="w-full">
                {comprehensiveResults.itemStatistics.map((item) => {
                  // Get option statistics for this question
                  const optionStats = comprehensiveResults.optionStatistics.filter(
                    opt => opt.questionNumber === item.questionNumber
                  );

                  return (
                    <AccordionItem key={item.questionNumber} value={`q-${item.questionNumber}`}>
                      <AccordionTrigger className={`hover:bg-orange-50 dark:hover:bg-orange-950/20 px-4 ${
                        item.decision === 'INVESTIGATE' ? 'border-l-4 border-red-500' :
                        item.decision === 'REVISE' ? 'border-l-4 border-yellow-500' :
                        'border-l-4 border-green-500'
                      }`}>
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="font-semibold">Q{item.questionNumber}</span>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">p={item.p_i.toFixed(3)}</span>
                            <span className="text-muted-foreground">D={item.D_i.toFixed(3)}</span>
                            <span className="text-muted-foreground">r_pb={item.r_pb.toFixed(3)}</span>
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${getDecisionColor(item.decision)}`}>
                              {getDecisionIcon(item.decision)}
                              <span className="font-semibold text-xs">{item.decision}</span>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pt-4 pb-2">
                        {/* Decision Reason */}
                        {item.decisionReason && (
                          <Alert className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Decision Rationale</AlertTitle>
                            <AlertDescription>{item.decisionReason}</AlertDescription>
                          </Alert>
                        )}

                        {/* Option Statistics Table */}
                        <div className="border-2 rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader className="bg-slate-100 dark:bg-slate-800">
                              <TableRow>
                                <TableHead className="font-bold">Option</TableHead>
                                <TableHead className="text-right font-bold">Count</TableHead>
                                <TableHead className="text-right font-bold">p_ij (%)</TableHead>
                                <TableHead className="text-right font-bold">D_ij</TableHead>
                                <TableHead className="text-right font-bold">r_pb</TableHead>
                                <TableHead className="text-right font-bold">T1 (Top 25%)</TableHead>
                                <TableHead className="text-right font-bold">T2</TableHead>
                                <TableHead className="text-right font-bold">T3</TableHead>
                                <TableHead className="text-right font-bold">T4 (Bottom 25%)</TableHead>
                                <TableHead className="font-bold">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {optionStats.map((opt) => (
                                <TableRow
                                  key={opt.option}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 ${
                                    opt.isCorrect ? 'bg-green-50 dark:bg-green-950/20 font-semibold' : ''
                                  }`}
                                >
                                  <TableCell className="font-bold">
                                    {opt.isCorrect ? `${opt.option}*` : opt.option}
                                  </TableCell>
                                  <TableCell className="text-right">{opt.count}</TableCell>
                                  <TableCell className="text-right">
                                    {(opt.p_ij * 100).toFixed(1)}%
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={
                                      opt.isCorrect
                                        ? (opt.D_ij < 0 ? 'text-red-600 dark:text-red-400' : opt.D_ij < 0.20 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400')
                                        : (opt.D_ij > 0 ? 'text-red-600 dark:text-red-400' : '')
                                    }>
                                      {opt.D_ij.toFixed(3)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={
                                      opt.isCorrect
                                        ? (opt.r_pb < 0 ? 'text-red-600 dark:text-red-400' : opt.r_pb < 0.20 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400')
                                        : (opt.r_pb > 0 ? 'text-red-600 dark:text-red-400' : '')
                                    }>
                                      {opt.r_pb.toFixed(3)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">{opt.T1}</TableCell>
                                  <TableCell className="text-right">{opt.T2}</TableCell>
                                  <TableCell className="text-right">{opt.T3}</TableCell>
                                  <TableCell className="text-right">{opt.T4}</TableCell>
                                  <TableCell>
                                    {opt.isCorrect ? (
                                      <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                        Correct
                                      </span>
                                    ) : opt.option === 'Blank/Other' ? (
                                      <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        N/A
                                      </span>
                                    ) : opt.isFunctional ? (
                                      <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                        Functional
                                      </span>
                                    ) : (
                                      <span className="text-xs px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                                        Weak
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Interpretation Guide */}
                        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-2">
                          <p className="font-semibold">Interpretation Guide:</p>
                          <ul className="space-y-1 ml-4 text-muted-foreground">
                            <li>• <strong>p_ij:</strong> Proportion selecting this option (sum to 100%)</li>
                            <li>• <strong>D_ij:</strong> Discrimination for this option. Correct answer should be positive (high scorers select it more). Distractors should be negative.</li>
                            <li>• <strong>r_pb:</strong> Point-biserial correlation. Correct answer should be positive. Distractors should be negative.</li>
                            <li>• <strong>Functional:</strong> Distractor selected by ≥5% of students (effective at attracting guessers)</li>
                            <li>• <strong>Weak:</strong> Distractor selected by &lt;5% (not functioning as intended)</li>
                          </ul>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
