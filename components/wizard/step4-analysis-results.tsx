'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Calculator, AlertCircle, Info, FileSpreadsheet, FileText } from 'lucide-react';
import {
  computeAverageResults,
  computeCodeAverages,
  computeComprehensiveItemAnalysis,
  exportComprehensiveAnalysisToExcel,
  exportToExcel,
} from '@/lib/excel-utils';
import { error as logError } from '@/lib/logger';
import { DOWNLOAD_FILENAMES } from '@/config/downloads';
import { useWizard } from '@/contexts/wizard-context';
import { AverageResult, CodeAverageResult, ComprehensiveItemAnalysisResult } from '@/types/exam';

// Import results display components (we'll need to extract these from item-analysis.tsx)
import { CrossVersionResults } from './results/cross-version-results';
import { ComprehensiveResults } from './results/comprehensive-results';

export function Step4AnalysisResults() {
  const { state } = useWizard();
  const [loadingCrossVersion, setLoadingCrossVersion] = useState(false);
  const [loadingComprehensive, setLoadingComprehensive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cross-version results
  const [averageResults, setAverageResults] = useState<AverageResult[]>([]);
  const [codeAverages, setCodeAverages] = useState<CodeAverageResult[]>([]);

  // Comprehensive results
  const [comprehensiveResults, setComprehensiveResults] = useState<ComprehensiveItemAnalysisResult | null>(null);

  if (!state.studentData || !state.itemAnalysisData) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Missing Data</AlertTitle>
        <AlertDescription>
          Please complete Step 1 (Upload Student Data) and Step 3 (Upload Item Analysis) first.
        </AlertDescription>
      </Alert>
    );
  }

  const handleComputeCrossVersion = () => {
    setLoadingCrossVersion(true);
    setError(null);
    try {
      const avgResults = computeAverageResults(
        state.studentData!,
        state.itemAnalysisData!,
        state.numQuestions
      );
      const codeResults = computeCodeAverages(
        state.studentData!,
        state.itemAnalysisData!,
        state.numQuestions
      );
      setAverageResults(avgResults);
      setCodeAverages(codeResults);
    } catch (err: any) {
      logError('Error computing cross-version analysis:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoadingCrossVersion(false);
    }
  };

  const handleComputeComprehensive = () => {
    setLoadingComprehensive(true);
    setError(null);
    try {
      const results = computeComprehensiveItemAnalysis(
        state.studentData!,
        state.itemAnalysisData!,
        state.numQuestions
      );
      setComprehensiveResults(results);
    } catch (err: any) {
      logError('Error computing comprehensive analysis:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoadingComprehensive(false);
    }
  };

  const downloadComprehensive = () => {
    if (!comprehensiveResults) return;
    exportComprehensiveAnalysisToExcel(
      comprehensiveResults,
      'item-analysis-comprehensive.xlsx'
    );
  };

  const downloadAverageResults = () => {
    if (averageResults.length === 0) return;

    const flattenedResults = averageResults.map((row) => {
      const flattened: any = {
        Master_Question: row.Master_Question,
        Average_score: row.Average_score,
      };

      const codes = Object.keys(row.codeStats).sort((a, b) => parseInt(a) - parseInt(b));
      codes.forEach((code) => {
        const position = row.positions[code];
        flattened[`Code ${code} - Position`] = position || "";
        flattened[`Code ${code} - Count`] = row.codeStats[code].count;
        flattened[`Code ${code} - Avg`] = row.codeStats[code].average;
      });

      return flattened;
    });

    exportToExcel(
      flattenedResults,
      DOWNLOAD_FILENAMES.crossVersionAnalysis.masterQuestionStats,
      "average_results"
    );
  };

  const downloadCodeAverages = () => {
    if (codeAverages.length === 0) return;
    exportToExcel(
      codeAverages,
      DOWNLOAD_FILENAMES.crossVersionAnalysis.examVersionStats,
      "code_averages"
    );
  };

  return (
    <div className="space-y-6">
      {/* Loaded Files Info */}
      {(state.studentDataFileName || state.itemAnalysisFileName) && (
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <FileSpreadsheet className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 dark:text-blue-100">Loaded Files</AlertTitle>
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            <div className="space-y-1 mt-1">
              {state.studentDataFileName && (
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-3 w-3" />
                  <span className="font-semibold">Student Data:</span>
                  <span className="font-mono text-sm">{state.studentDataFileName}</span>
                </div>
              )}
              {state.itemAnalysisFileName && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  <span className="font-semibold">Item Analysis:</span>
                  <span className="font-mono text-sm">{state.itemAnalysisFileName}</span>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Cross-Version Analysis Card */}
      <Card className="border-2 border-purple-200 dark:border-purple-800">
        <CardHeader className="bg-purple-50 dark:bg-purple-950/30">
          <CardTitle className="text-purple-900 dark:text-purple-100">
            Cross-Version Analysis
          </CardTitle>
          <CardDescription className="text-purple-700 dark:text-purple-300">
            Compare performance across exam versions and master questions
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Button
            onClick={handleComputeCrossVersion}
            disabled={loadingCrossVersion || averageResults.length > 0}
            size="lg"
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Calculator className="mr-2 h-4 w-4" />
            {loadingCrossVersion ? 'Computing...' : averageResults.length > 0 ? 'Computed ✓' : 'Compute Cross-Version Analysis'}
          </Button>
        </CardContent>
      </Card>

      {/* Cross-Version Results */}
      {averageResults.length > 0 && (
        <CrossVersionResults
          averageResults={averageResults}
          codeAverages={codeAverages}
          onDownloadAverage={downloadAverageResults}
          onDownloadCode={downloadCodeAverages}
        />
      )}

      {/* Comprehensive Analysis Card */}
      {state.hasPermutation && (
        <Card className="border-2 border-orange-200 dark:border-orange-800">
          <CardHeader className="bg-orange-50 dark:bg-orange-950/30">
            <CardTitle className="text-orange-900 dark:text-orange-100">
              Comprehensive Psychometric Analysis
            </CardTitle>
            <CardDescription className="text-orange-700 dark:text-orange-300">
              Item difficulty, discrimination, reliability (KR-20), and distractor analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Button
              onClick={handleComputeComprehensive}
              disabled={loadingComprehensive || comprehensiveResults !== null}
              size="lg"
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Calculator className="mr-2 h-4 w-4" />
              {loadingComprehensive ? 'Computing...' : comprehensiveResults ? 'Computed ✓' : 'Compute Comprehensive Analysis'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Comprehensive Results */}
      {comprehensiveResults && (
        <ComprehensiveResults
          results={comprehensiveResults}
          onDownload={downloadComprehensive}
        />
      )}

      {!state.hasPermutation && averageResults.length === 0 && (
        <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-900 dark:text-yellow-100">Limited Analysis</AlertTitle>
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            Your item analysis file does not contain permutation data. Only cross-version analysis is available.
            Upload a QUESTIONS_MAP format file with Permutation column for comprehensive psychometric analysis.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
