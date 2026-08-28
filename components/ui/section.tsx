import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The shared main-menu grouping primitive: a bordered card with an optional muted header strip
 * (icon · title · action slot) and a body. Lifted from the workspace's PanelContainer/PanelHeader
 * so listings, settings groups, and dashboard cards all read the same.
 */
export function Section({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('bg-card border border-border rounded-lg overflow-hidden', className)}>
      {children}
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  /** Right-aligned action slot (buttons, segmented controls, counts). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border',
        className,
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <h2 className="text-[13px] font-semibold leading-none">{title}</h2>
      {children && <div className="ml-auto flex items-center gap-1.5">{children}</div>}
    </header>
  );
}

export function SectionBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('p-4', className)}>{children}</div>;
}
