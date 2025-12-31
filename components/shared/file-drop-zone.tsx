'use client';

import { useState, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  title?: string;
  description?: string;
  maxSizeMB?: number;
  disabled?: boolean;
}

export function FileDropZone({
  onFileSelect,
  accept = '.xls,.xlsx,.csv,.txt',
  title = 'Upload File',
  description = 'Drag and drop or click to browse',
  maxSizeMB,
  disabled = false,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [disabled, onFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
      // Reset input to allow re-uploading same file
      e.target.value = '';
    },
    [onFileSelect]
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed rounded-lg p-12 text-center transition-colors',
        isDragging
          ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-950',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Upload Icon */}
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <Upload className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {description}
          {maxSizeMB && (
            <>
              {' • '}
              <span className="text-gray-500 dark:text-gray-500">
                Max {maxSizeMB}MB
              </span>
            </>
          )}
        </p>

        {/* Choose File Button */}
        <label htmlFor="file-upload">
          <Button
            type="button"
            onClick={() => document.getElementById('file-upload')?.click()}
            disabled={disabled}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Choose File
          </Button>
        </label>

        {/* Hidden File Input */}
        <input
          id="file-upload"
          type="file"
          accept={accept}
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />
      </div>
    </div>
  );
}
