# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### To Consider
- Template download buttons in wizard steps
- Help tooltips or info buttons per step
- Undo/redo for re-grading changes
- Import/export wizard state (JSON)

---

## [1.3.0] - 2025-12-31

### Added - Major Wizard Implementation 🎉
- **Four-step wizard workflow** replacing tab-based UI
  - Step 1: Upload Student Data (required)
  - Step 2: Re-grading (optional)
  - Step 3: Item Analysis Upload (optional)
  - Step 4: Results (two compute buttons)
- **Wizard state management** with React Context API
  - `contexts/wizard-context.tsx` - Global state provider
  - localStorage persistence with versioning (`kfupm_exam_wizard_v1`)
  - State survives page refresh
  - Version control for breaking changes
- **Navigation system**
  - Back button (maintains state)
  - Next button (advances when step complete)
  - Skip button (on optional steps)
  - Finish button (complete workflow from Step 2)
  - Start Over button (with confirmation dialog)
- **Progress tracking**
  - Visual stepper component showing current step
  - Completed steps tracking
  - Clear workflow visualization
- **Code mapping validation** (Step 3)
  - Automatic detection of code mismatches
  - Interactive mapping UI with dropdown selectors
  - Critical warning alerts about incorrect mapping
  - Student count display per code
  - Validates correct answers AFTER code mapping
  - Supports partial code mapping
- **Improved Start Over dialog**
  - Professional AlertDialog component (shadcn/ui)
  - Red warning icon and messaging
  - Clear description of what will be cleared
  - "This action cannot be undone" warning
  - Smooth animations
- **Visual warnings for missing answers** (Step 2)
  - Yellow background highlighting for empty answers
  - Yellow border for visual emphasis
  - Alert box explaining the highlighting
  - Prevents accidental submission of incomplete answer keys
- **Comprehensive analysis UI display** (Step 4)
  - Test Summary card with KR-20, metrics
  - Decision Criteria Legend (KEEP/REVISE/INVESTIGATE explanations)
  - Item Statistics Overview (sortable table)
  - Detailed Option Analysis (accordion per question)
  - Color-coded metrics (red/yellow for problems)
  - Sortable columns
  - Decision badges
  - Quartile breakdown (T1-T4)
  - Functional/non-functional distractor labels
- **File drop zone component**
  - Drag-and-drop file upload
  - Clean dashed border UI
  - Centered upload icon
  - File type validation
  - Size limit checking
  - Used across all upload steps
- **Documentation file structure**
  - Defined `/references/` folder for non-root MD files
  - Updated CLAUDE.MD with documentation conventions

### Changed
- **Complete UI redesign** from tabs to wizard
- **Validation timing** - Code mapping happens BEFORE answer validation
  - Ensures validation finds correct solution rows
  - Prevents validation failures due to code mismatch
- **Answer choice layout** (Step 2) - Changed to vertical stacking
  - From: horizontal flex with wrapping
  - To: vertical column layout
  - Fixes display issues in narrow columns (Q10+)
- **Question counting** - Uses `guessNumQuestions()` instead of column count
  - Intelligently detects valid questions by examining solution rows
  - Ignores empty columns
  - More accurate than counting all columns
- **File upload workflow** - Individual uploaders per step
  - Step 1: Student data upload
  - Step 3: Item analysis CSV upload
  - Simpler, more focused UX

### Removed
- **Old tab-based components** (~1,500+ lines removed)
  - `components/item-analysis.tsx` (362 lines)
  - `components/re-grading.tsx` (229 lines)
  - `components/shared/analysis-data-uploader.tsx` (~700+ lines)
  - `components/item-analysis-help-dialog.tsx` (~200+ lines)
  - `components/upload-help-dialog.tsx` (~100+ lines)
  - `components/ui/tabs.tsx`
  - `components/ui/dialog.tsx`
- **Tab navigation** - No longer needed with wizard flow

### Fixed
- Code mapping validation now happens at correct time (before answer validation)
- Question count detection handles empty columns correctly
- Answer choices display properly in all table columns
- TypeScript error: `kr20` → `KR20` property name

### Technical Details
- **New Components**: 11 wizard-related files
- **New Package**: `@radix-ui/react-alert-dialog`
- **Bundle size reduction**: Estimated 40-60 KB (from deleted files)
- **localStorage key**: `kfupm_exam_wizard_v1`

---

## [1.2.1] - 2025-12-30

### Fixed
- Validation errors in item analysis
- Removed duplicate code between `uncoding.tsx` and `item-analysis.tsx`
- Merged cross-version analysis into unified item analysis tab

