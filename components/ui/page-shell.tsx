import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The shell every main-menu page inherits: a full-height column whose header stays put and whose
 * body either scrolls (default) or fills so an inner table scrolls (`fill`). Both center at a shared
 * max width. `maxWidth` defaults to `max-w-7xl` for the listing pages; Settings/Docs pass narrower.
 */
export function PageShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('h-full flex flex-col min-h-0', className)}>{children}</div>;
}

export function PageHeader({
  title,
  maxWidth = 'max-w-7xl',
  className,
  dataTourId,
  children,
}: {
  /** The page title - always the first item in the header row. */
  title: React.ReactNode;
  maxWidth?: string;
  className?: string;
  /** Applied to the inner flex row, for guided-tour anchoring. */
  dataTourId?: string;
  /** Toolbar controls (New, search, sort, view toggle ...). */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6', className)}>
      <div
        className={cn('mx-auto flex flex-col sm:flex-row sm:items-center gap-3', maxWidth)}
        data-tour-id={dataTourId}
      >
        <h1 className="text-lg font-semibold shrink-0">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function PageBody({
  maxWidth = 'max-w-7xl',
  /** Fill mode: the body doesn't scroll itself; its inner column fills so a nested table scrolls. */
  fill = false,
  className,
  innerClassName,
  bodyRef,
  children,
}: {
  maxWidth?: string;
  fill?: boolean;
  className?: string;
  /** Overrides the default inner wrapper. */
  innerClassName?: string;
  /** Ref on the outer body element (e.g. a pagination scroll target). */
  bodyRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={bodyRef}
      className={cn(
        'flex-1 min-h-0 px-4 pb-4 sm:px-6 sm:pb-6',
        fill ? 'flex flex-col' : 'overflow-auto',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto w-full',
          maxWidth,
          innerClassName ?? (fill ? 'flex-1 min-h-0 flex flex-col' : 'flex flex-col gap-4'),
        )}
      >
        {children}
      </div>
    </div>
  );
}
