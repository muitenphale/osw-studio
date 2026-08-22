// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../extract';

describe('htmlToMarkdown', () => {
  it('extracts readable content and converts to markdown', () => {
    const html = `<html><body><article><h1>Title</h1><p>Hello <a href="https://x.com">link</a>.</p></article></body></html>`;
    const md = htmlToMarkdown(html, 'https://example.com/post');
    expect(md).toContain('# Title');
    expect(md).toContain('[link](https://x.com)');
  });

  it('falls back to raw text when extraction yields nothing', () => {
    const md = htmlToMarkdown('<div>bare</div>', 'https://example.com');
    expect(md).toContain('bare');
  });
});
