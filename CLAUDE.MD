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
- `references/channels/` holds the correspondence with an external reviewer (Codex), relayed by the user; its `README.md` has the protocol and an index. Decisions are recorded in the topic notes, not in the channel.
- **Workflow rule (user):** before implementing any fix or feature, write the plan into its topic note and send it to Codex as the next channel message. Implementation waits until the reply is processed. Do not ask "shall I go ahead?" before that step.

## Current State (as of 2026-11-28)

**Release**
- **Live:** v1.8.1 at https://regrading.netlify.app (Netlify site `regrading`). The version is shown in the page footer.
- **Browser check:** the user checked the live v1.8.0 site on 2026-11-28; all good.
- **Tags:** `v1.7.0`, `v1.7.1`, `v1.8.0`, `v1.8.1` (annotated, pushed).
- **Next:** the template dialog (1.9.0). Its design was reviewed in channel 005 and its implementation is under review in 007; the work is held in a git stash until then. See `references/TEMPLATE_DIALOG_FEATURE.md`.
- **Branches:** `new-feat` is the single development branch and `main` is the release branch. Releases fast-forward `main` to `new-feat`, so there are no merge commits.

**Release procedure**
1. Run all gates on `new-feat`: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, and `npm audit`, which must report 0.
2. Bump with `npm version X.Y.Z --no-git-tag-version`; move the CHANGELOG entries into a version section; commit as `X.Y.Z`.
3. Push `new-feat`, then `git push origin new-feat:main` (fast-forward only).
4. Wait until the live page contains `X.Y.Z` (Netlify runs lint, tests and build, about a minute).
5. Run `git tag -a vX.Y.Z` and push the tag.

**Tooling**
- Node 26 LTS (`.nvmrc`; `NODE_VERSION` in `netlify.toml`).
- Tests: Vitest with jsdom.
- Dummy data: `npm run gen:dummy`; see README.

**Open issues** (details under "November 2026 Updates → Known Issues")
- P2: fixed in 1.8.1 (channels 004 and 006).
- P3: WIDE detection depends on the first row. It has an `it.fails` marker test.
- P5: custom Shuffler version names in Options Matrix headers are not recognised.
- P6–P11: older issues found in the P2 review (channel 004). They are not part of 1.8.1. P11 (a stale item-analysis file after a new Step 1 upload) is next.
- P12 (low): Step 3 reads numeric version codes as numbers, so padded codes always need the code-mapping screen.
- Minor wording issues.

**Local-only data (gitignored)**
- `sample_files/`: real exam data, plus `shuffler_latest/`, a Shuffler v1.9.0 export including the `.tex`, and `__baseline__/`, the regression baseline for `tests/samples.local.test.ts`.
- `dummy_data/`: generated datasets.

**Topic notes in `references/`**
- `UPGRADE_PLAN.md`: the v1.7.0 upgrade.
- `ISSUE_P1_WIDE_PERMUTATION.md`: closed, not a bug.
- `DUMMY_DATA_GENERATOR.md`.
- `SESSION_HANDOFF_2026-11-27.md`: summary and next steps.

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

- **Stack:** Next.js 16 (Turbopack build, `output: "export"`), React 19, TypeScript 5.9, Tailwind 3, SheetJS 0.20.3 from `cdn.sheetjs.com` (not the npm registry, which stopped at a vulnerable 0.18.5).
- **Node:** 26 LTS, pinned in `.nvmrc` and in `netlify.toml` (`NODE_VERSION`).
- **Commands:**
  - `npm test`: Vitest
  - `npm run lint`: `eslint .`, flat config in `eslint.config.mjs`; `next lint` no longer exists
  - `npm run build`: static export to `out/`
- **Netlify:** runs `npm run lint && npm test && npm run build`.
- **Tests:** in `tests/`, using synthetic fixtures with hand-checked expected values. `tests/samples.local.test.ts` runs only when the gitignored `sample_files/` exists, and compares against `sample_files/__baseline__/`.
- **Browser floor:** Chrome/Edge/Firefox 111+, Safari 16.4+.

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

