export function getExternalAccountUrl(): string | null {
  return process.env.NEXT_PUBLIC_GATEWAY_URL
    ? `${process.env.NEXT_PUBLIC_GATEWAY_URL}/account`
    : null;
}