### Changed
- Consolidated analysis functionality into single tab

---

## [1.2.0] - 2025-12-XX

### Added
- **Full item analysis** with comprehensive psychometric metrics
  - Item difficulty (p-value)
  - Discrimination index (D)
  - Point-biserial correlation (r_pb)
  - Test reliability (KR-20)
  - Distractor efficiency analysis
  - Decision recommendations (KEEP/REVISE/INVESTIGATE)
- **Quartile-based distractor analysis**
  - T1 (Top 25%), T2, T3, T4 (Bottom 25%)
  - Option-level statistics
  - Functional/non-functional distractor identification
- **Interactive UI components**
  - Sortable tables for item statistics
  - Collapsible accordions for detailed question analysis
  - Color-coded metrics
  - Decision badges

### Changed
- Enhanced item analysis with full psychometric suite
- Improved UI for analysis results display

---

## [1.1.0] - 2025-12-XX

### Added
- **Separate Item Analysis tab**
  - Dedicated tab for comprehensive analysis
  - Separated from cross-version analysis
- **Position mapping**
  - Shows which question number maps to each exam version
  - Displayed in UI tables and Excel exports
  - Example: Master Q1 → Q7 in Version A, Q12 in Version B

### Changed
- Reorganized analysis features into separate tabs
- Enhanced cross-version analysis presentation

---

## [1.0.0] - 2025-12-XX

### Added - Initial Stable Release 🎉
- **Re-grading module**
  - Upload exam answer sheets (Excel/CSV)
  - Configure correct answers for each version
  - Support for multiple correct answers per question
  - Automatic grading calculation
  - Download revised answer sheets and results
- **Cross-version analysis**
  - Master question statistics
  - Exam version performance comparison
  - Support for alphanumeric codes (V1, A, 002, etc.)
- **Distractor analysis**
  - Answer choice distribution
  - Performance by student quartiles
- **Client-side processing**
  - All data stays in browser
  - No server required
  - Privacy-first approach
- **Excel export**
  - Download results in .xlsx format
  - Multiple export options
- **Configurable download filenames**
  - `config/downloads.json` for customization
  - Type-safe configuration
  - Zero runtime overhead
- **Modern UI**
  - shadcn/ui components
  - Tailwind CSS styling
  - Responsive design
  - Dark mode support

### Technical Stack
- Next.js 14 (App Router)
- React 18
- TypeScript
- SheetJS (xlsx)
- Tailwind CSS + shadcn/ui
- Static export (Netlify deployment)

---

## [0.3.0] - 2025-12-XX

### Added
- Configurable file names via `config/downloads.json`
- UI file upload improvements

### Fixed
- File upload UI issues
- Configuration loading

---

## [0.2.0] - 2025-12-XX

### Added
- Cross-version analysis improvements
- Enhanced statistics calculation

### Fixed
- Logic issues in analysis computation
- Data processing bugs

---

## [0.1.0] - 2025-12-XX

### Added - Initial Development
- Basic re-grading functionality
- Excel file parsing
- Student result calculation
- Simple UI structure

---

## Version History Summary

- **[1.3.0]** - Wizard workflow, major UX overhaul (Current)
- **[1.2.1]** - Bug fixes, code consolidation
- **[1.2.0]** - Full psychometric analysis
- **[1.1.0]** - Separate item analysis tab
- **[1.0.0]** - Initial stable release
- **[0.3.0]** - Configuration improvements
- **[0.2.0]** - Analysis enhancements
- **[0.1.0]** - Initial development

---

## Migration Guide

### From 1.2.x to 1.3.0

**Breaking Changes:**
- UI completely redesigned (tabs → wizard)
- localStorage structure changed (old data will be cleared)
- Component structure reorganized

**What to expect:**
1. First load: Start fresh with wizard workflow
2. localStorage: Data persists within wizard sessions
3. Navigation: Use Back/Next/Skip/Finish buttons
4. All functionality preserved, just different workflow

**Benefits:**
- Clearer workflow progression
- Better state management
- Improved validation timing
- Enhanced user guidance

---

## Notes

- **Semantic Versioning**: MAJOR.MINOR.PATCH
  - MAJOR: Breaking changes (UI redesign)
  - MINOR: New features (backwards compatible)
  - PATCH: Bug fixes
- **Release dates**: Some historical dates estimated based on git log
- **Current version**: 1.3.0 (December 31, 2025)

---

**Developed by**: Dr. Nasir Abbas and Dr. Mohammed Alshahrani
**Department**: Mathematics, King Fahd University of Petroleum & Minerals (KFUPM)
