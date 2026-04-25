'use client';

import { useState } from 'react';
import type { BriefState, ProjectBrief } from '@/lib/describe/types';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown } from 'lucide-react';

interface BriefSidebarProps {
  state: BriefState;
  ready?: boolean;
  creating?: boolean;
  onCreateNow?: () => void;
}

/** Known brief keys that get explicit rendering — everything else renders dynamically. */
const KNOWN_KEYS = new Set([
  'name', 'type', 'pages', 'styling', 'capabilities', 'direction', 'notes',
  // Under-the-hood keys (shown separately)
  'runtime', 'template',
]);

/** Known capability keys with explicit labels. */
const CAP_LABELS: Record<string, string> = {
  serverFunctions: 'Server functions',
  database: 'Database',
  auth: 'Authentication',
  scheduledTasks: 'Scheduled tasks',
};

/** Convert camelCase/snake_case to readable label. */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}

/** Format any value for display. */
function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(v => formatValue(v)).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Compute capabilities list from known booleans + any extras. */
function getCapabilitiesList(caps: ProjectBrief['capabilities']): string[] {
  if (!caps || typeof caps !== 'object') return [];
  const items: string[] = [];
  for (const [k, v] of Object.entries(caps)) {
    if (k === 'other' && Array.isArray(v)) {
      items.push(...v);
    } else if (CAP_LABELS[k] && v) {
      items.push(CAP_LABELS[k]);
    } else if (!CAP_LABELS[k] && k !== 'other' && v != null) {
      // Stray capability
      items.push(Array.isArray(v) ? `${humanizeKey(k)}: ${v.join(', ')}` : `${humanizeKey(k)}: ${formatValue(v)}`);
    }
  }
  return items;
}

/** Collect brief fields not covered by explicit rendering. */
function getExtraFields(brief: ProjectBrief): Array<{ label: string; value: string }> {
  const extras: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(brief)) {
    if (KNOWN_KEYS.has(key) || value == null) continue;
    extras.push({ label: humanizeKey(key), value: formatValue(value) });
  }
  return extras;
}

export function BriefSidebar({ state, ready, creating, onCreateNow }: BriefSidebarProps) {
  const { brief, pending, totalDecisions, resolvedCount, spec } = state;
  const percentage = totalDecisions > 0
    ? Math.round((resolvedCount / totalDecisions) * 100)
    : 0;

  const capabilities = getCapabilitiesList(brief.capabilities);
  const extraFields = getExtraFields(brief);
  const hasSpec = spec.length > 0;

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* ── Sticky header ── */}
      <div className="shrink-0 p-4 border-b border-border space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Project brief
        </p>
        <p className="text-sm font-medium truncate">
          {brief.name || <span className="italic text-muted-foreground">Untitled</span>}
        </p>
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {resolvedCount} of ~{totalDecisions} decisions &middot; {percentage}%
          </p>
        </div>
      </div>

      {/* ── Scrollable middle ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Read-only notice */}
        <div className="mx-4 mt-3 px-2.5 py-1.5 rounded-md bg-muted/60 text-[11px] text-muted-foreground leading-tight">
          Brief is read-only. To change anything, ask the agent.
        </div>

        {/* Fields */}
        <div className="p-4 space-y-4 text-sm">
          <Field label="Type" value={brief.type} />
          <Field label="Pages" value={brief.pages?.join(', ')} />
          <Field label="Styling" value={brief.styling} />
          {capabilities.length > 0 && (
            <Field label="Capabilities" value={capabilities.join(', ')} />
          )}
          <Field label="Direction" value={brief.direction} />
          <Field label="Notes" value={brief.notes} />

          {/* Dynamic extra fields from LLM */}
          {extraFields.map(({ label, value }) => (
            <Field key={label} label={label} value={value} />
          ))}

          {/* Pending decisions */}
          {pending.length > 0 && (
            <div className="pt-3 border-t border-dashed border-border space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Still to decide
              </p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                {pending.map((p, i) => (
                  <li key={i}>{p.label}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Spec preview — collapsible */}
          {hasSpec && <SpecPreview spec={spec} />}
        </div>
      </div>

      {/* ── Sticky bottom: under the hood + create ── */}
      <div className="shrink-0 border-t border-border">
        <div className="p-4 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Under the hood
          </p>
          <HoodRow label="Runtime" value={brief.runtime ?? '—'} />
          <HoodRow label="Template" value={brief.template ?? '—'} />
          <HoodRow label="Output" value={hasSpec ? '.PROMPT.md + .DESIGN.md' : '.PROMPT.md'} />
        </div>

        {onCreateNow && (
          <div className="px-4 pb-4">
            <Button
              onClick={onCreateNow}
              disabled={!ready || creating}
              className="w-full"
              size="sm"
            >
              {creating ? (
                <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Creating...</>
              ) : (
                'Create now'
              )}
            </Button>
            {!ready && (
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                Needs name, runtime, and template
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function HoodRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-muted-foreground">{value}</span>
    </div>
  );
}

/** Collapsible preview of accumulated .DESIGN.md sections. */
function SpecPreview({ spec }: { spec: BriefState['spec'] }) {
  const [open, setOpen] = useState(true);

  // Merge sections with the same heading for display
  const merged = new Map<string, string[]>();
  for (const s of spec) {
    const existing = merged.get(s.heading);
    if (existing) {
      existing.push(s.content);
    } else {
      merged.set(s.heading, [s.content]);
    }
  }

  return (
    <div className="pt-3 border-t border-border space-y-1.5">
      <button
        type="button"
        className="flex items-center gap-1.5 w-full text-left"
        onClick={() => setOpen(prev => !prev)}
      >
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${!open ? '-rotate-90' : ''}`} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Spec ({spec.length} {spec.length === 1 ? 'section' : 'sections'})
        </p>
      </button>
      {open && (
        <div className="space-y-3 pl-1">
          {Array.from(merged).map(([heading, contents]) => (
            <div key={heading}>
              <p className="text-[11px] font-medium text-foreground/80">{heading}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {contents.join('\n\n')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
