# 🎯 Flexible CSV Format Support - User Guide

## ✨ What's New?

Your exam grading tool now supports **ANY CSV format** for item analysis!

---

## 📋 **Supported Formats:**

### **Format 1: OLD (Auto-detected)**
```csv
code,order,order in master,option,option in master,correct
1,1,11,1,5,
1,1,11,2,4,
...
```

### **Format 2: NEW (Auto-detected)**
```csv
Group,Master Q#,Version,Version Q#,Permutation,Correct,Points
2,6,1,1,DEBAC,D,1
2,7,1,2,DEACB,C,1
...
```

### **Format 3: CUSTOM (Manual mapping)**
```csv
exam_code,question_num,master_num
1,1,11
2,1,14
...
```

---

## 🚀 **How It Works:**

### **Scenario 1: Known Format (OLD or NEW)**
1. ✅ Upload your CSV
2. ✅ See: "Format: OLD (auto-detected)" or "Format: NEW (auto-detected)"
3. ✅ Continue normally - no action needed!

### **Scenario 2: Unknown Format**
1. ⚠️ Upload your CSV
2. ⚠️ See: "Unknown format - mapping required"
3. 🔧 **Mapping UI appears** with three dropdowns:

```
┌────────────────────────────────────────────────┐
│ Map Your CSV Columns                           │
├────────────────────────────────────────────────┤
│ Detected columns in your CSV:                  │
│ [exam_code] [question_num] [master_num]        │
│                                                │
│ Code/Version: [Select: exam_code ▼]           │
│ Question Order: [Select: question_num ▼]      │
│ Master Question #: [Select: master_num ▼]     │
│                                                │
│ [Apply Mapping] [Cancel]                      │
└────────────────────────────────────────────────┘
```

4. ✅ Select the correct column for each field
5. ✅ Click "Apply Mapping"
6. ✅ Continue normally!

---

## 📖 **Column Meanings:**

| Required Field | What It Is | Example Values |
|---------------|------------|----------------|
| **Code / Version** | Exam version number or code | 1, 2, V1, A, 002, etc. |
| **Question Order** | Question position in that version | 1-14 (for a 14-question exam) |
| **Master Question #** | Master question number | 1-14 (master order) |

---

## 💡 **Examples:**

### **Example 1: Short Column Names**
Your CSV has: `ver,q,mq`

**Mapping:**
- Code/Version → `ver`
- Question Order → `q`
- Master Question # → `mq`

### **Example 2: Descriptive Names**
Your CSV has: `ExamVersion,QuestionInVersion,MasterQuestionNumber`

**Mapping:**
- Code/Version → `ExamVersion`
- Question Order → `QuestionInVersion`
- Master Question # → `MasterQuestionNumber`

### **Example 3: Alternative Names**
Your CSV has: `test_code,q_num,master_q`

**Mapping:**
- Code/Version → `test_code`
- Question Order → `q_num`
- Master Question # → `master_q`

---

## ✅ **Tips:**

1. **Column names are case-insensitive** - `Version`, `version`, `VERSION` all work
2. **Spaces and underscores are flexible** - `order in master`, `order_in_master` both work
3. **Only 3 columns needed** - all other columns are ignored
4. **Visual confirmation** - You'll see a ✓ or ⚠️ icon showing detection status

---

## 🔧 **Troubleshooting:**

**Q: I uploaded CSV but nothing happens**
- Make sure it's a `.csv` file (not `.xls` or `.xlsx`)

**Q: All dropdowns show the same columns**
- That's correct! Choose the appropriate column for each field

**Q: "Apply Mapping" is disabled**
- Make sure you've selected all three required columns

**Q: Error after applying mapping**
- Check that your selected columns contain numeric values
- Check console (F12) for debug info

---

## 🎉 **That's It!**

Your tool now works with:
- ✅ Old format CSVs
- ✅ New format CSVs  
- ✅ **ANY custom format** with manual mapping

**No more CSV format restrictions!** 🚀
