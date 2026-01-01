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
   - **Download template button** for quick start
   - **Fuzzy column detection**: Accepts flexible column names (ID, Student ID, Code, Version, etc.)
   - **Manual column mapping** if auto-detection fails
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
   - **Format selection guide**: Collapsible help to choose the right format
   - **Download templates**: Three formats available
     - **Normal**: Basic question mapping (cross-version analysis only)
     - **Question Map**: With permutation data (full psychometric analysis)
     - **Options Matrix**: WIDE format with option-level tracking
   - Upload item analysis CSV file
   - CSV format auto-detection (OLD/NEW/WIDE/UNKNOWN)
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
     - **Help & Interpretation Guide**: Collapsible help section explaining all metrics
     - **Interactive tooltips**: Hover over metrics for quick definitions
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
  - accordion, alert, alert-dialog, button, card, checkbox, input, label, table, tooltip

### Wizard State Management

**Context Provider:** `contexts/wizard-context.tsx`

**State Structure:**
```typescript
interface WizardState {
  studentData: ExamRow[] | null;
  studentDataFileName: string | null;
  numQuestions: number;
  correctAnswersMap: CorrectAnswersMap | null;
  hasRegraded: boolean;
  itemAnalysisData: ItemAnalysisRow[] | null;
  itemAnalysisFileName: string | null;
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

### File Display Feature (December 2025)
**Shows uploaded filenames at each wizard step**

**Feature:**
- Blue info cards display loaded file names at top of steps
- Step 2: Shows student data filename
- Step 3: Shows student data filename
- Step 4: Shows both student data AND item analysis filenames
- Filenames stored in wizard state and persisted to localStorage

**Implementation:**
- Added `studentDataFileName` and `itemAnalysisFileName` to WizardState
- Updated `updateStudentData()` and `updateItemAnalysis()` to save filenames
- Info cards in Steps 2, 3, 4 with FileSpreadsheet/FileText icons
- Consistent blue alert styling across all steps

### Fuzzy Column Detection & Mapping for Student Data (December 2025)
**Flexible column name support with automatic detection and manual mapping**

**Problem solved:**
- Files with different column names (e.g., "Student ID" vs "ID", "Version" vs "Code")
- Question columns with various formats (1, 2, 3 vs Q1, Q2, Q3 vs Question 1, Question 2)
- Extra empty columns that should be filtered out

**Fuzzy Matching:**
- **ID column:** Matches "id", "student id", "studentid", "std id", "matric", etc.
- **Code column:** Matches "code", "version", "exam code", "form code", etc.
- **Question columns:** Matches numeric ("1", "2"), Q-prefix ("Q1", "Q2"), Question prefix ("Question 1"), Ques prefix ("Ques1")

**Question Validation:**
- Filters out empty columns (only keeps columns with valid answers A-E)
- Validates sequential numbering (1,2,3,...N with no gaps)
- Error if non-sequential: Shows clear message to fix file

**Manual Mapping UI:**
- Appears when auto-detection fails (missing ID or Code)
- User selects ID and Code columns from dropdowns
- Shows all detected columns
- Shows detected question count
- Yellow-bordered card with clear instructions

**Implementation:**
- `detectColumns()` - Fuzzy matching and validation
- `readExamDataFileWithDetection()` - Returns raw data + detection results
- `applyColumnMapping()` - Normalizes data with column mapping
- Updated Step 1 with mapping UI (similar to Step 3's code mapping)

### Section Column Removal & Solution Row Detection Update (December 2025)
**Removed Section column entirely and updated solution detection logic**

**Changes:**
- Removed `Section` field from `ExamRow` and `StudentResult` types
- Removed `SOLUTION_ID` and `SOLUTION_SECTION` constants
- Updated template generator (removed Section column)

**Solution Row Detection (Backwards Compatible):**
```typescript
isSolutionRow(row: ExamRow): boolean {
  const code = String(row.Code || '').trim();
  const id = String(row.ID || '').trim();

  // NEW format: Code = "0", "00", "000", etc.
  if (/^0+$/.test(code)) return true;

  // OLD format (backwards compatibility): ID = "000000000", "0", or empty
  if (id === '000000000' || id === '0' || id === '') return true;

  return false;
}
```

**Why both checks:**
- NEW files: Solution rows have Code="0" (or "00", "000")
- OLD files: Solution rows have ID="000000000" with Code="005", "006", etc.
- Supports both formats for seamless transition

**Updated:**
- `lib/excel-utils.ts` - isSolutionRow(), normalizeImportData(), getAllQuestionCols()
- `lib/template-generator.ts` - Template now uses Code="0" for solutions
- `types/exam.ts` - Removed Section from interfaces
- Fixed `classifyStudentsByQuartile()` to use new solution detection

### WIDE Format Support for Item Analysis (December 2025)
**Added support for wide/pivot format CSV files with option-level permutation data**

**New Format (WIDE):**
- One row per option per master question (not one row per question)
- Columns: `Q`, `Option`, `Master_Correct`, `version_X_Q`, `version_X_Opt`
- Example:
```csv
Q,Option,Master_Correct,version_1_Q,version_1_Opt,version_2_Q,version_2_Opt
1,A,YES,4,A,10,D
1,B,,4,B,10,C
```

**Auto-Detection:**
- Detects WIDE format alongside OLD and NEW formats
- Looks for: Q/Option/Master_Correct columns + version_X_Q/version_X_Opt pairs
- Priority: WIDE → NEW → OLD → UNKNOWN

**Version Number Validation:**
- Extracts version numbers from column names (version_1, version_2, etc.)
- Validates sequential: (1,2,3,4) ✅, (5,6,7,8) ✅, (1,3,5) ❌
- Clear error if non-sequential with example

**Permutation Building:**
- Handles variable options (2-5 per question)
- Missing options stay in position: If Q has only A,B, then C→C, D→D, E→E
- Example: Master A,B only
  - Version 1: A→A, B→B → permutation = "ABCDE"
  - Version 2: A→B, B→A → permutation = "BACDE"

**Correct Answer Detection:**
- Finds correct option where `Master_Correct = YES` (or Y, TRUE, 1)
- Maps to version-specific answer using permutation

**Implementation:**
- `parseWideFormat()` in `lib/excel-utils.ts` - Converts WIDE to ItemAnalysisRow[]
- Updated `detectCSVFormat()` to detect WIDE format
- Updated `CSVDetectionResult` type to include 'WIDE'
- Step 3 handles WIDE format parsing before processing
- Full integration with existing code mapping and validation

**Supported Formats (Auto-Detect):**
1. **OLD**: code, order, order in master
2. **NEW**: Version, Version Q#, Master Q#
3. **WIDE**: Q, Option, Master_Correct, version_X_Q, version_X_Opt ✨ NEW!

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

## January 2026 Updates

### WIDE Format Bug Fix (January 2026)
**Critical fix for permutation-to-correct-answer mapping logic**

**Bug discovered:**
- In `parseWideFormat()` function at `lib/excel-utils.ts:692-696`
- Used forward lookup `permutationMap[correctOption]` instead of reverse lookup
- Caused incorrect answer keys when options were rotated

**Example scenario:**
- Master correct = "B"
- permutationMap = { A: "B", B: "C", C: "A", D: "D", E: "E" }
- Bug: `permutationMap["B"]` returned "C" (WRONG)
- Fix: Find key where value="B", which is "A" (CORRECT)

**Fix implemented:**
```typescript
// BUGGY CODE (before):
let versionCorrect: string | undefined = undefined;
if (correctOption) {
  versionCorrect = permutationMap[correctOption]; // Forward lookup - WRONG
}

