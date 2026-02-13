'use client';

import React, { useRef, useState } from 'react';
import { Camera, ImageUp, X, Loader2 } from 'lucide-react';
import { compressImage } from '@/lib/utils/image-compress';
import { cn } from '@/lib/utils';

interface ThumbnailAreaProps {
  image: string | undefined;
  onCapture?: () => Promise<string | null>;  // undefined = capture unavailable
  onImageChange: (image: string | undefined) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function ThumbnailArea({
  image,
  onCapture,
  onImageChange,
  size = 'md',
  className,
}: ThumbnailAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      onImageChange(compressed);
    } catch {
      // silently fail — user can retry
    }
    // Reset input so re-selecting the same file triggers onChange
    e.target.value = '';
  };

  const handleCapture = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onCapture) return;
    setIsCapturing(true);
    try {
      const result = await onCapture();
      if (result) onImageChange(result);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onImageChange(undefined);
  };

  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const isSm = size === 'sm';

  const btnBase = isSm
    ? 'h-5 w-5 rounded'
    : 'h-7 w-7 rounded-md';

  const iconSize = isSm ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  if (image) {
    return (
      <div className={cn('relative group', className)} onClick={stopProp}>
        {isSm ? (
          <div className="w-16 h-12 rounded-md overflow-hidden bg-muted shrink-0">
            <img src={image} alt="Thumbnail" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-video bg-muted">
            <img src={image} alt="Thumbnail" className="w-full h-full object-cover" />
          </div>
        )}
        <button
          type="button"
          onClick={handleRemove}
          className={cn(
            'absolute flex items-center justify-center bg-background/80 text-foreground opacity-0 group-hover:opacity-100 transition-opacity border border-border shadow-sm',
            btnBase,
            isSm ? 'top-0 right-0 -translate-y-1/3 translate-x-1/3' : 'top-1.5 right-1.5'
          )}
          title="Remove thumbnail"
        >
          <X className={iconSize} />
        </button>
      </div>
    );
  }

  // No image state
  return (
    <div className={cn('relative', className)} onClick={stopProp}>
      {isSm ? (
        <div className="w-16 h-12 rounded-md bg-muted flex items-center justify-center gap-1 shrink-0">
          {onCapture && (
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 transition-colors"
              title="Capture"
            >
              {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleUploadClick}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 transition-colors"
            title="Upload image"
          >
            <ImageUp className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="w-full aspect-video bg-muted flex items-center justify-center gap-3">
          {onCapture && (
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="h-9 w-9 rounded-lg flex items-center justify-center border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors shadow-sm"
              title="Capture screenshot"
            >
              {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleUploadClick}
            className="h-9 w-9 rounded-lg flex items-center justify-center border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors shadow-sm"
            title="Upload image"
          >
            <ImageUp className="h-4 w-4" />
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
