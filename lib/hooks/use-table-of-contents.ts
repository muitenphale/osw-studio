import { useMemo } from 'react';

// Helper to generate slug from heading text (matches MarkdownRenderer)
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export interface TocItem {
  id: string; // Still used for URL hash
  text: string;
  level: number;
  index: number; // Unique index for DOM targeting
  children?: TocItem[];
}

export function useTableOfContents(markdown: string): TocItem[] {
  return useMemo(() => {
    if (!markdown) return [];

    const lines = markdown.split('\n');
    const headings: { level: number; text: string; id: string; index: number }[] = [];

    let headingIndex = 0;
    for (const line of lines) {
      // Match markdown headings (##, ###, etc.) but skip # (h1 - title only)
      const match = line.match(/^(#{2,4})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = slugify(text);
        headings.push({ level, text, id, index: headingIndex });
        headingIndex++;
      }
    }

    // Build hierarchical structure (h2 with nested h3)
    const toc: TocItem[] = [];
    let currentH2: TocItem | null = null;

    for (const heading of headings) {
      if (heading.level === 2) {
        currentH2 = {
          id: heading.id,
          text: heading.text,
          level: 2,
          index: heading.index,
          children: [],
        };
        toc.push(currentH2);
      } else if (heading.level === 3 && currentH2) {
        currentH2.children!.push({
          id: heading.id,
          text: heading.text,
          level: 3,
          index: heading.index,
        });
      }
      // Ignore h4 for cleaner TOC
    }

    return toc;
  }, [markdown]);
}
