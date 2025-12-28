/**
 * Download file names configuration
 * Edit downloads.json to customize file names
 */

import downloadConfig from './downloads.json';

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

// Type-safe export of download configuration
export const DOWNLOAD_FILENAMES: DownloadConfig = downloadConfig as DownloadConfig;
