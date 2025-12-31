'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Users, Hash } from 'lucide-react';
import { FileDropZone } from '@/components/shared/file-drop-zone';
import { readExamDataFile, getAllQuestionCols, guessNumQuestions, isSolutionRow } from '@/lib/excel-utils';
import { useWizard } from '@/contexts/wizard-context';
import { ExamRow } from '@/types/exam';
import { error as logError } from '@/lib/logger';

export function Step1UploadStudentData() {
  const { updateStudentData, markStepComplete } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    data: ExamRow[];
    numQuestions: number;
    numStudents: number;
    codes: string[];
  } | null>(null);

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    setError(null);
    setUploadedFile(null);

    try {
      const data = await readExamDataFile(file);
      const qCols = getAllQuestionCols(data);
      const guessedNumQuestions = guessNumQuestions(data);
      const students = data.filter(row => !isSolutionRow(row));
      const codes = Array.from(new Set(students.map(s => s.Code))).sort();

      const fileInfo = {
        name: file.name,
        data,
        numQuestions: guessedNumQuestions,
        numStudents: students.length,
        codes,
      };

      setUploadedFile(fileInfo);

      // Update wizard state
      updateStudentData(data, guessedNumQuestions);
      markStepComplete(1);

    } catch (err: any) {
      logError('Error reading student data file:', err);
      setError(err.message || 'Failed to read file. Please check the format and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            <CardTitle>Upload Student Answers/Data File</CardTitle>
          </div>
          <CardDescription>
            Upload the exam answer sheet containing student responses and solution rows
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload Error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
            </Alert>
          )}

          <FileDropZone
            onFileSelect={handleFileSelect}
            accept=".xls,.xlsx,.csv,.txt"
            title="Upload Exam Data File"
            description="Excel (.xls, .xlsx) or CSV/TXT file with student answers"
            disabled={loading}
          />

          {loading && (
            <div className="text-center text-sm text-muted-foreground">
              Processing file...
            </div>
          )}

          {uploadedFile && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-900 dark:text-green-100">
                File Uploaded Successfully
              </AlertTitle>
              <AlertDescription className="text-green-800 dark:text-green-200">
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="font-semibold">{uploadedFile.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <div>
                        <div className="text-xs text-green-700 dark:text-green-300">Students</div>
                        <div className="text-lg font-bold text-green-900 dark:text-green-100">
                          {uploadedFile.numStudents}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      <div>
                        <div className="text-xs text-green-700 dark:text-green-300">Questions</div>
                        <div className="text-lg font-bold text-green-900 dark:text-green-100">
                          {uploadedFile.numQuestions}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      <div>
                        <div className="text-xs text-green-700 dark:text-green-300">Versions</div>
                        <div className="text-lg font-bold text-green-900 dark:text-green-100">
                          {uploadedFile.codes.length}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs">
                    <span className="font-semibold">Codes: </span>
                    {uploadedFile.codes.join(', ')}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
