/**
 * Skill Evaluator - Pre-flight check to determine which skills are relevant
 * to a user's prompt before the main LLM call.
 *
 * Runs a lightweight, non-streaming evaluation using the user's selected model
 * to boost skill adoption rates by prepending explicit read directives.
 */

import { SkillMetadata } from '@/lib/vfs/skills/types';
import { logger } from '@/lib/utils';

export interface SkillEvalResult {
  skillIds: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    provider: string;
  };
}

/**
 * Evaluate which enabled skills are relevant to the user's prompt.
 * Returns matched skill IDs and usage info. Returns empty on any failure.
 */
export async function evaluateRelevantSkills(
  userPrompt: string,
  skills: SkillMetadata[],
  fileTreeStr: string,
  provider: string,
  apiKey: string,
  model: string,
): Promise<SkillEvalResult> {
  const empty: SkillEvalResult = { skillIds: [] };
  if (skills.length === 0) return empty;

  // Build numbered skill list
  const skillList = skills
    .map((s, i) => `${i + 1}. "${s.name}" - ${s.description}`)
    .join('\n');

  const projectStructure = fileTreeStr
    ? `\n\nProject structure:\n${fileTreeStr}`
    : '';

  const evalPrompt = `Evaluate whether any of the following skills should be read before handling this task.

Skills:
${skillList}

Task: "${userPrompt}"${projectStructure}

Reply with ONLY a JSON array of skill numbers that are relevant. Multiple skills can match. Examples: [1,3], [2], or [] if none.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        provider,
        apiKey,
        model,
        messages: [{ role: 'user', content: evalPrompt }],
        stream: false,
        max_tokens: 50,
        temperature: 0,
      }),
    });

    if (!response.ok) return empty;

    const data = await response.json();

    // Extract text from response (handle both OpenAI and Anthropic formats)
    const text = data?.choices?.[0]?.message?.content
      || data?.content?.[0]?.text
      || '';

    // Extract usage from response
    const rawUsage = data?.usage;
    const usage = rawUsage ? {
      promptTokens: rawUsage.prompt_tokens || 0,
      completionTokens: rawUsage.completion_tokens || 0,
      totalTokens: rawUsage.total_tokens || (rawUsage.prompt_tokens || 0) + (rawUsage.completion_tokens || 0),
      model,
      provider,
    } : undefined;

    // Extract JSON array from response
    const match = text.match(/\[[\d,\s]*\]/);
    if (!match) return { skillIds: [], usage };

    const indices: number[] = JSON.parse(match[0]);
    const skillIds = indices
      .filter((i) => i >= 1 && i <= skills.length)
      .map((i) => skills[i - 1].id);

    return { skillIds, usage };
  } catch {
    logger.info('[SkillEvaluator] Evaluation skipped or failed');
    return empty;
  } finally {
    clearTimeout(timeout);
  }
}
