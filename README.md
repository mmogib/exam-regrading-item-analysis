# KFUPM Exam Grading Tool

A modern, client-side web application for re-grading MCQ-based exams and performing item analysis. Built for the Department of Mathematics at King Fahd University of Petroleum & Minerals (KFUPM).

## Features

### Re-grading Module
- Upload exam answer sheets (Excel format)
- Configure correct answers for each question version
- Support for multiple correct answers per question
- Automatic grading calculation (5 points per correct answer)
- Download revised answer sheets and results

### Uncoding Module
- Map student answers to master question order
- Calculate average scores per master question
- Support for multi-correct answers from solution rows
- Generate comprehensive item analysis reports

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
  - `import_test_data_revised.xlsx`: Updated answer sheet with revised solutions
  - `results_id_export_revised.xlsx`: Student results with totals and percentages

### Uncoding
- **Input**:
  - `import_test_data.xls/.xlsx`: Same format as re-grading
  - `item_analysis.csv`: Columns `code`, `order`, `order_in_master`
  
- **Output**:
  - `average_results.xlsx`: Average % correct per master question

## Usage

### Re-grading Workflow
1. Upload the original `import_test_data.xls` file
2. Set the number of questions in the exam
3. Configure correct answers for each version (code)
4. Click "Re-grade Exam"
5. Download the revised files

### Uncoding Workflow
1. Upload both the answers file and `item_analysis.csv`
2. Set the number of questions (master order)
3. Click "Compute Averages"
4. Download the `average_results.xlsx` file

## Key Features

- ✅ **Client-side processing**: All data stays in your browser (privacy-first)
- ✅ **Multi-correct support**: Questions can have multiple correct answers
- ✅ **Automatic detection**: Smart detection of question count and exam versions
- ✅ **Export to Excel**: Download results in standard Excel format
- ✅ **Responsive design**: Works on desktop and mobile devices
- ✅ **Modern UI**: Clean, professional interface with shadcn/ui

## Development

### Project Structure
```
exam-grading-app/
├── app/
│   ├── layout.tsx          # Root layout with fonts
│   ├── page.tsx            # Main page with tabs
│   └── globals.css         # Global styles
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── re-grading.tsx      # Re-grading module
│   └── uncoding.tsx        # Uncoding module
├── lib/
│   ├── utils.ts            # Utility functions
│   └── excel-utils.ts      # Excel processing logic
├── types/
│   └── exam.ts             # TypeScript types
└── public/                 # Static assets
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
