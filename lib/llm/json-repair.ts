/**
 * JSON Repair Utility
 * Attempts to repair truncated JSON from LLM responses that hit max_tokens
 */

import { logger } from '../utils';

export interface JSONRepairResult {
  success: boolean;
  repaired?: any;
  originalLength: number;
  repairedLength?: number;
  error?: string;
}

export type OperationSafety = 'safe' | 'unsafe' | 'unknown';

export interface PartialContentExtraction {
  success: boolean;
  content?: string;
  filePath?: string;
  operationType?: string;
  error?: string;
}

/**
 * Extract partial content from truncated JSON for continuation
 * Even if JSON repair fails, we can often salvage the content string
 * for buffering and continuation.
 */
export function extractPartialContent(truncatedJSON: string): PartialContentExtraction {
  // Try to extract file_path
  const filePathMatch = truncatedJSON.match(/"file_path"\s*:\s*"([^"]+)"/);
  const filePath = filePathMatch?.[1];

  // Try to extract operation type
  const typeMatch = truncatedJSON.match(/"type"\s*:\s*"(rewrite|update|replace_entity)"/);
  const operationType = typeMatch?.[1];

  // For rewrite operations, extract the content even if truncated
  if (operationType === 'rewrite') {
    // Look for "content": " and extract everything after
    const contentStartMatch = truncatedJSON.match(/"content"\s*:\s*"/);
    if (contentStartMatch) {
      const contentStartIndex = truncatedJSON.indexOf(contentStartMatch[0]) + contentStartMatch[0].length;
      let content = truncatedJSON.slice(contentStartIndex);

      // Remove trailing incomplete escape sequences
      // e.g., ends with \ or \u or \u0 etc.
      content = content.replace(/\\(?:[^"\\\/bfnrt]|u[0-9a-fA-F]{0,3})?$/, '');

      // Check if content ends with a closing quote (complete string)
      const lastQuoteIndex = content.lastIndexOf('"');
      if (lastQuoteIndex > 0) {
        // Check if the quote is not escaped
        let escapeCount = 0;
        for (let i = lastQuoteIndex - 1; i >= 0 && content[i] === '\\'; i--) {
          escapeCount++;
        }
        if (escapeCount % 2 === 0) {
          // This is an unescaped quote - content is complete up to this point
          content = content.slice(0, lastQuoteIndex);
        }
      }

      // Unescape JSON strings
      try {
        // Try to parse as a JSON string for proper unescaping
        content = JSON.parse(`"${content}"`);
      } catch {
        // Manual unescape for common sequences if JSON.parse fails
        content = content
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }

      if (content.length > 0) {
        return {
          success: true,
          content,
          filePath,
          operationType
        };
      }
    }
  }

  // For update operations, try to extract newStr (but mark as unsafe for auto-continue)
  if (operationType === 'update') {
    const newStrMatch = truncatedJSON.match(/"newStr"\s*:\s*"([\s\S]*?)(?:"|$)/);
    if (newStrMatch) {
      return {
        success: false,
        filePath,
        operationType,
        error: 'Update operations cannot be safely continued - oldStr matching would fail'
      };
    }
  }

  // For replace_entity operations, similar issue
  if (operationType === 'replace_entity') {
    return {
      success: false,
      filePath,
      operationType,
      error: 'Replace entity operations cannot be safely continued - selector matching would fail'
    };
  }

  return {
    success: false,
    filePath,
    operationType,
    error: 'Could not extract content from truncated JSON'
  };
}

/**
 * Get the last N characters of content as a continuation marker
 * Used to help the LLM know where to continue from
 */
export function getContinuationMarker(content: string, chars: number = 100): string {
  if (content.length <= chars) {
    return content;
  }
  // Try to find a good break point (newline)
  const lastSection = content.slice(-chars);
  const newlineIndex = lastSection.indexOf('\n');
  if (newlineIndex > 0) {
    return lastSection.slice(newlineIndex + 1);
  }
  return lastSection;
}

/**
 * Check if an error is a JSON truncation error
 */
export function isJSONTruncationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('unterminated string') ||
    message.includes('unexpected end of json') ||
    message.includes('unexpected end of input') ||
    message.includes('unexpected token')
  );
}

/**
 * Attempt to repair truncated JSON
 * Tries various closing strategies to create valid JSON
 */
