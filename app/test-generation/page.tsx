'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { MultiAgentOrchestrator } from '@/lib/llm/multi-agent-orchestrator';
import { testScenarios, testTracks } from '@/lib/testing/test-scenarios';
import type { AssertionResult } from '@/lib/testing/types';
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Square, Download, Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { ModelSettingsPanel } from '@/components/settings/model-settings';
import { configManager } from '@/lib/config/storage';
import { AppHeader, HeaderAction } from '@/components/ui/app-header';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ToolCallDetail {
  name: string;
  status: 'success' | 'failed';
  args?: string;
}

const KNOWN_TOOLS = new Set(['shell', 'write', 'evaluation']);

interface ToolStats {
  total: number;
  success: number;
  failed: number;
  invalid: number;
  invalidNames: string[];
  breakdown: Record<string, { total: number; success: number; failed: number }>;
}

function computeToolStats(details: ToolCallDetail[]): ToolStats {
  const breakdown: Record<string, { total: number; success: number; failed: number }> = {};
  let success = 0, failed = 0, invalid = 0;
  const invalidNameSet = new Set<string>();

  for (const d of details) {
    if (!KNOWN_TOOLS.has(d.name)) {
      invalid++;
      invalidNameSet.add(d.name);
    } else if (d.status === 'success') {
      success++;
    } else {
      failed++;
    }

    if (!breakdown[d.name]) breakdown[d.name] = { total: 0, success: 0, failed: 0 };
    breakdown[d.name].total++;
    if (d.status === 'success') breakdown[d.name].success++;
    else breakdown[d.name].failed++;
  }

  return { total: details.length, success, failed, invalid, invalidNames: [...invalidNameSet], breakdown };
}

function formatCost(amount: number): string {
  if (amount > 0 && amount < 0.0001) return '< $0.0001';
  return `$${amount.toFixed(4)}`;
}

interface ProgressDelta {
  text?: string;
  snapshot?: string;
}

interface ProgressToolStatus {
  toolName?: string;
  status?: string;
  args?: string;
}

interface TestResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'stopped';
  executionTime?: number;
  errors?: string[];
  details?: string;
  toolCalls?: number;
  generationOutput?: string;
  totalCost?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolCallDetails?: ToolCallDetail[];
  assertionResults?: AssertionResult[];
  assertionScore?: number;
  judgeResult?: { passed: boolean; reasoning: string };
  selfEvalCorrect?: boolean;
}

interface RoundResult {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'stopped';
  executionTime?: number;
  totalCost?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolCalls?: number;
  toolCallDetails?: ToolCallDetail[];
  assertionResults?: AssertionResult[];
  assertionScore?: number;
  judgeResult?: { passed: boolean; reasoning: string };
  selfEvalCorrect?: boolean;
  errors?: string[];
  details?: string;
}

interface AggregatedTestResult {
  id: string;
  name: string;
  roundCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  avgCost: number;
  totalCost: number;
  avgTokens: number;
  avgToolCalls: number;
  avgAssertionScore?: number;
  rounds: RoundResult[];
}

const allScenarioIds = testScenarios.map(s => s.id);

