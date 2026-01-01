'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Users, Hash, Download } from 'lucide-react';
import { FileDropZone } from '@/components/shared/file-drop-zone';
import {
  readExamDataFileWithDetection,
  applyColumnMapping,
  guessNumQuestions,
  isSolutionRow
} from '@/lib/excel-utils';
import { generateExamTemplate } from '@/lib/template-generator';
import { useWizard } from '@/contexts/wizard-context';
import { ExamRow, ColumnDetectionResult } from '@/types/exam';
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

  // Column mapping state
  const [showMappingUI, setShowMappingUI] = useState(false);
  const [rawData, setRawData] = useState<any[]>([]);
  const [detection, setDetection] = useState<ColumnDetectionResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<{
    idColumn: string;
    codeColumn: string;
  }>({ idColumn: '', codeColumn: '' });
  const [tempFileName, setTempFileName] = useState('');

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    setError(null);
    setUploadedFile(null);
    setShowMappingUI(false);

    try {
      const { rawData: fileData, detection: fileDetection } = await readExamDataFileWithDetection(file);

      if (!fileDetection.valid) {
        // Check if we can show mapping UI or if it's a fatal error
        if (fileDetection.errors.some(e => e.includes('sequential') || e.includes('gaps'))) {
          // Fatal error - question ordering issues
          setError(fileDetection.errors.join('\n'));
          return;
        }

        // Show mapping UI for missing columns
        setRawData(fileData);
        setDetection(fileDetection);
        setTempFileName(file.name);
        setColumnMapping({
          idColumn: fileDetection.idColumn || '',
          codeColumn: fileDetection.codeColumn || ''
        });
        setShowMappingUI(true);
        return;
      }

      // Auto-detection succeeded - process the data
      const data = applyColumnMapping(fileData, fileDetection);
      completeFileUpload(data, file.name);

    } catch (err: any) {
      logError('Error reading student data file:', err);
      setError(err.message || 'Failed to read file. Please check the format and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyMapping = () => {
    if (!detection || !columnMapping.idColumn || !columnMapping.codeColumn) {
      setError('Please select both ID and Code columns.');
      return;
    }

    try {
      // Update detection with manual mapping
      const updatedDetection: ColumnDetectionResult = {
        ...detection,
        idColumn: columnMapping.idColumn,
        codeColumn: columnMapping.codeColumn,
        valid: true,
        errors: []
      };

      const data = applyColumnMapping(rawData, updatedDetection);
      setShowMappingUI(false);
      completeFileUpload(data, tempFileName);
    } catch (err: any) {
      logError('Error applying column mapping:', err);
      setError(err.message || 'Failed to apply mapping. Please try again.');
    }
  };

  const completeFileUpload = (data: ExamRow[], fileName: string) => {
    const guessedNumQuestions = guessNumQuestions(data);
    const students = data.filter(row => !isSolutionRow(row));
    const codes = Array.from(new Set(students.map(s => s.Code))).sort();

    const fileInfo = {
      name: fileName,
      data,
      numQuestions: guessedNumQuestions,
      numStudents: students.length,
      codes,
    };

    setUploadedFile(fileInfo);

    // Update wizard state
    updateStudentData(data, guessedNumQuestions, fileName);
    markStepComplete(1);
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
          {/* Template Download Button */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={generateExamTemplate}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download Template
            </Button>
          </div>

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

      {/* Column Mapping UI */}
      {showMappingUI && detection && (
        <Card className="border-2 border-yellow-500/50">
          <CardHeader className="bg-yellow-50/50 dark:bg-yellow-950/20">
            <AlertCircle className="h-6 w-6 text-yellow-600 mt-0.5" />
            <CardTitle>Map Your Column Names</CardTitle>
            <CardDescription>
              We couldn't auto-detect all required columns. Please map them below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Show detected columns */}
            <div className="p-4 bg-muted/50 rounded-md">
              <p className="text-sm font-semibold mb-2">Detected columns in your file:</p>
              <div className="flex flex-wrap gap-2">
                {detection.allColumns.map((col, idx) => (
                  <code key={idx} className="text-xs bg-background px-2 py-1 rounded">
                    {col}
                  </code>
                ))}
              </div>
            </div>

            {/* Show auto-detection results */}
            {detection.questionColumns.length > 0 && (
              <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  <strong>Detected {detection.questionColumns.length} question columns:</strong>
                  <div className="mt-1 text-xs">
                    {detection.questionColumns.map((q, idx) => (
                      <span key={idx} className="mr-2">Q{q.number} ({q.name})</span>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Manual mapping dropdowns */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold">
                  Student ID Column <span className="text-red-500">*</span>
                </label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={columnMapping.idColumn}
                  onChange={(e) => setColumnMapping({ ...columnMapping, idColumn: e.target.value })}
                >
                  <option value="">-- Select Column --</option>
                  {detection.allColumns.map((col, idx) => (
                    <option key={idx} value={col}>{col}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Column containing student IDs
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">
                  Exam Code/Version Column <span className="text-red-500">*</span>
                </label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={columnMapping.codeColumn}
                  onChange={(e) => setColumnMapping({ ...columnMapping, codeColumn: e.target.value })}
                >
                  <option value="">-- Select Column --</option>
                  {detection.allColumns.map((col, idx) => (
                    <option key={idx} value={col}>{col}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Column containing exam version codes (solution rows should have Code = "0" or "00")
                </p>
              </div>
            </div>

            {/* Note about question columns */}
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <strong>Note:</strong> Question columns are auto-detected. We found {detection.questionColumns.length} sequential questions.
                All other columns will be ignored.
              </AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button
                onClick={handleApplyMapping}
                disabled={!columnMapping.idColumn || !columnMapping.codeColumn}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Apply Mapping & Continue
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setShowMappingUI(false);
                  setError('Mapping cancelled. Please re-upload a file with correct column names.');
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
