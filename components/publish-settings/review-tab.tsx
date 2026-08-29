'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageSquare,
  MessagesSquare,
  Copy,
  Check,
  ExternalLink,
  CornerDownRight,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Section, SectionBody, SectionHeader } from '@/components/ui/section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingRow } from '@/components/ui/setting-row';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MIN_REVIEW_PASSWORD_LENGTH } from '@/lib/api/deployment-review-merge';
import { reviewApiBase } from '@/lib/review/api-base';
import type { WireComment, WireParticipant } from '@/lib/review/comment-view';
import { cn, logger } from '@/lib/utils';

import {
  REVIEW_EXPIRY_CHOICES,
  type ReviewExpiryDuration,
  type ReviewFilter,
  buildThreads,
  countThreads,
  describeAnchor,
  expiryOptionToIso,
  filterThreads,
  isReviewExpired,
  participantColor,
  timeAgo,
} from './review-logic';

/**
 * The review block as the studio edits it.
 *
 * `passwordHash` is absent because the API never sends one (lib/api/deployment-public.ts) and never
 * accepts one either — the plaintext goes up under `password` and the server hashes it. The three
 * states of that field are the wire contract in lib/api/deployment-review-merge.ts: undefined
 * leaves the stored hash alone, null clears it, a string sets it.
 */
export interface ReviewDraft {
  enabled: boolean;
  expiresAt?: string;
  notifyByEmail?: boolean;
  /** Server-reported: whether a password is currently stored. Read-only. */
  reviewPasswordSet: boolean;
  password?: string | null;
}

interface ReviewTabProps {
  deploymentId: string;
  review: ReviewDraft;
  onChange: (review: ReviewDraft) => void;
  /**
   * Whether review mode is on in the *stored* record. The comment API answers 404 for a deployment
   * whose review is off (lib/review/access.ts), so an unsaved toggle cannot load an inbox yet.
   */
  storedEnabled: boolean;
  /** Any unsaved edit on the settings page, from the same tracking that drives the Save button. */
  isDirty: boolean;
  hasBeenPublished: boolean;
  hasPendingChanges: boolean;
  isPublishing: boolean;
  onPublish: () => void;
  onOpenInEditor: (pagePath: string) => void;
}

interface CommentsResponse {
  comments: WireComment[];
  participants: WireParticipant[];
  viewer: { participant_id: string; is_team: boolean };
}

