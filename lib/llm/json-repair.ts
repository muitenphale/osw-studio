/**
 * JSON Repair Utility
 * Attempts to repair truncated JSON from LLM responses that hit max_tokens
 */

export interface JSONRepairResult {
  success: boolean;
  repaired?: any;
  originalLength: number;
  repairedLength?: number;
  error?: string;
}

/**
 * Check if an error is a JSON parse error from malformed LLM output.
 * Covers truncation (hit max_tokens) AND encoding errors (unescaped quotes in content).
 */
export function isJSONTruncationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('unterminated string') ||
    message.includes('unexpected end of json') ||
    message.includes('unexpected end of input') ||
    message.includes('unexpected token') ||
    message.includes('expected')  // "Expected ',' or '}' after property value" — unescaped quote in content
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

