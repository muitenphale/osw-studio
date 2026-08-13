import { toast } from 'sonner';

/**
 * A toast that reports sync progress in place and resolves to its own result.
 *
 * A push is now many sequential requests and a pull writes files one at a time, so a toast that
 * only fires at the end reads as a hang for exactly as long as the work takes. Same shape as the
 * folder drop in `components/file-explorer/index.tsx`: one `toast.loading` with a stable id,
 * updated as work lands, then resolved to success or error on that id so it replaces itself
 * rather than stacking.
 *
 * **Nothing is raised until the work turns out to be a sequence.** Most pushes fit in one request
 * and finish faster than a toast can be read, and the callers that show one (duplicate, import)
 * already announce the result themselves — a progress toast for those is noise on top of a
 * message that was already there. `update` materialises the toast the first time it is told the
 * total is more than one; `success` and `error` always report, on the existing toast when there
 * is one and on their own when there is not.
 *
 * Totals are known before the first request on both sides — batch count for a push, file count
 * for a pull — so this reports a real ratio rather than a spinner. `components/ui/` has no
 * progress primitive, so the ratio is carried as text.
 */
export interface SyncProgressToast {
  update: (done: number, total: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  /** Finish without a verdict, for a caller whose own toast reports the outcome. */
  dismiss: () => void;
}

/** A no-op handle, so a silent caller runs the same code path without a toast. */
export const silentProgressToast: SyncProgressToast = {
  update: () => {},
  success: () => {},
  error: () => {},
  dismiss: () => {},
};

export function createSyncProgressToast(label: string): SyncProgressToast {
  let id: string | number | undefined;

  return {
    update: (done, total) => {
      if (total <= 1 && id === undefined) return;
      const text = `${label} (${done}/${total})`;
      if (id === undefined) id = toast.loading(text);
      else toast.loading(text, { id });
    },
    success: (message) => {
      if (id === undefined) id = toast.success(message);
      else toast.success(message, { id });
    },
    error: (message) => {
      if (id === undefined) id = toast.error(message);
      else toast.error(message, { id });
    },
    dismiss: () => {
      if (id !== undefined) toast.dismiss(id);
    },
  };
}
