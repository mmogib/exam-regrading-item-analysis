# KFUPM Exam Grading Tool

A modern, client-side web application for re-grading MCQ-based exams and performing item analysis. Built for the Department of Mathematics at King Fahd University of Petroleum & Minerals (KFUPM).

## Features

### Re-grading Module
- Upload exam answer sheets (Excel format)
- Configure correct answers for each question version
- Support for multiple correct answers per question
- Automatic grading calculation (5 points per correct answer)
- Download revised answer sheets and results

### Item Analysis Module
Unified analysis combining cross-version comparison and comprehensive psychometric analysis:

**Cross-Version Analysis** (always available):
- Map student answers to master question order
- Calculate average scores per master question across all exam versions
- Position mapping showing which question appears where in each version
- Performance comparison by exam code/version
- Support for multi-correct answers from solution rows
- Support for alphanumeric exam codes (V1, A, 002, etc.)

**Comprehensive Psychometric Analysis** (requires QUESTIONS_MAP format with Permutation column):
- Item difficulty (p-value) and discrimination index (D)
- Point-biserial correlation (r_pb)
- Test reliability (KR-20)
- Distractor efficiency analysis
- Decision recommendations (KEEP/REVISE/INVESTIGATE)
- Quartile-based distractor analysis showing answer choice distribution by student performance
- Option-level statistics for each question

## Tech Stack

- **Framework**: Next.js 14 (React, TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui
- **Excel Processing**: SheetJS (client-side)
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

### Re-grading
- **Input**: `import_test_data.xls` or `.xlsx`
  - Required columns: `form`, `ID`, `Section`, `Code`
  - Question columns (numeric names like `1`, `2`, `3`, etc.)
  - Solution rows: `ID = 000000000`, `Section = 00`
  
- **Output**:
  - `exam-data-regraded.xlsx`: Updated answer sheet with revised solutions
  - `student-grades.xlsx`: Student results with totals and percentages

### Item Analysis
- **Input**:
  - Answers file (.xls/.xlsx): Same format as re-grading
  - `item_analysis.csv`: Maps question positions across versions (supports multiple CSV formats)
  - `QUESTIONS_MAP.csv` (recommended): Extended format with Permutation column for comprehensive psychometric analysis

- **Output**:
  - `master-question-statistics.xlsx`: Average % correct per master question with position mapping
  - `exam-version-statistics.xlsx`: Performance statistics per exam version
  - `item-analysis-comprehensive.xlsx`: Full psychometric report (requires QUESTIONS_MAP format)

## Usage

### Re-grading Workflow
1. Upload the original `import_test_data.xls` file
2. Set the number of questions in the exam
3. Configure correct answers for each version (code)
4. Click "Re-grade Exam"
5. Download the revised files

### Item Analysis Workflow
1. Upload both the answers file and `item_analysis.csv` (or `QUESTIONS_MAP.csv` for comprehensive analysis)
2. Set the number of questions (master order)
3. Click "Compute Analysis"
4. View results:
   - **Comprehensive Psychometric Analysis** (if QUESTIONS_MAP uploaded):
     - Test summary with KR-20 reliability
     - Item statistics overview (sortable table)
     - Detailed option analysis (collapsible per question)
   - **Cross-Version Analysis** (always shown):
     - Master question statistics with position mapping
     - Exam version performance comparison
5. Download statistics files:
   - `master-question-statistics.xlsx`: Per master question stats with position mapping
   - `exam-version-statistics.xlsx`: Per exam version stats
   - `item-analysis-comprehensive.xlsx`: Full psychometric report (if applicable)

## Key Features

- ✅ **Client-side processing**: All data stays in your browser (privacy-first)
- ✅ **Multi-correct support**: Questions can have multiple correct answers
- ✅ **Automatic detection**: Smart detection of question count and exam versions
- ✅ **Export to Excel**: Download results in standard Excel format
- ✅ **Responsive design**: Works on desktop and mobile devices
- ✅ **Modern UI**: Clean, professional interface with shadcn/ui

## Recent Updates

### Unified Item Analysis Tab (2025)
- **Merged functionality**: Combined Cross-Version Analysis and Comprehensive Psychometric Analysis into a single workflow
- **Upload once, analyze twice**: Get both cross-version comparison and psychometric analysis from one set of uploads
- **Graceful degradation**: Works with basic item analysis CSV (cross-version only) or QUESTIONS_MAP format (full analysis)
- **Early validation**: Validates correct answers immediately when files are uploaded
- **Error recovery**: Click upload input to reset errors and mapping UI for fresh uploads

### Comprehensive Psychometric Analysis
- Item difficulty (p), discrimination index (D), point-biserial correlation (r_pb)
- Test reliability (KR-20)
- Distractor efficiency percentage
- Automatic decision recommendations (KEEP/REVISE/INVESTIGATE)
- Quartile-based distractor analysis (T1-T4) showing answer choice distribution by student performance
- Option-level statistics for each question with functional/weak distractor identification
- Collapsible accordion UI for easy navigation

### Position Mapping
- See which question number corresponds to each master question in each exam version
- Example: Master Q1 might be Q7 in Version A, Q12 in Version B
- Position info shown in both UI tables and Excel exports

### Alphanumeric Code Support
- Supports numeric codes: 1, 2, 001, 002
- Supports alphanumeric codes: V1, V2, A, B, Version-A
- Automatic detection and handling

### File Re-upload
- Modify uploaded files locally and re-upload seamlessly
- File metadata (size, timestamp) displayed for tracking
- No need to refresh page or restart

### Configurable Filenames
Download filenames are configurable via `config/downloads.json`:
```json
{
  "crossVersionAnalysis": {
    "masterQuestionStats": "master-question-statistics.xlsx",
    "examVersionStats": "exam-version-statistics.xlsx"
  },
  "reGrading": {
    "examDataRevised": "exam-data-regraded.xlsx",
    "studentResults": "student-grades.xlsx"
  },
  "templates": {
    "examDataTemplate": "exam-data-template.xlsx"
  }
}
```
Simply edit and rebuild - no code changes needed!

## Development

### Project Structure
```
exam-grading-app/
├── app/
│   ├── layout.tsx                    # Root layout with fonts
│   ├── page.tsx                      # Main page with tabs
│   └── globals.css                   # Global styles
├── components/
│   ├── ui/                           # shadcn/ui components
│   ├── re-grading.tsx                # Re-grading module
│   ├── item-analysis.tsx             # Item analysis module (unified)
│   ├── item-analysis-help-dialog.tsx # Help dialog for item analysis
│   └── shared/
│       └── analysis-data-uploader.tsx # Shared file uploader
├── config/
│   ├── downloads.json                # Download filename configuration
│   └── downloads.ts                  # Type-safe config loader
├── lib/
│   ├── utils.ts                      # Utility functions
│   └── excel-utils.ts                # Excel processing logic
├── types/
│   └── exam.ts                       # TypeScript types
└── public/                           # Static assets
```

### Adding New Features

1. **Add new UI components**: Use shadcn/ui CLI
```bash
npx shadcn-ui@latest add [component-name]
```

2. **Modify Excel processing**: Edit `lib/excel-utils.ts`

3. **Update types**: Edit `types/exam.ts`

## License

Developed by Dr. Nasir Abbas, Department of Mathematics, KFUPM.

## Support

For issues or questions, please contact the Department of Mathematics at KFUPM.
