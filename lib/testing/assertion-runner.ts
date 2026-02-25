import { TestAssertion, AssertionResult } from './types';
import type { ConversationNode } from '@/lib/llm/multi-agent-orchestrator';

function truncate(str: string, max = 100): string {
  return str.length > max ? str.substring(0, max - 3) + '...' : str;
}

function getAssistantText(conversation: ConversationNode[]): string {
  const parts: string[] = [];
  for (const node of conversation) {
    for (const msg of node.messages) {
      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          parts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if ('text' in block) parts.push(block.text);
          }
        }
      }
    }
  }
  return parts.join('\n');
}

function getToolOutputText(conversation: ConversationNode[], toolName: string): string {
  // Map tool_call_id → tool function name
  const callIdToName = new Map<string, string>();
  for (const node of conversation) {
    for (const msg of node.messages) {
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          callIdToName.set(tc.id, tc.function.name);
        }
      }
    }
  }

  // Collect tool result content for matching tool name
  const parts: string[] = [];
  for (const node of conversation) {
    for (const msg of node.messages) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        const name = callIdToName.get(msg.tool_call_id);
        if (name === toolName) {
          const content = typeof msg.content === 'string' ? msg.content : '';
          if (content) parts.push(content);
        }
      }
    }
  }

  return parts.join('\n');
}

function getToolCalls(conversation: ConversationNode[]) {
  const calls: Array<{ name: string; args: string }> = [];
  for (const node of conversation) {
    for (const msg of node.messages) {
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          calls.push({ name: tc.function.name, args: tc.function.arguments });
        }
      }
    }
  }
  return calls;
}

export async function runAssertions(
  projectId: string,
  conversation: ConversationNode[],
  assertions: TestAssertion[]
): Promise<AssertionResult[]> {
  const { vfs } = await import('@/lib/vfs');
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    // Skip judge assertions — handled separately
    if (assertion.type === 'judge') continue;

    let passed = false;
    let actual: string | undefined;

    try {
      switch (assertion.type) {
        case 'file_exists': {
          const exists = await vfs.fileExists(projectId, assertion.path);
          passed = exists;
          actual = exists ? 'file exists' : 'file not found';
          break;
        }

        case 'file_not_exists': {
          const exists = await vfs.fileExists(projectId, assertion.path);
          passed = !exists;
          actual = exists ? 'file exists (unexpected)' : 'file not found (expected)';
          break;
        }

        case 'file_contains': {
          const file = await vfs.readFile(projectId, assertion.path);
          const content = typeof file.content === 'string' ? file.content : '';
          const found = content.toLowerCase().includes(assertion.value.toLowerCase());
          passed = found;
          actual = found
            ? `contains "${truncate(assertion.value, 40)}"`
            : truncate(content, 80);
          break;
        }

        case 'file_not_contains': {
          const file = await vfs.readFile(projectId, assertion.path);
          const content = typeof file.content === 'string' ? file.content : '';
          const found = content.toLowerCase().includes(assertion.value.toLowerCase());
          passed = !found;
          actual = found
            ? `still contains "${truncate(assertion.value, 40)}"`
            : 'value absent (expected)';
          break;
        }

        case 'file_matches': {
          const file = await vfs.readFile(projectId, assertion.path);
          const content = typeof file.content === 'string' ? file.content : '';
          const re = new RegExp(assertion.pattern, 'i');
          const match = re.exec(content);
          passed = !!match;
          actual = match
            ? `matched: "${truncate(match[0], 40)}"`
            : truncate(content, 80);
          break;
        }

        case 'valid_json': {
          const file = await vfs.readFile(projectId, assertion.path);
          const content = typeof file.content === 'string' ? file.content : '';
          try {
            JSON.parse(content);
            passed = true;
            actual = 'valid JSON';
          } catch {
            passed = false;
            actual = `invalid JSON: ${truncate(content, 60)}`;
          }
          break;
        }

        case 'tool_used': {
          const calls = getToolCalls(conversation);
          const found = calls.some(c => c.name === assertion.toolName);
          passed = found;
          actual = found
            ? `${assertion.toolName} was called`
            : `tools used: ${[...new Set(calls.map(c => c.name))].join(', ') || 'none'}`;
          break;
        }

        case 'tool_args_match': {
          const calls = getToolCalls(conversation);
          const re = new RegExp(assertion.pattern, 'i');
          const matching = calls.filter(c => c.name === assertion.toolName && re.test(c.args));
          passed = matching.length > 0;
          if (matching.length > 0) {
            actual = `matched args: ${truncate(matching[0].args, 60)}`;
          } else {
            const toolCalls = calls.filter(c => c.name === assertion.toolName);
            actual = toolCalls.length > 0
              ? `${toolCalls.length} ${assertion.toolName} call(s), none matched pattern`
              : `${assertion.toolName} not called`;
          }
          break;
        }

        case 'output_matches': {
          const text = getAssistantText(conversation);
          const re = new RegExp(assertion.pattern, 'i');
          const match = re.exec(text);
          passed = !!match;
          actual = match
            ? `matched: "${truncate(match[0], 40)}"`
            : `no match in ${text.length} chars of output`;
          break;
        }

        case 'tool_output_matches': {
          const text = getToolOutputText(conversation, assertion.toolName);
          const re = new RegExp(assertion.pattern, 'i');
          const match = re.exec(text);
          passed = !!match;
          actual = match
            ? `matched: "${truncate(match[0], 40)}"`
            : `no match in ${text.length} chars of tool output`;
          break;
        }
      }
    } catch (err) {
      passed = false;
      actual = err instanceof Error ? err.message : String(err);
    }

    results.push({ assertion, passed, actual });
  }

  return results;
}
