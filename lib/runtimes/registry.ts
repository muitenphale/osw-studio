import type { ProjectRuntime } from '@/lib/vfs/types';

export interface RuntimeConfig {
  id: ProjectRuntime;
  label: string;
  description: string;
  previewMode: 'visual' | 'terminal';
  bundled: boolean;
  jsxImportSource?: string;
  sfcExtension?: string;
  compilerCdnUrl?: string;
  sourceExtensions: string[];
  badge: { label: string; color: string };
  starterTemplateId: string;
}

export const RUNTIME_CONFIGS: RuntimeConfig[] = [
  {
    id: 'static',
    label: 'Static Website',
    description: 'HTML, CSS, JavaScript with Handlebars templating',
    previewMode: 'visual',
    bundled: false,
    sourceExtensions: [],
    badge: { label: 'Static', color: 'gray' },
    starterTemplateId: 'blank',
  },
  {
    id: 'react',
    label: 'React + TypeScript',
    description: 'Component-based app with auto-bundling',
    previewMode: 'visual',
    bundled: true,
    jsxImportSource: 'react',
    sourceExtensions: ['.tsx', '.ts', '.jsx'],
    badge: { label: 'React', color: 'sky' },
    starterTemplateId: 'react-starter',
  },
  {
    id: 'preact',
    label: 'Preact + TypeScript',
    description: 'Lightweight React alternative with signals',
    previewMode: 'visual',
    bundled: true,
    jsxImportSource: 'preact',
    sourceExtensions: ['.tsx', '.ts', '.jsx'],
    badge: { label: 'Preact', color: 'purple' },
    starterTemplateId: 'preact-starter',
  },
  {
    id: 'svelte',
    label: 'Svelte',
    description: 'Compile-time reactive framework',
    previewMode: 'visual',
    bundled: true,
    sfcExtension: '.svelte',
    compilerCdnUrl: 'https://esm.sh/svelte@5/compiler',
    sourceExtensions: ['.svelte', '.ts'],
    badge: { label: 'Svelte', color: 'orange' },
    starterTemplateId: 'svelte-starter',
  },
  {
    id: 'vue',
    label: 'Vue',
    description: 'Progressive framework with SFC support',
    previewMode: 'visual',
    bundled: true,
    sfcExtension: '.vue',
    compilerCdnUrl: 'https://esm.sh/@vue/compiler-sfc@3',
    sourceExtensions: ['.vue', '.ts'],
    badge: { label: 'Vue', color: 'green' },
    starterTemplateId: 'vue-starter',
  },
];

const configMap = new Map(RUNTIME_CONFIGS.map(c => [c.id, c]));

export function getRuntimeConfig(id: ProjectRuntime): RuntimeConfig {
  return configMap.get(id) ?? configMap.get('static')!;
}

export function getProjectRuntimes(): { value: ProjectRuntime; label: string; description: string }[] {
  return RUNTIME_CONFIGS.map(c => ({ value: c.id, label: c.label, description: c.description }));
}

export function isRuntimeBundled(runtime: ProjectRuntime): boolean {
  return getRuntimeConfig(runtime).bundled;
}

const BADGE_CLASSES: Record<string, string> = {
  gray:   'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
  sky:    'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800',
  purple: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800',
  orange: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-800',
  green:  'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800',
};

export function getRuntimeBadge(runtime: ProjectRuntime): { label: string; className: string } {
  const cfg = getRuntimeConfig(runtime);
  return {
    label: cfg.badge.label,
    className: BADGE_CLASSES[cfg.badge.color] || BADGE_CLASSES.gray,
  };
}
