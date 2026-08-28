import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * One setting inside a Section: label + optional description on the left, control on the right.
 * Stacked rows divide themselves with a top border (the first row has none), replacing the
 * ad-hoc bordered boxes the settings panes used to hand-roll.
 */
export function SettingRow({
  title,
  description,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  /** The control (Switch, Button, Select, ToggleGroup …). */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 py-3 border-t border-border first:border-t-0',
        className,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
