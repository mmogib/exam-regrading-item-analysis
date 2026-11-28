'use client';

/**
 * Step 1 "Download Template" dialog: generate a realistic grading-center answer
 * file with simulated students, optionally from a Shuffler Question Map or
 * Options Matrix, plus matching Step 3 files and expected results.
 * The work is done by lib/grading-center.ts; this component only collects the
 * settings and offers the files. It never changes the data loaded in the wizard.
 */
import { useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileDropZone } from '@/components/shared/file-drop-zone';
import {
  buildGradingCenterSnapshot,
  DEFAULT_GRADING_CENTER_SETTINGS,
  GRADING_CENTER_COLUMNS,
  MAX_STUDENTS,
  MAX_VERSIONS,
  randomSeed,
  readShufflerFile,
  type GradingCenterSettings,
  type GradingCenterSnapshot,
  type ShufflerExam,
} from '@/lib/grading-center';
import { downloadFile, generateExamTemplate } from '@/lib/template-generator';

interface LoadedSource {
  fileName: string;
  bytes: Uint8Array;
  exam: ShufflerExam;
}

const percent = (rate: number) => `${+(rate * 100).toFixed(3)}%`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function TemplateDialog() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<GradingCenterSettings>(DEFAULT_GRADING_CENTER_SETTINGS);
  const [seedChosen, setSeedChosen] = useState(false);
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GradingCenterSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reading, setReading] = useState<string | null>(null); // name of the file being read
  // Any newer input makes an older file read or generation result obsolete
  const readToken = useRef(0);
  const generationToken = useRef(0);
  const id = useId();

  /** Withdraw the current downloads and drop any generation still queued. */
  const invalidate = () => {
    generationToken.current++;
    setSnapshot(null);
    setError(null);
    setGenerating(false);
  };
  const update = (patch: Partial<GradingCenterSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    invalidate();
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // A fresh seed the first time; it is shown, so a file can be regenerated
      if (!seedChosen) {
        setSettings((s) => ({ ...s, seed: randomSeed() }));
        setSeedChosen(true);
      }
    } else {
      // Closing cancels unfinished work; a finished snapshot stays for the next opening
      readToken.current++;
      generationToken.current++;
      setReading(null);
      setGenerating(false);
    }
  };

  const onShufflerFile = async (file: File) => {
    const token = ++readToken.current;
    invalidate();
    setSourceError(null);
    setReading(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const exam = readShufflerFile(new TextDecoder('utf-8').decode(bytes));
      if (token !== readToken.current) return;
      setSource({ fileName: file.name, bytes, exam });
      invalidate(); // nothing generated before this file was ready belongs to it
    } catch (e) {
      if (token !== readToken.current) return;
      setSource(null);
      setSourceError(message(e));
      invalidate();
    } finally {
      if (token === readToken.current) setReading(null);
    }
  };

  const clearSource = () => {
    readToken.current++;
    invalidate();
    setReading(null);
    setSource(null);
    setSourceError(null);
  };

  const generate = () => {
    const token = ++generationToken.current;
    setGenerating(true);
    setError(null);
    setSnapshot(null);
    // Let "Generating..." paint before the synchronous work
    setTimeout(() => {
      if (token !== generationToken.current) return;
      try {
        const result = buildGradingCenterSnapshot(
          settings,
          source ? { fileName: source.fileName, bytes: source.bytes } : undefined
        );
        if (token === generationToken.current) setSnapshot(result);
      } catch (e) {
        if (token === generationToken.current) setError(message(e));
      } finally {
        if (token === generationToken.current) setGenerating(false);
      }
    }, 0);
  };

  const numberField = (
    key: 'students' | 'questions' | 'versions' | 'sections' | 'seed',
    label: string,
    hint: string,
    opts: { min: number; max: number; disabled?: boolean; value?: number }
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        type="number"
        inputMode="numeric"
        min={opts.min}
        max={opts.max}
        step={1}
        disabled={opts.disabled}
        value={Number.isNaN(opts.value ?? settings[key]) ? '' : (opts.value ?? settings[key])}
        onChange={(e) => update({ [key]: e.target.valueAsNumber } as Partial<GradingCenterSettings>)}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const checkbox = (key: 'plants' | 'plantMiskey' | 'scanErrors', label: string, hint: string) => (
    <div className="flex items-start gap-2">
      <Checkbox
        id={`${id}-${key}`}
        checked={settings[key]}
        onCheckedChange={(v) => update({ [key]: v === true } as Partial<GradingCenterSettings>)}
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );

  const rates = settings.scanErrorRates;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Download a template</DialogTitle>
          <DialogDescription>
            Generate an answer file (.xlsx) in the grading-center layout (form, ID, Section, Code, 1–{GRADING_CENTER_COLUMNS})
            with simulated students, plus the matching Step 3 files and the results the app should compute.
            Synthetic data only. This does not change the data loaded in the wizard.
          </DialogDescription>
        </DialogHeader>

        {/* Source */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Exam (optional)</h4>
          {source ? (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Using {source.fileName}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {source.exam.kind === 'question-map' ? 'Question Map' : 'Options Matrix'}: {source.exam.questions} questions,{' '}
                  {source.exam.versions.length} versions ({source.exam.versions.join(', ')}).
                </span>
                <Button variant="outline" size="sm" onClick={clearSource}>
                  Remove
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <FileDropZone
              compact
              accept=".csv"
              maxSizeMB={5}
              title="Shuffler Question Map or Options Matrix"
              description="Optional: start from your exam's Shuffler file"
              onFileSelect={onShufflerFile}
            />
          )}
          {reading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading {reading}...
            </p>
          )}
          {sourceError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>This file cannot be used</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">{sourceError}</AlertDescription>
            </Alert>
          )}
        </section>

        {/* Settings */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Details</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {numberField('students', 'Students', `1 to ${MAX_STUDENTS}`, { min: 1, max: MAX_STUDENTS })}
            {numberField('questions', 'Questions', source ? 'From your file' : `2 to ${GRADING_CENTER_COLUMNS}`, {
              min: 2,
              max: GRADING_CENTER_COLUMNS,
              disabled: !!source,
              value: source?.exam.questions,
            })}
            {numberField('versions', 'Versions', source ? 'From your file' : `1 to ${MAX_VERSIONS}`, {
              min: 1,
              max: MAX_VERSIONS,
              disabled: !!source,
              value: source?.exam.versions.length,
            })}
            {numberField('sections', 'Sections', '1 to 99 (01, 02, ...)', { min: 1, max: 99 })}
            <div className="space-y-1">
              <Label htmlFor={`${id}-seed`}>Seed</Label>
              <div className="flex gap-2">
                <Input
                  id={`${id}-seed`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={Number.isNaN(settings.seed) ? '' : settings.seed}
                  onChange={(e) => update({ seed: e.target.valueAsNumber })}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="New seed"
                  title="New seed"
                  onClick={() => update({ seed: randomSeed() })}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Same seed, same file</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-blank`}>Blank answers (%)</Label>
              <Input
                id={`${id}-blank`}
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={Number.isNaN(settings.blankRate) ? '' : +(settings.blankRate * 100).toFixed(4)}
                onChange={(e) => update({ blankRate: e.target.valueAsNumber / 100 })}
              />
              <p className="text-xs text-muted-foreground">Per answer</p>
            </div>
          </div>

          <div className="space-y-3">
            {checkbox(
              'plants',
              'Planted problem questions',
              source
                ? 'Three questions for the item analysis to flag: too easy, dead distractors, low discrimination.'
                : 'Five questions for the item analysis to flag: wrong key, too easy, dead distractors, two accepted answers, low discrimination.'
            )}
            {source &&
              checkbox(
                'plantMiskey',
                'Plant a wrong key',
                'The student file gets one wrong key. Step 3 rejects it until you correct that question in Step 2.'
              )}
            {checkbox(
              'scanErrors',
              'Grading-center scan errors',
              `Multiple marks "X" (${percent(rates.multipleMark)} of answered questions; imported as blank), an unreadable ID digit "@" (${percent(
                rates.maskedId
              )} of students), an unreadable section "@@" (${percent(rates.unreadableSection)} of students).`
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={generate} disabled={generating || reading !== null} className="gap-2">
            {(generating || reading !== null) && <Loader2 className="h-4 w-4 animate-spin" />}
            {generating ? 'Generating...' : reading !== null ? 'Reading file...' : 'Generate files'}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Cannot generate</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
          </Alert>
        )}

        {/* Downloads */}
        {snapshot && (
          <section className="space-y-3" aria-live="polite">
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <AlertTitle>
                {snapshot.students} students, {snapshot.questions} questions, versions {snapshot.versions.join(', ')}
              </AlertTitle>
              <AlertDescription>
                Blank answers: {snapshot.realized.blanks}. Multiple marks: {snapshot.realized.multipleMarks}. Unreadable IDs:{' '}
                {snapshot.realized.maskedIds}. Unreadable sections: {snapshot.realized.unreadableSections}.
              </AlertDescription>
            </Alert>
            <ul className="space-y-2">
              {snapshot.files.map((f) => (
                <li key={f.kind} className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                    <p className="truncate text-xs text-muted-foreground" title={f.name}>
                      {f.name}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-2"
                    onClick={() => downloadFile(f.content, f.mime, f.name)}
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="border-t pt-3 text-xs text-muted-foreground">
          Need a small fixed example instead?{' '}
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={generateExamTemplate}>
            Download the fixed example
          </Button>{' '}
          (20 students; it matches the fixed files in Step 3).
        </div>
      </DialogContent>
    </Dialog>
  );
}
