import * as XLSX from 'xlsx';
import { DOWNLOAD_FILENAMES } from '@/config/downloads';

/**
 * Generate exam data template Excel file with 4 versions and 20 questions
 */
export function generateExamTemplate(): void {
  // Template data with 4 exam versions (001, 002, 003, 004)
  // 20 questions, 5 students per version
  const templateData = [
    // Solution rows (ID = "0", Code = actual version)
    {
      ID: '0',
      Code: '001',
      '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E',
      '6': 'A', '7': 'B', '8': 'C', '9': 'D', '10': 'E',
      '11': 'A', '12': 'B', '13': 'C', '14': 'D', '15': 'E',
      '16': 'A', '17': 'B', '18': 'C', '19': 'D', '20': 'E'
    },
    {
      ID: '0',
      Code: '002',
      '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'A',
      '6': 'B', '7': 'C', '8': 'D', '9': 'E', '10': 'A',
      '11': 'B', '12': 'C', '13': 'D', '14': 'E', '15': 'A',
      '16': 'B', '17': 'C', '18': 'D', '19': 'E', '20': 'A'
    },
    {
      ID: '0',
      Code: '003',
      '1': 'C', '2': 'D', '3': 'E', '4': 'A', '5': 'B',
      '6': 'C', '7': 'D', '8': 'E', '9': 'A', '10': 'B',
      '11': 'C', '12': 'D', '13': 'E', '14': 'A', '15': 'B',
      '16': 'C', '17': 'D', '18': 'E', '19': 'A', '20': 'B'
    },
    {
      ID: '0',
      Code: '004',
      '1': 'D', '2': 'E', '3': 'A', '4': 'B', '5': 'C',
      '6': 'D', '7': 'E', '8': 'A', '9': 'B', '10': 'C',
      '11': 'D', '12': 'E', '13': 'A', '14': 'B', '15': 'C',
      '16': 'D', '17': 'E', '18': 'A', '19': 'B', '20': 'C'
    },
    // Student answers - Version 001
    {
      ID: '202301001',
      Code: '001',
      '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E',
      '6': 'A', '7': 'B', '8': 'C', '9': 'D', '10': 'E',
      '11': 'A', '12': 'B', '13': 'C', '14': 'D', '15': 'E',
      '16': 'A', '17': 'B', '18': 'C', '19': 'D', '20': 'E'
    },
    {
      ID: '202301002',
      Code: '001',
      '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'A',
      '6': 'A', '7': 'B', '8': 'C', '9': 'D', '10': 'E',
      '11': 'A', '12': 'B', '13': 'C', '14': 'A', '15': 'E',
      '16': 'A', '17': 'B', '18': 'C', '19': 'D', '20': 'E'
    },
    {
      ID: '202301003',
      Code: '001',
      '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E',
      '6': 'B', '7': 'B', '8': 'C', '9': 'D', '10': 'E',
      '11': 'A', '12': 'C', '13': 'C', '14': 'D', '15': 'E',
      '16': 'A', '17': 'B', '18': 'D', '19': 'D', '20': 'E'
    },
    {
      ID: '202301004',
      Code: '001',
      '1': 'B', '2': 'B', '3': 'C', '4': 'D', '5': 'E',
      '6': 'A', '7': 'A', '8': 'C', '9': 'D', '10': 'E',
      '11': 'A', '12': 'B', '13': 'D', '14': 'D', '15': 'E',
      '16': 'A', '17': 'B', '18': 'C', '19': 'C', '20': 'E'
    },
    {
      ID: '202301005',
      Code: '001',
      '1': 'A', '2': 'C', '3': 'C', '4': 'E', '5': 'E',
      '6': 'A', '7': 'B', '8': 'D', '9': 'D', '10': 'A',
      '11': 'A', '12': 'B', '13': 'C', '14': 'D', '15': 'B',
      '16': 'A', '17': 'B', '18': 'C', '19': 'D', '20': 'C'
    },
    // Student answers - Version 002
    {
      ID: '202302001',
      Code: '002',
      '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'A',
      '6': 'B', '7': 'C', '8': 'D', '9': 'E', '10': 'A',
      '11': 'B', '12': 'C', '13': 'D', '14': 'E', '15': 'A',
      '16': 'B', '17': 'C', '18': 'D', '19': 'E', '20': 'A'
    },
    {
      ID: '202302002',
      Code: '002',
      '1': 'B', '2': 'C', '3': 'D', '4': 'A', '5': 'A',
      '6': 'B', '7': 'C', '8': 'D', '9': 'E', '10': 'B',
      '11': 'B', '12': 'C', '13': 'D', '14': 'E', '15': 'A',
      '16': 'B', '17': 'C', '18': 'D', '19': 'A', '20': 'A'
    },
    {
      ID: '202302003',
      Code: '002',
      '1': 'A', '2': 'C', '3': 'D', '4': 'E', '5': 'A',
      '6': 'B', '7': 'D', '8': 'D', '9': 'E', '10': 'A',
      '11': 'C', '12': 'C', '13': 'D', '14': 'E', '15': 'A',
      '16': 'B', '17': 'B', '18': 'D', '19': 'E', '20': 'A'
    },
    {
      ID: '202302004',
      Code: '002',
      '1': 'B', '2': 'D', '3': 'D', '4': 'E', '5': 'B',
      '6': 'B', '7': 'C', '8': 'E', '9': 'E', '10': 'A',
      '11': 'B', '12': 'C', '13': 'E', '14': 'E', '15': 'A',
      '16': 'B', '17': 'C', '18': 'D', '19': 'D', '20': 'A'
    },
    {
      ID: '202302005',
      Code: '002',
      '1': 'B', '2': 'C', '3': 'A', '4': 'E', '5': 'A',
      '6': 'C', '7': 'C', '8': 'D', '9': 'A', '10': 'A',
      '11': 'B', '12': 'D', '13': 'D', '14': 'E', '15': 'B',
      '16': 'B', '17': 'C', '18': 'E', '19': 'E', '20': 'A'
    },
    // Student answers - Version 003
    {
      ID: '202303001',
      Code: '003',
      '1': 'C', '2': 'D', '3': 'E', '4': 'A', '5': 'B',
      '6': 'C', '7': 'D', '8': 'E', '9': 'A', '10': 'B',
      '11': 'C', '12': 'D', '13': 'E', '14': 'A', '15': 'B',
      '16': 'C', '17': 'D', '18': 'E', '19': 'A', '20': 'B'
    },
    {
      ID: '202303002',
      Code: '003',
      '1': 'C', '2': 'D', '3': 'E', '4': 'B', '5': 'B',
      '6': 'C', '7': 'D', '8': 'E', '9': 'A', '10': 'C',
      '11': 'C', '12': 'D', '13': 'E', '14': 'A', '15': 'B',
      '16': 'C', '17': 'D', '18': 'E', '19': 'B', '20': 'B'
    },
    {
      ID: '202303003',
      Code: '003',
      '1': 'B', '2': 'D', '3': 'E', '4': 'A', '5': 'B',
      '6': 'C', '7': 'E', '8': 'E', '9': 'A', '10': 'B',
      '11': 'D', '12': 'D', '13': 'E', '14': 'A', '15': 'B',
      '16': 'C', '17': 'C', '18': 'E', '19': 'A', '20': 'B'
    },
    {
      ID: '202303004',
      Code: '003',
      '1': 'C', '2': 'E', '3': 'E', '4': 'A', '5': 'C',
      '6': 'C', '7': 'D', '8': 'A', '9': 'A', '10': 'B',
      '11': 'C', '12': 'D', '13': 'A', '14': 'A', '15': 'B',
      '16': 'C', '17': 'D', '18': 'E', '19': 'E', '20': 'B'
    },
    {
      ID: '202303005',
      Code: '003',
      '1': 'C', '2': 'D', '3': 'B', '4': 'A', '5': 'B',
      '6': 'D', '7': 'D', '8': 'E', '9': 'B', '10': 'B',
      '11': 'C', '12': 'E', '13': 'E', '14': 'A', '15': 'C',
      '16': 'C', '17': 'D', '18': 'A', '19': 'A', '20': 'B'
    },
    // Student answers - Version 004
    {
      ID: '202304001',
      Code: '004',
      '1': 'D', '2': 'E', '3': 'A', '4': 'B', '5': 'C',
      '6': 'D', '7': 'E', '8': 'A', '9': 'B', '10': 'C',
      '11': 'D', '12': 'E', '13': 'A', '14': 'B', '15': 'C',
      '16': 'D', '17': 'E', '18': 'A', '19': 'B', '20': 'C'
    },
    {
      ID: '202304002',
      Code: '004',
      '1': 'D', '2': 'E', '3': 'A', '4': 'C', '5': 'C',
      '6': 'D', '7': 'E', '8': 'A', '9': 'B', '10': 'D',
      '11': 'D', '12': 'E', '13': 'A', '14': 'B', '15': 'C',
      '16': 'D', '17': 'E', '18': 'A', '19': 'C', '20': 'C'
    },
    {
      ID: '202304003',
      Code: '004',
      '1': 'C', '2': 'E', '3': 'A', '4': 'B', '5': 'C',
      '6': 'D', '7': 'A', '8': 'A', '9': 'B', '10': 'C',
      '11': 'E', '12': 'E', '13': 'A', '14': 'B', '15': 'C',
      '16': 'D', '17': 'D', '18': 'A', '19': 'B', '20': 'C'
    },
    {
      ID: '202304004',
      Code: '004',
      '1': 'D', '2': 'A', '3': 'A', '4': 'B', '5': 'D',
      '6': 'D', '7': 'E', '8': 'B', '9': 'B', '10': 'C',
      '11': 'D', '12': 'E', '13': 'B', '14': 'B', '15': 'C',
      '16': 'D', '17': 'E', '18': 'A', '19': 'A', '20': 'C'
    },
    {
      ID: '202304005',
      Code: '004',
      '1': 'D', '2': 'E', '3': 'B', '4': 'B', '5': 'C',
      '6': 'E', '7': 'E', '8': 'A', '9': 'C', '10': 'C',
      '11': 'D', '12': 'A', '13': 'A', '14': 'B', '15': 'D',
      '16': 'D', '17': 'E', '18': 'B', '19': 'B', '20': 'C'
    }
  ];

  // Define column order: ID, Code, then question numbers (1-20)
  const headers = ['ID', 'Code', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
                   '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

  // Create workbook and worksheet with specified column order
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateData, { header: headers });

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Exam Data');

  // Generate buffer
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Create blob and download
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DOWNLOAD_FILENAMES.templates.examDataTemplate;
  link.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Generate Item Analysis template (Normal format - without permutation)
 * For basic cross-version analysis only
 */
export function generateItemAnalysisNormalTemplate(): void {
  const csvContent = `Version,Version Q#,Master Q#
001,1,1
001,2,2
001,3,3
001,4,4
001,5,5
001,6,6
001,7,7
001,8,8
001,9,9
001,10,10
002,1,2
002,2,3
002,3,4
002,4,5
002,5,1
002,6,7
002,7,8
002,8,9
002,9,10
002,10,6
003,1,3
003,2,4
003,3,5
003,4,1
003,5,2
003,6,8
003,7,9
003,8,10
003,9,6
003,10,7
004,1,4
004,2,5
004,3,1
004,4,2
004,5,3
004,6,9
004,7,10
004,8,6
004,9,7
004,10,8`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DOWNLOAD_FILENAMES.templates.itemAnalysisNormal;
  link.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Generate Item Analysis template (With Permutation format)
 * For comprehensive psychometric analysis
 */
export function generateItemAnalysisWithPermutationTemplate(): void {
  const csvContent = `Version,Version Q#,Master Q#,Permutation,Correct
001,1,1,ABCDE,A
001,2,2,ABCDE,B
001,3,3,ABCDE,C
001,4,4,ABCDE,D
001,5,5,ABCDE,E
001,6,6,ABCDE,A
001,7,7,ABCDE,B
001,8,8,ABCDE,C
001,9,9,ABCDE,D
001,10,10,ABCDE,E
002,1,2,BCDEA,B
002,2,3,CDEAB,C
002,3,4,DEABC,D
002,4,5,EABCD,E
002,5,1,BCDEA,A
002,6,7,CDEAB,B
002,7,8,DEABC,C
002,8,9,EABCD,D
002,9,10,BCDEA,E
002,10,6,CDEAB,A
003,1,3,CDEAB,C
003,2,4,DEABC,D
003,3,5,EABCD,E
003,4,1,BCDEA,A
003,5,2,CDEAB,B
003,6,8,EABCD,C
003,7,9,BCDEA,D
003,8,10,CDEAB,E
003,9,6,DEABC,A
003,10,7,EABCD,B
004,1,4,DEABC,D
004,2,5,EABCD,E
004,3,1,BCDEA,A
004,4,2,CDEAB,B
004,5,3,DEABC,C
004,6,9,BCDEA,D
004,7,10,CDEAB,E
004,8,6,DEABC,A
004,9,7,EABCD,B
004,10,8,BCDEA,C`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DOWNLOAD_FILENAMES.templates.itemAnalysisWithPermutation;
  link.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Generate Item Analysis template (WIDE format)
 * Option-level permutation tracking for complex randomized exams
 */
export function generateItemAnalysisWideTemplate(): void {
  const csvContent = `Q,Option,Master_Correct,version_1_Q,version_1_Opt,version_2_Q,version_2_Opt,version_3_Q,version_3_Opt,version_4_Q,version_4_Opt
1,A,YES,1,A,5,B,4,C,3,D
1,B,,1,B,5,C,4,D,3,E
1,C,,1,C,5,D,4,E,3,A
1,D,,1,D,5,E,4,A,3,B
1,E,,1,E,5,A,4,B,3,C
2,A,,2,A,1,B,2,C,5,D
2,B,YES,2,B,1,C,2,D,5,E
2,C,,2,C,1,D,2,E,5,A
2,D,,2,D,1,E,2,A,5,B
2,E,,2,E,1,A,2,B,5,C
3,A,,3,A,2,B,3,C,1,D
3,B,,3,B,2,C,3,D,1,E
3,C,YES,3,C,2,D,3,E,1,A
3,D,,3,D,2,E,3,A,1,B
3,E,,3,E,2,A,3,B,1,C
4,A,,4,A,3,B,1,C,2,D
4,B,,4,B,3,C,1,D,2,E
4,C,,4,C,3,D,1,E,2,A
4,D,YES,4,D,3,E,1,A,2,B
4,E,,4,E,3,A,1,B,2,C
5,A,,5,A,4,B,5,C,4,D
5,B,,5,B,4,C,5,D,4,E
5,C,,5,C,4,D,5,E,4,A
5,D,,5,D,4,E,5,A,4,B
5,E,YES,5,E,4,A,5,B,4,C
6,A,YES,6,A,10,B,9,C,8,D
6,B,,6,B,10,C,9,D,8,E
6,C,,6,C,10,D,9,E,8,A
6,D,,6,D,10,E,9,A,8,B
6,E,,6,E,10,A,9,B,8,C
7,A,,7,A,6,B,7,C,10,D
7,B,YES,7,B,6,C,7,D,10,E
7,C,,7,C,6,D,7,E,10,A
7,D,,7,D,6,E,7,A,10,B
7,E,,7,E,6,A,7,B,10,C
8,A,,8,A,7,B,8,C,6,D
8,B,,8,B,7,C,8,D,6,E
8,C,YES,8,C,7,D,8,E,6,A
8,D,,8,D,7,E,8,A,6,B
8,E,,8,E,7,A,8,B,6,C
9,A,,9,A,8,B,6,C,7,D
9,B,,9,B,8,C,6,D,7,E
9,C,,9,C,8,D,6,E,7,A
9,D,YES,9,D,8,E,6,A,7,B
9,E,,9,E,8,A,6,B,7,C
10,A,,10,A,9,B,10,C,9,D
10,B,,10,B,9,C,10,D,9,E
10,C,,10,C,9,D,10,E,9,A
10,D,,10,D,9,E,10,A,9,B
10,E,YES,10,E,9,A,10,B,9,C`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = DOWNLOAD_FILENAMES.templates.itemAnalysisWide;
  link.click();
  window.URL.revokeObjectURL(url);
}
