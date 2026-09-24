'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DocsPageActionsProps {
  /** Raw Markdown source of the document being shown. */
  markdown: string;
}

export function DocsPageActions({ markdown }: DocsPageActionsProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const copyPage = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  // Served as text/plain from a Blob: browsers download text/markdown instead of showing it.
  const viewMarkdown = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/plain;charset=utf-8' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="flex items-center shrink-0">
      <Button
        variant="outline"
        size="sm"
        onClick={copyPage}
        className="rounded-r-none border-r-0"
        aria-label="Copy page"
      >
        {copied ? <Check className="h-4 w-4 sm:mr-2" /> : <Copy className="h-4 w-4 sm:mr-2" />}
        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy page'}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-l-none px-2" aria-label="Open page actions">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={copyPage} className="items-start gap-3 py-2">
            <Copy className="h-4 w-4 mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span>Copy page</span>
              <span className="text-xs text-muted-foreground">Copy page as Markdown for LLMs</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={viewMarkdown} className="items-start gap-3 py-2">
            <FileText className="h-4 w-4 mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span>View as Markdown</span>
              <span className="text-xs text-muted-foreground">Open this page as plain text</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
