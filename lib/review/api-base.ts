/**
 * Where review comment traffic is addressed.
 *
 * Under the review copy's own prefix rather than under `/api`, because the participant session is
 * minted with `path=/review/{deploymentId}` (lib/review/session.ts). RFC 6265 §5.1.4 path matching
 * means a browser sends that cookie to nothing outside the prefix: an endpoint at `/api/review/...`
 * is reachable, but never with the cookie that says who is calling, so every write from a client
 * arrives anonymous and is refused. Widening the cookie to `/` would fix the symptom by handing
 * one review copy's session to every other one on the instance.
 *
 * The `osw-api` segment keeps the endpoints clear of the customer's own pages, which the catch-all
 * under this same prefix serves. It shadows exactly three URLs in the review copy, and a published
 * site holding a real page at one of them is not a case worth designing around.
 *
 * It deliberately does not begin with an underscore: Next keeps any directory whose name starts
 * with `_` out of the router entirely, so `__osw` would have to be spelled `%5F%5Fosw` on disk to
 * route at all, and a percent-escaped directory name is a puzzle for the next reader.
 *
 * Shared so the widget, the studio's review tab and the routes cannot drift apart — the widget
 * cannot import at runtime (it ships as script text), so it interpolates this at build time.
 */
export function reviewApiBase(deploymentId: string): string {
  return `/review/${encodeURIComponent(deploymentId)}/osw-api`;
}