// FIXED CODE (after):
let versionCorrect: string | undefined = undefined;
if (correctOption) {
  versionCorrect = Object.keys(permutationMap).find(
    (key) => permutationMap[key] === correctOption  // Reverse lookup - CORRECT
  );
}
```

**Impact:** This bug only affected WIDE format files with rotated options. Now correctly generates answer keys for all option permutations.

### Favicon Implementation (January 2026)
**Professional browser icon for the application**

**Implementation:**
- Added complete favicon set to `/public/` directory
- Configured Next.js metadata in `app/layout.tsx`

**Files added:**
- `favicon.ico` (16KB) - Main favicon
- `favicon-16x16.png` (487 bytes) - Small icon
- `favicon-32x32.png` (954 bytes) - Medium icon
- `apple-touch-icon.png` (6.5KB) - Apple devices
- `android-chrome-192x192.png` (7.2KB) - Android small
- `android-chrome-512x512.png` (25KB) - Android large
- `site.webmanifest` (294 bytes) - Web manifest

**Metadata configuration:**
```typescript
export const metadata: Metadata = {
  title: "KFUPM Exam Grading Tool",
  description: "MCQ-Based Exam Re-grading and Item Analysis Tool - Department of Mathematics, KFUPM",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};
```

**Result:** Professional appearance in browser tabs, bookmarks, and home screen shortcuts.

### Dynamic Template Generation System (January 2026)
**Generates templates at runtime - zero maintenance burden**

**Problem solved:**
- Static template files become outdated when code changes
- Manual maintenance required to keep templates in sync

**Solution:**
- All templates generated dynamically from code
- Always match current codebase structure
- Zero maintenance - templates auto-update with code changes

**Templates generated:**
1. **Student Data Template** (`generateExamTemplate()`)
   - 4 exam versions (001, 002, 003, 004)
   - 20 sample questions with realistic answer patterns
   - Solution rows: ID="0", Code=actual version (e.g., "001")
   - Downloads as `exam-data-template.xlsx`

2. **Item Analysis - Normal Format** (`generateItemAnalysisNormalTemplate()`)
   - Basic question mapping only
   - Columns: Version, Version Q#, Master Q#
   - Downloads as `item-analysis-normal-template.csv`

3. **Item Analysis - Question Map** (`generateItemAnalysisWithPermutationTemplate()`)
   - With permutation data for full psychometric analysis
   - Columns: Version, Version Q#, Master Q#, Permutation, Correct
   - Downloads as `item-analysis-with-permutation-template.csv`

4. **Item Analysis - Options Matrix** (`generateItemAnalysisWideTemplate()`)
   - WIDE format with option-level tracking
   - Columns: Q, Option, Master_Correct, version_X_Q, version_X_Opt
   - Downloads as `item-analysis-wide-template.csv`

**Implementation:**
- `lib/template-generator.ts` - All template generation functions
- Download buttons in Steps 1 and 3
- Uses `config/downloads.json` for filenames

**Key insight - Solution row format:**
- CORRECT: `{ ID: '0', Code: '001', ... }` - ID identifies solution, Code is actual version
- INCORRECT: `{ ID: 'Solution-001', Code: '0', ... }` - This was the initial mistake

### Help & Interpretation Guide (January 2026)
**Step 4: Comprehensive help for psychometric analysis interpretation**

**Problem solved:**
- Faculty users need to understand complex psychometric metrics
- Metrics like KR-20, p_i, D_i, r_pb, DE are not self-explanatory

**Solution:**
- Collapsible help section (collapsed by default to avoid overwhelming UI)
- Comprehensive guide with three sections

**Guide sections:**
1. **Understanding the Metrics**
   - KR-20 Reliability: Test consistency measure (0-1 scale, ideal ≥0.80)
   - p_i (Difficulty): Proportion correct (ideal 0.30-0.90)
   - D_i (Discrimination): Difference between top/bottom quartiles (ideal ≥0.30)
   - r_pb (Point-Biserial): Item-total correlation (ideal ≥0.20)
   - DE (Distractor Efficiency): Non-functional distractor count (ideal 0)

2. **Decision Criteria Cards**
   - **KEEP**: All metrics in good range
   - **REVISE**: One metric problematic
   - **INVESTIGATE**: Multiple metrics problematic
   - Color-coded cards with specific criteria

3. **Example Interpretation**
   - Real example question with metrics
   - Detailed explanation of what each metric means for that question
   - Recommended action with justification

**Implementation:**
- Component: `components/wizard/results/comprehensive-results.tsx`
- Accordion component (shadcn/ui) for collapsible sections
- Blue-bordered card with help icon
- Clear, accessible language for non-statistics experts

**User feedback:** "I did test it. It is nice and clean."

### Interactive Tooltips (January 2026)
**Hover help on metric headers throughout Step 4**

**Feature:**
- Quick definitions on hover over metric headers
- Uses @radix-ui/react-tooltip for accessibility
- Consistent help icon (small question mark) next to each metric

**Tooltips added:**
- **KR-20 Reliability**: "Test consistency measure (0-1). ≥0.90 Excellent, ≥0.80 Good, ≥0.70 Acceptable"
- **p_i (Difficulty)**: "Proportion of students who answered correctly. 0.30-0.90 is ideal"
- **D_i (Discrimination)**: "Ability to distinguish strong/weak students. ≥0.30 is good"
- **r_pb (Point-Biserial)**: "Correlation with total score. ≥0.20 indicates good item quality"
- **DE (Distractor Efficiency)**: "Count of non-functional distractors. 0 is ideal"

**Implementation:**
- Added `components/ui/tooltip.tsx` (shadcn/ui component)
- Package: `@radix-ui/react-tooltip`
- Wrapped metric headers with `<Tooltip>` and `<TooltipTrigger>`
- `<TooltipContent>` contains concise definitions

**Result:** Users can quickly understand metrics without leaving the page or opening the full guide.

### Format Selection Guide (January 2026)
**Step 3: Interactive guide to help users choose the right item analysis format**

**Problem solved:**
- Users confused about which item analysis format to use
- Three different formats with different capabilities
- Need to understand trade-offs before uploading

**Solution:**
- Collapsible "Which Format Should I Use?" guide in Step 3
- Three numbered format cards with clear descriptions
- Links to Shuffler Tool for advanced formats

**Format cards:**
1. **Normal Format**
   - Use when: No option shuffling
   - Provides: Cross-version analysis only
   - Template download available

2. **Question Map** (formerly "With Permutation")
   - Use when: Options are shuffled
   - Provides: Full psychometric analysis + KR-20
   - Usually from Shuffler Tool
   - Template download available

3. **Options Matrix** (formerly "WIDE Format")
   - Use when: Detailed option position tracking needed
   - Provides: Same as Question Map (auto-generates permutation)
   - Usually from Shuffler Tool
   - Template download available

**External link:**
- Link to Shuffler Tool: `https://shuffler.mshahrani.website`
- Configurable via `config/downloads.json` (`externalLinks.shufflerTool`)

