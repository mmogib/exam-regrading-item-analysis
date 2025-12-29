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

export function CrossVersionHelpDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cross-Version Analysis Help</DialogTitle>
          <DialogDescription>
            Learn how to prepare and upload your files for cross-version analysis
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="answers" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="answers" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Answers File
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-2">
              <FileText className="h-4 w-4" />
              Item Analysis
            </TabsTrigger>
            <TabsTrigger value="distractor" className="gap-2">
              <Calculator className="h-4 w-4" />
              Distractor Analysis
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
                <p className="text-sm text-muted-foreground">
                  The Item Analysis CSV file maps questions from different exam versions to a master question order.
                  This allows you to compare how students performed on the same conceptual question across different exam versions.
                </p>
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

          {/* Distractor Analysis Tab */}
          <TabsContent value="distractor" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">What is Distractor Analysis?</h3>
                <p className="text-sm text-muted-foreground">
                  Distractor analysis shows which answer choices students select, broken down by performance level.
                  It helps identify if weak students are attracted to specific wrong answers (distractors),
                  which can reveal confusing questions or misleading answer choices.
                </p>
              </div>

              <div className="bg-orange-50 dark:bg-orange-950/20 border-2 border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold text-lg text-orange-900 dark:text-orange-100">
                      Requirements for Distractor Analysis
                    </h3>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Distractor analysis requires the <strong>QUESTIONS_MAP format</strong> with a <strong>Permutation</strong> column.
                      This extended format includes how answer choices are scrambled across exam versions.
                    </p>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      If you upload the basic ItemAnalysis format (without Permutation), you'll see a warning
                      and distractor analysis will be skipped. All other features will still work normally.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">QUESTIONS_MAP Format (Extended)</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  The QUESTIONS_MAP format extends the basic ItemAnalysis format with additional columns:
                </p>

                <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto mb-3">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-300 dark:border-slate-700">
                        <th className="text-left pr-4 pb-2">Group</th>
                        <th className="text-left pr-4 pb-2">Master Q#</th>
                        <th className="text-left pr-4 pb-2">Version</th>
                        <th className="text-left pr-4 pb-2">Version Q#</th>
                        <th className="text-left pr-4 pb-2">Permutation</th>
                        <th className="text-left pr-4 pb-2">Correct</th>
                        <th className="text-left pr-4 pb-2">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="pr-4 py-1">1</td><td className="pr-4">11</td><td className="pr-4">1</td><td className="pr-4">1</td><td className="pr-4 text-blue-600 dark:text-blue-400 font-bold">CADEB</td><td className="pr-4">B</td><td className="pr-4">1</td></tr>
                      <tr><td className="pr-4 py-1">1</td><td className="pr-4">5</td><td className="pr-4">1</td><td className="pr-4">2</td><td className="pr-4 text-blue-600 dark:text-blue-400 font-bold">ABEDC</td><td className="pr-4">A</td><td className="pr-4">1</td></tr>
                      <tr><td className="pr-4 py-1">1</td><td className="pr-4">17</td><td className="pr-4">1</td><td className="pr-4">3</td><td className="pr-4 text-blue-600 dark:text-blue-400 font-bold">ACEBD</td><td className="pr-4">A</td><td className="pr-4">1</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>New columns explained:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>Permutation:</strong> Shows how answer choices A-E are scrambled in this version</li>
                    <li><strong>Correct:</strong> The correct answer for this question in this version</li>
                    <li><strong>Points:</strong> Points awarded for this question (usually 1)</li>
                    <li><strong>Group:</strong> Optional grouping identifier (can be same for all)</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Understanding Permutations</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  The <strong>Permutation</strong> column shows how answer choices in the exam version map to the master exam.
                  Each position in the permutation string represents a choice in the version's exam.
                </p>

                <div className="bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-3 text-blue-900 dark:text-blue-100">
                    Example: Permutation "CADEB"
                  </h4>

                  <div className="space-y-2 text-sm">
                    <p className="text-blue-800 dark:text-blue-200 mb-2">
                      This permutation means the answer choices in Version 1 map to the master as follows:
                    </p>

                    <div className="bg-white dark:bg-slate-900 rounded p-3 border border-blue-200 dark:border-blue-800 font-mono text-xs space-y-1">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="font-bold text-blue-700 dark:text-blue-300">Version Choice</div>
                        <div className="font-bold text-blue-700 dark:text-blue-300">→</div>
                        <div className="font-bold text-blue-700 dark:text-blue-300">Master Choice</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>A (position 0)</div>
                        <div>→</div>
                        <div>C (permutation[0])</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>B (position 1)</div>
                        <div>→</div>
                        <div>A (permutation[1])</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>C (position 2)</div>
                        <div>→</div>
                        <div>D (permutation[2])</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>D (position 3)</div>
                        <div>→</div>
                        <div>E (permutation[3])</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>E (position 4)</div>
                        <div>→</div>
                        <div>B (permutation[4])</div>
                      </div>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 mt-3">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        <strong>Real Example:</strong> If a student in Version 1 selected answer <strong>C</strong>,
                        they actually chose what corresponds to master option <strong>D</strong> (because C is at position 2, and permutation[2] = 'D').
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Interpreting Distractor Analysis Results</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  The results show how students at different performance levels answered each question:
                </p>

                <div className="space-y-3">
                  <div className="bg-muted p-3 rounded-md border-l-4 border-green-500">
                    <p className="font-semibold text-sm mb-1">Top 25% (T1)</p>
                    <p className="text-xs text-muted-foreground">
                      Highest-scoring students. Should mostly select correct answers.
                    </p>
                  </div>

                  <div className="bg-muted p-3 rounded-md border-l-4 border-blue-500">
                    <p className="font-semibold text-sm mb-1">Second 25% (T2)</p>
                    <p className="text-xs text-muted-foreground">
                      Above-average students.
                    </p>
                  </div>

                  <div className="bg-muted p-3 rounded-md border-l-4 border-yellow-500">
                    <p className="font-semibold text-sm mb-1">Third 25% (T3)</p>
                    <p className="text-xs text-muted-foreground">
                      Below-average students.
                    </p>
                  </div>

                  <div className="bg-muted p-3 rounded-md border-l-4 border-red-500">
                    <p className="font-semibold text-sm mb-1">Bottom 25% (T4)</p>
                    <p className="text-xs text-muted-foreground">
                      Lowest-scoring students. Often attracted to confusing distractors.
                    </p>
                  </div>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 mt-3">
                  <p className="text-sm text-yellow-900 dark:text-yellow-200">
                    <strong>💡 Educational Insight:</strong> If a wrong answer attracts many TOP 25% students,
                    it might be a legitimate alternative answer or the question may be ambiguous.
                    If a wrong answer attracts many BOTTOM 25% students but few top students,
                    it's working as an effective distractor.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Output Format</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  The distractor analysis displays results with:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
                  <li>Collapsible accordion showing one master question at a time</li>
                  <li>Correct answer marked with an asterisk (*)</li>
                  <li>Count and percentage for each choice</li>
                  <li>Breakdown by performance quartile</li>
                  <li>"Blank/Other" row for students who didn't answer or gave invalid responses</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