> **Superseded in v1.8.0.** The four templates now come from one generated dataset (`TEMPLATE_PRESET` in `lib/dummy-data.ts`; wrappers in `lib/template-generator.ts`). Each has 20 questions × 4 versions × 5 students per version, and they agree with each other; the old hand-written Options Matrix template did not. The function names and download filenames are unchanged. See "Dummy Data Generator" below.

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

## November 2026 Updates

### Dependency & Security Upgrade (v1.7.0)

**Upgrades:**
- Next.js 14.2.15 → 16.4.6
- React 18 → 19
- ESLint 8 → 9 (flat config)
- SheetJS 0.18.5 (npm) → 0.20.3 (official CDN)
- Node 26 pinned

`npm audit` went from 17 vulnerabilities to 0.

**Commit sequence on `new-feat`:**
1. Test safety net (`8a7ae35`)
2. Framework (`dd43cc1`)
3. Lint repairs (`1557697`)
4. SheetJS (`23894dc`)
5. Docs and version

**Behavior:** unchanged. Unit tests and the local sample comparison were identical before and after each dependency commit.

**Lint notes:**
- `contexts/wizard-context.tsx` restores saved state in a post-mount effect, by design: the static prerender has no `localStorage`. Its `react-hooks/set-state-in-effect` exception is commented.
- `components/wizard/step2-regrading.tsx` has the same kind of commented exception for re-initialising the answer key.

### Known Issues (status as of v1.8.0)

All of these predate the upgrade and were found while writing tests or reviewing with Codex.

**P1: resolved, not a bug.** The current WIDE parser is correct for current Shuffler output.
- Checked against a full Shuffler v1.9.0 export (exam `.tex`, Question Map and Options Matrix): both CSVs match the exam text in 80/80 positions, permutations and correct answers.
- The Shuffler documents `Option` as the original letter and `[Version]_Opt` as the letter it became. `parseWideFormat()` reads it that way, and the January reverse lookup is correct.
- Only an older sample export (`OPTIONS_MATRIX_Math 201…`) used the opposite direction. Old files are out of scope; their Question Map works.

**P2 (medium): fixed in 1.8.1.** Comprehensive item statistics used to be computed per *version position*.
- **The bug:** `p_i`, `D_i` and `r_pb` were computed per version position but labelled as master questions, while `DE` and the option statistics were per master question. With shuffled question order the rows mixed questions, so the decisions and KR-20 were wrong. KR-20 could be off in either direction.
- **The fix:** `projectToMasterOrder()` in `lib/excel-utils.ts` puts every answer in master order before the analysis. It works on copies and keeps the row order, the version letters and the option permutations.
- **Checks first:** for each version that has students, it refuses to compute, with a clear error, when:
  - the map is not one-to-one;
  - a mapped question lacks a permutation or a single correct letter (multi-letter `Correct` metadata is rejected; multiple accepted answers belong in the solution row);
  - versions disagree on a question's master key;
  - a student appears twice in the version;
  - the version has no solution row, or has solution rows that conflict;
  - a required answer cell is missing (`""` is a blank answer).
- **Normalisation:** the copies carry trimmed codes and trimmed, upper-case permutations and correct letters, so every helper matches them the same way.
- **What changed and what didn't:** for valid, fully mapped inputs, grades, cross-version analysis, `DE` and the option statistics are unchanged. The per-question statistics, decisions and KR-20 *can* change. A single shuffled version, or versions sharing one shuffled order, were mislabelled too.
- **Scope:** the checks cover the map's scalar keys. They do not re-check the map against the working key (P6, P11).
- **Tests:** in `tests/analysis.test.ts` (hand-checked, including the guards, a single shuffled version, unequal versions and constant items), `tests/export-and-templates.test.ts` (shuffled export) and `tests/dummy-data.test.ts` (against the oracle, which now includes `rpb` and either key).
- **Review:** channels 004 and 006.

