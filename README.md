# KFUPM Exam Grading Tool

A modern, client-side web application for re-grading MCQ-based exams and performing comprehensive item analysis. Built for the Department of Mathematics at King Fahd University of Petroleum & Minerals (KFUPM).

## Features

### Wizard-Based Workflow
Four-step guided process for exam grading and analysis:

**Step 1: Upload Student Data** (Required)
- Upload exam answer sheets (Excel or CSV format)
- Auto-detect number of questions
- Display summary: students, questions, exam versions
- Data persists across page refreshes (localStorage)

**Step 2: Re-grading** (Optional)
- Review and modify correct answers for each exam version
- Support for multiple correct answers per question (e.g., A, C, D)
- Visual warnings for questions missing correct answers (yellow highlight)
- Configurable points per question
- Download revised answer sheets and student results
- Choose: "Finish" (complete workflow) or "Continue to Item Analysis"

**Step 3: Item Analysis Upload** (Optional)
- Upload item analysis CSV file
- Auto-detect CSV format (multiple formats supported)
- Manual column mapping for custom CSV formats
- **Code validation and mapping**:
  - Automatically detects code mismatches (e.g., "005" vs "5")
  - Interactive mapping interface with critical warnings
  - Validates correct answers against solution rows
- Detects permutation data for comprehensive analysis

**Step 4: Analysis Results**
Two types of analysis available:

**Cross-Version Analysis** (always available):
- Master question statistics across all exam versions
- Position mapping (shows which question appears where in each version)
- Performance comparison by exam code/version
- Support for multi-correct answers
- Support for alphanumeric exam codes (V1, A, 002, etc.)
- Download: `master-question-statistics.xlsx`, `exam-version-statistics.xlsx`

**Comprehensive Psychometric Analysis** (requires QUESTIONS_MAP format with Permutation):
- Item difficulty (p-value) and discrimination index (D)
- Point-biserial correlation (r_pb)
- Test reliability (KR-20)
- Distractor efficiency analysis
- Decision recommendations (KEEP/REVISE/INVESTIGATE)
- Quartile-based distractor analysis (T1-T4)
- Option-level statistics for each question
- Interactive UI with sortable tables and expandable question details
- Download: `item-analysis-comprehensive.xlsx`

### User Experience
- ✅ **Progress tracking**: Visual stepper showing current step and completion status
- ✅ **Flexible navigation**: Back, Next, Skip, Finish buttons as appropriate
- ✅ **State persistence**: All data saved to browser (survives page refresh)
- ✅ **Start Over**: Clear all data and restart (with confirmation dialog)
- ✅ **Client-side processing**: All data stays in your browser (privacy-first)
- ✅ **Responsive design**: Works on desktop and mobile devices

## Tech Stack