export default function TestGenerationPage() {
  const router = useRouter();
  const [testResults, setTestResults] = useState<TestResult[]>(
    testScenarios.map(scenario => ({
      id: scenario.id,
      name: scenario.name,
      status: 'pending'
    }))
  );
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [orchestratorInstances, setOrchestratorInstances] = useState<Map<string, MultiAgentOrchestrator>>(new Map());
  const [generationOutputs, setGenerationOutputs] = useState<Map<string, string>>(new Map());
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const generationOutputRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const batchCancelledRef = useRef(false);
  const [overallStats, setOverallStats] = useState({
    total: 0,
    passed: 0,
    failed: 0,
    successRate: 0,
    totalCost: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    toolStats: { total: 0, success: 0, failed: 0, invalid: 0, invalidNames: [] as string[], breakdown: {} } as ToolStats,
  });

  // Model settings popover state
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState('');

  // Judge model settings
  const [judgeModel, setJudgeModel] = useState('');

  // Multi-round state
  const [totalRounds, setTotalRounds] = useState(1);
  const [currentRound, setCurrentRound] = useState(0);
  const [roundHistory, setRoundHistory] = useState<RoundResult[][]>([]);
  const [benchmarkComplete, setBenchmarkComplete] = useState(false);
  const testResultsRef = useRef<TestResult[]>([]);

  useEffect(() => { testResultsRef.current = testResults; }, [testResults]);

  useEffect(() => {
    setCurrentModel(configManager.getDefaultModel());
  }, []);

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Select Model';
    const parts = modelId.split('/');
    const modelName = parts[parts.length - 1];
    return modelName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const runSingleTest = async (scenarioId: string) => {
    const scenario = testScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const startTime = Date.now();
    setRunningTest(scenarioId);
    setExpandedTests(prev => new Set([...prev, scenarioId]));

    // Update status to running
    setTestResults(prev => prev.map(result =>
      result.id === scenarioId
        ? { ...result, status: 'running', generationOutput: '' }
        : result
    ));

    let projectId = '';
    const toolDetails: ToolCallDetail[] = [];
    try {
      projectId = `test-${Date.now()}`;

      const { vfs } = await import('@/lib/vfs');
      await vfs.init();
      await vfs.createProject(`Test: ${scenario.name}`, undefined, projectId);

      if (scenario.setupFiles) {
        for (const [filePath, content] of Object.entries(scenario.setupFiles)) {
          await vfs.createFile(projectId, filePath, content);
        }
      }

      const appendOutput = (scenarioId: string, text: string) => {
        setGenerationOutputs(prev => {
          const newMap = new Map(prev);
          newMap.set(scenarioId, (newMap.get(scenarioId) || '') + text);
          return newMap;
        });
        setTestResults(prev => prev.map(result =>
          result.id === scenarioId
            ? { ...result, generationOutput: (result.generationOutput || '') + text }
            : result
        ));
        setTimeout(() => {
          const outputElement = generationOutputRefs.current.get(scenarioId);
          if (outputElement) {
            outputElement.scrollTop = outputElement.scrollHeight;
          }
        }, 0);
      };

      const orchestrator = new MultiAgentOrchestrator(
        projectId,
        'orchestrator',
        (message, step) => {
          if (message === 'assistant_delta') {
            const delta = step as ProgressDelta;
            const deltaText = delta?.text;
            const snapshot = delta?.snapshot;
            if (!deltaText && !snapshot) return;

            if (snapshot !== undefined) {
              setGenerationOutputs(prev => {
                const newMap = new Map(prev);
                newMap.set(scenarioId, snapshot);
                return newMap;
              });
              setTestResults(prev => prev.map(result =>
                result.id === scenarioId
                  ? { ...result, generationOutput: snapshot }
                  : result
              ));
            } else if (deltaText) {
              appendOutput(scenarioId, deltaText);
            }

            setTimeout(() => {
              const outputElement = generationOutputRefs.current.get(scenarioId);
              if (outputElement) {
                outputElement.scrollTop = outputElement.scrollHeight;
              }
            }, 0);
          }

          if (message === 'tool_status') {
            const data = step as ProgressToolStatus;
            const toolName = data?.toolName || 'unknown';
            if (data?.status === 'executing') {
              let argSnippet = '';
              if (data?.args) {
                try {
                  const parsed = JSON.parse(data.args);
                  if (toolName === 'shell') argSnippet = parsed.cmd || parsed.command || '';
                  else if (toolName === 'write') argSnippet = parsed.path || parsed.filePath || '';
                  else if (toolName === 'evaluation') {
                    const g = parsed.goal_achieved;
                    argSnippet = g !== undefined ? `goal_achieved: ${g}` : '';
                  }
                } catch {}
                if (argSnippet.length > 80) argSnippet = argSnippet.substring(0, 77) + '...';
              }
              toolDetails.push({ name: toolName, status: 'success', args: argSnippet });
              appendOutput(scenarioId, `\n[tool] ${toolName}${argSnippet ? ` — ${argSnippet}` : ' ...'}\n`);
            } else if (data?.status === 'completed') {
              appendOutput(scenarioId, `[tool] ${toolName} done\n`);
            } else if (data?.status === 'failed') {
              const last = [...toolDetails].reverse().find(d => d.name === toolName);
              if (last) last.status = 'failed';
              appendOutput(scenarioId, `[tool] ${toolName} failed\n`);
            }
          }
        },
        { chatMode: false }
      );

      setOrchestratorInstances(prev => {
        const newMap = new Map(prev);
        newMap.set(scenarioId, orchestrator);
        return newMap;
      });

      const result = await orchestrator.execute(scenario.prompt);

      const toolCallCount = (result.conversation || []).reduce((count, node) => {
        return count + node.messages.reduce((msgCount, msg) => {
          return msgCount + (msg.tool_calls?.length || 0);
        }, 0);
      }, 0);

      // Extract detailed tool calls from conversation (more authoritative — has args)
      const conversationToolDetails: ToolCallDetail[] = [];
      const toolResultMap = new Map<string, boolean>();
      for (const node of (result.conversation || [])) {
        for (const msg of node.messages) {
          if (msg.role === 'tool' && msg.tool_call_id) {
            const content = typeof msg.content === 'string' ? msg.content : '';
            toolResultMap.set(msg.tool_call_id, !content.startsWith('Error:'));
          }
        }
        for (const msg of node.messages) {
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              let argSnippet = '';
              try {
                const parsed = JSON.parse(tc.function.arguments);
                if (tc.function.name === 'shell') {
                  argSnippet = parsed.cmd || parsed.command || '';
                } else if (tc.function.name === 'write') {
                  argSnippet = parsed.path || parsed.filePath || '';
                } else if (tc.function.name === 'evaluation') {
                  const goal = parsed.goal_achieved;
                  argSnippet = goal !== undefined ? `goal_achieved: ${goal}` : '';
                }
              } catch {}
              if (argSnippet.length > 80) argSnippet = argSnippet.substring(0, 77) + '...';

              const succeeded = toolResultMap.has(tc.id) ? toolResultMap.get(tc.id)! : true;
              conversationToolDetails.push({
                name: tc.function.name,
                status: succeeded ? 'success' : 'failed',
                args: argSnippet,
              });
            }
          }
        }
      }

      const finalToolDetails = conversationToolDetails.length > 0 ? conversationToolDetails : toolDetails;

      // Run programmatic assertions (before project cleanup)
      let assertionResults: AssertionResult[] = [];
      if (scenario.assertions && scenario.assertions.length > 0) {
        try {
          const { runAssertions } = await import('@/lib/testing/assertion-runner');
          assertionResults = await runAssertions(projectId, result.conversation || [], scenario.assertions);
        } catch (err) {
          console.warn('Assertion runner error:', err);
        }
      }

      // Run judge assertions (if configured)
      const judgeAssertions = scenario.assertions?.filter(a => a.type === 'judge') || [];
      let judgeResult: { passed: boolean; reasoning: string } | undefined;
      if (judgeAssertions.length > 0 && judgeModel) {
        try {
          const { vfs: vfsInst } = await import('@/lib/vfs');
          const files = await vfsInst.listFiles(projectId);
          const fileContents: Record<string, string> = {};
          for (const f of files) {
            if (typeof f.content === 'string') {
              fileContents[f.path] = f.content;
            }
          }

          const judgeProvider = configManager.getSelectedProvider();
          const judgeApiKey = configManager.getProviderApiKey(judgeProvider) || '';
          const { runJudgeEvaluation } = await import('@/lib/testing/judge');
          judgeResult = await runJudgeEvaluation(
            judgeAssertions[0].criteria,
            { prompt: scenario.prompt, files: fileContents, summary: result.summary },
            { provider: judgeProvider, apiKey: judgeApiKey, model: judgeModel }
          );

          assertionResults.push({
            assertion: judgeAssertions[0],
            passed: judgeResult.passed,
            actual: judgeResult.reasoning,
          });
        } catch (err) {
          console.warn('Judge evaluation error:', err);
        }
      }

      // Compute assertion score and determine pass/fail
      const assertionScore = assertionResults.length > 0
        ? (assertionResults.filter(r => r.passed).length / assertionResults.length) * 100
        : undefined;

      const testPassed = assertionResults.length > 0
        ? assertionResults.every(r => r.passed)
        : result.success;

      setTestResults(prev => prev.map(testResult =>
        testResult.id === scenarioId
          ? {
              ...testResult,
              status: testPassed ? 'success' : 'failed',
              executionTime: Date.now() - startTime,
              errors: testPassed
                ? undefined
                : assertionResults.length > 0
                  ? assertionResults.filter(r => !r.passed).map(r => r.assertion.description + (r.actual ? ` — ${r.actual}` : ''))
                  : [result.summary],
              details: result.summary,
              toolCalls: toolCallCount,
              totalCost: result.totalCost,
              promptTokens: result.totalUsage.promptTokens,
              completionTokens: result.totalUsage.completionTokens,
              totalTokens: result.totalUsage.totalTokens,
              toolCallDetails: finalToolDetails,
              assertionResults: assertionResults.length > 0 ? assertionResults : undefined,
              assertionScore,
              judgeResult,
              selfEvalCorrect: assertionResults.length > 0 ? result.success === testPassed : undefined,
            }
          : testResult
      ));

      if (testPassed) {
        toast.success(`Test passed: ${scenario.name}`);
      } else {
        toast.error(`Test failed: ${scenario.name}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      setTestResults(prev => prev.map(result =>
        result.id === scenarioId
          ? {
              ...result,
              status: 'failed',
              executionTime: Date.now() - startTime,
              errors: [errorMessage],
              details: `Error: ${errorMessage}`,
              toolCallDetails: toolDetails.length > 0 ? toolDetails : undefined,
            }
          : result
      ));

      toast.error(`Test error: ${scenario.name}`);
    }

    setOrchestratorInstances(prev => {
      const newMap = new Map(prev);
      newMap.delete(scenarioId);
      return newMap;
    });

    if (projectId) {
      try {
        const { vfs } = await import('@/lib/vfs');
        await vfs.deleteProject(projectId);
      } catch {}
    }

    setRunningTest(null);
  };

  const stopTest = (scenarioId: string) => {
    const orchestrator = orchestratorInstances.get(scenarioId);
    if (orchestrator) {
      orchestrator.stop();
      toast.info(`Stopping test: ${testScenarios.find(s => s.id === scenarioId)?.name}`);
    }
  };

  const runTrack = async (trackId: string) => {
    const scenarioIds = trackId === 'all'
      ? allScenarioIds
      : testTracks.find(t => t.id === trackId)?.scenarioIds || [];

    if (scenarioIds.length === 0) return;

    setActiveTrack(trackId);
    batchCancelledRef.current = false;
    setRoundHistory([]);
    setBenchmarkComplete(false);

    for (let round = 0; round < totalRounds; round++) {
      if (batchCancelledRef.current) break;
      setCurrentRound(round);

      // Reset test results to pending for this round
      setTestResults(
        testScenarios.map(scenario => ({
          id: scenario.id,
          name: scenario.name,
          status: 'pending'
        }))
      );
      setGenerationOutputs(new Map());

      for (const testId of scenarioIds) {
        if (batchCancelledRef.current) break;
        await runSingleTest(testId);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Snapshot completed results for this round
      const snapshot: RoundResult[] = testResultsRef.current
        .filter(r => r.status === 'success' || r.status === 'failed' || r.status === 'stopped')
        .map(r => ({
          id: r.id,
          name: r.name,
          status: r.status as 'success' | 'failed' | 'stopped',
          executionTime: r.executionTime,
          totalCost: r.totalCost,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          totalTokens: r.totalTokens,
          toolCalls: r.toolCalls,
          toolCallDetails: r.toolCallDetails,
          assertionResults: r.assertionResults,
          assertionScore: r.assertionScore,
          judgeResult: r.judgeResult,
          selfEvalCorrect: r.selfEvalCorrect,
          errors: r.errors,
          details: r.details,
        }));
      setRoundHistory(prev => [...prev, snapshot]);
    }

    setBenchmarkComplete(true);
    setActiveTrack(null);
  };

  // Derive overall stats from testResults reactively
  useEffect(() => {
    const completed = testResults.filter(r => r.status !== 'pending' && r.status !== 'running');
    const passed = testResults.filter(r => r.status === 'success');

    const totalCost = completed.reduce((sum, r) => sum + (r.totalCost || 0), 0);
    const promptTokens = completed.reduce((sum, r) => sum + (r.promptTokens || 0), 0);
    const completionTokens = completed.reduce((sum, r) => sum + (r.completionTokens || 0), 0);
    const totalTokens = completed.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
    const allToolDetails = completed.flatMap(r => r.toolCallDetails || []);
    const toolStats = computeToolStats(allToolDetails);

    setOverallStats({
      total: completed.length,
      passed: passed.length,
      failed: completed.length - passed.length,
      successRate: completed.length > 0 ? (passed.length / completed.length) * 100 : 0,
      totalCost,
      promptTokens,
      completionTokens,
      totalTokens,
      toolStats,
    });
  }, [testResults]);

  const stopBenchmark = () => {
    batchCancelledRef.current = true;
    orchestratorInstances.forEach((orchestrator) => {
      orchestrator.stop();
    });
  };

  const resetTests = () => {
    stopBenchmark();
    setTestResults(
      testScenarios.map(scenario => ({
        id: scenario.id,
        name: scenario.name,
        status: 'pending'
      }))
    );
    setOverallStats({ total: 0, passed: 0, failed: 0, successRate: 0, totalCost: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, toolStats: { total: 0, success: 0, failed: 0, invalid: 0, invalidNames: [], breakdown: {} } });
    setRunningTest(null);
    setActiveTrack(null);
    setOrchestratorInstances(new Map());
    setGenerationOutputs(new Map());
    setExpandedTests(new Set());
    setRoundHistory([]);
    setCurrentRound(0);
    setBenchmarkComplete(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'stopped': return <Square className="h-4 w-4 text-orange-500" />;
      case 'running': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  // Compute per-track report data
  const trackReports = useMemo(() => {
    const reports: Record<string, {
      total: number;
      passed: number;
      failed: number;
      successRate: number;
      avgTime: number;
      totalToolCalls: number;
      totalCost: number;
      totalTokens: number;
      toolStats: ToolStats;
      totalAssertions: number;
      passedAssertions: number;
      assertionScore: number;
      selfEvalTotal: number;
      selfEvalCorrect: number;
      allDone: boolean;
      results: TestResult[];
    }> = {};

    for (const track of testTracks) {
      const trackResults = track.scenarioIds
        .map(id => testResults.find(r => r.id === id))
        .filter((r): r is TestResult => r !== undefined);

      const terminal = trackResults.filter(r => r.status === 'success' || r.status === 'failed' || r.status === 'stopped');
      const passed = terminal.filter(r => r.status === 'success');
      const allDone = terminal.length === trackResults.length && terminal.length > 0;
      const times = terminal.filter(r => r.executionTime).map(r => r.executionTime!);
      const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const totalToolCalls = terminal.reduce((sum, r) => sum + (r.toolCalls || 0), 0);
      const totalCost = terminal.reduce((sum, r) => sum + (r.totalCost || 0), 0);
      const totalTokens = terminal.reduce((sum, r) => sum + (r.totalTokens || 0), 0);

      const allDetails = terminal.flatMap(r => r.toolCallDetails || []);
      const toolStats = computeToolStats(allDetails);

      const totalAssertions = terminal.reduce((sum, r) => sum + (r.assertionResults?.length || 0), 0);
      const passedAssertions = terminal.reduce((sum, r) =>
        sum + (r.assertionResults?.filter(a => a.passed).length || 0), 0);
      const assertionScore = totalAssertions > 0 ? (passedAssertions / totalAssertions) * 100 : 0;

      const selfEvalTotal = terminal.filter(r => r.selfEvalCorrect !== undefined).length;
      const selfEvalCorrectCount = terminal.filter(r => r.selfEvalCorrect === true).length;

      reports[track.id] = {
        total: trackResults.length,
        passed: passed.length,
        failed: terminal.length - passed.length,
        successRate: terminal.length > 0 ? (passed.length / terminal.length) * 100 : 0,
        avgTime,
        totalToolCalls,
        totalCost,
        totalTokens,
        toolStats,
        totalAssertions,
        passedAssertions,
        assertionScore,
        selfEvalTotal,
        selfEvalCorrect: selfEvalCorrectCount,
        allDone,
        results: trackResults,
      };
    }

    return reports;
  }, [testResults]);

  // Aggregated results across all rounds
  const aggregatedResults = useMemo((): AggregatedTestResult[] => {
    if (roundHistory.length === 0) return [];

    const scenarioMap = new Map<string, RoundResult[]>();
    for (const round of roundHistory) {
      for (const result of round) {
        const existing = scenarioMap.get(result.id) || [];
        existing.push(result);
        scenarioMap.set(result.id, existing);
      }
    }

    return Array.from(scenarioMap.entries()).map(([id, rounds]) => {
      const name = rounds[0].name;
      const passCount = rounds.filter(r => r.status === 'success').length;
      const failCount = rounds.length - passCount;
      const times = rounds.filter(r => r.executionTime).map(r => r.executionTime!);
      const costs = rounds.filter(r => r.totalCost !== undefined).map(r => r.totalCost!);
      const tokens = rounds.filter(r => r.totalTokens !== undefined).map(r => r.totalTokens!);
      const toolCalls = rounds.filter(r => r.toolCalls !== undefined).map(r => r.toolCalls!);
      const assertionScores = rounds.filter(r => r.assertionScore !== undefined).map(r => r.assertionScore!);

      return {
        id,
        name,
        roundCount: rounds.length,
        passCount,
        failCount,
        passRate: (passCount / rounds.length) * 100,
        avgTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
        minTime: times.length > 0 ? Math.min(...times) : 0,
        maxTime: times.length > 0 ? Math.max(...times) : 0,
        avgCost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
        totalCost: costs.reduce((a, b) => a + b, 0),
        avgTokens: tokens.length > 0 ? tokens.reduce((a, b) => a + b, 0) / tokens.length : 0,
        avgToolCalls: toolCalls.length > 0 ? toolCalls.reduce((a, b) => a + b, 0) / toolCalls.length : 0,
        avgAssertionScore: assertionScores.length > 0 ? assertionScores.reduce((a, b) => a + b, 0) / assertionScores.length : undefined,
        rounds,
      };
    });
  }, [roundHistory]);

  const aggregatedOverallStats = useMemo(() => {
    if (aggregatedResults.length === 0) return null;
    const totalTests = aggregatedResults.reduce((sum, r) => sum + r.roundCount, 0);
    const totalPassed = aggregatedResults.reduce((sum, r) => sum + r.passCount, 0);
    const totalFailed = aggregatedResults.reduce((sum, r) => sum + r.failCount, 0);
    const totalCost = aggregatedResults.reduce((sum, r) => sum + r.totalCost, 0);

    const allResults = roundHistory.flat();
    const totalTokens = allResults.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
    const promptTokens = allResults.reduce((sum, r) => sum + (r.promptTokens || 0), 0);
    const completionTokens = allResults.reduce((sum, r) => sum + (r.completionTokens || 0), 0);
    const allToolDetails = allResults.flatMap(r => r.toolCallDetails || []);
    const toolStats = computeToolStats(allToolDetails);

    return {
      totalTests,
      totalPassed,
      totalFailed,
      passRate: totalTests > 0 ? (totalPassed / totalTests) * 100 : 0,
      totalCost,
      totalTokens,
      promptTokens,
      completionTokens,
      toolStats,
      roundsCompleted: roundHistory.length,
    };
  }, [aggregatedResults, roundHistory]);

  const isRunning = runningTest !== null;

  // Export helpers
  const buildExportData = () => {
    const provider = configManager.getSelectedProvider();
    const model = currentModel;
    const dateStr = new Date().toISOString();

    const rounds = roundHistory.length > 0
      ? roundHistory.map((round, i) => ({ round: i + 1, results: round }))
      : [{
          round: 1,
          results: testResults
            .filter(r => r.status === 'success' || r.status === 'failed' || r.status === 'stopped')
            .map(r => ({
              id: r.id,
              name: r.name,
              status: r.status as 'success' | 'failed' | 'stopped',
              executionTime: r.executionTime,
              totalCost: r.totalCost,
              promptTokens: r.promptTokens,
              completionTokens: r.completionTokens,
              totalTokens: r.totalTokens,
              toolCalls: r.toolCalls,
              toolStats: r.toolCallDetails ? computeToolStats(r.toolCallDetails) : undefined,
              assertionScore: r.assertionScore,
              selfEvalCorrect: r.selfEvalCorrect,
              errors: r.errors,
              details: r.details,
            }))
        }];

    const aggregated = aggregatedResults.length > 0
      ? aggregatedResults.map(r => ({
          id: r.id,
          name: r.name,
          roundCount: r.roundCount,
          passRate: r.passRate,
          avgTime: r.avgTime,
          minTime: r.minTime,
          maxTime: r.maxTime,
          avgCost: r.avgCost,
          totalCost: r.totalCost,
          avgTokens: r.avgTokens,
          avgToolCalls: r.avgToolCalls,
          avgAssertionScore: r.avgAssertionScore,
        }))
      : undefined;

    // Compute self-eval accuracy across all round data
    const selfEvalData = (() => {
      const allRoundResults = roundHistory.length > 0
        ? roundHistory.flat()
        : testResults.filter(r => r.status === 'success' || r.status === 'failed' || r.status === 'stopped');
      const withSelfEval = allRoundResults.filter(r => r.selfEvalCorrect !== undefined);
      const correct = withSelfEval.filter(r => r.selfEvalCorrect === true).length;
      return withSelfEval.length > 0 ? { selfEvalCorrect: correct, selfEvalTotal: withSelfEval.length } : {};
    })();

    const baseStats = aggregatedOverallStats || {
      totalTests: overallStats.total,
      totalPassed: overallStats.passed,
      totalFailed: overallStats.failed,
      passRate: overallStats.successRate,
      totalCost: overallStats.totalCost,
      totalTokens: overallStats.totalTokens,
      promptTokens: overallStats.promptTokens,
      completionTokens: overallStats.completionTokens,
      toolStats: overallStats.toolStats,
      roundsCompleted: roundHistory.length || (overallStats.total > 0 ? 1 : 0),
    };

    const summary = {
      ...baseStats,
      ...selfEvalData,
    };

    return {
      meta: {
        tool: 'OSW Studio Benchmark',
        date: dateStr,
        provider,
        model,
        judgeModel: judgeModel || undefined,
        totalRounds: roundHistory.length || (overallStats.total > 0 ? 1 : 0),
      },
      rounds,
      aggregated,
      summary,
    };
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getExportFilename = (ext: string) => {
    const modelSlug = currentModel.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    const dateSlug = new Date().toISOString().split('T')[0];
    return `osws-benchmark-${modelSlug}-${dateSlug}.${ext}`;
  };

  const exportJSON = () => {
    const data = buildExportData();
    downloadFile(JSON.stringify(data, null, 2), getExportFilename('json'), 'application/json');
    toast.success('Benchmark results exported as JSON');
  };

  const exportMarkdown = () => {
    const data = buildExportData();
    const lines: string[] = [];
    lines.push('# OSW Studio Benchmark Report');
    lines.push('');
    lines.push(`**Date:** ${data.meta.date}`);
    lines.push(`**Provider:** ${data.meta.provider}`);
    lines.push(`**Model:** ${data.meta.model}`);
    if (data.meta.judgeModel) lines.push(`**Judge Model:** ${data.meta.judgeModel}`);
    lines.push(`**Rounds:** ${data.meta.totalRounds}`);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Tests | ${data.summary.totalTests} |`);
    lines.push(`| Passed | ${data.summary.totalPassed} |`);
    lines.push(`| Failed | ${data.summary.totalFailed} |`);
    lines.push(`| Pass Rate | ${data.summary.passRate.toFixed(1)}% |`);
    lines.push(`| Total Cost | $${data.summary.totalCost.toFixed(4)} |`);
    if (data.summary.totalTokens) {
      lines.push(`| Total Tokens | ${data.summary.totalTokens.toLocaleString()} (${data.summary.promptTokens?.toLocaleString() || 0} in / ${data.summary.completionTokens?.toLocaleString() || 0} out) |`);
    }
    if (data.summary.toolStats && data.summary.toolStats.total > 0) {
      const ts = data.summary.toolStats;
      let toolLine = `| Tool Calls | ${ts.total} (${ts.success} ok`;
      if (ts.failed > 0) toolLine += `, ${ts.failed} failed`;
      if (ts.invalid > 0) toolLine += `, ${ts.invalid} invalid: ${ts.invalidNames.join(', ')}`;
      toolLine += ') |';
      lines.push(toolLine);
    }
    lines.push(`| Rounds | ${data.summary.roundsCompleted} |`);
    if (data.summary.selfEvalTotal) {
      lines.push(`| Self-eval Accuracy | ${data.summary.selfEvalCorrect}/${data.summary.selfEvalTotal} (${((data.summary.selfEvalCorrect! / data.summary.selfEvalTotal) * 100).toFixed(1)}%) |`);
    }
    lines.push('');

    if (data.aggregated && data.aggregated.length > 0) {
      lines.push('## Per-Test Results (Multi-Round)');
      lines.push('');
      lines.push('| Test | Pass Rate | Avg Time | Avg Cost | Avg Tokens | Avg Tools |');
      lines.push('|------|-----------|----------|----------|------------|-----------|');
      for (const r of data.aggregated) {
        lines.push(`| ${r.name} | ${r.passRate.toFixed(0)}% | ${(r.avgTime / 1000).toFixed(1)}s | $${r.avgCost.toFixed(4)} | ${Math.round(r.avgTokens).toLocaleString()} | ${r.avgToolCalls.toFixed(1)} |`);
      }
    } else if (data.rounds.length > 0 && data.rounds[0].results.length > 0) {
      lines.push('## Results');
      lines.push('');
      lines.push('| Test | Status | Time | Cost | Tokens |');
      lines.push('|------|--------|------|------|--------|');
      for (const r of data.rounds[0].results) {
        const time = r.executionTime ? `${(r.executionTime / 1000).toFixed(1)}s` : '-';
        const cost = r.totalCost !== undefined ? `$${r.totalCost.toFixed(4)}` : '-';
        const tokens = r.totalTokens !== undefined ? r.totalTokens.toLocaleString() : '-';
        lines.push(`| ${r.name} | ${r.status} | ${time} | ${cost} | ${tokens} |`);
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('*Generated by OSW Studio Benchmark*');

    downloadFile(lines.join('\n'), getExportFilename('md'), 'text/markdown');
    toast.success('Benchmark results exported as Markdown');
  };

  const headerActions: HeaderAction[] = [
    {
      id: 'back',
      label: 'Back to Projects',
      icon: ArrowLeft,
      onClick: () => router.push('/'),
      variant: 'outline'
    }
  ];

  return (
    <div className="h-screen flex flex-col">
      <AppHeader
        leftText="OSWS Benchmark"
        onLogoClick={() => router.push('/')}
        actions={headerActions}
      />

      <div className="flex-1 overflow-auto bg-background p-6">
        <div className="max-w-6xl mx-auto">

        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">How to Interpret Benchmark Results</h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                This benchmark evaluates how well a model performs with OSW Studio&apos;s agentic tools (shell, write, evaluation).
                A <strong>passing test</strong> means the model completed the task using the right tools.
                A <strong>failing test</strong> means the model couldn&apos;t complete the task or encountered errors.
              </p>
              <div className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                <strong>Tip:</strong> Select your preferred provider and model below to benchmark specific configurations.
                The generation output will show you what the AI is doing during execution.
              </div>
            </div>
          </div>
        </div>

        {/* Cost Warning Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-amber-600 dark:text-amber-400 mt-0.5">💡</div>
            <div className="flex-1">
              <h3 className="font-medium text-amber-900 dark:text-amber-100 mb-1">Cost Warning</h3>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Running benchmarks can be <strong>very expensive</strong> and likely isn&apos;t necessary.
                It&apos;s cheaper and easier to just use good models and research community feedback about agentic capabilities.
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
                This benchmark is for evaluating how models perform with OSW Studio&apos;s agentic system
                and using those results to improve it.
              </p>
            </div>
          </div>
        </div>

        {/* Round progress indicator */}
        {totalRounds > 1 && activeTrack && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 mb-4 text-sm text-blue-800 dark:text-blue-200">
            Round {currentRound + 1} of {totalRounds} ({roundHistory.length} completed)
          </div>
        )}

        {/* Stats Overview */}
        {(() => {
          const stats = benchmarkComplete && aggregatedOverallStats && roundHistory.length > 1
            ? {
                total: aggregatedOverallStats.totalTests,
                passed: aggregatedOverallStats.totalPassed,
                failed: aggregatedOverallStats.totalFailed,
                successRate: aggregatedOverallStats.passRate,
                totalCost: aggregatedOverallStats.totalCost,
                promptTokens: aggregatedOverallStats.promptTokens,
                completionTokens: aggregatedOverallStats.completionTokens,
                totalTokens: aggregatedOverallStats.totalTokens,
                toolStats: aggregatedOverallStats.toolStats,
                rounds: aggregatedOverallStats.roundsCompleted,
              }
            : {
                total: overallStats.total,
                passed: overallStats.passed,
                failed: overallStats.failed,
                successRate: overallStats.successRate,
                totalCost: overallStats.totalCost,
                promptTokens: overallStats.promptTokens,
                completionTokens: overallStats.completionTokens,
                totalTokens: overallStats.totalTokens,
                toolStats: overallStats.toolStats,
                rounds: undefined as number | undefined,
              };

          return (
            <>
              <div className={`grid grid-cols-2 ${stats.rounds ? 'md:grid-cols-4 lg:grid-cols-7' : 'md:grid-cols-3 lg:grid-cols-6'} gap-4 mb-4`}>
                {stats.rounds !== undefined && (
                  <div className="bg-card border rounded-lg p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">Rounds</div>
                    <div className="text-2xl font-bold">{stats.rounds}</div>
                  </div>
                )}
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Total Tests</div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Passed</div>
                  <div className="text-2xl font-bold text-green-600">{stats.passed}</div>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Failed</div>
                  <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Pass Rate</div>
                  <div className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</div>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Cost</div>
                  <div className="text-2xl font-bold">
                    {formatCost(stats.totalCost)}
                  </div>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Tokens</div>
                  <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {stats.promptTokens.toLocaleString()} in &rarr; {stats.completionTokens.toLocaleString()} out
                  </div>
                </div>
              </div>

              {/* Tool usage summary */}
              {stats.toolStats.total > 0 && (() => {
                const ts = stats.toolStats;
                const knownEntries = Object.entries(ts.breakdown).filter(([name]) => KNOWN_TOOLS.has(name));
                return (
                  <div className="bg-card border rounded-lg overflow-hidden mb-6">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b bg-muted/30">
                      <span className="text-sm font-medium">Tool Calls: {ts.total}</span>
                      <span className="text-sm text-green-600">{ts.success} successful</span>
                      {ts.failed > 0 && <span className="text-sm text-red-600">{ts.failed} failed</span>}
                      {ts.invalid > 0 && <span className="text-sm text-orange-500">{ts.invalid} invalid</span>}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left px-4 py-1.5 font-medium">Tool</th>
                          <th className="text-right px-4 py-1.5 font-medium">Total</th>
                          <th className="text-right px-4 py-1.5 font-medium text-green-600">OK</th>
                          <th className="text-right px-4 py-1.5 font-medium text-red-500">Failed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {knownEntries.map(([name, counts]) => (
                          <tr key={name} className="border-t border-border/50">
                            <td className="px-4 py-1.5 font-medium">{name}</td>
                            <td className="px-4 py-1.5 text-right text-muted-foreground">{counts.total}</td>
                            <td className="px-4 py-1.5 text-right text-green-600">{counts.success}</td>
                            <td className={`px-4 py-1.5 text-right ${counts.failed > 0 ? 'text-red-500 font-medium' : 'text-red-500/40'}`}>
                              {counts.failed}
                            </td>
                          </tr>
                        ))}
                        {ts.invalid > 0 && (
                          <tr className="border-t border-border/50">
                            <td className="px-4 py-1.5 font-medium text-orange-500">invalid</td>
                            <td className="px-4 py-1.5 text-right text-orange-500">{ts.invalid}</td>
                            <td className="px-4 py-1.5 text-right text-green-600/40">0</td>
                            <td className="px-4 py-1.5 text-right text-red-500 font-medium">{ts.invalid}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </>
          );
        })()}

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Popover open={showModelSettings} onOpenChange={setShowModelSettings}>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <span>{getModelDisplayName(currentModel)}</span>
                {showModelSettings ? (
                  <ChevronDown className="h-4 w-4 ml-2" />
                ) : (
                  <ChevronUp className="h-4 w-4 ml-2" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
              <ModelSettingsPanel
                onClose={() => setShowModelSettings(false)}
                onModelChange={(modelId) => setCurrentModel(modelId)}
                showJudgeModel
                onJudgeModelChange={(modelId) => setJudgeModel(modelId)}
              />
            </PopoverContent>
          </Popover>

          <div className="inline-flex items-center rounded-md border border-input">
            <button
              onClick={() => setTotalRounds(r => Math.max(1, r - 1))}
              disabled={isRunning || totalRounds <= 1}
              className="h-9 w-8 inline-flex items-center justify-center rounded-l-md hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="h-9 px-2 inline-flex items-center justify-center text-sm font-medium min-w-[5rem] border-x border-input select-none">
              {totalRounds} Round{totalRounds > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setTotalRounds(r => Math.min(10, r + 1))}
              disabled={isRunning || totalRounds >= 10}
              className="h-9 w-8 inline-flex items-center justify-center rounded-r-md hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {testTracks.map(track => (
            <Button
              key={track.id}
              onClick={() => runTrack(track.id)}
              disabled={isRunning}
              variant={activeTrack === track.id ? 'default' : 'outline'}
            >
              <Play className="h-4 w-4 mr-2" />
              {track.name} ({track.scenarioIds.length})
            </Button>
          ))}
          <Button
            onClick={() => runTrack('all')}
            disabled={isRunning}
            variant={activeTrack === 'all' ? 'default' : 'outline'}
          >
            <Play className="h-4 w-4 mr-2" />
            All ({allScenarioIds.length})
          </Button>
          {isRunning ? (
            <Button variant="destructive" onClick={stopBenchmark}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button variant="outline" onClick={resetTests}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}

          {(overallStats.total > 0 || roundHistory.length > 0) && (
            <>
              <div className="w-px h-6 bg-border self-center" />
              <Button variant="outline" onClick={exportJSON} disabled={isRunning}>
                <Download className="h-4 w-4 mr-2" />
                JSON
              </Button>
              <Button variant="outline" onClick={exportMarkdown} disabled={isRunning}>
                <Download className="h-4 w-4 mr-2" />
                Markdown
              </Button>
            </>
          )}
        </div>

        {/* Test Results — grouped by track */}
        <div className="space-y-8">
          {testTracks.map(track => {
            const report = trackReports[track.id];
            return (
              <div key={track.id}>
                {/* Track header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {track.name}
                  </h2>
                  <span className="text-xs text-muted-foreground">{track.description}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Scenarios in this track */}
                <div className="grid gap-4">
                  {track.scenarioIds.map(scenarioId => {
                    const result = testResults.find(r => r.id === scenarioId);
                    const scenario = testScenarios.find(s => s.id === scenarioId);
                    if (!result || !scenario) return null;

                    return (
                      <div key={result.id} className="bg-card border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 font-medium">
                              {getStatusIcon(result.status)}
                              {result.name}
                              <span className="text-sm font-normal text-muted-foreground">
                                ({scenario.category})
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {scenario.prompt.substring(0, 100)}...
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {result.executionTime && (
                              <span className="text-sm text-muted-foreground">
                                {(result.executionTime / 1000).toFixed(1)}s
                              </span>
                            )}
                            {result.status === 'running' && runningTest === result.id ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => stopTest(result.id)}
                              >
                                <Square className="h-3 w-3 mr-1" />
                                Stop
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runSingleTest(result.id)}
                                disabled={isRunning}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Test
                              </Button>
                            )}
                            {(result.status === 'running' || result.generationOutput || expandedTests.has(result.id)) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setExpandedTests(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(result.id)) {
                                      newSet.delete(result.id);
                                    } else {
                                      newSet.add(result.id);
                                    }
                                    return newSet;
                                  });
                                }}
                              >
                                {expandedTests.has(result.id) ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        {/* Generation Output Display */}
                        {(result.status === 'running' || expandedTests.has(result.id)) && (result.generationOutput || generationOutputs.get(result.id)) && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-sm font-medium text-muted-foreground">Generation Output</div>
                              {result.status === 'running' && (
                                <div className="flex items-center gap-1">
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  <span className="text-xs text-muted-foreground">Generating...</span>
                                </div>
                              )}
                            </div>
                            <div
                              className="bg-muted/50 rounded-md p-3 max-h-64 overflow-y-auto"
                              ref={(el) => {
                                if (el) {
                                  generationOutputRefs.current.set(result.id, el);
                                }
                              }}
                            >
                              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80">
                                {result.generationOutput || generationOutputs.get(result.id) || ''}
                              </pre>
                            </div>
                          </div>
                        )}

                        {(result.status === 'success' || result.status === 'failed' || result.status === 'stopped') && (
                          <div className="mt-3 pt-3 border-t space-y-2 text-sm">
                            {result.details && (
                              <div>
                                <strong>Result:</strong> {result.details}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              {result.totalCost !== undefined && (
                                <span>
                                  <strong className="text-foreground">Cost:</strong>{' '}
                                  {formatCost(result.totalCost)}
                                </span>
                              )}
                              {result.totalTokens !== undefined && (
                                <span>
                                  <strong className="text-foreground">Tokens:</strong>{' '}
                                  {(result.promptTokens || 0).toLocaleString()} &rarr; {(result.completionTokens || 0).toLocaleString()} ({result.totalTokens.toLocaleString()} total)
                                </span>
                              )}
                              {result.toolCalls !== undefined && (
                                <span>
                                  <strong className="text-foreground">Tool Calls:</strong> {result.toolCalls}
                                </span>
                              )}
                            </div>
                            {result.toolCallDetails && result.toolCallDetails.length > 0 && (() => {
                              const ts = computeToolStats(result.toolCallDetails);
                              return (
                                <div className="mt-1">
                                  <div className="text-xs text-muted-foreground mb-1">
                                    <span className="font-medium text-foreground">{ts.total} tool call{ts.total !== 1 ? 's' : ''}</span>
                                    {' — '}
                                    <span className="text-green-600">{ts.success} ok</span>
                                    {ts.failed > 0 && <>, <span className="text-red-500">{ts.failed} failed</span></>}
                                    {ts.invalid > 0 && <>, <span className="text-orange-500">{ts.invalid} invalid</span></>}
                                  </div>
                                  <div className="space-y-0.5 font-mono text-xs">
                                    {result.toolCallDetails.map((tc, i) => {
                                      const isInvalid = !KNOWN_TOOLS.has(tc.name);
                                      return (
                                        <div key={i} className="flex items-center gap-1.5">
                                          <span className={tc.status === 'success' && !isInvalid ? 'text-green-500' : isInvalid ? 'text-orange-500' : 'text-red-500'}>
                                            {tc.status === 'success' && !isInvalid ? '\u2713' : '\u2717'}
                                          </span>
                                          <span className={`font-semibold ${isInvalid ? 'text-orange-500' : ''}`}>{tc.name}</span>
                                          {isInvalid && (
                                            <span className="text-orange-500 text-[10px] border border-orange-400/50 rounded px-1">invalid</span>
                                          )}
                                          {tc.args && (
                                            <span className="text-muted-foreground truncate max-w-md">
                                              &mdash; {tc.args}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                            {result.assertionResults && result.assertionResults.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-dashed">
                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                  Assertions: {result.assertionResults.filter(a => a.passed).length}/{result.assertionResults.length} passed
                                  {result.assertionScore !== undefined && ` (${result.assertionScore.toFixed(0)}%)`}
                                </div>
                                <div className="space-y-0.5 font-mono text-xs">
                                  {result.assertionResults.map((ar, i) => (
                                    <div key={i} className="flex items-start gap-1.5">
                                      <span className={ar.passed ? 'text-green-500' : 'text-red-500'}>
                                        {ar.passed ? '\u2713' : '\u2717'}
                                      </span>
                                      <span className={ar.passed ? 'text-muted-foreground' : 'text-foreground'}>
                                        {ar.assertion.description}
                                      </span>
                                      {!ar.passed && ar.actual && (
                                        <span className="text-red-400 truncate max-w-sm">
                                          &mdash; {ar.actual}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {result.errors && result.errors.length > 0 && (
                              <div className="text-red-600">
                                <strong>Errors:</strong> {result.errors.join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Track Report — shown when all tests in this track are done */}
                {report.allDone && (
                  <div className="mt-4 bg-muted/40 border rounded-lg p-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
                      <h3 className="text-sm font-semibold">{track.name} Track Report</h3>
                      <span className="text-xs text-muted-foreground">
                        Passed: {report.passed}/{report.total} ({report.successRate.toFixed(1)}%)
                        {report.totalAssertions > 0 && (
                          <>&nbsp;|&nbsp; Assertions: {report.passedAssertions}/{report.totalAssertions} ({report.assertionScore.toFixed(0)}%)</>
                        )}
                        {report.selfEvalTotal > 0 && (
                          <>&nbsp;|&nbsp; Self-eval accuracy: {report.selfEvalCorrect}/{report.selfEvalTotal}</>
                        )}
                        &nbsp;|&nbsp; Avg time: {(report.avgTime / 1000).toFixed(1)}s
                        &nbsp;|&nbsp; Cost: {formatCost(report.totalCost)}
                        &nbsp;|&nbsp; Tokens: {report.totalTokens.toLocaleString()}
                        &nbsp;|&nbsp; Tool calls: {report.totalToolCalls}
                        {' ('}
                        <span className="text-green-600">{report.toolStats.success} ok</span>
                        {report.toolStats.failed > 0 && <>, <span className="text-red-500">{report.toolStats.failed} fail</span></>}
                        {report.toolStats.invalid > 0 && <>, <span className="text-orange-500">{report.toolStats.invalid} invalid</span></>}
                        {')'}
                        {Object.keys(report.toolStats.breakdown).length > 0 && (
                          <> &mdash; {Object.entries(report.toolStats.breakdown)
                            .filter(([name]) => KNOWN_TOOLS.has(name))
                            .map(([name, counts], i) => (
                            <span key={name}>
                              {i > 0 ? ', ' : ''}
                              {name}: {counts.total}
                              {counts.failed > 0 && <span className="text-red-500"> ({counts.failed}&#x2717;)</span>}
                            </span>
                          ))}</>
                        )}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {report.results.map(r => {
                        const isPass = r.status === 'success';
                        return (
                          <div key={r.id} className="flex items-center gap-2 text-xs font-mono">
                            <span className={isPass ? 'text-green-500' : 'text-red-500'}>
                              {isPass ? '\u2713' : '\u2717'}
                            </span>
                            <span className="w-48 truncate">{r.id}</span>
                            <span className="w-16 text-right text-muted-foreground">
                              {r.executionTime ? `${(r.executionTime / 1000).toFixed(1)}s` : '—'}
                            </span>
                            <span className="w-20 text-right text-muted-foreground">
                              {r.totalCost !== undefined ? formatCost(r.totalCost) : ''}
                            </span>
                            <span className="w-20 text-right text-muted-foreground">
                              {r.totalTokens !== undefined ? `${r.totalTokens.toLocaleString()} tok` : ''}
                            </span>
                            <span className="w-32 text-muted-foreground">
                              {r.toolCallDetails && r.toolCallDetails.length > 0 ? (() => {
                                const ts = computeToolStats(r.toolCallDetails);
                                return (
                                  <>
                                    {ts.total} tools
                                    {' ('}
                                    <span className="text-green-600">{ts.success}</span>
                                    {ts.failed > 0 && <>/<span className="text-red-500">{ts.failed}</span></>}
                                    {ts.invalid > 0 && <>/<span className="text-orange-500">{ts.invalid}!</span></>}
                                    {')'}
                                  </>
                                );
                              })() : r.toolCalls !== undefined ? `${r.toolCalls} tools` : ''}
                            </span>
                            {r.assertionScore !== undefined && (
                              <span className={`w-16 text-right ${r.assertionScore === 100 ? 'text-green-500' : r.assertionScore > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {r.assertionScore.toFixed(0)}%
                              </span>
                            )}
                            {r.errors && r.errors.length > 0 && (
                              <span className="text-red-500 truncate">— {r.errors[0]}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Aggregated Results Table — multi-round only */}
        {benchmarkComplete && roundHistory.length > 1 && aggregatedResults.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-border" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Aggregated Results ({roundHistory.length} Rounds)
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="bg-card border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Test</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Pass Rate</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Avg Time</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Min/Max</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Avg Cost</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Avg Tokens</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Avg Tools</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Assert %</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedResults.map(r => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${
                        r.passRate === 100 ? 'text-green-500' : r.passRate > 0 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {r.passRate.toFixed(0)}%
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          ({r.passCount}/{r.roundCount})
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {(r.avgTime / 1000).toFixed(1)}s
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground text-xs">
                        {(r.minTime / 1000).toFixed(1)}s / {(r.maxTime / 1000).toFixed(1)}s
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {formatCost(r.avgCost)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {Math.round(r.avgTokens).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {r.avgToolCalls.toFixed(1)}
                      </td>
                      <td className={`px-4 py-2 text-right ${
                        r.avgAssertionScore !== undefined
                          ? r.avgAssertionScore === 100 ? 'text-green-500' : r.avgAssertionScore > 0 ? 'text-yellow-500' : 'text-red-500'
                          : 'text-muted-foreground'
                      }`}>
                        {r.avgAssertionScore !== undefined ? `${r.avgAssertionScore.toFixed(0)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
