# CLAUDE.MD

This file documents the exam grading application codebase.

## Project Overview

This is an exam grading application built with Next.js, TypeScript, and React for KFUPM Mathematics Department.

## Getting Started

See `README.md` for installation and setup instructions.

## Documentation File Structure

**Root directory** (tracked in git):
- `CLAUDE.MD` - Internal/developer documentation (this file)
- `README.MD` - User-facing documentation

**`/references/` folder** (untracked, gitignored):
- All other MD files: analysis, plans, reports, summaries, etc.
- Examples: `UNUSED_FILES_REPORT.md`, `DOCUMENTATION_PLAN.md`, `DistractorAnalysis.MD`
- **Important**: When creating new documentation files, place them in `/references/` unless they are meant to be `CLAUDE.MD` or `README.MD`

## Architecture

The application is a client-side only Next.js app with static export capability. All processing happens in the browser using SheetJS.

### Application Structure

**Four-step wizard workflow:**

1. **Step 1: Upload Student Data** (`components/wizard/step1-upload-student-data.tsx`)
   - Upload exam answer sheet (.xls/.xlsx/.csv/.txt)
   - Auto-detect number of questions using `guessNumQuestions()`
   - Display summary: students, questions, exam versions
   - Validates and stores data in wizard state

2. **Step 2: Re-grading** (`components/wizard/step2-regrading.tsx`) - Optional
   - Review and modify correct answers for each version
   - Visual warning (yellow highlight) for questions with no correct answer
   - Configure points per question
   - Re-grade and download revised data
   - Two exit paths: "Finish" (complete) or "Continue to Item Analysis"

3. **Step 3: Item Analysis Upload** (`components/wizard/step3-upload-item-analysis.tsx`) - Optional
   - Upload item analysis CSV file
   - CSV format auto-detection (OLD/NEW/UNKNOWN)
   - Manual column mapping UI for unknown formats
   - **Code mismatch detection and mapping**:
     - Compares codes from Step 1 with item analysis codes
     - Shows mapping UI if codes don't match
     - Critical warning about incorrect mapping
     - Validates correct answers AFTER code mapping
   - Detects permutation data availability

4. **Step 4: Results** (`components/wizard/step4-analysis-results.tsx`)
   - Two compute buttons (separate analysis types)
   - **Cross-Version Analysis** (always available):
     - Master question statistics
     - Exam version statistics
     - Downloads: `master-question-statistics.xlsx`, `exam-version-statistics.xlsx`
   - **Comprehensive Psychometric Analysis** (requires permutation):
     - Full UI display with sortable tables and collapsible accordions
     - Test summary, item statistics, detailed option analysis
     - Download: `item-analysis-comprehensive.xlsx`

**Main Components:**
- `components/wizard/exam-wizard.tsx` - Main wizard container with navigation
- `components/wizard/stepper.tsx` - Progress indicator (visual step tracker)
- `components/wizard/results/cross-version-results.tsx` - Cross-version analysis display
- `components/wizard/results/comprehensive-results.tsx` - Comprehensive analysis display

**Shared Components:**
- `components/shared/file-drop-zone.tsx` - Drag-drop file upload component
  - Clean dashed border UI
  - Centered upload icon
  - File type validation
  - Size limit checking
  - Used across all upload steps

**UI Components:**
- `components/ui/` - shadcn/ui component library
  - accordion, alert, alert-dialog, button, card, checkbox, input, label, table

### Wizard State Management

**Context Provider:** `contexts/wizard-context.tsx`

**State Structure:**
```typescript
interface WizardState {
  studentData: ExamRow[] | null;
  numQuestions: number;
  correctAnswersMap: CorrectAnswersMap | null;
  hasRegraded: boolean;
  itemAnalysisData: ItemAnalysisRow[] | null;
  hasPermutation: boolean;
  currentStep: number;
  completedSteps: number[];
}
```

**localStorage Persistence:**
- Storage key: `kfupm_exam_wizard_v1`
- Version control for breaking changes
- Auto-saves on state updates
- Restores state on page refresh
- Cleared on "Start Over"

**Navigation:**
- Back: Return to previous step (maintains state)
- Next: Advance to next step (if current step complete)
- Skip: Available on Steps 2 & 3 (optional steps)
- Finish: Complete workflow (from Step 2 if skipping item analysis)
- Start Over: Reset all data with confirmation dialog

## Development

See `README.md` for full development guidelines.

## Recent Features (2025)

### Wizard Implementation (December 2025)
**Major architectural change from tab-based UI to wizard workflow**

**What changed:**
- Replaced 2-tab UI with 4-step wizard
- Added state management with React Context
- Added localStorage persistence with versioning
- Improved validation timing (code mapping before answer validation)
- Enhanced UX with progress tracking and step completion

**Deleted components** (old tab-based UI):
- `components/item-analysis.tsx` - Old Item Analysis tab
- `components/re-grading.tsx` - Old Re-grading tab
- `components/shared/analysis-data-uploader.tsx` - Old file uploader
- `components/item-analysis-help-dialog.tsx` - Help dialog
- `components/upload-help-dialog.tsx` - Help dialog
- `components/ui/tabs.tsx` - Tab component
- `components/ui/dialog.tsx` - Dialog component