export function ReviewTab({
  deploymentId,
  review,
  onChange,
  storedEnabled,
  isDirty,
  hasBeenPublished,
  hasPendingChanges,
  isPublishing,
  onPublish,
  onOpenInEditor,
}: ReviewTabProps) {
  const update = (patch: Partial<ReviewDraft>) => onChange({ ...review, ...patch });

  // ── Address ──────────────────────────────────────────────────────────────
  // Unlike the public URL, which the server resolves because slugs and custom domains change where
  // a deployment is served from, the review copy has exactly one address: app/review/[deploymentId]
  // is a route on this origin and nothing reroutes it.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const reviewUrl = `${origin}/review/${deploymentId}/`;

  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy the address');
    }
  };

  // ── Password ─────────────────────────────────────────────────────────────
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const tooShort = passwordInput.length > 0 && passwordInput.length < MIN_REVIEW_PASSWORD_LENGTH;

  /**
   * Only a password that meets the server's rule reaches the draft. Anything shorter stays in the
   * input and leaves the intent at "keep", so pressing Save while mid-typing cannot send a value
   * the route would reject.
   */
  const handlePasswordInput = (value: string) => {
    setPasswordInput(value);
    update({ password: value.length >= MIN_REVIEW_PASSWORD_LENGTH ? value : undefined });
  };

  const cancelPasswordEdit = () => {
    setPasswordEditing(false);
    setPasswordInput('');
    update({ password: undefined });
  };

  const passwordState: 'pending-set' | 'pending-clear' | 'set' | 'unset' =
    typeof review.password === 'string'
      ? 'pending-set'
      : review.password === null
        ? 'pending-clear'
        : review.reviewPasswordSet
          ? 'set'
          : 'unset';

  // ── Expiry ───────────────────────────────────────────────────────────────
  const expired = isReviewExpired(review.expiresAt);
  const expiryLabel = review.expiresAt
    ? new Date(review.expiresAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  const handleExpiryChange = (value: string) => {
    if (value === 'current') return;
    update({ expiresAt: expiryOptionToIso(value as 'never' | ReviewExpiryDuration) });
  };

  // ── Build state ──────────────────────────────────────────────────────────
  // The review copy is written by a publish, so switching the toggle on does not make the address
  // answer. `settingsVersion` bumps on that toggle (reviewChangeNeedsRepublish), which is what puts
  // the deployment into pending-changes here.
  const notBuilt = review.enabled && (isDirty || !hasBeenPublished || hasPendingChanges);
  const buildNotice = !review.enabled
    ? null
    : isDirty
      ? 'Review mode is not saved yet. Save changes, then publish to build the review copy.'
      : !hasBeenPublished
        ? 'This deployment has never been published, so there is no review copy yet. The address returns nothing until you publish.'
        : hasPendingChanges
          ? 'The review copy has not been built yet. The address returns nothing until you publish.'
          : null;

  const statusBadge = !review.enabled ? (
    <Badge variant="secondary">Off</Badge>
  ) : notBuilt ? (
    <Badge variant="outline" className="border-amber-500 text-amber-500">
      Publish to apply
    </Badge>
  ) : expired ? (
    <Badge variant="secondary">Closed</Badge>
  ) : (
    <Badge variant="outline" className="border-green-500 text-green-500">
      Live
    </Badge>
  );

  return (
    <div className="flex flex-col gap-4">
      <Section>
        <SectionHeader icon={MessagesSquare} title="Review mode">
          {statusBadge}
        </SectionHeader>
        <SectionBody className="px-4 py-1">
          <SettingRow
            title="Build a review copy of this site"
            description="Publishing writes a second, private copy carrying the comment widget. The public site is unchanged and never carries it."
          >
            <Switch
              id="review-enabled"
              checked={review.enabled}
              onCheckedChange={(checked) => update({ enabled: checked })}
            />
          </SettingRow>

          {review.enabled && (
            <>
              <SettingRow
                className="flex-wrap"
                title="Address"
                description={
                  <>
                    Anyone with this address can open the review copy and comment, unless you set a
                    password.
                    <span className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5">
                      <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground">
                        {reviewUrl}
                      </code>
                    </span>
                  </>
                }
              >
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={copyAddress} className="gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(reviewUrl, '_blank')}
                    className="gap-1.5"
                    disabled={notBuilt}
                    title={notBuilt ? 'Publish first — the review copy has not been built' : undefined}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </Button>
                </div>
              </SettingRow>

              <SettingRow
                className="flex-wrap"
                title={
                  <>
                    Password <span className="font-normal text-muted-foreground">— optional</span>
                  </>
                }
                description={
                  passwordEditing ? (
                    <>
                      Asked for once, then remembered in the reviewer&apos;s browser.
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <Input
                          autoFocus
                          type="password"
                          value={passwordInput}
                          onChange={(e) => handlePasswordInput(e.target.value)}
                          placeholder="New password"
                          className="h-8 w-full max-w-[220px] text-[13px]"
                        />
                        <span
                          className={cn(
                            'text-xs',
                            tooShort ? 'text-destructive' : 'text-muted-foreground'
                          )}
                        >
                          At least {MIN_REVIEW_PASSWORD_LENGTH} characters
                        </span>
                      </span>
                    </>
                  ) : (
                    <>Asked for once, then remembered in the reviewer&apos;s browser.</>
                  )
                }
              >
                <div className="flex items-center gap-1.5">
                  {passwordEditing ? (
                    <>
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={typeof review.password !== 'string'}
                        onClick={() => setPasswordEditing(false)}
                      >
                        Done
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelPasswordEdit}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {passwordState === 'pending-set'
                          ? 'Set on save'
                          : passwordState === 'pending-clear'
                            ? 'Cleared on save'
                            : passwordState === 'set'
                              ? 'Set'
                              : 'Not set'}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPasswordInput('');
                          setPasswordEditing(true);
                        }}
                      >
                        {review.reviewPasswordSet ? 'Change' : 'Set'}
                      </Button>
                      {passwordState === 'set' && (
                        <Button variant="ghost" size="sm" onClick={() => update({ password: null })}>
                          Clear
                        </Button>
                      )}
                      {(passwordState === 'pending-set' || passwordState === 'pending-clear') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => update({ password: undefined })}
                        >
                          Undo
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </SettingRow>

              <SettingRow
                className="flex-wrap"
                title="Email notifications"
                description="This instance cannot send email yet, so nothing is delivered and no digest is queued. Comments are kept and read here."
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Not available</Badge>
                  <Switch id="review-notify" checked={false} disabled />
                </div>
              </SettingRow>

              <SettingRow
                className="flex-wrap"
                title={
                  <>
                    Stop serving{' '}
                    <span className="font-normal text-muted-foreground">— optional</span>
                  </>
                }
                description={
                  expiryLabel
                    ? expired
                      ? `Closed on ${expiryLabel}. The address returns nothing; the comments below are kept.`
                      : `Closes on ${expiryLabel}. After that the address returns nothing. Comments are kept.`
                    : 'The address keeps working until you turn review mode off.'
                }
              >
                <Select value={review.expiresAt ? 'current' : 'never'} onValueChange={handleExpiryChange}>
                  <SelectTrigger id="review-expiry" className="w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {review.expiresAt && (
                      <SelectItem value="current">{expired ? 'Closed' : 'Keep current date'}</SelectItem>
                    )}
                    {REVIEW_EXPIRY_CHOICES.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
            </>
          )}
        </SectionBody>
      </Section>

      {buildNotice && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 sm:flex-row sm:items-center dark:border-yellow-800 dark:bg-yellow-950">
          <p className="min-w-0 flex-1 text-sm text-yellow-800 dark:text-yellow-200">{buildNotice}</p>
          {!isDirty && (
            <Button variant="outline" size="sm" onClick={onPublish} disabled={isPublishing}>
              {isPublishing ? 'Publishing…' : 'Publish now'}
            </Button>
          )}
        </div>
      )}

      <ReviewComments
        deploymentId={deploymentId}
        storedEnabled={storedEnabled}
        onOpenInEditor={onOpenInEditor}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ReviewComments({
  deploymentId,
  storedEnabled,
  onOpenInEditor,
}: {
  deploymentId: string;
  storedEnabled: boolean;
  onOpenInEditor: (pagePath: string) => void;
}) {
  const [data, setData] = useState<CommentsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>('open');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${reviewApiBase(deploymentId)}/comments`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Could not load comments');
      setData((await response.json()) as CommentsResponse);
    } catch (err) {
      logger.error('[ReviewTab] Failed to load comments:', err);
      setError('Could not load comments.');
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    if (!storedEnabled) {
      setData(null);
      return;
    }
    void load();
  }, [storedEnabled, load]);

  const threads = useMemo(() => buildThreads(data?.comments ?? []), [data]);
  const counts = useMemo(() => countThreads(threads), [threads]);
  const visible = useMemo(() => filterThreads(threads, filter), [threads, filter]);

  const setStatus = async (commentId: string, status: 'open' | 'resolved') => {
    setBusyId(commentId);
    try {
      const response = await fetch(`${reviewApiBase(deploymentId)}/comments/${commentId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Could not update the comment');
      await load();
    } catch (err) {
      logger.error('[ReviewTab] Failed to change comment status:', err);
      toast.error('Could not update the comment');
    } finally {
      setBusyId(null);
    }
  };

  const postReply = async (root: WireComment) => {
    const body = replyBody.trim();
    if (!body) return;

    setBusyId(root.id);
    try {
      // Only content travels: authorship is derived server-side from the account session, so a
      // reply from here carries the team badge without this asking for it.
      const response = await fetch(`${reviewApiBase(deploymentId)}/comments`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          parent_id: root.id,
          page_path: root.page_path,
          selector: root.selector ?? undefined,
          anchor_text: root.anchor_text ?? undefined,
        }),
      });
      if (!response.ok) throw new Error('Could not post the reply');
      setReplyingTo(null);
      setReplyBody('');
      await load();
    } catch (err) {
      logger.error('[ReviewTab] Failed to post reply:', err);
      toast.error('Could not post the reply');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section>
      <SectionHeader icon={MessageSquare} title="Comments" className="flex-wrap gap-y-2">
        {storedEnabled && (
          <>
            <ToggleGroup
              type="single"
              value={filter}
              onValueChange={(value) => value && setFilter(value as ReviewFilter)}
            >
              <ToggleGroupItem value="open" size="sm" className="text-xs">
                Open · {counts.open}
              </ToggleGroupItem>
              <ToggleGroupItem value="resolved" size="sm" className="text-xs">
                Resolved · {counts.resolved}
              </ToggleGroupItem>
              <ToggleGroupItem value="all" size="sm" className="text-xs">
                All
              </ToggleGroupItem>
            </ToggleGroup>
            <Button variant="ghost" size="sm" onClick={load} title="Reload comments">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </>
        )}
      </SectionHeader>

      <SectionBody className="px-4 py-1">
        {!storedEnabled ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Comments are kept, but they can only be read while review mode is on.
          </p>
        ) : loading && !data ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {counts.all === 0
              ? 'No comments yet. Send the address to whoever is reviewing.'
              : filter === 'open'
                ? 'Nothing open.'
                : 'Nothing resolved yet.'}
          </p>
        ) : (
          visible.map((thread, index) => (
            // Wraps rather than squeezing: the actions are a fixed width, so on a narrow column an
            // unwrapped row would shrink the comment body to one word per line.
            <div
              key={thread.root.id}
              className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-border py-3 first:border-t-0"
            >
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums',
                  thread.root.status === 'resolved'
                    ? 'bg-green-500/15 text-green-600 dark:text-green-500'
                    : 'bg-primary/15 text-primary'
                )}
              >
                {index + 1}
              </span>

              <div className="min-w-[10rem] flex-1">
                <div className="text-[13px]">{thread.root.body}</div>
                <CommentMeta comment={thread.root} />

                {thread.replies.map((reply) => (
                  <div key={reply.id} className="mt-2 border-l-2 border-border pl-3">
                    <div className="flex items-start gap-1.5 text-xs">
                      <CornerDownRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                      <span>{reply.body}</span>
                    </div>
                    <CommentMeta comment={reply} anchored={false} />
                  </div>
                ))}

                {replyingTo === thread.root.id && (
                  <div className="mt-2 flex flex-col gap-2">
                    <Textarea
                      autoFocus
                      rows={2}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Reply…"
                      className="text-[13px]"
                    />
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={!replyBody.trim() || busyId === thread.root.id}
                        onClick={() => postReply(thread.root)}
                      >
                        {busyId === thread.root.id ? 'Posting…' : 'Post reply'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyBody('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="ml-auto flex shrink-0 flex-wrap items-start justify-end gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReplyingTo(thread.root.id);
                    setReplyBody('');
                  }}
                >
                  Reply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenInEditor(thread.root.page_path)}
                >
                  Open in editor
                </Button>
                <Button
                  variant={thread.root.status === 'resolved' ? 'ghost' : 'accent'}
                  size="sm"
                  disabled={busyId === thread.root.id}
                  onClick={() =>
                    setStatus(thread.root.id, thread.root.status === 'resolved' ? 'open' : 'resolved')
                  }
                >
                  {thread.root.status === 'resolved' ? 'Reopen' : 'Resolve'}
                </Button>
              </div>
            </div>
          ))
        )}
      </SectionBody>
    </Section>
  );
}

function CommentMeta({ comment, anchored = true }: { comment: WireComment; anchored?: boolean }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      {anchored && <span className="font-mono">{describeAnchor(comment)}</span>}
      <span className="inline-flex items-center gap-1.5">
        <i
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: participantColor(comment.participant_id, comment.is_team) }}
        />
        <b className="font-semibold text-foreground">{comment.author_name}</b>
        {comment.is_team && (
          <span className="rounded-full border border-border px-1.5 py-px text-[10px]">team</span>
        )}
      </span>
      <span>{timeAgo(comment.created_at)}</span>
    </div>
  );
}
