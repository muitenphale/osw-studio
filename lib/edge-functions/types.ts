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

/**
 * Console methods available in edge functions
 */
export interface ConsoleMock {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
}

/**
 * Response helper methods available in edge functions
 */
export interface ResponseHelpers {
  /**
   * Return a JSON response
   * @param data Object to serialize as JSON
   * @param status HTTP status code (default: 200)
   */
  json: (data: object, status?: number) => void;

  /**
   * Return a plain text response
   * @param text Text content
   * @param status HTTP status code (default: 200)
   */
  text: (text: string, status?: number) => void;

  /**
   * Return an error response
   * @param message Error message
   * @param status HTTP status code (default: 500)
   */
  error: (message: string, status?: number) => void;
}

/**
 * Secrets API available to edge functions
 * Provides read-only access to encrypted secrets
 */
export interface SecretsAPI {
  /**
   * Get a secret value by name
   * @param name The secret name (e.g., 'STRIPE_API_KEY')
   * @returns The decrypted secret value, or null if not found
   */
  get(name: string): string | null;

  /**
   * Check if a secret exists
   * @param name The secret name
   * @returns true if the secret exists
   */
  has(name: string): boolean;

  /**
   * List all available secret names (values are not exposed)
   * @returns Array of secret names
   */
  list(): string[];
}
