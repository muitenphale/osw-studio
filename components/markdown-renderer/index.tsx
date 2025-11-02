'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { normalizeContent } from './content-normalizer';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  skipNormalization?: boolean;
}

export function MarkdownRenderer({ content, className, skipNormalization = false }: MarkdownRendererProps) {
  // Normalize content to fix common LLM formatting issues
  const processedContent = skipNormalization ? content : normalizeContent(content);

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        components={{
        h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 mt-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mb-1 mt-2">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-semibold mb-1 mt-2">{children}</h4>,

        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm">{children}</li>,

        pre: ({ children, ...props }) => {
          // Handle indented code blocks (4+ spaces) from ReactMarkdown
          // These should render as regular text, not code blocks
          return (
            <pre className="p-3 rounded-md bg-muted overflow-x-auto mb-2" {...props}>
              {children}
            </pre>
          );
        },

        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match;

          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }

          // Fenced code block with language
          return (
            <code className="font-mono text-xs" {...props}>
              {children}
            </code>
          );
        },
        
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 py-0.5 mb-2 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        
        a: ({ href, children }) => (
          <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        
        em: ({ children }) => <em className="italic">{children}</em>,
        
        hr: () => <hr className="my-3 border-muted" />,
        
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full divide-y divide-muted">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/30">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-muted">{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => <th className="px-2 py-1 text-left text-xs font-medium">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 text-xs">{children}</td>,
      }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}