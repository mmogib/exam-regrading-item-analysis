# CLAUDE.MD

This file documents the exam grading application codebase.

## Project Overview

This is an exam grading application built with Next.js, TypeScript, and React for KFUPM Mathematics Department.

## Getting Started

See `README.md` for installation and setup instructions.

## Architecture

The application is a client-side only Next.js app with static export capability. All processing happens in the browser using SheetJS.

### Application Structure

**Two main tabs:**
1. **Re-grading** (`components/re-grading.tsx`) - Modify correct answers and re-calculate scores
2. **Item Analysis** (`components/item-analysis.tsx`) - Unified analysis tab combining:
   - Comprehensive psychometric analysis (difficulty, discrimination, reliability KR-20, distractor evaluation)
   - Cross-version comparison (master question statistics and version performance)

**Shared Components:**
- `components/shared/analysis-data-uploader.tsx` - Reusable file upload component for Item Analysis tab
  - Handles exam answers (.xls/.xlsx/.csv/.txt) and item analysis (.csv) uploads
  - CSV format auto-detection (OLD/NEW/UNKNOWN) with manual column mapping
  - Code mismatch detection and mapping UI
    - Normalizes codes (trim whitespace) for reliable comparison
    - Supports partial code mapping (e.g., answer file codes 005-008 mapped to item CSV codes 5-8, while codes 1-4 remain unmapped)
  - Student statistics display
  - **Error/mapping reset on file click**: When user clicks upload input (before selecting file), clears errors/warnings and resets mapping UI for fresh upload
- `components/item-analysis-help-dialog.tsx` - Help dialog for Item Analysis tab explaining file formats and analysis types

## Development

See `README.md` for full development guidelines.

## Recent Features (2025)

### Position Mapping
- Displays which question number maps to each exam version
- Shown in UI tables and Excel exports (in Item Analysis tab)
- Implementation: `lib/excel-utils.ts` (computeAverageResults function), `types/exam.ts` (AverageResult interface)
- UI: `components/item-analysis.tsx` (table rendering in Master Question Statistics section)

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
- Used across: `components/item-analysis.tsx`, `components/re-grading.tsx`, `lib/template-generator.ts`

### Unified Item Analysis Tab (2025)
- **Merged tab** combining Cross-Version Analysis and Comprehensive Psychometric Analysis
- **Single workflow**: Upload files once → Get all analysis results
- **Deleted file**: `components/uncoding.tsx` (merged into `item-analysis.tsx`)

**What it does:**
1. **Cross-Version Analysis** (always runs):
   - Master question statistics across all exam versions
   - Performance comparison by exam code/version
   - Position mapping (shows which question number corresponds to each version)
   - Downloads: `master-question-stats.xlsx`, `exam-version-stats.xlsx`

2. **Comprehensive Psychometric Analysis** (runs if permutation data exists):
   - Item difficulty (p-value), discrimination index (D), point-biserial correlation (r_pb)
   - Test reliability (KR-20)
   - Distractor efficiency (DE%)
   - Decision recommendations (KEEP/REVISE/INVESTIGATE)
   - Quartile-based distractor analysis (T1-T4)
   - Option-level statistics for each question
   - Download: `item-analysis-comprehensive.xlsx`

**Implementation Details:**
- **Early validation**: Validates correct answers immediately when files are uploaded (before Compute button)
- **Permutation handling**: Shows warning if permutation missing; still computes cross-version analysis
- **Components**:
  - Main tab: `components/item-analysis.tsx`
  - Help dialog: `components/item-analysis-help-dialog.tsx`
- **Functions**:
  - `validateCorrectAnswers()`, `computeAverageResults()`, `computeCodeAverages()` (cross-version)
  - `computeComprehensiveItemAnalysis()` (psychometric analysis)
  - All in `lib/excel-utils.ts`
- **Types**: `ComprehensiveItemAnalysisResult`, `ItemStatistics`, `OptionStatistics`, `AverageResult`, `CodeAverageResult` in `types/exam.ts`
- **UI Design**:
  - Orange-themed cards for comprehensive analysis
  - Purple-themed for master question stats
  - Blue-themed for version stats
  - Sortable tables, collapsible accordions, color-coded metrics

**Key Features:**
- Upload files → Immediate validation (errors shown before Compute)
- Single Compute button → Both analyses run (if applicable)
- Results displayed in order: Psychometric → Cross-Version
- Three separate download buttons for granular exports
- Graceful degradation: Works without permutation (cross-version only)

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
