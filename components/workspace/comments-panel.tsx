"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { userMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  readCommentDraft,
  writeCommentDraft,
  clearPostedCommentDraft,
} from "./comment-draft-storage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CommentDraftGuard = () => {
  unsaved: boolean;
  recoveredLocally: boolean;
};

export interface CommentsPanelProps {
  id: Id<"documents">;
  userId: Id<"users">;
  initialDraft?: string | null;
  onDraftGuardChange?: (guard: CommentDraftGuard | null) => void;
  onDraftStateChange?: (body: string | null) => void;
  open: boolean;
  returnFocusRef?: import("react").RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  role: "owner" | "editor" | "viewer";
}

export function CommentsPanel({
  id,
  userId,
  initialDraft,
  onDraftGuardChange,
  onDraftStateChange,
  open,
  onOpenChange,
  role,
  returnFocusRef,
}: CommentsPanelProps) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const comments = useQuery(api.comments.list, open ? { id } : "skip");
  const add = useMutation(api.comments.add);
  const setResolved = useMutation(api.comments.setResolved);
  const remove = useMutation(api.comments.remove);
  const draftKey = `folio-comment-draft:${userId}:${id}`;
  const [body, setBody] = useState(
    () => initialDraft ?? readCommentDraft(draftKey) ?? "",
  );
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const [recoveryAvailable, setRecoveryAvailable] = useState(true);
  useEffect(() => {
    const current = bodyRef.current;
    onDraftStateChange?.(current.trim() ? current : null);
  }, [onDraftStateChange]);
  const draftGuard = useCallback<CommentDraftGuard>(() => {
    const current = bodyRef.current;
    const unsaved = Boolean(current.trim());
    const recoveredLocally = !unsaved || writeCommentDraft(draftKey, current);
    setRecoveryAvailable(recoveredLocally);
    return { unsaved, recoveredLocally };
  }, [draftKey]);
  useEffect(() => {
    onDraftGuardChange?.(draftGuard);
    return () => onDraftGuardChange?.(null);
  }, [draftGuard, onDraftGuardChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const current = bodyRef.current;
      if (current.trim() && !writeCommentDraft(draftKey, current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftKey]);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<Id<"comments"> | null>(null);
  const [deleteId, setDeleteId] = useState<Id<"comments"> | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState("");
  const canWrite = role !== "viewer";
  const visible = comments?.filter(
    (comment) => showResolved || !comment.resolved,
  );
  const unresolvedCount =
    comments?.filter((comment) => !comment.resolved).length ?? 0;
  const resolvedCount =
    comments?.filter((comment) => comment.resolved).length ?? 0;

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || posting || !body.trim()) return;
    setPosting(true);
    setError("");
    const submittedBody = bodyRef.current;
    try {
      await add({ id, body: submittedBody.trim() });
      clearPostedCommentDraft(draftKey, submittedBody);
      if (bodyRef.current === submittedBody) {
        bodyRef.current = "";
        setBody("");
        onDraftStateChange?.(null);
      }
      setRecoveryAvailable(true);
    } catch (cause) {
      setError(
        userMessage(cause, "Could not post your comment. Please try again."),
      );
    } finally {
      setPosting(false);
    }
  }

  async function resolve(commentId: Id<"comments">, resolved: boolean) {
    setBusyId(commentId);
    setError("");
    try {
      await setResolved({ id, commentId, resolved });
    } catch (cause) {
      setError(
        userMessage(cause, "Could not update this comment. Please try again."),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteComment(commentId: Id<"comments">) {
    setBusyId(commentId);
    setError("");
    try {
      await remove({ id, commentId });
      setDeleteId(null);
      doneRef.current?.focus();
    } catch (cause) {
      setError(
        userMessage(cause, "Could not delete this comment. Please try again."),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        returnFocusRef={returnFocusRef}
        className="gap-5 sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-5">
            <MessageSquare className="h-5 w-5 text-primary" /> Comments
          </DialogTitle>
          <DialogDescription>
            Keep feedback close to the document.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {unresolvedCount} open{" "}
            {unresolvedCount === 1 ? "comment" : "comments"}
          </p>
          {resolvedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={showResolved}
              onClick={() => setShowResolved(!showResolved)}
            >
              {showResolved
                ? "Hide resolved"
                : `Show resolved (${resolvedCount})`}
            </Button>
          )}
        </div>
        <div className="max-h-[42dvh] min-h-28 overflow-y-auto pr-1">
          {comments === undefined ? (
            <p
              role="status"
              className="py-8 text-center text-sm text-muted-foreground"
            >
              Loading comments…
            </p>
          ) : visible?.length ? (
            <ol className="space-y-5">
              {visible.map((comment) => (
                <li key={comment._id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {comment.authorName}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(comment.createdAt)}
                        {comment.resolved ? " · Resolved" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canWrite && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={busyId !== null}
                          aria-label={`${comment.resolved ? "Reopen" : "Resolve"} comment by ${comment.authorName}`}
                          title={
                            comment.resolved
                              ? "Reopen comment"
                              : "Resolve comment"
                          }
                          onClick={() =>
                            void resolve(comment._id, !comment.resolved)
                          }
                        >
                          {busyId === comment._id ? (
                            <Loader2 className="animate-spin" />
                          ) : comment.resolved ? (
                            <CheckCircle2 className="text-primary" />
                          ) : (
                            <Circle />
                          )}
                        </Button>
                      )}
                      {comment.canRemove && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                          disabled={busyId !== null}
                          aria-label={`Delete comment by ${comment.authorName}`}
                          title="Delete comment"
                          onClick={(event) => {
                            deleteTriggerRef.current = event.currentTarget;
                            setDeleteId(comment._id);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p
                    className={`mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed ${comment.resolved ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    {comment.body}
                  </p>
                  {deleteId === comment._id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-secondary p-3">
                      <span className="mr-auto text-xs">
                        Delete this comment?
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId !== null}
                        onClick={() => {
                          setDeleteId(null);
                          deleteTriggerRef.current?.focus();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId !== null}
                        onClick={() => void deleteComment(comment._id)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="py-8 text-center">
              <p className="font-serif text-xl">
                {resolvedCount ? "All caught up." : "Start a conversation."}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {resolvedCount
                  ? "The feedback here has been resolved."
                  : "Add feedback, questions, or a note for your collaborators."}
              </p>
            </div>
          )}
        </div>
        {canWrite ? (
          <form onSubmit={post} className="space-y-3 border-t pt-4">
            <Label htmlFor="document-comment">Add a comment</Label>
            <Textarea
              id="document-comment"
              value={body}
              onChange={(event) => {
                const next = event.target.value;
                bodyRef.current = next;
                setBody(next);
                onDraftStateChange?.(next.trim() ? next : null);
                setRecoveryAvailable(writeCommentDraft(draftKey, next));
              }}
              maxLength={2000}
              disabled={posting}
              placeholder="What would you like to discuss?"
              aria-describedby="comment-length"
            />
            {!recoveryAvailable && body.trim() && (
              <p role="status" className="text-xs text-destructive">
                This browser cannot keep a recovery copy. Post or copy your
                comment before leaving.
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span
                id="comment-length"
                className="text-[11px] text-muted-foreground"
              >
                {body.length.toLocaleString()} / 2,000
              </span>
              <Button type="submit" disabled={posting || !body.trim()}>
                {posting && <Loader2 className="animate-spin" />}
                {posting ? "Posting…" : "Post comment"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              You have view-only access. Ask the owner for edit access to join
              the discussion.
            </p>
            {body.trim() && (
              <>
                <Label htmlFor="unposted-comment">Unposted comment draft</Label>
                <Textarea
                  id="unposted-comment"
                  aria-label="Unposted comment draft"
                  value={body}
                  readOnly
                  rows={3}
                />
                <p
                  className={`text-xs leading-relaxed ${recoveryAvailable ? "text-muted-foreground" : "text-destructive"}`}
                >
                  {recoveryAvailable
                    ? "Your draft is kept in this browser. You can select and copy it; posting requires edit access."
                    : "This browser cannot keep a recovery copy. Select and copy this draft before leaving."}
                </p>
              </>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            ref={doneRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
