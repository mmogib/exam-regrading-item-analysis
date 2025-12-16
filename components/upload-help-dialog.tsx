"use client";

import {
  Download,
  FileSpreadsheet,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateExamTemplate } from "@/lib/template-generator";

export function UploadHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            Exam Data Upload Guide
          </DialogTitle>
          <DialogDescription>
            Choose how you want to upload your exam data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