- **Framework**: Next.js 14 (React, TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui
- **Excel Processing**: SheetJS (client-side)
- **State Management**: React Context API + localStorage
- **Deployment**: Netlify (static site)

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd exam-grading-app
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Building for Production

```bash
npm run build
```

This creates an optimized static export in the `out/` directory.

## Deployment to Netlify

### Option 1: Deploy via Git
1. Push your code to GitHub
2. Connect your repository to Netlify
3. Netlify will automatically build and deploy

### Option 2: Manual Deploy
1. Build the project: `npm run build`
2. Drag and drop the `out/` folder to Netlify

### Option 3: Netlify CLI
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=out
```

## File Formats

### Student Answer Data
- **Input**: `import_test_data.xls`, `.xlsx`, `.csv`, or `.txt`
  - Required columns: `form`, `ID`, `Section`, `Code`
  - Question columns (numeric names like `1`, `2`, `3`, etc.)
  - Solution rows: `ID = 000000000`, `Section = 00`
  - Supports alphanumeric codes (V1, A, 002, etc.)

- **Output** (Step 2 - Re-grading):
  - `exam-data-regraded.xlsx`: Updated answer sheet with revised solutions
  - `student-grades.xlsx`: Student results with totals and percentages

### Item Analysis Data
- **Input** (Step 3):
  - `item_analysis.csv`: Maps question positions across versions (multiple formats supported)
  - `QUESTIONS_MAP.csv` (recommended): Extended format with Permutation column for comprehensive analysis
  - Auto-detection of CSV format (OLD/NEW/UNKNOWN)
  - Manual column mapping available for custom formats

- **Output** (Step 4):
  - `master-question-statistics.xlsx`: Average % correct per master question with position mapping
  - `exam-version-statistics.xlsx`: Performance statistics per exam version
  - `item-analysis-comprehensive.xlsx`: Full psychometric report (requires QUESTIONS_MAP format)

## Usage

### Workflow 1: Re-grading Only
1. **Step 1**: Upload student answer sheet
2. **Step 2**: Review and modify correct answers → Click "Re-grade"
3. Download revised answer sheet and results
4. Click "Finish" to complete

### Workflow 2: Item Analysis Only
1. **Step 1**: Upload student answer sheet
2. **Step 2**: Click "Skip" (no re-grading needed)
3. **Step 3**: Upload item analysis CSV
   - System validates codes and correct answers
   - Map codes if mismatch detected
4. **Step 4**: Click "Compute Cross-Version Analysis" and/or "Compute Comprehensive Analysis"
5. Download analysis reports

### Workflow 3: Complete Analysis
1. **Step 1**: Upload student answer sheet
2. **Step 2**: Re-grade if needed → Click "Continue to Item Analysis"
3. **Step 3**: Upload item analysis CSV
4. **Step 4**: Compute both analyses
5. Download all reports

### Code Mapping (Step 3)
If exam version codes don't match between files:
- System detects mismatch (e.g., student data has "005", CSV has "5")
- Shows interactive mapping table
- **CRITICAL**: Incorrect mapping will produce wrong grades!
- Select correct mapping from dropdowns
- Click "Accept Mapping & Continue"

## Key Features

### Client-Side Processing
- ✅ **Privacy-first**: All data stays in your browser
- ✅ **No server required**: Works offline after initial load
- ✅ **Fast processing**: No network delays
- ✅ **Secure**: Data never leaves your device

### Smart Validation
- ✅ **Auto-detect question count**: Intelligently counts valid questions
- ✅ **Code normalization**: Handles numeric and alphanumeric codes
- ✅ **Multi-answer support**: Questions can have multiple correct answers (e.g., "ACDE")
- ✅ **Early validation**: Catches errors before computation

### Export Capabilities
- ✅ **Excel format**: Standard .xlsx files
- ✅ **Configurable filenames**: Edit `config/downloads.json`
- ✅ **Multiple reports**: Separate downloads for different analyses
- ✅ **Position mapping**: Shows question locations in each version

### User Interface
- ✅ **Clean design**: Modern, professional interface
- ✅ **Visual feedback**: Color-coded warnings and status indicators
- ✅ **Progress tracking**: Clear stepper showing workflow progress
- ✅ **Responsive**: Works on desktop, tablet, and mobile
- ✅ **Dark mode**: Automatic theme detection

## Recent Updates

### Wizard Workflow (December 2025)
- **Complete redesign**: Replaced tab-based UI with 4-step wizard
- **State persistence**: All data saved to browser localStorage
- **Improved navigation**: Back/Next/Skip/Finish buttons with clear workflow
- **Better UX**: Progress indicator, step completion tracking

### Code Validation Enhancement (December 2025)
- **Automatic detection**: Identifies code mismatches between files
- **Interactive mapping**: User-friendly interface for code mapping
- **Critical warnings**: Clear alerts about mapping importance
- **Smart validation timing**: Maps codes before validating answers

### Visual Improvements (December 2025)
- **Yellow warnings**: Empty answers highlighted in re-grading table
- **Improved dialogs**: Professional confirmation modals (Start Over)
- **Better layouts**: Vertical answer choice stacking for narrow columns
- **Full analysis display**: Complete psychometric analysis UI with tables and accordions

### Position Mapping
- See which question number corresponds to each master question in each exam version
- Example: Master Q1 might be Q7 in Version A, Q12 in Version B
- Position info shown in both UI tables and Excel exports

### Alphanumeric Code Support
- Supports numeric codes: 1, 2, 001, 002
- Supports alphanumeric codes: V1, V2, A, B, Version-A
- Automatic detection and handling

### Configurable Filenames
Download filenames are configurable via `config/downloads.json`:
```json
{
  "crossVersionAnalysis": {
    "masterQuestionStats": "master-question-statistics.xlsx",
    "examVersionStats": "exam-version-statistics.xlsx"
  },
  "comprehensiveItemAnalysis": {
    "report": "item-analysis-comprehensive.xlsx"
  },
  "reGrading": {
    "examDataRevised": "exam-data-regraded.xlsx",
    "studentResults": "student-grades.xlsx"
  }
}
```
Simply edit and rebuild - no code changes needed!

## Development

### Project Structure
```
exam-grading-app/
├── app/
│   ├── layout.tsx                        # Root layout with fonts
│   ├── page.tsx                          # Main page with wizard
│   └── globals.css                       # Global styles
├── components/
│   ├── wizard/                           # Wizard workflow components
│   │   ├── exam-wizard.tsx              # Main wizard container
│   │   ├── stepper.tsx                  # Progress indicator
│   │   ├── step1-upload-student-data.tsx
│   │   ├── step2-regrading.tsx
│   │   ├── step3-upload-item-analysis.tsx
│   │   ├── step4-analysis-results.tsx
│   │   └── results/                     # Result display components
│   │       ├── cross-version-results.tsx
│   │       └── comprehensive-results.tsx
│   ├── shared/                           # Reusable components
│   │   └── file-drop-zone.tsx           # Drag-drop file upload
│   └── ui/                               # shadcn/ui components
├── contexts/
│   └── wizard-context.tsx                # Wizard state management
├── config/
│   ├── downloads.json                    # Download filename configuration
│   └── downloads.ts                      # Type-safe config loader
├── lib/
│   ├── utils.ts                          # Utility functions
│   ├── excel-utils.ts                    # Excel processing logic
│   └── template-generator.ts             # Template generation
├── types/
│   └── exam.ts                           # TypeScript types
└── public/                               # Static assets
```

### Adding New Features

1. **Add new UI components**: Use shadcn/ui CLI
```bash
npx shadcn-ui@latest add [component-name]
```

2. **Modify Excel processing**: Edit `lib/excel-utils.ts`

3. **Update types**: Edit `types/exam.ts`

4. **Add wizard steps**: Create new step component in `components/wizard/`

### State Management
The wizard uses React Context API for state management:
- **Provider**: `contexts/wizard-context.tsx`
- **localStorage**: Persists state with versioning (`kfupm_exam_wizard_v1`)
- **State structure**: See `WizardState` interface in context file

## Troubleshooting

### File Upload Issues
- **File not recognized**: Ensure Excel/CSV file has required columns
- **Large files slow**: Files >1000 students may take time to process
- **Browser freezes**: Try smaller file or newer browser

### Validation Errors
- **Code mismatch**: Use the mapping UI to match codes between files
- **Missing answers**: Check solution rows (ID=000000000, Section=00)
- **Wrong format**: Verify CSV has correct columns (code, order, orderInMaster)

### localStorage Full
- Browser localStorage has ~5-10 MB limit
- Click "Start Over" to clear stored data
- For very large datasets, process in batches

## Documentation

- **`CLAUDE.MD`**: Internal documentation for developers and Claude
- **`DistractorAnalysis.MD`**: Psychometric formulas and theory
- **`UNUSED_FILES_REPORT.md`**: Cleanup analysis from wizard refactor
- **`DOCUMENTATION_PLAN.md`**: Future documentation roadmap

## License

Developed by Dr. Nasir Abbas and Dr. Mohammed Alshahrani, Department of Mathematics, KFUPM.

## Support

For issues or questions, please contact the Department of Mathematics at KFUPM.
