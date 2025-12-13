# R Shiny to TypeScript/React Conversion Reference

This document maps the R Shiny code to the new TypeScript/React implementation.

## Architecture Comparison

| R Shiny | TypeScript/React |
|---------|------------------|
| Shiny Server (R backend) | Client-side only (no backend) |
| Reactive values | React useState hooks |
| render* functions | React components |
| readxl package | SheetJS (xlsx library) |
| writexl package | SheetJS + FileSaver.js |

## File Structure Mapping

### R Shiny (Single File)
```r
app.R (everything in one file)
├── UI definitions
├── Server logic
├── Helper functions
└── Data processing
```

### TypeScript/React (Modular)
```typescript
exam-grading-app/
├── app/page.tsx              // Main UI (replaces fluidPage)
├── components/
│   ├── re-grading.tsx        // Re-grading module (replaces regradeUI + regradeServer)
│   └── uncoding.tsx          // Uncoding module (replaces uncodingUI + uncodingServer)
├── lib/
│   └── excel-utils.ts        // All helper functions
└── types/exam.ts             // Type definitions
```

## Function Mapping

### Data Reading Functions

**R Shiny:**
```r
readxl::read_excel(input$file$datapath)
read.csv(path, stringsAsFactors = FALSE)
```

**TypeScript:**
```typescript
readExcelFile(file: File): Promise<ExamRow[]>
readCSVFile(file: File): Promise<ItemAnalysisRow[]>
```

### Data Normalization

**R Shiny:**
```r
normalize_import_df <- function(df) {
  df$ID <- stringr::str_pad(df$ID, width = 9, side = "left", pad = "0")
  # ... more normalization
}
```

**TypeScript:**
```typescript
function normalizeImportData(data: any[]): ExamRow[] {
  normalized.ID = normalized.ID.padStart(9, '0');
  // ... more normalization
}
```

### Re-grading Logic

**R Shiny:**
```r
compute_results <- function(df, q_cols, correct_map) {
  # Calculate scores
  scores <- mapply(function(ans, corr_set) {
    if (ans %in% corr_set) POINTS_PER_Q else 0
  }, ans = answers, corr_set = corr)
}
```

**TypeScript:**
```typescript
export function computeResults(
  data: ExamRow[],
  qCols: string[],
  correctMap: CorrectAnswersMap
): StudentResult[] {
  // Calculate scores
  if (answer && correct.includes(answer as AnswerChoice)) {
    totalScore += POINTS_PER_Q;
  }
}
```

### Excel Export

**R Shiny:**
```r
write_xlsx_file <- function(dflist, file) {
  writexl::write_xlsx(dflist, path = file)
}
```

**TypeScript:**
```typescript
export function exportToExcel(data: any[], filename: string, sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer]);
  saveAs(blob, filename);
}
```

## UI Component Mapping

### File Upload

**R Shiny:**
```r
fileInput("file", "Upload import_test_data.xls/.xlsx", 
          accept = c(".xls", ".xlsx"))
```

**TypeScript/React:**
```tsx
<Input
  type="file"
  accept=".xls,.xlsx"
  onChange={handleFileUpload}
/>
```

### Checkbox Groups

**R Shiny:**
```r
checkboxGroupInput(
  inputId = ns(paste0("code_", i, "_q_", qi)),
  label = NULL,
  choices = ANS_CHOICES,
  selected = default_letters,
  inline = TRUE
)
```

**TypeScript/React:**
```tsx
{ANS_CHOICES.map((choice) => (
  <Checkbox
    checked={currentAnswers.includes(choice)}
    onCheckedChange={() => toggleAnswer(code, qIdx, choice)}
  />
))}
```

### Tables

**R Shiny:**
```r
tableOutput(ns("res_table"))

output$res_table <- renderTable({
  head(revised_results()$results, 20)
}, striped = TRUE, hover = TRUE, bordered = TRUE)
```

**TypeScript/React:**
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>ID</TableHead>
      <TableHead>Section</TableHead>
      {/* ... */}
    </TableRow>
  </TableHeader>
  <TableBody>
    {results.slice(0, 20).map((row) => (
      <TableRow key={idx}>
        <TableCell>{row.ID}</TableCell>
        {/* ... */}
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Download Buttons

**R Shiny:**
```r
downloadButton(ns("dl_import_revised"), "Download...")

output$dl_import_revised <- downloadHandler(
  filename = function() { "import_test_data_revised.xlsx" },
  content = function(file) {
    write_xlsx_file(list(...), file)
  }
)
```

**TypeScript/React:**
```tsx
<Button onClick={downloadImportRevised}>
  <Download className="mr-2 h-4 w-4" />
  Download import_test_data_revised.xlsx
</Button>

const downloadImportRevised = () => {
  exportToExcel(revisedData, 'import_test_data_revised.xlsx', 'import_test_data');
};
```

## State Management

### R Shiny (Reactive)
```r
raw_df <- reactive({
  req(input$file)
  df <- readxl::read_excel(input$file$datapath)
  normalize_import_df(df)
})

revised_results <- eventReactive(input$regrade, {
  # ... compute results
})
```

### TypeScript/React (useState)
```typescript
const [data, setData] = useState<ExamRow[]>([]);
const [results, setResults] = useState<StudentResult[]>([]);

const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const examData = await readExcelFile(uploadedFile);
  setData(examData);
};

const handleRegrade = () => {
  const studentResults = computeResults(data, qCols, correctMap);
  setResults(studentResults);
};
```

## Key Differences

### 1. **Processing Location**
- **R Shiny**: Server-side processing (R backend)
- **TypeScript/React**: Client-side processing (browser)

### 2. **Data Flow**
- **R Shiny**: Reactive programming (automatic updates)
- **TypeScript/React**: Explicit state updates via setState

### 3. **File Handling**
- **R Shiny**: Server filesystem access
- **TypeScript/React**: Browser File API + in-memory processing

### 4. **Deployment**
- **R Shiny**: Requires R server (Shiny Server, RStudio Connect)
- **TypeScript/React**: Static files (can host anywhere - Netlify, Vercel, S3)

### 5. **Dependencies**
- **R Shiny**: R packages (shiny, readxl, writexl, dplyr, tidyr)
- **TypeScript/React**: npm packages (React, Next.js, xlsx, file-saver)

## Advantages of TypeScript/React Version

1. **No Server Required**: Static site, host anywhere
2. **Privacy**: All data processing in browser (never leaves user's computer)
3. **Speed**: No server round-trips
4. **Modern UI**: shadcn/ui components, Tailwind CSS
5. **Type Safety**: TypeScript catches errors at compile time
6. **Free Hosting**: Netlify free tier is generous
7. **Mobile Friendly**: Responsive design works on phones/tablets
8. **Offline Capable**: Can work without internet (after initial load)

## Preserved Features

All functionality from the R Shiny app is preserved:

✅ Multi-correct answer support  
✅ Solution row processing  
✅ Code sorting (numeric codes first)  
✅ ID/Section padding (only for numeric values)  
✅ Question count auto-detection  
✅ Item analysis mapping  
✅ Average score calculation  
✅ Excel export with proper formatting  

## Notes

- The TypeScript version uses **functional programming** patterns instead of R's vectorized operations
- **Array methods** (map, filter, reduce) replace R's apply family
- **Promises/async-await** replace R's synchronous file operations
- **React hooks** replace Shiny's reactive values
- **shadcn/ui** components replace Shiny's built-in widgets

---

This conversion maintains 100% feature parity with your R Shiny app while providing a modern, maintainable codebase! 🎉
