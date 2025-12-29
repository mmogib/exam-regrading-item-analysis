# Testing Strategy for Exam Grading Application

This document outlines the comprehensive testing strategy for the exam grading application, including unit tests, integration tests, and end-to-end tests.

## Table of Contents

1. [Overview](#overview)
2. [Testing Pyramid](#testing-pyramid)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [End-to-End Tests](#end-to-end-tests)
6. [Setup Instructions](#setup-instructions)
7. [Test Data Strategy](#test-data-strategy)
8. [Continuous Integration](#continuous-integration)
9. [Coverage Goals](#coverage-goals)

---

## Overview

### Current State
- **No existing tests** - Clean slate to start
- **Heavy data processing** - Excel/CSV parsing, complex calculations
- **React components** - UI with state management
- **File I/O focused** - File uploads, downloads

### Testing Approach
We follow the testing pyramid approach with more unit tests at the base, fewer integration tests in the middle, and minimal E2E tests at the top.

---

## Testing Pyramid

```
        /\
       /  \  E2E Tests (2-3 tests)
      /____\
     /      \  Integration Tests (5-10 tests)
    /________\
   /          \  Unit Tests (20-30 tests)
  /____________\
```

---

## Unit Tests

### Purpose
Test individual functions in isolation to ensure they work correctly with various inputs.

### What to Test

**High Priority:**
- ✅ `classifyStudentsByQuartile()` - Critical business logic for quartile ranking
- ✅ `computeDistractorAnalysis()` - New feature, complex permutation logic
- ✅ `validateCorrectAnswers()` - Data validation between QUESTIONS_MAP and solution rows
- ✅ `computeResults()` - Grading calculations
- ✅ `normalizeItemAnalysis()` - CSV parsing with multiple formats

**Medium Priority:**
- `computeAverageResults()` - Cross-version statistics
- `computeCodeAverages()` - Per-version averages
- `buildCorrectAnswersMap()` - Solution row parsing
- Permutation decoding helper functions

### Example Unit Tests

```typescript
// lib/__tests__/excel-utils.test.ts

import { classifyStudentsByQuartile } from '../excel-utils';
import { StudentResult } from '@/types/exam';

describe('classifyStudentsByQuartile', () => {
  it('should classify students into 4 quartiles', () => {
    const students: StudentResult[] = [
      { ID: '1', Section: '01', Code: '001', Tot: 100, Per: 100 },
      { ID: '2', Section: '01', Code: '001', Tot: 80, Per: 80 },
      { ID: '3', Section: '01', Code: '001', Tot: 60, Per: 60 },
      { ID: '4', Section: '01', Code: '001', Tot: 40, Per: 40 },
    ];

    const ranked = classifyStudentsByQuartile(students);

    expect(ranked[0].Rank).toBe('T1'); // Top 25%
    expect(ranked[1].Rank).toBe('T2');
    expect(ranked[2].Rank).toBe('T3');
    expect(ranked[3].Rank).toBe('T4');
  });

  it('should handle ties at quartile boundaries', () => {
    const students: StudentResult[] = [
      { ID: '1', Section: '01', Code: '001', Tot: 90, Per: 90 },
      { ID: '2', Section: '01', Code: '001', Tot: 75, Per: 75 },
      { ID: '3', Section: '01', Code: '001', Tot: 75, Per: 75 }, // Tie at boundary
      { ID: '4', Section: '01', Code: '001', Tot: 60, Per: 60 },
    ];

    const ranked = classifyStudentsByQuartile(students);

    // Both students with score 75 should be in higher quartile (T1)
    expect(ranked[1].Rank).toBe('T1');
    expect(ranked[2].Rank).toBe('T1');
  });

  it('should exclude solution rows from ranking', () => {
    const students: StudentResult[] = [
      { ID: '000000000', Section: '00', Code: '001', Tot: 100, Per: 100 }, // Solution row
      { ID: '0', Section: '00', Code: '002', Tot: 100, Per: 100 }, // Solution row
      { ID: '1', Section: '01', Code: '001', Tot: 80, Per: 80 },
    ];

    const ranked = classifyStudentsByQuartile(students);

    expect(ranked).toHaveLength(1); // Only real student
    expect(ranked[0].ID).toBe('1');
  });

  it('should return empty array for no students', () => {
    const ranked = classifyStudentsByQuartile([]);
    expect(ranked).toEqual([]);
  });
});

describe('computeDistractorAnalysis', () => {
  it('should decode permutations correctly', () => {
    // Test: Permutation "CADEB" means:
    // Student's A (index 0) → Master's C (permutation[0])
    // Student's B (index 1) → Master's A (permutation[1])
    // Student's C (index 2) → Master's D (permutation[2])
    // Student's D (index 3) → Master's E (permutation[3])
    // Student's E (index 4) → Master's B (permutation[4])

    // Create mock data to test this
    const examData = [
      { ID: '000000000', Section: '00', Code: '1', '1': 'B' }, // Solution
      { ID: '1', Section: '01', Code: '1', '1': 'C' }, // Student answered C
    ];

    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1, permutation: 'CADEB', correct: 'B' }
    ];

    const rankedStudents = [
      { ID: '1', Section: '01', Code: '1', Tot: 80, Per: 80, Rank: 'T1' as const }
    ];

    const result = computeDistractorAnalysis(examData, itemAnalysis, rankedStudents);

    // Student answered C, permutation[2] = D, so student chose Master option D
    const choiceD = result[0].choices.find(c => c.choice === 'D');
    expect(choiceD?.count).toBe(1);
    expect(choiceD?.T1).toBe(1);
  });

  it('should count Blank/Other for invalid answers', () => {
    const examData = [
      { ID: '000000000', Section: '00', Code: '1', '1': 'A' },
      { ID: '1', Section: '01', Code: '1', '1': '' }, // Blank
      { ID: '2', Section: '01', Code: '1', '1': 'X' }, // Invalid
    ];

    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1, permutation: 'ABCDE', correct: 'A' }
    ];

    const rankedStudents = [
      { ID: '1', Section: '01', Code: '1', Tot: 50, Per: 50, Rank: 'T3' as const },
      { ID: '2', Section: '01', Code: '1', Tot: 40, Per: 40, Rank: 'T4' as const }
    ];

    const result = computeDistractorAnalysis(examData, itemAnalysis, rankedStudents);

    const blankOther = result[0].choices.find(c => c.choice === 'Blank/Other');
    expect(blankOther?.count).toBe(2);
  });

  it('should mark correct answer with isCorrect flag', () => {
    const examData = [
      { ID: '000000000', Section: '00', Code: '1', '1': 'B' },
      { ID: '1', Section: '01', Code: '1', '1': 'A' },
    ];

    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1, permutation: 'ABCDE', correct: 'B' }
    ];

    const rankedStudents = [
      { ID: '1', Section: '01', Code: '1', Tot: 80, Per: 80, Rank: 'T1' as const }
    ];

    const result = computeDistractorAnalysis(examData, itemAnalysis, rankedStudents);

    // Correct answer is B in version, which maps to B in master (identity permutation)
    const choiceB = result[0].choices.find(c => c.choice === 'B');
    expect(choiceB?.isCorrect).toBe(true);

    const choiceA = result[0].choices.find(c => c.choice === 'A');
    expect(choiceA?.isCorrect).toBe(false);
  });

  it('should throw error if permutation data missing', () => {
    const examData = [{ ID: '1', Section: '01', Code: '1', '1': 'A' }];
    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1 } // No permutation
    ];
    const rankedStudents = [
      { ID: '1', Section: '01', Code: '1', Tot: 80, Per: 80, Rank: 'T1' as const }
    ];

    expect(() => {
      computeDistractorAnalysis(examData, itemAnalysis, rankedStudents);
    }).toThrow('Distractor analysis requires permutation data');
  });
});

describe('validateCorrectAnswers', () => {
  it('should return null when no permutation data', () => {
    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1 } // No permutation or correct
    ];
    const examData = [];

    const error = validateCorrectAnswers(itemAnalysis, examData);
    expect(error).toBeNull();
  });

  it('should detect mismatch between QUESTIONS_MAP and solution row', () => {
    const examData = [
      { ID: '000000000', Section: '00', Code: '1', '1': 'A' } // Solution says A
    ];

    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1, permutation: 'ABCDE', correct: 'B' } // Map says B
    ];

    const error = validateCorrectAnswers(itemAnalysis, examData);

    expect(error).toContain('mismatch');
    expect(error).toContain('Version 1');
    expect(error).toContain("QUESTIONS_MAP says 'B'");
    expect(error).toContain("solution row has 'A'");
  });

  it('should return null when answers match', () => {
    const examData = [
      { ID: '000000000', Section: '00', Code: '1', '1': 'A' }
    ];

    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1, permutation: 'ABCDE', correct: 'A' }
    ];

    const error = validateCorrectAnswers(itemAnalysis, examData);
    expect(error).toBeNull();
  });

  it('should report error when solution row missing', () => {
    const examData = []; // No solution rows

    const itemAnalysis = [
      { code: 1, order: 1, order_in_master: 1, permutation: 'ABCDE', correct: 'A' }
    ];

    const error = validateCorrectAnswers(itemAnalysis, examData);

    expect(error).toContain('No solution row found');
    expect(error).toContain('Version 1');
  });
});

describe('normalizeItemAnalysis', () => {
  it('should parse NEW format with permutation column', () => {
    const data = [
      { Version: '1', 'Version Q#': '1', 'Master Q#': '5', Permutation: 'CADEB', Correct: 'B', Points: '1' }
    ];

    const result = normalizeItemAnalysis(data, 'NEW');

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe(1);
    expect(result[0].order).toBe(1);
    expect(result[0].order_in_master).toBe(5);
    expect(result[0].permutation).toBe('CADEB');
    expect(result[0].correct).toBe('B');
    expect(result[0].points).toBe(1);
  });

  it('should parse OLD format without permutation', () => {
    const data = [
      { code: 'A', order: '1', order_in_master: '5' }
    ];

    const result = normalizeItemAnalysis(data, 'OLD');

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('A');
    expect(result[0].order).toBe(1);
    expect(result[0].order_in_master).toBe(5);
    expect(result[0].permutation).toBeUndefined();
  });

  it('should handle alphanumeric codes', () => {
    const data = [
      { Version: 'A', 'Version Q#': '1', 'Master Q#': '5' },
      { Version: 'Version-B', 'Version Q#': '1', 'Master Q#': '3' }
    ];

    const result = normalizeItemAnalysis(data, 'NEW');

    expect(result[0].code).toBe('A');
    expect(result[1].code).toBe('Version-B');
  });

  it('should skip rows with missing required data', () => {
    const data = [
      { Version: '1', 'Version Q#': '1', 'Master Q#': '5' }, // Valid
      { Version: '1', 'Version Q#': '', 'Master Q#': '6' },  // Missing order
      { Version: '', 'Version Q#': '2', 'Master Q#': '7' },  // Missing code
    ];

    const result = normalizeItemAnalysis(data, 'NEW');

    expect(result).toHaveLength(1);
    expect(result[0].order_in_master).toBe(5);
  });
});
```

---

## Integration Tests

### Purpose
Test how multiple components work together, including state management and data flow.

### What to Test
- File upload → Parse → Display results flow
- Full computation pipeline with mocked file data
- State management in components
- Code mapping UI interactions

### Example Integration Tests

```typescript
// components/__tests__/uncoding.integration.test.tsx

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UncodingTab } from '../uncoding';

// Mock the excel-utils functions
jest.mock('@/lib/excel-utils', () => ({
  ...jest.requireActual('@/lib/excel-utils'),
  readExamDataFile: jest.fn(),
  readCSVFileWithDetection: jest.fn(),
}));

describe('UncodingTab Integration', () => {
  it('should upload files and compute distractor analysis', async () => {
    // Mock file upload responses
    const mockAnswersData = [
      { ID: '000000000', Section: '00', Code: '1', '1': 'A' },
      { ID: '1', Section: '01', Code: '1', '1': 'A' },
    ];

    const mockItemAnalysisDetection = {
      format: 'NEW' as const,
      columns: ['Version', 'Version Q#', 'Master Q#', 'Permutation', 'Correct'],
      data: [
        { Version: '1', 'Version Q#': '1', 'Master Q#': '1', Permutation: 'ABCDE', Correct: 'A' }
      ]
    };

    const { readExamDataFile, readCSVFileWithDetection } = require('@/lib/excel-utils');
    readExamDataFile.mockResolvedValue(mockAnswersData);
    readCSVFileWithDetection.mockResolvedValue(mockItemAnalysisDetection);

    render(<UncodingTab />);
    const user = userEvent.setup();

    // Create mock files
    const answersFile = new File(['mock'], 'answers.xlsx', { type: 'application/vnd.ms-excel' });
    const iaFile = new File(['mock'], 'mapping.csv', { type: 'text/csv' });

    // Upload files
    const answersInput = screen.getByLabelText(/answers file/i);
    await user.upload(answersInput, answersFile);

    await waitFor(() => {
      expect(screen.getByText(/loaded:.*answers\.xlsx/i)).toBeInTheDocument();
    });

    const iaInput = screen.getByLabelText(/item analysis file/i);
    await user.upload(iaInput, iaFile);

    await waitFor(() => {
      expect(screen.getByText(/loaded:.*mapping\.csv/i)).toBeInTheDocument();
    });

    // Click compute
    const computeButton = screen.getByRole('button', { name: /compute/i });
    await user.click(computeButton);

    // Verify distractor analysis appears
    await waitFor(() => {
      expect(screen.getByText(/distractor analysis/i)).toBeInTheDocument();
    });
  });

  it('should show warning when permutation data missing', async () => {
    const mockItemAnalysisDetection = {
      format: 'OLD' as const,
      columns: ['code', 'order', 'order_in_master'],
      data: [
        { code: '1', order: '1', order_in_master: '1' } // No permutation
      ]
    };

    const { readCSVFileWithDetection } = require('@/lib/excel-utils');
    readCSVFileWithDetection.mockResolvedValue(mockItemAnalysisDetection);

    render(<UncodingTab />);
    const user = userEvent.setup();

    const iaFile = new File(['mock'], 'mapping.csv', { type: 'text/csv' });
    const iaInput = screen.getByLabelText(/item analysis file/i);
    await user.upload(iaInput, iaFile);

    await waitFor(() => {
      expect(screen.getByText(/does not contain permutation data/i)).toBeInTheDocument();
    });
  });
});
```

---

## End-to-End Tests

### Purpose
Test complete user workflows from start to finish with real file handling and browser interactions.

### Recommended Tool: Playwright

Playwright is modern, fast, and supports multiple browsers. It's recommended for E2E testing of Next.js applications.

### Installation

```bash
npm install --save-dev @playwright/test
npx playwright install
```

### Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Example E2E Tests

```typescript
// e2e/distractor-analysis.spec.ts

import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Distractor Analysis Workflow', () => {
  test('should perform complete distractor analysis with QUESTIONS_MAP file', async ({ page }) => {
    await page.goto('/');

    // Navigate to Cross-Version Analysis tab
    await page.click('text=Cross-Version Analysis');

    // Upload answers file
    const answersPath = path.join(__dirname, '../sample_files/imported_test_data.csv');
    const answersInput = page.locator('input[type="file"]').first();
    await answersInput.setInputFiles(answersPath);

    // Wait for upload confirmation
    await expect(page.locator('text=/Loaded:.*imported_test_data/i')).toBeVisible();

    // Upload QUESTIONS_MAP file
    const mappingPath = path.join(__dirname, '../sample_files/QUESTIONS_MAP_Math 201_Final_Exam_mapping.csv');
    const iaInput = page.locator('input[type="file"]').nth(1);
    await iaInput.setInputFiles(mappingPath);

    // Wait for upload confirmation
    await expect(page.locator('text=/Loaded:.*QUESTIONS_MAP/i')).toBeVisible();

    // Click Compute button
    await page.click('button:has-text("Compute")');

    // Wait for all results to appear
    await expect(page.locator('text=Master Question Statistics')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Distractor Analysis')).toBeVisible();
    await expect(page.locator('text=Exam Version Statistics')).toBeVisible();

    // Expand first accordion item in distractor analysis
    await page.click('text=Master Question 1');

    // Verify distractor table appears
    await expect(page.locator('table th:has-text("Choice")')).toBeVisible();
    await expect(page.locator('table th:has-text("TOP 25%")')).toBeVisible();
    await expect(page.locator('table th:has-text("SECOND 25%")')).toBeVisible();
    await expect(page.locator('table th:has-text("THIRD 25%")')).toBeVisible();
    await expect(page.locator('table th:has-text("BOTTOM 25%")')).toBeVisible();

    // Verify correct answer is marked with asterisk
    await expect(page.locator('text=/[A-E]\\*/').first()).toBeVisible();

    // Test download distractor analysis
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download distractor-analysis.xlsx")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('distractor-analysis.xlsx');
  });

  test('should show warning with old ItemAnalysis format', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Cross-Version Analysis');

    // Create a mock old format CSV file
    const oldFormatCSV = 'code,order,order_in_master\n1,1,5\n1,2,1\n2,1,3';
    const blob = new Blob([oldFormatCSV], { type: 'text/csv' });
    const file = new File([blob], 'old-format.csv', { type: 'text/csv' });

    // Upload via JS because we're creating file on the fly
    await page.evaluate((fileContent) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const dt = new DataTransfer();
      const file = new File([fileContent], 'old-format.csv', { type: 'text/csv' });
      dt.items.add(file);
      input!.files = dt.files;
      input!.dispatchEvent(new Event('change', { bubbles: true }));
    }, oldFormatCSV);

    // Wait for warning about missing permutation
    await expect(page.locator('text=/does not contain permutation data/i')).toBeVisible();
  });

  test('should handle code mismatch mapping', async ({ page }) => {
    // Test the code mapping UI when answer file codes don't match item analysis codes
    await page.goto('/');
    await page.click('text=Cross-Version Analysis');

    // Upload files that will trigger code mismatch
    // ... implementation details
  });
});

test.describe('Re-grading Workflow', () => {
  test('should re-grade exam and download results', async ({ page }) => {
    await page.goto('/');

    // Upload exam file
    const examPath = path.join(__dirname, '../sample_files/imported_test_data.csv');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(examPath);

    await expect(page.locator('text=/Loaded:/i')).toBeVisible();

    // Click Re-grade button
    await page.click('button:has-text("Re-Grade")');

    // Wait for results
    await expect(page.locator('text=Grading Results')).toBeVisible({ timeout: 10000 });

    // Verify results table
    await expect(page.locator('table th:has-text("ID")')).toBeVisible();
    await expect(page.locator('table th:has-text("Total")')).toBeVisible();

    // Test download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download student-grades.xlsx")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('student-grades.xlsx');
  });
});
```

---

## Setup Instructions

### 1. Install Testing Dependencies

```bash
# Unit and Integration tests (Jest + React Testing Library)
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom

# E2E tests (Playwright)
npm install --save-dev @playwright/test
npx playwright install
```

### 2. Configure Jest

Create `jest.config.js`:

```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'components/**/*.tsx',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
}

module.exports = createJestConfig(customJestConfig)
```

Create `jest.setup.js`:

```javascript
import '@testing-library/jest-dom'
```

### 3. Update package.json

Add test scripts:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

### 4. Create Test Directory Structure

```
exam-grading-app/
├── lib/
│   └── __tests__/
│       └── excel-utils.test.ts
├── components/
│   └── __tests__/
│       ├── uncoding.test.tsx
│       └── uncoding.integration.test.tsx
├── e2e/
│   ├── distractor-analysis.spec.ts
│   └── re-grading.spec.ts
├── test-fixtures/
│   └── mock-data.ts
├── jest.config.js
├── jest.setup.js
└── playwright.config.ts
```

---

## Test Data Strategy

### Option A: Minimal Mock Data

Create small, focused datasets for unit and integration tests.

```typescript
// test-fixtures/mock-data.ts

import { ExamRow, ItemAnalysisRow, StudentResult } from '@/types/exam';

export const mockSolutionRows: ExamRow[] = [
  {
    form: '1',
    ID: '000000000',
    Section: '00',
    Code: '1',
    '1': 'A',
    '2': 'B',
    '3': 'C',
  },
  {
    form: '1',
    ID: '000000000',
    Section: '00',
    Code: '2',
    '1': 'B',
    '2': 'C',
    '3': 'A',
  },
];

export const mockStudents: ExamRow[] = [
  {
    form: '1',
    ID: '123456',
    Section: '01',
    Code: '1',
    '1': 'A',
    '2': 'B',
    '3': 'C',
  },
  {
    form: '1',
    ID: '123457',
    Section: '01',
    Code: '1',
    '1': 'A',
    '2': 'C',
    '3': 'B',
  },
];

export const mockItemAnalysisWithPermutation: ItemAnalysisRow[] = [
  {
    code: 1,
    order: 1,
    order_in_master: 1,
    permutation: 'ABCDE',
    correct: 'A',
    points: 1,
  },
  {
    code: 2,
    order: 1,
    order_in_master: 2,
    permutation: 'BCDEA',
    correct: 'C',
    points: 1,
  },
];

export const mockStudentResults: StudentResult[] = [
  { ID: '123456', Section: '01', Code: '1', Tot: 100, Per: 100 },
  { ID: '123457', Section: '01', Code: '1', Tot: 80, Per: 80 },
  { ID: '123458', Section: '01', Code: '2', Tot: 60, Per: 60 },
  { ID: '123459', Section: '01', Code: '2', Tot: 40, Per: 40 },
];
```

### Option B: Real Sample Files

Use actual files from `sample_files/` directory for E2E tests.

**Pros:**
- Tests realistic scenarios
- Validates real-world data handling

**Cons:**
- Larger files, slower tests
- Harder to create specific edge cases

### Recommended Approach

- **Unit tests**: Use minimal mock data (Option A)
- **Integration tests**: Use small synthetic files
- **E2E tests**: Use real sample files (Option B)

---

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    name: Unit and Integration Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests

      - name: Build application
        run: npm run build

  e2e:
    name: End-to-End Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## Coverage Goals

### Target Coverage Metrics

- **Overall**: 70%+
- **lib/excel-utils.ts**: 80%+
- **Critical functions**: 90%+
  - `classifyStudentsByQuartile()`
  - `computeDistractorAnalysis()`
  - `validateCorrectAnswers()`
  - `computeResults()`

### Running Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

### Coverage Exemptions

Files that don't need high coverage:
- UI components with primarily presentational logic
- Type definitions
- Configuration files
- Template generators

---

## Best Practices

### 1. Test Naming Convention

```typescript
describe('FunctionName', () => {
  it('should [expected behavior] when [condition]', () => {
    // Test implementation
  });
});
```

### 2. AAA Pattern

Structure tests using Arrange-Act-Assert:

```typescript
it('should classify students correctly', () => {
  // Arrange
  const students = createMockStudents();

  // Act
  const result = classifyStudentsByQuartile(students);

  // Assert
  expect(result[0].Rank).toBe('T1');
});
```

### 3. Test Isolation

Each test should be independent:

```typescript
beforeEach(() => {
  // Reset state before each test
  jest.clearAllMocks();
});
```

### 4. Descriptive Assertions

```typescript
// ❌ Bad
expect(result.length).toBe(5);

// ✅ Good
expect(result).toHaveLength(5);
expect(result[0]).toMatchObject({
  ID: '123456',
  Rank: 'T1'
});
```

### 5. Edge Cases

Always test:
- Empty inputs
- Null/undefined values
- Boundary conditions
- Invalid data
- Large datasets

---

## Running Tests

### Run All Tests

```bash
npm test
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Run Specific Test File

```bash
npm test excel-utils.test.ts
```

### Run E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in UI mode (interactive)
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug
```

### Run Tests in CI

```bash
# Run with coverage
npm run test:coverage

# Run E2E in headless mode
CI=true npm run test:e2e
```

---

## Next Steps

### Immediate (Start Here)

1. ✅ Set up testing infrastructure (Jest + Playwright)
2. ✅ Write unit tests for `classifyStudentsByQuartile()`
3. ✅ Write unit tests for `computeDistractorAnalysis()`
4. ✅ Write one E2E test for complete workflow

### Short Term

1. Add tests for other critical functions
2. Set up code coverage reporting
3. Add integration tests for component interactions
4. Configure CI/CD pipeline

### Long Term

1. Achieve 80%+ coverage on critical modules
2. Add visual regression testing (optional)
3. Add performance testing for large datasets
4. Set up automated test runs on pull requests

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Next.js Testing](https://nextjs.org/docs/testing)

---

## Troubleshooting

### Common Issues

**Issue: Tests fail with module not found**
```bash
# Clear Jest cache
npm test -- --clearCache
```

**Issue: Playwright browsers not installed**
```bash
npx playwright install
```

**Issue: Tests timeout**
```typescript
// Increase timeout for specific test
it('should handle large file', async () => {
  // ...
}, 30000); // 30 second timeout
```

**Issue: DOM not available in tests**
```javascript
// Ensure jest.config.js has:
testEnvironment: 'jest-environment-jsdom'
```

---

*Last Updated: 2025-12-29*