export function attemptJSONRepair(truncatedJSON: string): JSONRepairResult {
  const originalLength = truncatedJSON.length;

  // Strategy 1: Close unterminated string, then close all open structures
  const repairs = [
    // Just close strings and structures
    (json: string) => json + '"}]}',
    (json: string) => json + '"}]}}',
    (json: string) => json + '"]}}',
    (json: string) => json + '"}',
    (json: string) => json + '"}}',
    (json: string) => json + '"]',
    (json: string) => json + ']}',
    (json: string) => json + '}}',
    (json: string) => json + ']',
    (json: string) => json + '}',
    // Try without closing string first (might already be closed)
    (json: string) => json + ']}}',
    (json: string) => json + '}}',
  ];

  for (const repairFn of repairs) {
    try {
      const repaired = repairFn(truncatedJSON);
      const parsed = JSON.parse(repaired);

      return {
        success: true,
        repaired: parsed,
        originalLength,
        repairedLength: repaired.length
      };
    } catch {
      // Try next strategy
      continue;
    }
  }

  return {
    success: false,
    originalLength,
    error: 'Could not repair JSON - all strategies failed'
  };
}

/**
 * Format byte size in human-readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Analyze operation types to determine if auto-repair is safe
 */
export function analyzeOperationType(operations: any[]): OperationSafety {
  if (!Array.isArray(operations) || operations.length === 0) {
    return 'unknown';
  }

  const hasUnsafeOps = operations.some(op => {
    const type = op?.type;
    // These operations require complete, exact content - unsafe to auto-repair
    return type === 'update' || type === 'replace_entity';
  });

  if (hasUnsafeOps) {
    return 'unsafe';
  }

  const allSafeOps = operations.every(op => {
    const type = op?.type;
    // These operations can be continued/appended to - safe to auto-repair
    return type === 'rewrite';
  });

  if (allSafeOps) {
    return 'safe';
  }

  return 'unknown';
}

/**
 * Generate helpful continuation message for the LLM
 */
export function generateContinuationMessage(
  result: string,
  filePath: string,
  operations: any[],
  originalLength: number
): string {
  const tokenEstimate = Math.ceil(originalLength / 4);
  const sizeEstimate = formatBytes(originalLength);
  const firstOpType = operations[0]?.type || 'unknown';

  return `${result}

⚠️ NOTE: Tool call was truncated due to max_tokens limit and auto-repaired.
The operation executed successfully, but the content may be incomplete.

📊 Size: ~${sizeEstimate} (≈${tokenEstimate} tokens)
📁 File: ${filePath}
🔧 Operation: ${firstOpType}

📝 Next steps:
1. Verify if the file content is complete
2. If incomplete, continue with additional write operations
3. Use multiple smaller operations (aim for <2KB / ~500 tokens each)

Example continuation for ${filePath}:
{"file_path": "${filePath}", "operations": [{"type": "rewrite", "content": "...remaining content..."}]}

💡 Tip: Split large files into sections to avoid hitting token limits.`;
}

/**
 * Generate error message for unsafe operations
 */
export function generateUnsafeOperationError(
  operations: any[],
  originalLength: number
): string {
  const tokenEstimate = Math.ceil(originalLength / 4);
  const sizeEstimate = formatBytes(originalLength);
  const unsafeOps = operations
    .filter(op => op?.type === 'update' || op?.type === 'replace_entity')
    .map(op => op.type);

  return `Error: Tool call JSON was truncated and contains unsafe operation types.

📊 Attempted size: ~${sizeEstimate} (≈${tokenEstimate} tokens)
🚫 Unsafe operations detected: ${[...new Set(unsafeOps)].join(', ')}

Why this failed:
• 'update' operations require exact, complete oldStr/newStr - partial content = wrong match
• 'replace_entity' operations need complete selectors - partial patterns = wrong entity match
• Auto-repair would corrupt your file with incomplete/incorrect changes

💡 Solution: Split into smaller write operations
1. Each operation should be <2KB (≈500 tokens)
2. Use multiple sequential tool calls for large changes
3. For rewrites, split content into logical sections

Example - Instead of one large operation:
❌ {"operations": [{"type": "update", "oldStr": "...4KB...", "newStr": "...4KB..."}]}

✅ Use multiple smaller operations:
{"operations": [{"type": "update", "oldStr": "...section1...", "newStr": "...new1..."}]}
{"operations": [{"type": "update", "oldStr": "...section2...", "newStr": "...new2..."}]}

Or use rewrite for complete file replacement (can be continued if truncated).`;
}