**Implementation:**
- Wizard container: `components/wizard/exam-wizard.tsx`
- State management: `contexts/wizard-context.tsx`
- 4 step components + 2 result display components
- Navigation logic with Back/Next/Skip/Finish buttons

### Code Mapping Validation (December 2025)
**Critical feature for Step 3 (Item Analysis Upload)**

**Problem solved:**
- Item analysis CSV codes may not match student data codes
- Example: Student data has "005", "006", "007" but CSV has "5", "6", "7"

**Implementation:**
- `checkCodeMismatch()` function in Step 3
- Normalizes codes (trim whitespace)
- Sorts codes (numeric first, then alphabetic)
- Compares sorted lists
- Shows mapping UI if mismatch detected

**UI Components:**
- Red-bordered card with critical warning
- Mapping table with dropdown selectors
- Student count display per code
- "Accept Mapping & Continue" button
- "Cancel & Re-upload Files" button

**Validation timing:**
1. Check code mismatch FIRST
2. If mismatch → Show mapping UI → Wait for user
3. User accepts → Apply mapping → Validate correct answers
4. If match → Validate immediately
5. Validation uses mapped codes to find correct solution rows

**Key insight:** Multi-answer validation works correctly
- Solution row can have "ACDE" (multiple correct answers)
- Item analysis says correct is "A"
- Validation: `"ACDE".includes("A")` → ✅ Pass

### Visual Warnings for Missing Answers (December 2025)
**Step 2: Re-grading table enhancement**

**Feature:**
- Questions with NO correct answer selected are highlighted yellow
- Yellow background + yellow border
- Visible warning in "Correct Answers Summary" table
- Alert box explaining the highlighting

**Implementation:**
```typescript
const hasNoAnswer = answers.length === 0;
className={`p-2 ${hasNoAnswer ? 'bg-yellow-100 border-2 border-yellow-400' : ''}`}
```

**Purpose:** Prevent accidental submission of incomplete answer keys

### Improved "Start Over" Dialog (December 2025)
**Replaced browser confirm() with custom AlertDialog**

**Features:**
- Professional modal dialog (shadcn/ui AlertDialog)
- Red warning icon
- Clear title: "Start Over?"
- Detailed description of what will be cleared
- Bold warning: "This action cannot be undone"
- Two buttons: "Cancel" and "Yes, Start Over"
- Smooth animations

**Implementation:**
- Component: `components/ui/alert-dialog.tsx` (new)
- Package: `@radix-ui/react-alert-dialog`
- State: `showResetDialog` boolean
- Handler: `confirmStartOver()` function

### Comprehensive Analysis UI Display (December 2025)
**Step 4: Full psychometric analysis visualization**

**Components restored:**
- Test Summary card (KR-20, mean score, difficulty, discrimination)
- Decision Criteria Legend (explains KEEP/REVISE/INVESTIGATE)
- Item Statistics Overview (sortable table)
- Detailed Option Analysis (accordion per question)

**Features:**
- Color-coded metrics (red/yellow for problematic values)
- Sortable columns (click headers)
- Decision badges (KEEP/REVISE/INVESTIGATE)
- Quartile breakdown (T1-T4)
- Functional/non-functional distractor labels
- Collapsible per-question details

**Implementation:**
- Component: `components/wizard/results/comprehensive-results.tsx`
- Sorting state management
- Color coding helpers (getDecisionColor, getDecisionIcon)
- Accordion UI for option-level details

### Answer Choice Layout Fix (December 2025)
**Step 2: Re-grading table column layout**

**Problem:** Answer choices (A, B, C, D, E) wrapped horizontally in narrow columns (Q10+)

**Solution:** Changed from horizontal flex to vertical column layout
```typescript
// Before: flex gap-1 justify-center flex-wrap
// After:  flex flex-col gap-1 items-start
```

**Result:** All questions display consistently with vertical checkbox stacking

### Position Mapping
- Displays which question number maps to each exam version
- Shown in UI tables and Excel exports
- Implementation: `lib/excel-utils.ts` (computeAverageResults), `types/exam.ts` (AverageResult)
- UI: Cross-version results tables

### Alphanumeric Code Support
- Handles both numeric (1, 002) and alphanumeric (V1, A, Version-A) codes
- Implementation: `lib/excel-utils.ts` (normalizeItemAnalysis, computeAverageResults, computeCodeAverages)
- Type changes: `types/exam.ts` (ItemAnalysisRow.code, CodeAverageResult.Code now string | number)

### File Re-upload
- Users can modify and re-upload same file without page refresh
- Input cleared after upload
- Implementation: FileDropZone component with key-based reset

### Configurable Download Filenames
- All download names defined in `config/downloads.json`
- Type-safe via `config/downloads.ts`
- Zero runtime overhead (bundled at build time)
- Used across: wizard result components, `lib/excel-utils.ts`

## Key Business Logic

### Core Functions (`lib/excel-utils.ts`)

