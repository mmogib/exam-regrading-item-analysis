# CLAUDE.MD

This file documents the exam grading application codebase.

## Project Overview

This is an exam grading application built with Next.js, TypeScript, and React for KFUPM Mathematics Department.

## Getting Started

See `QUICK_START.md` for installation and setup instructions.

## Architecture

The application is a client-side only Next.js app with static export capability. All processing happens in the browser using SheetJS.

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
- Implementation: `components/uncoding.tsx`, `components/re-grading.tsx`
- Helper functions: formatFileSize(), formatTimestamp()

### Configurable Download Filenames
- All download names defined in `config/downloads.json`
- Type-safe via `config/downloads.ts`
- Zero runtime overhead (bundled at build time)
- Used across: `components/uncoding.tsx`, `components/re-grading.tsx`, `lib/template-generator.ts`

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