**Implementation:**
- Accordion component for collapsibility
- Blue-bordered card with help icon
- Clear formatting with emoji indicators
- Download template buttons for each format
- Quick decision helper at bottom

**User feedback:** Corrected naming from "With Permutation" → "Question Map" and "WIDE Format" → "Options Matrix"

### Naming Conventions (January 2026)
**Standardized terminology across the application**

**User-specified naming:**
- **"Question Map"** (not "With Permutation") - Item analysis format with permutation data
- **"Options Matrix"** (not "WIDE Format") - Item analysis format with option-level tracking

**Updated locations:**
- Step 3 format selection guide
- Download button labels
- Template generation functions
- README.md documentation

**Rationale:**
- "Question Map" more accurately describes the content (question mapping with permutation)
- "Options Matrix" clearer than "WIDE Format" for users

### Solution Row Format Update (January 2026)
**Clarified correct format for solution rows in student data**

**Correct format (NEW):**
- ID = "0" (identifies row as solution)
- Code = actual exam version (e.g., "001", "002", "003")
- One solution row per exam version

**Example:**
```typescript
{ ID: '0', Code: '001', 1: 'A', 2: 'B', ... }  // Solution for version 001
{ ID: '0', Code: '002', 1: 'C', 2: 'A', ... }  // Solution for version 002
```