**File Reading:**
- `readExamDataFile()` - Parse Excel/CSV student data
- `readCSVFileWithDetection()` - Auto-detect CSV format
- `parseCSVWithMapping()` - Manual column mapping

**Data Processing:**
- `getAllQuestionCols()` - Extract question column names
- `guessNumQuestions()` - Smart detection (examines solution rows)
- `getSolutionCodes()` - Extract exam version codes
- `buildCorrectAnswersMap()` - Build answer key map
- `normalizeItemAnalysis()` - Parse item analysis CSV

**Validation:**
- `validateCorrectAnswers()` - Multi-answer support (e.g., "ACDE" accepts A, C, D, or E)
- `isSolutionRow()` - Check if row is solution (ID=000000000, Section=00)

**Analysis:**
- `computeResults()` - Calculate student scores
- `computeAverageResults()` - Master question statistics
- `computeCodeAverages()` - Version-level statistics
- `computeComprehensiveItemAnalysis()` - Full psychometric analysis
  - Item difficulty, discrimination, point-biserial
  - KR-20 reliability
  - Distractor efficiency
  - Decision recommendations
- `classifyStudentsByQuartile()` - T1/T2/T3/T4 ranking

**Export:**
- `exportToExcel()` - Generic Excel export
- `reviseSolutionRows()` - Update solution rows with new answers
- `exportComprehensiveAnalysisToExcel()` - Full psychometric report

### Type Definitions (`types/exam.ts`)

**Core Types:**
- `ExamRow` - Student answer row
- `StudentResult` - Grading result
- `ItemAnalysisRow` - Item analysis CSV row
- `CorrectAnswersMap` - Answer key structure

**Analysis Results:**
- `AverageResult` - Master question statistics (with positions)
- `CodeAverageResult` - Version statistics
- `ComprehensiveItemAnalysisResult` - Full psychometric analysis
- `ItemStatistics` - Item-level metrics
- `OptionStatistics` - Option-level metrics
- `DistractorAnalysisResult` - Distractor analysis (legacy, kept for compatibility)

**Wizard State:**
- `WizardState` - Complete wizard state structure

## Configuration

### Download Filenames
Download filenames are configurable via `config/downloads.json`.
Edit this file to customize output file names for all downloads.

Type definitions are in `config/downloads.ts` for type safety.

**How to change:**
1. Edit `config/downloads.json`
2. Run `npm run build`
3. Deploy

No code changes needed!

## Code Flow

### Wizard Navigation Flow
```
Step 1 (Upload Data) [Required]
    ↓ [Next]
Step 2 (Re-grade) [Optional]
    ↓ [Finish] → Success → Reset
    ↓ [Continue to Item Analysis]
Step 3 (Item Analysis Upload) [Optional]
    ↓ [Next]
Step 4 (Results)
    → Compute Cross-Version Analysis
    → Compute Comprehensive Analysis (if permutation exists)
    → Download reports
```

### Code Mapping Flow (Step 3)
```
Upload CSV
    ↓
Detect format (OLD/NEW/UNKNOWN)
    ↓ [If UNKNOWN]
Manual column mapping UI
    ↓
Parse data
    ↓
Check code mismatch
    ↓ [If mismatch]
Code mapping UI
    ↓
User selects mapping
    ↓
Apply mapping
    ↓
Validate correct answers (with mapped codes)
    ↓
Complete step
```

### Validation Timing
**CRITICAL ORDER:**
1. Check code mismatch FIRST
2. If codes match → Validate correct answers immediately
3. If codes don't match → Show mapping UI → Wait for user
4. After user maps → Apply mapping → THEN validate correct answers

**Why this order matters:**
- Validation needs to find solution rows by code
- If codes don't match, validation will fail (can't find solution rows)
- Must map codes BEFORE validating

## Testing Checklist

**End-to-End Workflows:**
- [ ] Upload student data → Re-grade → Finish
- [ ] Upload student data → Re-grade → Item Analysis → Results
- [ ] Upload student data → Skip re-grade → Item Analysis → Results
- [ ] Upload student data → Start Over (confirm dialog)

**Code Mapping:**
- [ ] Upload with matching codes → No mapping UI shown
- [ ] Upload with mismatched codes → Mapping UI shown
- [ ] Accept mapping → Validation passes
- [ ] Cancel mapping → Error shown

**localStorage:**
- [ ] Upload data → Refresh page → State restored
- [ ] Complete wizard → Refresh → State restored
- [ ] Start Over → localStorage cleared

**Visual Warnings:**
- [ ] Re-grading table: Empty answer → Yellow highlight
- [ ] Item analysis: Missing permutation → Warning shown

## Known Limitations

- Client-side processing only (no server-side validation)
- Large files (>1000 students) may be slow
- Browser localStorage size limits (~5-10 MB)
- No support for non-MCQ question types
- Assumes 5 answer choices (A-E)

## Future Enhancements

**Potential features to consider:**
- Template download buttons in wizard steps (re-use `lib/template-generator.ts`)
- Help tooltips or info buttons per step
- Undo/redo for re-grading changes
- Import/export wizard state (JSON)
- Progressive Web App (PWA) support
- Offline mode
- Print-friendly result views
