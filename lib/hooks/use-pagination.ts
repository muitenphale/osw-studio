'use client';

import { useEffect, useMemo, useState } from 'react';

export interface UsePaginationOptions {
  perPage: number;
  /** When any of these values change, current page resets to 1. */
  resetOn?: unknown[];
}

export interface UsePaginationResult<T> {
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  total: number;
  pageItems: T[];
  rangeStart: number; // 1-based
  rangeEnd: number;   // 1-based, inclusive
}

export function usePagination<T>(
  items: T[],
  { perPage, resetOn = [] }: UsePaginationOptions
): UsePaginationResult<T> {
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Clamp page if the list shrinks below the current page's start.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Reset to page 1 when filters/sort change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, resetOn);

  const pageItems = useMemo(() => {
    const start = (page - 1) * perPage;
    return items.slice(start, start + perPage);
  }, [items, page, perPage]);

  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(total, page * perPage);

  return { page, setPage, totalPages, total, pageItems, rangeStart, rangeEnd };
}
