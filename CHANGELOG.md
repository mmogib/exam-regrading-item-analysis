# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **A new student file now resets the later steps.**
  - A successful Step 1 upload, even of the same file, clears the accepted item analysis file and the previous re-grading, and returns to Step 1, with a notice saying what was removed. Before this, Step 4 could analyse the new students with the item analysis file of another exam.
  - An item analysis file whose check finishes after the student data changed is no longer accepted.
  - A Step 1 read that finishes after leaving Step 1 is ignored.
  - Sessions saved by earlier versions keep their student data (including a corrected key), but need the item analysis file uploaded again.
- Step 1's column-mapping hint now describes solution rows correctly (ID 0 with the version's real code).
- Step 3's answer-mismatch message says "the item analysis file says …" instead of "QUESTIONS_MAP says …", which was wrong for Options Matrix and other formats.
- **Questions with more than one accepted answer.** Distractor efficiency and the option table now take the correct answers from the answer key, including answers added in Step 2. Before this, a second accepted answer was counted as a distractor. The comprehensive analysis now stops with a clear error if versions accept different answers for the same question.
- **Questions with fewer than five options.** Distractor efficiency counts only the real options, and the option table lists only them. Before this, it always assumed four distractors. When every option is accepted, distractor efficiency shows **N/A** and the distractor rules are skipped in the decision.
- **One-question exams.** The comprehensive analysis needs at least 2 questions, so it now explains that instead of showing KR-20 as NaN.
- **Options Matrix files:**
  - files whose first row has an empty cell, for example a blank Master_Correct, are now recognised;
  - custom version names such as `A_Q` / `A_Opt` are now read;
  - malformed matrices (missing, repeated or out-of-range options or letters, positions that differ) are rejected with a clear message instead of being padded.
- **Version codes.**
  - Item analysis files keep codes exactly as written; only all-digit codes are read as numbers, so `1A` and `1B` stay distinct.
  - Step 3 now matches codes like `1` and `001` by itself when every code has exactly one match, so the code-mapping screen appears only when a choice is needed.
  - The suggested mapping no longer depends on the order of the rows.

### Changed
- **Option point-biserial** (option table) now uses the same rest score as the item point-biserial (the total without that question). For a question with one accepted answer, the correct option's value equals the item's.
- **Score groups T1–T4.** Students with the same total are always in the same group: a tie at a boundary goes to the higher group, so groups can be unequal or empty. Before this, a tie could be split. The top and bottom 27% groups used for D are unchanged.
- The help and the Excel guide explain both, and N/A.

### To Consider
- Template download buttons in wizard steps
- Help tooltips or info buttons per step
- Undo/redo for re-grading changes
- Import/export wizard state (JSON)

---

## [1.9.0] - 2026-11-28

### Added
- **Download Template dialog (Step 1).**
  - It generates a realistic answer file in the KFUPM grading-center layout (.xlsx: form, ID, Section, Code, 1–125) with simulated students, up to 5000.
  - It also gives the matching Step 3 files and the expected results (.json).
  - Optionally, it starts from your Shuffler Question Map or Options Matrix.
  - Options: planted problem questions, a planted wrong key (with a Shuffler file), and grading-center scan errors (`X` multiple marks, unreadable `@` ID digits and `@@` sections).
  - The generated files pad numeric source version codes, for example 1 → 001, and keep alphabetic names. If Step 3 offers code mapping, confirm the binding between the item analysis and student-file codes. The expected-results JSON keeps the original source codes.

### Changed
- Step 3's template buttons are labelled as fixed examples. The matching fixed student example is in the Step 1 dialog.
- File drop zones check dropped files against the allowed types and size, the same as chosen files, and each drop zone opens its own file chooser.

---

## [1.8.1] - 2026-11-28

### Fixed
- **Comprehensive analysis:** difficulty (p), discrimination (D) and item point-biserial (r_pb) are now computed and labelled by master question. Earlier reports used version positions, so they could pool different questions or put statistics under the wrong master-question label.
  - Re-run an earlier comprehensive report if any version's question order differs from the master order. This includes a single shuffled version, and versions that all share the same shuffled order.
  - Per-question statistics, KEEP/REVISE/INVESTIGATE decisions and KR-20 may change, and KR-20 can go up or down.
  - For valid, fully mapped inputs, grades, cross-version analysis, distractor efficiency and option statistics are unchanged by this correction.
- **New checks:** the comprehensive analysis now checks each version that has students, and stops with a clear error for:
  - an incomplete or non-one-to-one question map;
  - a missing or invalid option permutation;
  - a missing or invalid single correct letter;
  - versions whose map keys disagree;
  - a student listed twice in one version;
  - a missing solution row, or conflicting solution rows;
  - a missing answer cell (an empty cell still counts as a blank answer).
- The item analysis file's `Correct` value must be a single letter. Solution rows can still contain several accepted answers.

---

## [1.8.0] - 2026-11-27

### Added
- Dummy data generator (`npm run gen:dummy`). It writes one synthetic exam in every input form the app accepts, plus independently computed expected results and planted problem questions. It can also simulate students for a real Shuffler Question Map (`--from-shuffler`).

### Changed
- The four template downloads are generated from one dataset, so they now agree with each other. Previously the Options Matrix template disagreed with the exam template at 24 of 40 positions. Each template now has 20 questions × 4 versions.

---

## [1.7.1] - 2026-11-27

### Fixed
- Answer keys corrected in Step 2 (Re-grading) are now used by Item Analysis (Steps 3 and 4). Previously those steps kept using the key from the uploaded file. If the key changes after an item-analysis file was loaded, that file must be uploaded again.
- Corrected answers in Step 2 survive a page refresh.

### Added
- App version shown in the page footer.

---

## [1.7.0] - 2026-11-27

Dependency and security upgrade. There are no intended changes to grading, analysis or exports: the automated tests and a comparison on real sample files give identical results before and after.

### Security
- Next.js 14.2 → 16.4. Next.js 14 is end of life and had 26 unpatched advisories.
- SheetJS (`xlsx`) 0.18.5 from npm → 0.20.3 from the official SheetJS CDN. This fixes a prototype-pollution and a ReDoS advisory in file parsing; npm offered no fix.
- `npm audit`: 17 vulnerabilities → 0.

### Changed
- React 18 → 19.
- ESLint 8 → 9 with a flat config. `npm run lint` now runs `eslint .`, because `next lint` was removed in Next.js 16.
- Node.js 26 (LTS) is pinned for local development (`.nvmrc`) and Netlify (`NODE_VERSION`).
- **Supported browsers** are now Chrome/Edge/Firefox 111+ and Safari 16.4+, the Next.js 16 baseline. Previously they were Chrome 64+ and Safari 12+.
- The Netlify build runs lint and tests before building.
- Removed the unused `@radix-ui/react-dialog` and `@radix-ui/react-tabs` packages.

### Added
- Automated test suite (Vitest, `npm test`), plus an optional local comparison against `sample_files/`.

### Fixed
- Lint errors: escaped quotes in UI text, and documented the effect patterns. Nothing visible changes.

## [1.6.0] - 2026-01-01

### Added
- User documentation.

## [1.5.0] - 2026-01-01

### Added
- Support for the wide-format (Options Matrix) item analysis file.
- Favicons and web manifest.

### Fixed
- Correct-answer mapping for the wide format.

## [1.4.0] - 2025-12-31

### Added
- Automatic detection of column names in the student data file.

## [1.3.1] - 2025-12-31

### Changed
- Documentation planning.

> Entries 1.3.1–1.6.0 were backfilled from the git history on 2026-11-27.

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
