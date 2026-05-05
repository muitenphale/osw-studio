'use client';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

export function SwitchWorkspaceLink() {
  if (!GATEWAY_URL) return null;

  return (
    <a
      href={`${GATEWAY_URL}/account`}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Switch workspace
    </a>
  );
}
