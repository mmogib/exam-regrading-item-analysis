'use client';

import { useState, useCallback, useId, useRef } from 'react';
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
  /** Less padding, for use inside a dialog. */
  compact?: boolean;
}

/**
 * Why a file does not meet `accept` (file extensions such as ".csv") and
 * `maxSizeMB`, or null when it does. Applied to dropped and chosen files alike:
 * a file chooser's `accept` is only a hint, and drops bypass it entirely.
 */
export function fileRejection(file: File, accept: string, maxSizeMB?: number): string | null {
  const extensions = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.startsWith('.'));
  const name = file.name.toLowerCase();
  if (extensions.length > 0 && !extensions.some((ext) => name.endsWith(ext))) {
    return `"${file.name}" is not an accepted file type (${extensions.join(', ')}).`;
  }
  if (maxSizeMB !== undefined && file.size > maxSizeMB * 1024 * 1024) {
    return `"${file.name}" is larger than ${maxSizeMB} MB.`;
  }
  return null;
}

export function FileDropZone({
  onFileSelect,
  accept = '.xls,.xlsx,.csv,.txt',
  title = 'Upload File',
  description = 'Drag and drop or click to browse',
  maxSizeMB,
  disabled = false,
  compact = false,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  // Each instance has its own input, so two drop zones on one page never open each other's chooser
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const reason = fileRejection(file, accept, maxSizeMB);
      setRejection(reason);
      if (!reason) onFileSelect(file);
    },
    [accept, maxSizeMB, onFileSelect]
  );

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
        handleFile(files[0]);
      }
    },
    [disabled, handleFile]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
      // Reset input to allow re-uploading same file
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed rounded-lg text-center transition-colors',
        compact ? 'p-4' : 'p-12',
        isDragging
          ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-950',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className={cn('flex flex-col items-center', compact ? 'gap-2' : 'gap-4')}>
        {/* Upload Icon */}
        {!compact && (
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Upload className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
        )}

        {/* Title */}
        <h3 className={cn('font-semibold text-gray-900 dark:text-gray-100', compact ? 'text-sm' : 'text-lg')}>
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
        <Button
          type="button"
          size={compact ? 'sm' : 'default'}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          Choose File
        </Button>

        {rejection && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {rejection}
          </p>
        )}

        {/* Hidden File Input */}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          aria-label={title}
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />
      </div>
    </div>
  );
}
