'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, FileSpreadsheet, FileText, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateExamTemplate } from '@/lib/template-generator';

export function ItemAnalysisHelpDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <HelpCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Item Analysis Help</DialogTitle>
          <DialogDescription>
            Learn how to prepare and upload your files for comprehensive psychometric analysis and cross-version comparison
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="answers" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="answers" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Answers File
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-2">
              <FileText className="h-4 w-4" />
              Item Analysis
            </TabsTrigger>
          </TabsList>

          {/* Answers File Tab */}
          <TabsContent value="answers" className="space-y-6">
            {/* Option 1: ITC Exam Center */}
            <div className="border-2 border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50/50 dark:bg-green-950/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-lg text-green-900 dark:text-green-100">
                    Option 1: ITC Exam Center File
                  </h3>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    If you received your exam data file from the KFUPM ITC Exam
                    Center, you can upload it directly without any modifications.
                  </p>
                  <ul className="text-sm text-green-700 dark:text-green-300 space-y-1 ml-4">
                    <li>• File is already in the correct format</li>
                    <li>• Simply select and upload the file</li>
                    <li>• Supported formats: .xls, .xlsx</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Option 2: Custom Format */}
            <div className="border-2 border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                <div className="space-y-3 flex-1">
                  <h3 className="font-semibold text-lg text-purple-900 dark:text-purple-100">
                    Option 2: Custom Grading (e.g., Gradescope)
                  </h3>
                  <p className="text-sm text-purple-800 dark:text-purple-200">
                    If you're doing your own grading or using external tools like
                    Gradescope, you must format your data according to our
                    template.
                  </p>

                  <Button
                    onClick={generateExamTemplate}
                    variant="outline"
                    className="border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Template (Excel)
                  </Button>

                  <div className="bg-white dark:bg-slate-900 rounded p-3 border border-purple-200 dark:border-purple-800">
                    <p className="text-xs font-semibold text-purple-900 dark:text-purple-100 mb-2">
                      Template Format Requirements:
                    </p>
                    <ul className="text-xs text-purple-700 dark:text-purple-300 space-y-1">
                      <li>
                        • <strong>Required columns:</strong> ID, Section, Code,
                        then question numbers (1, 2, 3, ...)
                      </li>
                      <li>
                        • <strong>Solution rows:</strong> ID is required (use "0" or "000000000"), Section is optional
                      </li>
                      <li>
                        • <strong>Code column:</strong> Can be numeric (001, 002)
                        or text (A, B, Version A)
                      </li>
                      <li>
                        • <strong>Question columns:</strong> Number them
                        sequentially (1, 2, 3, ...)
                      </li>
                      <li>
                        • <strong>Answers:</strong> Single letters A-E for
                        students, multiple letters for solutions (e.g., "ABE")
                      </li>
                      <li>
                        • <strong>File formats:</strong> .xls, .xlsx, .csv (comma or tab-delimited), or .txt
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Example Table */}
            <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
              <h4 className="font-semibold text-sm mb-3 text-slate-900 dark:text-slate-100">
                Example Data Format:
              </h4>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-200 dark:bg-slate-800">
                      <th className="border border-slate-300 dark:border-slate-700 px-2 py-1">
                        ID
                      </th>
                      <th className="border border-slate-300 dark:border-slate-700 px-2 py-1">
                        Section
                      </th>
                      <th className="border border-slate-300 dark:border-slate-700 px-2 py-1">
                        Code
                      </th>
                      <th className="border border-slate-300 dark:border-slate-700 px-2 py-1">
                        1
                      </th>
                      <th className="border border-slate-300 dark:border-slate-700 px-2 py-1">
                        2
                      </th>
                      <th className="border border-slate-300 dark:border-slate-700 px-2 py-1">
                        3
                      </th>
                      <th className="border border-slate-300 dark:border-slate-700 px-2 py-1">
                        ...
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-950">
                    <tr className="bg-green-50 dark:bg-green-950/30">
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        000000000
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        00
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        005
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        A
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        E
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        ABE
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center">
                        ...
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        100306520
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        02
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        005
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        A
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        E
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 font-mono">
                        B
                      </td>
                      <td className="border border-slate-300 dark:border-slate-700 px-2 py-1 text-center">
                        ...
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                <span className="text-green-600 dark:text-green-400">
                  Green row:
                </span>{" "}
                Solution row (ID = 000000000, Section = 00)
              </p>
            </div>
          </TabsContent>

          {/* Item Analysis File Tab */}
          <TabsContent value="analysis" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">What is Item Analysis?</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  The Item Analysis CSV file maps questions from different exam versions to a master question order.
                  This enables both cross-version comparison and comprehensive psychometric analysis.
                </p>
                <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded-md border-l-4 border-orange-500">
                  <p className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2">What you get:</p>
                  <ul className="list-disc list-inside text-sm text-orange-800 dark:text-orange-200 space-y-1">
                    <li><strong>Cross-Version Analysis:</strong> Compare performance across exam versions (always available)</li>
                    <li><strong>Comprehensive Psychometric Analysis:</strong> Item difficulty, discrimination, reliability (KR-20), distractor efficiency (requires QUESTIONS_MAP format with Permutation column)</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Supported Formats</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  The system auto-detects two CSV formats:
                </p>

                <div className="space-y-3">
                  <div className="bg-muted p-3 rounded-md border-l-4 border-blue-500">
                    <p className="font-semibold text-sm mb-2">Format 1: NEW Format (Recommended)</p>
                    <div className="font-mono text-xs mb-2">
                      Version | Version Q# | Master Q#
                    </div>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li><strong>Version:</strong> Exam version code (A, B, C, etc.)</li>
                      <li><strong>Version Q#:</strong> Question number in that version</li>
                      <li><strong>Master Q#:</strong> Corresponding master question number</li>
                    </ul>
                  </div>

                  <div className="bg-muted p-3 rounded-md border-l-4 border-purple-500">
                    <p className="font-semibold text-sm mb-2">Format 2: OLD Format</p>
                    <div className="font-mono text-xs mb-2">
                      code | order | orderInMaster
                    </div>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li><strong>code:</strong> Exam version code</li>
                      <li><strong>order:</strong> Question number in that version</li>
                      <li><strong>orderInMaster:</strong> Master question number</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Example (NEW Format)</h3>
                <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left pr-4">Version</th>
                        <th className="text-left pr-4">Version Q#</th>
                        <th className="text-left pr-4">Master Q#</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="pr-4">A</td><td className="pr-4">1</td><td className="pr-4">5</td></tr>
                      <tr><td className="pr-4">A</td><td className="pr-4">2</td><td className="pr-4">1</td></tr>
                      <tr><td className="pr-4">A</td><td className="pr-4">3</td><td className="pr-4">7</td></tr>
                      <tr><td className="pr-4">B</td><td className="pr-4">1</td><td className="pr-4">3</td></tr>
                      <tr><td className="pr-4">B</td><td className="pr-4">2</td><td className="pr-4">5</td></tr>
                      <tr><td className="pr-4">B</td><td className="pr-4">3</td><td className="pr-4">1</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Interpretation:</strong> In exam Version A, question 1 corresponds to master question 5,
                  question 2 corresponds to master question 1, and so on.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Manual Column Mapping</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  If your CSV uses different column names, the system will show "Unknown format - mapping required"
                  and prompt you to manually map your columns to the required fields.
                </p>
                <div className="bg-muted p-3 rounded-md border-l-4 border-yellow-500">
                  <p className="text-sm">
                    <strong>⚠ Note:</strong> Any CSV file is accepted. If auto-detection fails, simply select which
                    of your columns represent the version code, version question number, and master question number.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
