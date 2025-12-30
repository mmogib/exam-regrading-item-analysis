# CLAUDE.MD

This file documents the exam grading application codebase.

## Project Overview

This is an exam grading application built with Next.js, TypeScript, and React for KFUPM Mathematics Department.

## Getting Started

See `README.md` for installation and setup instructions.

## Architecture

The application is a client-side only Next.js app with static export capability. All processing happens in the browser using SheetJS.

### Application Structure

**Three main tabs:**
1. **Re-grading** (`components/re-grading.tsx`) - Modify correct answers and re-calculate scores
2. **Cross-Version Analysis** (`components/uncoding.tsx`) - Calculate master question statistics and version performance
3. **Item Analysis** (`components/item-analysis.tsx`) - Comprehensive psychometric analysis including distractor evaluation

**Shared Components:**
- `components/shared/analysis-data-uploader.tsx` - Reusable file upload component for tabs 2 & 3
  - Handles exam answers (.xls/.xlsx/.csv/.txt) and item analysis (.csv) uploads
  - CSV format auto-detection (OLD/NEW/UNKNOWN) with manual column mapping
  - Code mismatch detection and mapping UI
  - Student statistics display
  - Used by both Cross-Version Analysis and Item Analysis tabs

## Development

See `README.md` for full development guidelines.

## Recent Features (2025)

### Position Mapping
- Displays which question number maps to each exam version
- Shown in UI tables and Excel exports
- Implementation: `lib/excel-utils.ts` (computeAverageResults function), `types/exam.ts` (AverageResult interface)
- UI: `components/uncoding.tsx` (table rendering)

### Alphanumeric Code Support
- Handles both numeric (1, 002) and alphanumeric (V1, A, Version-A) codes
- Changes in: `lib/excel-utils.ts` (normalizeItemAnalysis, computeAverageResults, computeCodeAverages)
- Type changes: `types/exam.ts` (ItemAnalysisRow.code, CodeAverageResult.Code now string | number)

### File Re-upload
- Users can modify and re-upload same file without page refresh
- Input cleared after upload, metadata (size, timestamp) tracked
- Implementation: `components/shared/analysis-data-uploader.tsx`, `components/re-grading.tsx`
- Helper functions: formatFileSize(), formatTimestamp()

### Configurable Download Filenames
- All download names defined in `config/downloads.json`
- Type-safe via `config/downloads.ts`
- Zero runtime overhead (bundled at build time)
- Used across: `components/uncoding.tsx`, `components/re-grading.tsx`, `lib/template-generator.ts`

### Item Analysis Tab (2025)
- **New dedicated tab** for comprehensive psychometric analysis
- Moved distractor analysis from Cross-Version Analysis tab to separate Item Analysis tab
- Analyzes which answer choices students select across performance quartiles
- Shows if weak students are attracted to specific wrong answers (distractors)
- Helps identify confusing questions and misleading answer choices
- **Requirements**: QUESTIONS_MAP format with Permutation column
- **Implementation**:
  - Component: `components/item-analysis.tsx` (new dedicated tab)
  - Functions: `classifyStudentsByQuartile()`, `validateCorrectAnswers()`, `computeDistractorAnalysis()` in `lib/excel-utils.ts`
  - Types: `StudentResultWithRank`, `DistractorAnalysisResult`, `DistractorChoiceResult` in `types/exam.ts`
  - Uses shared `AnalysisDataUploader` component for file uploads
  - UI: Accordion component (orange-themed card)
  - Download: `distractor-analysis.xlsx`
- **Features**:
  - Global quartile ranking (T1=Top 25%, T2=Second 25%, T3=Third 25%, T4=Bottom 25%)
  - Tie handling at quartile boundaries (assigns to higher quartile)
  - Permutation decoding (maps version-specific answers to master question options)
  - Correct answer validation (QUESTIONS_MAP vs solution rows)
  - Blank/Other tracking for invalid/missing responses
  - Collapsible per-question view with accordion UI
- **Data Format**: Extends `ItemAnalysisRow` with optional fields: `permutation`, `correct`, `points`, `group`
- **Future**: Will include additional psychometric metrics (p-value, discrimination indices, point-biserial correlations, etc.)

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
