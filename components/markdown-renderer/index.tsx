'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { normalizeContent } from './content-normalizer';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Helper to generate slug from heading text
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start
    .replace(/-+$/, '');      // Trim - from end
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  skipNormalization?: boolean;
}

export function MarkdownRenderer({ content, className, skipNormalization = false }: MarkdownRendererProps) {
  const router = useRouter();

  // Normalize content to fix common LLM formatting issues
  const processedContent = skipNormalization ? content : normalizeContent(content);

  // Pre-calculate all heading data from the markdown
  // This runs once per content change and is stable across re-renders
  const headingData = React.useMemo(() => {
    const lines = processedContent.split('\n');
    const headings: Array<{ level: number; text: string; index: number }> = [];
    let index = 0;

    for (const line of lines) {
      // Match H2, H3, H4 (skip H1 as it's not in TOC)
      const match = line.match(/^(#{2,4})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          index: index++,
        });
      }
    }

    return headings;
  }, [processedContent]);

  // Create a map from heading text to index for quick lookup during render
  const headingIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    headingData.forEach(h => {
      const key = `${h.level}-${h.text}`;
      if (!map.has(key)) {
        map.set(key, h.index);
      }
    });
    return map;
  }, [headingData]);

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        h1: ({ children }) => {
          const text = children?.toString() || '';
          const id = slugify(text);
          return <h1 id={id} className="text-3xl font-bold mb-4 mt-8 first:mt-0">{children}</h1>;
        },
        h2: ({ children }) => {
          const text = children?.toString() || '';
          const id = slugify(text);
          const key = `2-${text}`;
          const index = headingIndexMap.get(key);
          return (
            <h2
              id={id}
              data-heading-index={index}
              className="text-2xl font-bold mb-3 mt-8 pb-2 border-b border-border/50 first:mt-0"
            >
              {children}
            </h2>
          );
        },
        h3: ({ children }) => {
          const text = children?.toString() || '';
          const id = slugify(text);
          const key = `3-${text}`;
          const index = headingIndexMap.get(key);
          return (
            <h3
              id={id}
              data-heading-index={index}
              className="text-xl font-semibold mb-2 mt-6"
            >
              {children}
            </h3>
          );
        },
        h4: ({ children }) => {
          const text = children?.toString() || '';
          const id = slugify(text);
          const key = `4-${text}`;
          const index = headingIndexMap.get(key);
          return (
            <h4
              id={id}
              data-heading-index={index}
              className="text-lg font-semibold mb-2 mt-4"
            >
              {children}
            </h4>
          );
        },

        p: ({ children }) => <p className="mb-4 leading-relaxed last:mb-0">{children}</p>,

        ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>,
        li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,

        pre: ({ children, ...props }) => {
          // Extract language from code block if present
          const codeElement = React.Children.toArray(children).find(
            (child) => React.isValidElement(child) && child.type === 'code'
          ) as React.ReactElement<{ className?: string }> | undefined;

          const className = codeElement?.props?.className || '';
          const match = /language-(\w+)/.exec(className);
          const language = match ? match[1] : null;

          return (
            <div className="relative mb-4 group">
              {language && (
                <div className="absolute top-2 right-2 px-2 py-1 text-xs font-medium text-muted-foreground bg-background/80 rounded border border-border/50 backdrop-blur-sm">
                  {language}
                </div>
              )}
              <pre className="p-4 rounded-lg bg-muted/50 border border-border/50 overflow-x-auto" {...props}>
                {children}
              </pre>
            </div>
          );
        },

        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match;

          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/30 font-mono text-xs" {...props}>
                {children}
              </code>
            );
          }

          // Fenced code block with language
          return (
            <code className="font-mono text-xs block" {...props}>
              {children}
            </code>
          );
        },
        
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary/30 bg-muted/30 pl-4 pr-4 py-3 mb-4 italic text-muted-foreground rounded-r">
            {children}
          </blockquote>
        ),
        
        a: ({ href, children }) => {
          if (!href) return <a>{children}</a>;

          // Internal doc links (?doc=...)
          const isInternalDoc = href.startsWith('?doc=');
          // Internal navigation links (?nav=...)
          const isNavLink = href.startsWith('?nav=');
          // Anchor links within page (#...)
          const isAnchorLink = href.startsWith('#');
          // External links (http://, https://)
          const isExternal = href.startsWith('http://') || href.startsWith('https://');

          // Internal links (doc links, nav links, or anchors) stay in same tab
          const shouldOpenNewTab = isExternal;

          // Handle special link types with router navigation
          const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (isInternalDoc) {
              e.preventDefault();
              router.push(`/${href}`);
            } else if (isNavLink) {
              e.preventDefault();
              const view = href.replace('?nav=', '');
              const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

              if (isServerMode) {
                router.push(`/admin/${view}`);
              } else {
                // Browser mode - dispatch event for navigation
                window.dispatchEvent(new CustomEvent('nav-to-view', { detail: { view } }));
                router.push('/');
              }
            }
          };

          return (
            <a
              href={href}
              onClick={handleClick}
              className={cn(
                "text-primary hover:underline cursor-pointer",
                isExternal && "inline-flex items-center gap-1"
              )}
              target={shouldOpenNewTab ? '_blank' : undefined}
              rel={shouldOpenNewTab ? 'noopener noreferrer' : undefined}
            >
              {children}
              {isExternal && <ExternalLink className="h-3 w-3 inline" />}
            </a>
          );
        },
        
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        
        em: ({ children }) => <em className="italic">{children}</em>,
        
        hr: () => <hr className="my-8 border-border" />,

        table: ({ children }) => (
          <div className="overflow-x-auto mb-6 rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-border bg-background">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
        th: ({ children }) => <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide">{children}</th>,
        td: ({ children }) => <td className="px-4 py-3 text-sm">{children}</td>,
      }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}