**Backwards compatibility (OLD):**
- ID = "000000000" (9 zeros) or empty
- Code = actual exam version
- Still supported for old files

**Detection logic:**
```typescript
isSolutionRow(row: ExamRow): boolean {
  const code = String(row.Code || '').trim();
  const id = String(row.ID || '').trim();

  // NEW format: ID = "0", "00", "000", etc.
  if (/^0+$/.test(id)) return true;

  // OLD format: ID = "000000000", "0", or empty
  if (id === '000000000' || id === '0' || id === '') return true;

  return false;
}
```

**Why clarification needed:**
- Initial template had incorrect format: `{ ID: 'Solution-001', Code: '0' }`
- User corrected: "ID for solution must be 0 remember, CODE must be a real code"
- Updated all templates and documentation

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

### Download Filenames and External Links
All configurable settings are in `config/downloads.json` with type-safe definitions in `config/downloads.ts`.

**Configurable settings:**
1. **Download filenames** - All Excel/CSV export file names
   - Cross-version analysis outputs
   - Re-grading outputs
   - Template filenames
   - Comprehensive analysis output

2. **External links** - URLs to external resources
   - Shuffler Tool URL (used in Step 3 format selection guide)

**Configuration structure:**
```json
{
  "crossVersionAnalysis": {
    "masterQuestionStats": "master-question-statistics.xlsx",
    "examVersionStats": "exam-version-statistics.xlsx",
    "distractorAnalysis": "distractor-analysis.xlsx"
  },
  "reGrading": {
    "examDataRevised": "exam-data-regraded.xlsx",
    "studentResults": "student-grades.xlsx"
  },
  "templates": {
    "examDataTemplate": "exam-data-template.xlsx",
    "itemAnalysisNormal": "item-analysis-normal-template.csv",
    "itemAnalysisWithPermutation": "item-analysis-with-permutation-template.csv",
    "itemAnalysisWide": "item-analysis-wide-template.csv"
  },
  "externalLinks": {
    "shufflerTool": "https://shuffler.mshahrani.website"
  }
}
```

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
- Undo/redo for re-grading changes
- Import/export wizard state (JSON)
- Progressive Web App (PWA) support
- Offline mode
- Print-friendly result views
