/**
 * Edge Function Runtime Types
 *
 * These types define the interface for user-defined edge functions
 * and their execution context.
 */

/**
 * The request object passed to edge functions
 */
export interface FunctionRequest {
  /** HTTP method (GET, POST, PUT, DELETE) */
  method: string;

  /** Request headers */
  headers: Record<string, string>;

  /** Parsed request body (JSON) */
  body: unknown;

  /** URL path parameters */
  params: Record<string, string>;

  /** Query string parameters */
  query: Record<string, string>;

  /** The full request path after the function name */
  path: string;
}

/**
 * The response object that functions should return
 */
export interface FunctionResponse {
  /** HTTP status code */
  status: number;

  /** Response headers */
  headers: Record<string, string>;

  /** Response body (string or object for JSON) */
  body: string | object;
}

/**
 * Database API available to edge functions
 * Provides sandboxed access to the site's SQLite database
 */
export interface DatabaseAPI {
  /**
   * Execute a SELECT query and return results
   * @param sql SQL query string with ? placeholders
   * @param params Parameter values for placeholders
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];

  /**
   * Execute an INSERT, UPDATE, or DELETE query
   * @param sql SQL statement with ? placeholders
   * @param params Parameter values for placeholders
   */
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint };

  /**
   * Alias for query() - returns all matching rows
   */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
}

/**
 * Result of executing an edge function
 */
export interface ExecutionResult {
  /** The function's response */
  response: FunctionResponse;

  /** Console logs captured during execution */
  logs: string[];

  /** Execution time in milliseconds */
  durationMs: number;

  /** Error message if execution failed */
  error?: string;
}

/**
 * Options for database API creation
 */
export interface DatabaseAPIOptions {
  /** If true, only SELECT queries are allowed */
  readOnly?: boolean;

  /** Maximum number of queries per execution (default: 100) */
  maxQueries?: number;
}

