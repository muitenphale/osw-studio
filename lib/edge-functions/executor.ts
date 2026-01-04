/**
 * Edge Function Executor
 *
 * Executes user-defined JavaScript functions in a sandboxed environment
 * using Node.js VM module. Provides limited globals and a secure database API.
 */

import vm from 'vm';
import { EdgeFunction, ServerFunction } from '@/lib/vfs/types';
import {
  FunctionRequest,
  FunctionResponse,
  ExecutionResult,
  ConsoleMock,
  ResponseHelpers,
  DatabaseAPI,
  SecretsAPI,
} from './types';
import { createDatabaseAPI } from './database-api';
import { SiteDatabase } from '@/lib/vfs/adapters/site-database';
import { decryptSecret, isEncryptionConfigured } from './secrets-crypto';

/**
 * Execute an edge function with the given request
 *
 * @param fn The edge function definition
 * @param request The incoming request
 * @param siteDb The site's database instance
 * @returns Execution result including response, logs, and timing
 */
export async function executeFunction(
  fn: EdgeFunction,
  request: FunctionRequest,
  siteDb: SiteDatabase
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const logs: string[] = [];

  // Track if response has been set
  let responseSet = false;
  let response: FunctionResponse = {
    status: 200,
    headers: {},
    body: '',
  };

  // Create console mock that captures logs
  const consoleMock: ConsoleMock = {
    log: (...args: unknown[]) => {
      logs.push(`[LOG] ${args.map(formatArg).join(' ')}`);
    },
    error: (...args: unknown[]) => {
      logs.push(`[ERROR] ${args.map(formatArg).join(' ')}`);
    },
    warn: (...args: unknown[]) => {
      logs.push(`[WARN] ${args.map(formatArg).join(' ')}`);
    },
    info: (...args: unknown[]) => {
      logs.push(`[INFO] ${args.map(formatArg).join(' ')}`);
    },
  };

  // Create database API
  const db = createDatabaseAPI(siteDb);

  // Load enabled server functions
  const serverFunctions = siteDb.listServerFunctions().filter(f => f.enabled);

  // Load and decrypt secrets
  const decryptedSecrets: Record<string, string> = {};
  if (isEncryptionConfigured()) {
    try {
      const secretRecords = siteDb.listSecretsWithValues();
      for (const record of secretRecords) {
        try {
          decryptedSecrets[record.name] = decryptSecret(
            record.encryptedValue,
            record.iv,
            record.authTag
          );
        } catch {
          logs.push(`[WARN] Failed to decrypt secret "${record.name}"`);
        }
      }
    } catch (error) {
      logs.push(`[WARN] Failed to load secrets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Create secrets API
  const secrets: SecretsAPI = {
    get: (name: string) => decryptedSecrets[name] ?? null,
    has: (name: string) => name in decryptedSecrets,
    list: () => Object.keys(decryptedSecrets),
  };

  // Create Response helpers
  const Response: ResponseHelpers = {
    json: (data: object, status: number = 200) => {
      if (responseSet) {
        logs.push('[WARN] Response already set, ignoring subsequent Response.json() call');
        return;
      }
      responseSet = true;
      response = {
        status,
        headers: { 'Content-Type': 'application/json' },
        body: data,
      };
    },
    text: (text: string, status: number = 200) => {
      if (responseSet) {
        logs.push('[WARN] Response already set, ignoring subsequent Response.text() call');
        return;
      }
      responseSet = true;
      response = {
        status,
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      };
    },
    error: (message: string, status: number = 500) => {
      if (responseSet) {
        logs.push('[WARN] Response already set, ignoring subsequent Response.error() call');
        return;
      }
      responseSet = true;
      response = {
        status,
        headers: { 'Content-Type': 'application/json' },
        body: { error: message },
      };
    },
  };

  // Build server object with callable server functions
  // Each server function receives args array and has access to db and fetch
  const server: Record<string, (...args: unknown[]) => unknown> = {};

  // Create VM context with limited globals
  const context = vm.createContext({
    // Request and response
    request,
    db,
    Response,
    server, // Server functions callable via server.functionName(args)
    secrets, // Encrypted secrets accessible via secrets.get(name)

    // Allowed globals
    fetch: globalThis.fetch,
    console: consoleMock,
    JSON,
    Date,
    Math,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Symbol,

    // Utility functions
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    atob,
    btoa,

    // Explicitly disabled (set to undefined for clear error messages)
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    process: undefined,
    Buffer: undefined,
    global: undefined,
    globalThis: undefined,
  });

  // Populate server object with callable server functions
  // Each function wraps the user's code and executes it within the same VM context
  for (const serverFn of serverFunctions) {
    server[serverFn.name] = (...callArgs: unknown[]) => {
      try {
        // Server function code receives 'args' array and has access to db, fetch, console
        const wrappedServerFnCode = `
          (function(args) {
            'use strict';
            ${serverFn.code}
          })
        `;

        // Compile and get the function
        const serverScript = new vm.Script(wrappedServerFnCode, {
          filename: `server-function:${serverFn.name}`,
        });

        // Run to get the function reference
        const serverFnRef = serverScript.runInContext(context, {
          timeout: 5000, // Server functions have 5s timeout each
        });

        // Call the function with args
        return serverFnRef(callArgs);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logs.push(`[ERROR] Server function "${serverFn.name}" failed: ${errorMsg}`);
        throw new Error(`Server function "${serverFn.name}" failed: ${errorMsg}`);
      }
    };
  }

  try {
    // Wrap code in async IIFE to support await
    const wrappedCode = `
      (async function() {
        'use strict';
        ${fn.code}
      })();
    `;

    const script = new vm.Script(wrappedCode, {
      filename: `edge-function:${fn.name}`,
    });

    // Execute with timeout
    const timeout = Math.min(fn.timeoutMs || 5000, 30000); // Max 30s
    await script.runInContext(context, {
      timeout,
      breakOnSigint: true,
    });

    // If no response was set, return 204 No Content
    if (!responseSet) {
      response = { status: 204, headers: {}, body: '' };
    }

    return {
      response,
      logs,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = formatError(error);

    // Log the error
    logs.push(`[ERROR] ${errorMessage}`);

    return {
      response: {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: errorMessage },
      },
      logs,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Format an argument for console output
 */
function formatArg(arg: unknown): string {
  if (arg === undefined) return 'undefined';
  if (arg === null) return 'null';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;

  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

/**
 * Format an error for output
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    // Check for specific VM errors
    if (error.message.includes('Script execution timed out')) {
      return 'Function execution timed out';
    }
    if (error.message.includes('is not defined')) {
      return `ReferenceError: ${error.message}`;
    }
    return error.message;
  }
  return String(error);
}

/**
 * Validate function code before saving
 * Returns an error message if invalid, null if valid
 */
export function validateFunctionCode(code: string): string | null {
  if (!code || code.trim().length === 0) {
    return 'Function code cannot be empty';
  }

  // Check for obviously dangerous patterns
  const dangerousPatterns = [
    { pattern: /\beval\s*\(/, message: 'eval() is not allowed' },
    { pattern: /\bFunction\s*\(/, message: 'Function constructor is not allowed' },
    { pattern: /\bprocess\b/, message: 'process object is not available' },
    { pattern: /\brequire\s*\(/, message: 'require() is not available' },
    { pattern: /\bimport\s*\(/, message: 'Dynamic import is not available' },
    { pattern: /\b__proto__\b/, message: '__proto__ access is not allowed' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(code)) {
      return message;
    }
  }

  // Try to parse the code as JavaScript
  try {
    // Wrap in async function to allow await
    new vm.Script(`(async function() { ${code} })()`);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return `Syntax error: ${error.message}`;
    }
    return `Invalid code: ${error instanceof Error ? error.message : String(error)}`;
  }

  return null;
}

/**
 * Validate function name
 * Returns an error message if invalid, null if valid
 */
export function validateFunctionName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Function name cannot be empty';
  }

  if (name.length > 64) {
    return 'Function name must be 64 characters or less';
  }

  // Must be URL-safe: lowercase letters, numbers, hyphens
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
    return 'Function name must be URL-safe (lowercase letters, numbers, hyphens only, cannot start or end with hyphen)';
  }

  // Reserved names
  const reserved = ['health', 'status', 'ping', 'api', 'admin', 'static'];
  if (reserved.includes(name)) {
    return `Function name "${name}" is reserved`;
  }

  return null;
}

/**
 * Validate server function name
 * Server functions use camelCase or snake_case (valid JS identifiers)
 * Returns an error message if invalid, null if valid
 */
export function validateServerFunctionName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Function name cannot be empty';
  }

  if (name.length > 64) {
    return 'Function name must be 64 characters or less';
  }

  // Must be valid JavaScript identifier: starts with letter/underscore, contains letters/numbers/underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return 'Function name must be a valid identifier (letters, numbers, underscores; cannot start with number)';
  }

  // Reserved JavaScript keywords
  const jsReserved = [
    'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete', 'do',
    'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof', 'new',
    'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
    'while', 'with', 'class', 'const', 'enum', 'export', 'extends', 'import',
    'super', 'implements', 'interface', 'let', 'package', 'private', 'protected',
    'public', 'static', 'yield', 'await', 'async',
  ];

  if (jsReserved.includes(name)) {
    return `"${name}" is a reserved JavaScript keyword`;
  }

  // Reserved server function names (to avoid conflicts with globals)
  const reserved = ['db', 'fetch', 'console', 'args', 'request', 'Response', 'server', 'secrets'];
  if (reserved.includes(name)) {
    return `"${name}" is reserved and cannot be used as a server function name`;
  }

  return null;
}
