/**
 * Content normalizer for LLM output before markdown rendering
 * Fixes formatting issues from models that output excessive whitespace
 */

/**
 * Normalizes content to fix common LLM output formatting issues
 * - Removes excessive leading whitespace that causes false code blocks
 * - Preserves intentional markdown formatting (fenced code blocks, lists, etc.)
 * - Normalizes excessive blank lines
 */
export function normalizeContent(content: string): string {
  if (!content || typeof content !== 'string') return '';

  const lines = content.split('\n');
  const normalized: string[] = [];
  let inFencedCodeBlock = false;
  let consecutiveBlankLines = 0;

  // Detect if a line is a fenced code block delimiter
  const isFencedCodeDelimiter = (line: string): boolean => {
    const trimmed = line.trim();
    return /^```/.test(trimmed);
  };

  // Detect if a line is an intentional list item
  const isListItem = (line: string): boolean => {
    const trimmed = line.trim();
    return /^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
  };

  // Detect if a line is an intentional blockquote
  const isBlockquote = (line: string): boolean => {
    return /^\s*>/.test(line);
  };

  // Detect if line is likely code (heuristic)
  const looksLikeCode = (line: string): boolean => {
    const trimmed = line.trim();
    // Empty lines or very short lines are not code
    if (!trimmed || trimmed.length < 3) return false;

    // Check for code-like patterns
    const codePatterns = [
      /^(const|let|var|function|class|import|export|return|if|for|while)\s/,
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[=:({]/,
      /[{};()[\]]/,
      /^\/\//,
      /^#/,
    ];

    return codePatterns.some(pattern => pattern.test(trimmed));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code block state
    if (isFencedCodeDelimiter(line)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      normalized.push(line);
      consecutiveBlankLines = 0;
      continue;
    }

    // Inside fenced code blocks, preserve everything as-is
    if (inFencedCodeBlock) {
      normalized.push(line);
      consecutiveBlankLines = 0;
      continue;
    }

    // Handle blank lines
    if (!line.trim()) {
      consecutiveBlankLines++;
      // Allow max 2 consecutive blank lines
      if (consecutiveBlankLines <= 2) {
        normalized.push('');
      }
      continue;
    }

    consecutiveBlankLines = 0;

    // Preserve list items with their indentation
    if (isListItem(line)) {
      normalized.push(line);
      continue;
    }

    // Preserve blockquotes
    if (isBlockquote(line)) {
      normalized.push(line);
      continue;
    }

    // Check for excessive leading whitespace
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;

    // If line has 4+ leading spaces and doesn't look like code, trim it
    if (leadingSpaces >= 4 && !looksLikeCode(line)) {
      // This is likely accidental indentation from the model
      normalized.push(line.trim());
      continue;
    }

    // If line has 2-3 leading spaces, reduce to 0 (likely unintentional)
    if (leadingSpaces >= 2 && leadingSpaces < 4) {
      normalized.push(line.trim());
      continue;
    }

    // Otherwise preserve the line as-is
    normalized.push(line);
  }

  return normalized.join('\n').trim();
}
