import { ProviderId } from '@/lib/llm/providers/types';
import { getProvider } from '@/lib/llm/providers/registry';

interface JudgeConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
}

interface JudgeContext {
  prompt: string;
  files: Record<string, string>;
  summary: string;
}

interface JudgeResult {
  passed: boolean;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a benchmark judge evaluating whether an AI coding assistant completed a task correctly.

You will be given:
1. The original task prompt
2. The final state of project files
3. A summary from the AI assistant

Evaluate whether the task was completed correctly based on the criteria provided.

Respond in EXACTLY this format:
VERDICT: PASS
REASONING: <one paragraph explaining your judgment>

Or:
VERDICT: FAIL
REASONING: <one paragraph explaining what was missing or incorrect>`;

function buildUserMessage(criteria: string, context: JudgeContext): string {
  const fileSummary = Object.entries(context.files)
    .map(([path, content]) => `--- ${path} ---\n${content.substring(0, 2000)}`)
    .join('\n\n');

  return `## Task Prompt
${context.prompt}

## Evaluation Criteria
${criteria}

## Assistant Summary
${context.summary}

## Project Files
${fileSummary}

Evaluate whether the task was completed correctly based on the criteria above.`;
}

function parseVerdict(response: string): JudgeResult {
  const verdictMatch = /VERDICT:\s*(PASS|FAIL)/i.exec(response);
  const reasoningMatch = /REASONING:\s*([\s\S]+)/i.exec(response);

  return {
    passed: verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : false,
    reasoning: reasoningMatch ? reasoningMatch[1].trim() : response.substring(0, 200),
  };
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  provider: ProviderId,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    headers['X-Title'] = 'OSW-Studio';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 512,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Judge API error (${provider}): ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Judge API error (anthropic): ${error}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: userMessage }] },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Judge API error (gemini): ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function runJudgeEvaluation(
  criteria: string,
  context: JudgeContext,
  config: JudgeConfig
): Promise<JudgeResult> {
  const providerConfig = getProvider(config.provider);
  const userMessage = buildUserMessage(criteria, context);

  let responseText: string;

  if (config.provider === 'anthropic') {
    responseText = await callAnthropic(config.apiKey, config.model, SYSTEM_PROMPT, userMessage);
  } else if (config.provider === 'gemini') {
    responseText = await callGemini(config.apiKey, config.model, SYSTEM_PROMPT, userMessage);
  } else {
    const baseUrl = providerConfig.baseUrl || 'https://openrouter.ai/api/v1';
    responseText = await callOpenAICompatible(
      baseUrl, config.apiKey, config.model, config.provider, SYSTEM_PROMPT, userMessage
    );
  }

  return parseVerdict(responseText);
}
