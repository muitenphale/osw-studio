/** Persist open editor buffers to the VFS before Save or publish. */
export async function flushEditorToVfs(): Promise<void> {
  if (typeof window === 'undefined') return;
  const waiters: Promise<void>[] = [];
  window.dispatchEvent(new CustomEvent('osw-flush-editor', { detail: { waiters } }));
  if (waiters.length === 0) return;
  await Promise.race([
    Promise.all(waiters),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);
}
