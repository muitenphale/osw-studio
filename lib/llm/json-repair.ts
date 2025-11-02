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
 * Estimate token count (rough approximation)
 * Generally: 1 token ≈ 4 characters for English text
 */
export function estimateTokenCount(str: string): number {
  return Math.ceil(str.length / 4);
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
  const tokenEstimate = estimateTokenCount(String(originalLength));
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
2. If incomplete, continue with additional json_patch operations
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
  const tokenEstimate = estimateTokenCount(String(originalLength));
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

💡 Solution: Split into smaller json_patch operations
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
