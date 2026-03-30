/**
 * Vendored Codex utilities — extracted from @spmurrayzzz/opencode-openai-codex-auth
 * to avoid bundling the full package (which pulls in fs, path, fileURLToPath, and
 * bakes local absolute paths into the Next.js standalone build).
 *
 * Only the functions we actually use are included here.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for ChatGPT backend API */
export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api';

/** JWT claim path for ChatGPT account ID */
export const JWT_CLAIM_PATH = 'https://api.openai.com/auth';

const OPENAI_HEADERS = {
  BETA: 'OpenAI-Beta',
  ACCOUNT_ID: 'chatgpt-account-id',
  ORIGINATOR: 'originator',
  SESSION_ID: 'session_id',
  CONVERSATION_ID: 'conversation_id',
} as const;

const OPENAI_HEADER_VALUES = {
  BETA_RESPONSES: 'responses=experimental',
  ORIGINATOR_CODEX: 'codex_cli_rs',
} as const;

// ---------------------------------------------------------------------------
// Model map — maps config IDs to normalized API model names
// ---------------------------------------------------------------------------

const MODEL_MAP: Record<string, string> = {
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'gpt-5.1-codex': 'gpt-5.1-codex',
  'gpt-5.1-codex-low': 'gpt-5.1-codex',
  'gpt-5.1-codex-medium': 'gpt-5.1-codex',
  'gpt-5.1-codex-high': 'gpt-5.1-codex',
  'gpt-5.1-codex-mini': 'gpt-5.1-codex-mini',
  'gpt-5.1-codex-mini-medium': 'gpt-5.1-codex-mini',
  'gpt-5.1-codex-mini-high': 'gpt-5.1-codex-mini',
  'gpt-5.1': 'gpt-5.1',
  'gpt-5.1-low': 'gpt-5.1',
  'gpt-5.1-medium': 'gpt-5.1',
  'gpt-5.1-high': 'gpt-5.1',
  'gpt-5-codex': 'gpt-5-codex',
  'codex-mini-latest': 'codex-mini-latest',
  'gpt-5-codex-mini': 'codex-mini-latest',
  'gpt-5-codex-mini-medium': 'codex-mini-latest',
  'gpt-5-codex-mini-high': 'codex-mini-latest',
  'gpt-5': 'gpt-5',
  'gpt-5-mini': 'gpt-5',
  'gpt-5-nano': 'gpt-5',
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Decode a JWT token to extract payload.
 */
export function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Create headers for Codex API requests.
 */
export function createCodexHeaders(
  init: RequestInit | undefined,
  accountId: string,
  accessToken: string,
): Headers {
  const headers = new Headers(init?.headers ?? {});
  headers.delete('x-api-key');
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set(OPENAI_HEADERS.ACCOUNT_ID, accountId);
  headers.set(OPENAI_HEADERS.BETA, OPENAI_HEADER_VALUES.BETA_RESPONSES);
  headers.set(OPENAI_HEADERS.ORIGINATOR, OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);
  headers.delete(OPENAI_HEADERS.CONVERSATION_ID);
  headers.delete(OPENAI_HEADERS.SESSION_ID);
  headers.set('accept', 'text/event-stream');
  return headers;
}

/**
 * Get normalized model name from config ID.
 * Returns undefined if the model isn't in the map (pass through as-is).
 */
export function getNormalizedModel(modelId: string): string | undefined {
  if (MODEL_MAP[modelId]) return MODEL_MAP[modelId];
  const lower = modelId.toLowerCase();
  const match = Object.keys(MODEL_MAP).find(k => k.toLowerCase() === lower);
  return match ? MODEL_MAP[match] : undefined;
}

/**
 * Get reasoning configuration for a Codex model.
 */
export function getReasoningConfig(originalModel: string): { effort: string; summary: string } {
  const normalized = originalModel?.toLowerCase() ?? '';
  const isCodexMini = normalized.includes('codex-mini') || normalized.includes('codex-mini-latest');
  const isCodex = normalized.includes('codex') && !isCodexMini;
  const isLightweight = !isCodexMini && (normalized.includes('nano') || normalized.includes('mini'));

  let effort = isCodexMini ? 'medium' : isLightweight ? 'minimal' : 'medium';

  if (isCodexMini) {
    if (effort === 'minimal' || effort === 'low') effort = 'medium';
    if (effort !== 'high') effort = 'medium';
  }
  if (isCodex && effort === 'minimal') effort = 'low';

  return { effort, summary: 'auto' };
}

/**
 * Handle error responses from the Codex API.
 * Parses rate-limit headers and enriches the error with friendly messages.
 */
export async function handleErrorResponse(response: Response): Promise<Response> {
  const raw = await response.text();
  let enriched = raw;
  try {
    const parsed = JSON.parse(raw);
    const err = parsed?.error ?? {};
    const h = response.headers;
    const primaryResetsAt = toInt(h.get('x-codex-primary-reset-at'));
    const secondaryResetsAt = toInt(h.get('x-codex-secondary-reset-at'));
    const resetsAt = err.resets_at ?? primaryResetsAt ?? secondaryResetsAt;
    const mins = resetsAt ? Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000)) : undefined;
    const code = (err.code ?? err.type ?? '').toString();

    let friendly_message: string | undefined;
    if (/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code) || response.status === 429) {
      const plan = err.plan_type ? ` (${String(err.plan_type).toLowerCase()} plan)` : '';
      const when = mins !== undefined ? ` Try again in ~${mins} min.` : '';
      friendly_message = `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
    }

    enriched = JSON.stringify({
      error: {
        ...err,
        message: err.message ?? friendly_message ?? 'Usage limit reached.',
        friendly_message,
        rate_limits: primaryResetsAt !== undefined || secondaryResetsAt !== undefined
          ? {
              primary: { used_percent: toNumber(h.get('x-codex-primary-used-percent')), resets_at: primaryResetsAt },
              secondary: { used_percent: toNumber(h.get('x-codex-secondary-used-percent')), resets_at: secondaryResetsAt },
            }
          : undefined,
        status: response.status,
      },
    });
  } catch {
    // Raw body not JSON; leave unchanged
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(enriched, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function toNumber(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toInt(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