**Found in the P2 review (channel 004): pre-existing, open, not part of 1.8.1**
- **P6 (medium):** `DE` and the option statistics take the correct answer from the map's single `correct` letter, not from the working key. A second accepted answer, or a key corrected in Step 2, is counted as a distractor.
- **P7 (low):** `DE` always assumes 4 distractors, even for questions with fewer options.
- **P8 (low):** KR-20 is undefined for an exam with one question: it comes out as NaN or Infinity, and the UI and export print it unguarded.
- **P9 (low):** option `r_pb` uses the full total score, although a code comment says "rest score". The two definitions need to be stated.
- **P10 (low):** the quartiles (T1–T4) and the 27% groups used for D have different tie rules. This is by design; it needs documenting.
- **P12 (low):** Step 3 parses numeric version codes as numbers (`normalizeItemAnalysis`: `001` becomes `1`), so a map with padded codes always goes through the code-mapping screen, and its suggestion is correct. `validateCorrectAnswers` skips codes that have no solution row, so it must run after code mapping, which the UI does. Found while building the template dialog.
- **P11 (medium, next):** uploading a new student file in Step 1 keeps the previously accepted item-analysis file (`updateStudentData` does not clear it), and that file is not checked again.

**P3 (low): WIDE detection reads column names from the first data row only.**
- SheetJS omits blank cells, so a file whose first row has an empty `Master_Correct` is detected as UNKNOWN.
- The Shuffler flags whichever master answer was configured. When that is option A, as in the sample exports, the first row is never blank.
- Marked `it.fails` in `tests/item-analysis-parsing.test.ts`.

**P4 (fixed in 1.7.1):** a key corrected in Step 2 used to be ignored by Steps 3 and 4. Re-grading now makes the revised data (with the corrected key) the working exam data, via `applyRegradedKey` in `contexts/wizard-context.tsx`. If the key changes after an item-analysis file was accepted, that file is cleared and must be re-uploaded, because it was validated against the old key. Tests: `tests/regrade.test.ts`.

**P5 (low, open): custom Shuffler version names are not recognised in Options Matrix headers.**
- The Shuffler writes `${versionName}_Q` / `${versionName}_Opt`.
- With its default names (`version_N`) the files work. With custom names, such as `A_Q` in its own help example, the file is not detected as WIDE, and `parseWideFormat` needs numeric `version_N` / `vN` columns.

**Minor (open):**
- The Step 1 mapping hint says solution rows have Code = "0" or "00". The documented format is ID = "0" with Code = the real version.
- Step 3's mismatch message says "QUESTIONS_MAP says …" even when an Options Matrix was uploaded.

**Out of scope (user decision):** Options Matrix exports from an earlier Shuffler version that used the reverse direction. Which version changed is not recorded. Use their Question Map instead.

### Dummy Data Generator (November 2026)

- **Core:** `lib/dummy-data.ts`. Pure and browser-safe, with seeded and independent random streams.
- It builds a master exam and its versions: question order and option permutations (version letter to master letter, as `decodePermutation` expects).
- It simulates students with a 2PL model and plants five problems: a miskey, a too-easy question, two dead distractors, two accepted answers, and low discrimination.
- It serialises one dataset into every Step 1 and Step 3 form (`buildBundle`).
- `expectedResults` is an **independent oracle**: it never calls `lib/excel-utils.ts`.
- **CLI:** `scripts/generate-dummy-data.ts`, run as `npm run gen:dummy` (tsx). Output goes to `dummy_data/` (gitignored). `--from-shuffler <Question Map>` validates the map, rebuilds the exam and simulates students only.
- **Templates:** the four download buttons use `TEMPLATE_PRESET`, one clean dataset, so the templates agree.
- **Tests:** `tests/dummy-data.test.ts` covers every form through the real import path, oracle agreement (p, D, r_pb and KR-20, on identity and shuffled order, with the published and the corrected key), planted-item flags, and Shuffler-mode validation.
- **Seed check (20 seeds, N=200, K=20, V=4):** KR-20 0.70–0.78.
  - Miskey: INVESTIGATE 19/20.
  - Dead distractors: REVISE 20/20.
  - Too easy: REVISE 19/20.
  - Low discrimination: never KEEP.
- **Design review:** channel 003; Codex changes adopted, trimmed.

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

**Automated (run first):** `npm test`. Covers scoring, parsing, analyses, exports and templates, plus the local `sample_files/` comparison when that folder is present. The manual checks below cover the UI.

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
- Requires Chrome/Edge/Firefox 111+ or Safari 16.4+ (Next.js 16 baseline)

## Future Enhancements

**Potential features to consider:**
- Undo/redo for re-grading changes
- Import/export wizard state (JSON)
- Progressive Web App (PWA) support
- Offline mode
- Print-friendly result views
