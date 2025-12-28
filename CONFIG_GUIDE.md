# Configuration Guide

## Download Filenames

All download filenames are configurable without code changes.

### Location
`config/downloads.json`

### Format
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

### Current Filenames

#### Cross-Version Analysis Tab
- **Master Question Statistics**: `master-question-statistics.xlsx`
  - Contains average % correct per master question
  - Includes position mapping (shows which question number in each version)
  - Per-version breakdown of performance

- **Exam Version Statistics**: `exam-version-statistics.xlsx`
  - Contains overall performance per exam version/code
  - Helps identify if certain versions were harder/easier

#### Re-Grading Tab
- **Exam Data Revised**: `exam-data-regraded.xlsx`
  - Updated answer sheet with corrected solution rows
  - Same format as uploaded file
  - Ready for re-import if needed

- **Student Results**: `student-grades.xlsx`
  - Student grades with ID, Section, Code, Total Score, Percentage
  - Ready for grade submission

#### Templates
- **Exam Data Template**: `exam-data-template.xlsx`
  - Example template for uploading exam data
  - Shows correct format with sample data

### How to Change Filenames

1. **Open the config file**:
   ```bash
   # Edit config/downloads.json
   ```

2. **Update the desired filename(s)**:
   ```json
   {
     "crossVersionAnalysis": {
       "masterQuestionStats": "my-custom-name.xlsx",
       "examVersionStats": "another-name.xlsx"
     }
   }
   ```

3. **Rebuild the application**:
   ```bash
   npm run build
   ```

4. **Deploy**:
   - The new filenames will be used immediately
   - No code changes required!

### Rules and Restrictions

- ✅ Must end with `.xlsx` extension
- ✅ Can use hyphens, underscores, spaces
- ✅ Can use any alphanumeric characters
- ❌ Avoid special characters like `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`
- ❌ Keep filenames reasonable length (< 100 characters)

### Examples

**Academic Style:**
```json
{
  "crossVersionAnalysis": {
    "masterQuestionStats": "Question_Analysis_Report.xlsx",
    "examVersionStats": "Version_Comparison_Report.xlsx"
  }
}
```

**Date-based:**
```json
{
  "crossVersionAnalysis": {
    "masterQuestionStats": "master-questions-2025.xlsx",
    "examVersionStats": "version-stats-2025.xlsx"
  }
}
```

**Department Specific:**
```json
{
  "reGrading": {
    "examDataRevised": "MATH-exam-revised.xlsx",
    "studentResults": "MATH-grades.xlsx"
  }
}
```

### Type Safety

The configuration is type-safe via `config/downloads.ts`. If you add or remove fields, TypeScript will catch errors at build time.

**Interface:**
```typescript
export interface DownloadConfig {
  crossVersionAnalysis: {
    masterQuestionStats: string;
    examVersionStats: string;
  };
  reGrading: {
    examDataRevised: string;
    studentResults: string;
  };
  templates: {
    examDataTemplate: string;
  };
}
```

### Performance

**Zero runtime overhead!**
- JSON is loaded at build time
- Compiled into JavaScript bundle
- No parsing or processing at runtime
- Same speed as hardcoded values

### Troubleshooting

**Q: I changed the filename but it's still using the old one**
- Make sure you ran `npm run build` after editing
- Clear your browser cache
- Redeploy the application

**Q: Build fails after changing config**
- Check JSON syntax (missing commas, quotes, brackets)
- Ensure all fields are present
- Make sure filenames end with `.xlsx`

**Q: Can I change filenames without rebuilding?**
- No, changes require rebuild
- This is by design for performance (build-time bundling)

### Where Filenames Are Used

The configuration is imported and used in:

1. **components/uncoding.tsx**
   - Lines 338, 343: Export functions
   - Lines 765, 847: Button labels

2. **components/re-grading.tsx**
   - Lines 158, 163: Export functions
   - Lines 405, 426: Button labels

3. **lib/template-generator.ts**
   - Line 106: Template download

All these locations automatically use the configured filenames - no manual updates needed!

---

**Need more customization?** Check `README.md` for full development documentation.
