import * as XLSX from 'xlsx';

/**
 * Generate exam data template Excel file
 */
export function generateExamTemplate(): void {
  // Template data matching the required format
  const templateData = [
    {
      ID: '000000000',
      Section: '00',
      Code: '005',
      '1': 'A',
      '2': 'E',
      '3': 'A',
      '4': 'E',
      '5': 'C',
      '6': 'E',
      '7': 'D',
      '8': 'E',
      '9': 'E',
      '10': 'E',
      '11': 'D',
      '12': 'D',
      '13': 'B',
      '14': 'C'
    },
    {
      ID: '000000000',
      Section: '00',
      Code: '006',
      '1': 'E',
      '2': 'E',
      '3': 'B',
      '4': 'A',
      '5': 'B',
      '6': 'E',
      '7': 'B',
      '8': 'A',
      '9': 'B',
      '10': 'D',
      '11': 'C',
      '12': 'A',
      '13': 'C',
      '14': 'C'
    },
    {
      ID: '100306520',
      Section: '02',
      Code: '005',
      '1': 'D',
      '2': 'D',
      '3': 'E',
      '4': 'E',
      '5': 'C',
      '6': 'E',
      '7': 'D',
      '8': 'E',
      '9': 'D',
      '10': 'E',
      '11': 'E',
      '12': 'C',
      '13': 'B',
      '14': 'A'
    },
    {
      ID: '100704682',
      Section: '01',
      Code: '005',
      '1': 'B',
      '2': 'D',
      '3': 'B',
      '4': 'E',
      '5': 'B',
      '6': 'E',
      '7': 'D',
      '8': 'D',
      '9': 'D',
      '10': 'A',
      '11': 'D',
      '12': 'A',
      '13': 'B',
      '14': 'A'
    }
  ];

  // Define column order: ID, Section, Code, then question numbers
  const headers = ['ID', 'Section', 'Code', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];

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
  link.download = 'exam_data_template.xlsx';
  link.click();
  window.URL.revokeObjectURL(url);
}
