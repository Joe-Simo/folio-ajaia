"use client";
import { isConflict, userMessage } from "@/lib/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { DocumentEditor } from "@/components/editor/document-editor";
import { ShareDialog } from "@/components/share-dialog";
import { CommentsPanel, type CommentDraftGuard } from "./comments-panel";
import { readCommentDraft, writeCommentDraft } from "./comment-draft-storage";
import { Textarea } from "@/components/ui/textarea";
import { HistoryPanel } from "./history-panel";
import { PresenceIndicator } from "./presence-indicator";
import { downloadMarkdown, downloadPdf } from "@/lib/document-export";
import { Button } from "@/components/ui/button";
import { DocumentTitle } from "@/components/editor/document-title";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  Cloud,
  Loader2,
  MoreHorizontal,
  Share2,
  Upload,
  Trash2,
  Download,
  AlertCircle,
  LockKeyhole,
  MessageSquare,
  History,
  FileText,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  readDraft,
  writeDraft,
  removeDraft,
  acknowledgeDraft,
  type Draft,
} from "./draft-storage";
export type NavigationSaveResult = { safe: boolean; recoveredLocally: boolean };
export type NavigationGuard = () => Promise<NavigationSaveResult>;
type NavigationGuardProps = {
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
type RetainedDraft = { userId: Id<"users">; draft: Draft };
function downloadLocalDraft(draft: Draft) {
  const blob = new Blob([JSON.stringify(JSON.parse(draft.content), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    (draft.title.replace(/[^a-z0-9_-]+/gi, "-") || "document") + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type LoadedDocument = NonNullable<FunctionReturnType<typeof api.documents.get>>;
export function DocumentSession({
  id,
  onDeleted,
  onImport,
  onNavigationGuardChange,
}: NavigationGuardProps & {
  id: Id<"documents">;
  onDeleted: () => void;
  onImport: () => void;
}) {
  const doc = useQuery(api.documents.get, { id });
  const user = useQuery(api.users.current);
  const retainedDraft = useRef<RetainedDraft | null>(null);
  const retainedComment = useRef<{ userId: Id<"users">; body: string } | null>(
    null,
  );
  const currentUserId = useRef(user?._id);
  currentUserId.current = user?._id;
  const [leaveUnavailableOpen, setLeaveUnavailableOpen] = useState(false);
  const captureDraft = useCallback(
    (draft: Draft | null) => {
      if (!user || currentUserId.current !== user._id) return;
      retainedDraft.current = draft
        ? { userId: user._id, draft: { ...draft } }
        : null;
    },
    [user],
  );
  const captureComment = useCallback(
    (body: string | null) => {
      if (!user || currentUserId.current !== user._id) return;
      retainedComment.current = body ? { userId: user._id, body } : null;
    },
    [user],
  );
  const unavailableComment =
    doc === null && user
      ? retainedComment.current?.userId === user._id
        ? retainedComment.current.body
        : readCommentDraft(`folio-comment-draft:${user._id}:${id}`)
      : null;
  const unavailableDraft =
    doc === null && user
      ? retainedDraft.current?.userId === user._id
        ? retainedDraft.current.draft
        : readDraft("folio-draft:" + user._id + ":" + id)
      : null;
  const hasUnavailableWork = Boolean(
    unavailableDraft || unavailableComment?.trim(),
  );
  useEffect(() => {
    if (
      doc !== null ||
      !user ||
      !hasUnavailableWork ||
      !onNavigationGuardChange
    )
      return;
    const recoveryKey = "folio-draft:" + user._id + ":" + id;
    onNavigationGuardChange(async () => ({
      safe: false,
      recoveredLocally:
        (!unavailableDraft || writeDraft(recoveryKey, unavailableDraft)) &&
        (!unavailableComment ||
          writeCommentDraft(
            `folio-comment-draft:${user._id}:${id}`,
            unavailableComment,
          )),
    }));
    return () => onNavigationGuardChange(null);
  }, [
    doc,
    user,
    id,
    unavailableDraft,
    unavailableComment,
    hasUnavailableWork,
    onNavigationGuardChange,
  ]);
  useEffect(() => {
    if (!hasUnavailableWork) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnavailableWork]);
  if (doc === undefined || user === undefined)
    return (
      <div className="document-opening" role="status">
        <Loader2 className="animate-spin" size={20} />
        Opening document…
      </div>
    );
  if (!doc || !user)
    return (
      <>
        <div className="library-empty">
          <LockKeyhole size={35} />
          <h2>This page is not available.</h2>
          <p>It may have been deleted, or your access was removed.</p>
          {hasUnavailableWork && (
            <p role="alert">
              Your unsaved local work is still available. Download or copy it
              before leaving this page.
            </p>
          )}
          {unavailableDraft && (
            <Button onClick={() => downloadLocalDraft(unavailableDraft)}>
              Download local draft
            </Button>
          )}
          {unavailableComment && (
            <Textarea
              className="max-w-2xl"
              aria-label="Unposted comment draft"
              readOnly
              value={unavailableComment}
            />
          )}
          <Button
            variant="outline"
            onClick={() =>
              hasUnavailableWork ? setLeaveUnavailableOpen(true) : onDeleted()
            }
          >
            Back to workspace
          </Button>
        </div>
        <Dialog
          open={leaveUnavailableOpen}
          onOpenChange={setLeaveUnavailableOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Leave this local draft?</DialogTitle>
              <DialogDescription>
                Download or copy your unsaved work first if you want to keep it.
                Leaving will close this in-memory copy.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setLeaveUnavailableOpen(false)}
              >
                Keep draft open
              </Button>
              <Button variant="destructive" onClick={onDeleted}>
                Leave draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  return (
    <LoadedSession
      key={user._id}
      doc={doc}
      userId={user._id}
      onDeleted={onDeleted}
      onImport={onImport}
      onNavigationGuardChange={onNavigationGuardChange}
      onDraftStateChange={captureDraft}
      onCommentDraftStateChange={captureComment}
      initialDraft={
        retainedDraft.current?.userId === user._id
          ? retainedDraft.current.draft
          : null
      }
      initialCommentDraft={
        retainedComment.current?.userId === user._id
          ? retainedComment.current.body
          : null
      }
    />
  );
}
function LoadedSession({
  doc,
  userId,
  onDeleted,
  onImport,
  onNavigationGuardChange,
  onDraftStateChange,
  onCommentDraftStateChange,
  initialDraft,
  initialCommentDraft,
}: NavigationGuardProps & {
  onDraftStateChange: (draft: Draft | null) => void;
  onCommentDraftStateChange: (body: string | null) => void;
  initialDraft: Draft | null;
  initialCommentDraft: string | null;
  doc: LoadedDocument;
  userId: Id<"users">;
  onDeleted: () => void;
  onImport: () => void;
}) {
  const update = useMutation(api.documents.update);
  const remove = useMutation(api.documents.remove);
  const restoreVersion = useMutation(api.history.restore);
  const [draft, setDraft] = useState<Draft>(
    () =>
      initialDraft ?? {
        title: doc.title,
        content: doc.content,
        revision: doc.revision,
      },
  );
  const [editorVersion, setEditorVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [share, setShare] = useState(false);
  const shareTriggerRef = useRef<HTMLButtonElement>(null);
  const commentsTriggerRef = useRef<HTMLButtonElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const draftRef = useRef(draft);
  const busyRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const [localRecoveryAvailable, setLocalRecoveryAvailable] = useState(true);
  const dirtyRef = useRef(false);
  const commentDraftGuard = useRef<CommentDraftGuard | null>(null);
  const registerCommentGuard = useCallback(
    (guard: CommentDraftGuard | null) => {
      commentDraftGuard.current = guard;
    },
    [],
  );
  const initialized = useRef(false);
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  const key = `folio-draft:${userId}:${doc._id}`;
  const canEdit = doc.role !== "viewer";
  const setDraftValue = useCallback((next: Draft, syncEditor = false) => {
    draftRef.current = next;
    setDraft(next);
    if (syncEditor) setEditorVersion((version) => version + 1);
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const local = initialDraft ?? readDraft(key);
    if (!local) return;
    if (local.title !== doc.title || local.content !== doc.content) {
      setDraftValue(local, true);
      onDraftStateChange(local);
      setDirty(true);
      dirtyRef.current = true;
      setRecovered(true);
      setConflict(local.revision !== doc.revision);
    } else {
      removeDraft(key);
      onDraftStateChange(null);
    }
  }, [
    key,
    doc.title,
    doc.content,
    doc.revision,
    canEdit,
    setDraftValue,
    onDraftStateChange,
    initialDraft,
  ]);
  useEffect(() => {
    if (busyRef.current) return;
    if (doc.revision > draftRef.current.revision) {
      const current = draftRef.current;
      if (
        dirtyRef.current &&
        (current.title !== doc.title || current.content !== doc.content)
      )
        setConflict(true);
      else {
        if (dirtyRef.current) {
          acknowledgeDraft(key, current, current, doc.revision);
          dirtyRef.current = false;
          setDirty(false);
          setConflict(false);
          setError("");
          setRecovered(false);
          onDraftStateChange(null);
        }
        setDraftValue(
          { title: doc.title, content: doc.content, revision: doc.revision },
          true,
        );
      }
    }
  }, [doc, saving, key, setDraftValue, onDraftStateChange]);
  useEffect(() => {
    if (!canEdit) {
      if (dirtyRef.current) {
        onDraftStateChange(draftRef.current);
        return;
      }
      setDirty(false);
      dirtyRef.current = false;
      setConflict(false);
      setDraftValue(
        {
          title: doc.title,
          content: doc.content,
          revision: doc.revision,
        },
        true,
      );
    }
  }, [canEdit, doc, setDraftValue, onDraftStateChange]);
  const save = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (!dirtyRef.current || busyRef.current || conflict || !canEdit)
      return Promise.resolve();
    const snapshot = { ...draftRef.current };
    if (!snapshot.title.trim()) {
      setError("Give your document a title before saving.");
      return Promise.resolve();
    }
    busyRef.current = true;
    setSaving(true);
    setError("");
    const operation = (async () => {
      try {
        const result = await update({
          id: doc._id,
          title: snapshot.title,
          content: snapshot.content,
          expectedRevision: snapshot.revision,
        });
        const current = draftRef.current;
        const changed =
          current.title !== snapshot.title ||
          current.content !== snapshot.content;
        acknowledgeDraft(key, snapshot, current, result.revision);
        setDraftValue({
          ...current,
          title: changed ? current.title : snapshot.title.trim(),
          revision: result.revision,
        });
        setDirty(changed);
        dirtyRef.current = changed;
        onDraftStateChange(
          changed ? { ...current, revision: result.revision } : null,
        );
        if (!changed) setRecovered(false);
      } catch (e) {
        const message = userMessage(
          e,
          "Could not save. Please check your connection and retry.",
        );
        if (isConflict(e)) setConflict(true);
        else setError(message);
        setDirty(true);
        dirtyRef.current = true;
        onDraftStateChange(draftRef.current);
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
    })();
    inFlightRef.current = operation;
    void operation.finally(() => {
      if (inFlightRef.current === operation) inFlightRef.current = null;
    });
    return operation;
  }, [
    canEdit,
    conflict,
    doc._id,
    key,
    setDraftValue,
    update,
    onDraftStateChange,
  ]);

  useEffect(() => {
    if (!onNavigationGuardChange) return;
    const guard: NavigationGuard = async () => {
      // Offline Convex mutations intentionally wait for reconnection. Navigation
      // must offer a choice instead of waiting indefinitely for that promise.
      const flush = async () => {
        if (inFlightRef.current) await inFlightRef.current;
        if (dirtyRef.current) await save();
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        flush(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 2500);
        }),
      ]);
      if (timer) clearTimeout(timer);
      const recoveredLocally = dirtyRef.current
        ? writeDraft(key, draftRef.current)
        : true;
      setLocalRecoveryAvailable(recoveredLocally);
      const comment = commentDraftGuard.current?.();
      const commentSafe = !comment?.unsaved || comment.recoveredLocally;
      return {
        safe: !dirtyRef.current && !busyRef.current && commentSafe,
        recoveredLocally: recoveredLocally && commentSafe,
      };
    };
    onNavigationGuardChange(guard);
    return () => onNavigationGuardChange(null);
  }, [onNavigationGuardChange, key, save]);
  useEffect(() => {
    if (!dirty || saving || conflict || error) return;
    const timer = setTimeout(() => void save(), 900);
    return () => clearTimeout(timer);
  }, [draft, dirty, saving, conflict, error, save]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);
  function edit(values: Partial<Pick<Draft, "title" | "content">>) {
    if (!canEdit) return;
    const next = { ...draftRef.current, ...values };
    setDraftValue(next);
    onDraftStateChange(next);
    setDirty(true);
    dirtyRef.current = true;
    setError("");
    setLocalRecoveryAvailable(writeDraft(key, next));
  }
  function reload() {
    const current = latestDoc.current;
    setDraftValue(
      {
        title: current.title,
        content: current.content,
        revision: current.revision,
      },
      true,
    );
    setDirty(false);
    dirtyRef.current = false;
    setConflict(false);
    setError("");
    setRecovered(false);
    removeDraft(key);
    onDraftStateChange(null);
  }
  function download() {
    downloadLocalDraft(draft);
  }
  async function restore(versionId: Id<"versions">) {
    if (dirtyRef.current || busyRef.current || !canEdit) {
      toast.error("Save your current draft before restoring a version.");
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const beforeRestore = { ...draftRef.current };
      const result = await restoreVersion({
        id: doc._id,
        versionId,
        expectedRevision: beforeRestore.revision,
      });
      acknowledgeDraft(key, beforeRestore, beforeRestore, result.revision);
      onDraftStateChange(null);
      setHistoryOpen(false);
      toast.success("Version restored as a new revision");
    } catch (cause) {
      if (isConflict(cause)) setConflict(true);
      throw cause;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }
  async function exportFile(format: "markdown" | "pdf") {
    setExporting(true);
    const toastId = toast.loading(
      format === "pdf" ? "Preparing PDF…" : "Preparing Markdown…",
    );
    try {
      if (format === "markdown") downloadMarkdown(draft.title, draft.content);
      else await downloadPdf(draft.title, draft.content);
      toast.success(
        format === "pdf" ? "PDF export ready" : "Markdown export ready",
        { id: toastId },
      );
    } catch (cause) {
      toast.error(userMessage(cause, "Could not export this document."), {
        id: toastId,
      });
    } finally {
      setExporting(false);
    }
  }
  async function deleteDoc() {
    setDeleting(true);
    try {
      await remove({ id: doc._id });
      writeCommentDraft(`folio-comment-draft:${userId}:${doc._id}`, "");
      onCommentDraftStateChange(null);
      removeDraft(key);
      onDraftStateChange(null);
      toast.success("Document deleted");
      onDeleted();
    } catch (e) {
      toast.error(
        userMessage(e, "Could not delete this document. Please try again."),
      );
    } finally {
      setDeleting(false);
    }
  }
  const status =
    !canEdit && dirty
      ? "Local draft · view-only access"
      : conflict
        ? "Newer changes available"
        : error
          ? "Changes not saved"
          : saving
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : "All changes saved";
  return (
    <>
      <header className="workspace-header document-header">
        <div className="document-heading-meta">
          <div className="breadcrumb-line">
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <span className="breadcrumb-title">
              {draft.title || "Untitled document"}
            </span>
          </div>
          <div
            className={
              "save-status " + (error || conflict ? "status-error" : "")
            }
            role="status"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : dirty || conflict || error ? (
              <Cloud size={14} />
            ) : (
              <Check size={14} />
            )}
            <span>{status}</span>
            {!canEdit && <span className="view-only-label">View only</span>}
            <PresenceIndicator documentId={doc._id} userId={userId} />
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="outline"
            className="import-header"
            onClick={onImport}
          >
            <Upload size={16} />
            Import
          </Button>
          {dirty && !conflict && (
            <Button
              variant="outline"
              onClick={() => void save()}
              disabled={saving || !canEdit}
            >
              Save
            </Button>
          )}
          <Button
            ref={commentsTriggerRef}
            variant="outline"
            className="comments-trigger"
            aria-label="Comments"
            onClick={() => setCommentsOpen(true)}
          >
            <MessageSquare size={16} />
            <span>Comments</span>
          </Button>
          <Button ref={shareTriggerRef} onClick={() => setShare(true)}>
            <Share2 size={16} />
            <span>{doc.role === "owner" ? "Share" : "Access"}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={actionsTriggerRef}
                variant="ghost"
                size="icon"
                aria-label="Document actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                <History size={15} />
                Version history
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={exporting}
                onClick={() => void exportFile("markdown")}
              >
                <FileText size={15} />
                Export Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={exporting}
                onClick={() => void exportFile("pdf")}
              >
                <FileDown size={15} />
                {exporting ? "Preparing export…" : "Export PDF"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={download}>
                <Download size={15} />
                Download document JSON
              </DropdownMenuItem>
              {doc.role === "owner" && (
                <DropdownMenuItem
                  className="text-red-700"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} />
                  Delete document
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {!canEdit && dirty && (
        <div className="save-notice" role="alert">
          <LockKeyhole size={17} />
          <span>
            Your access changed to view-only. Your unsaved local draft is still
            shown. Download it before loading the saved document.
          </span>
          <Button variant="outline" size="sm" onClick={download}>
            Download local draft
          </Button>
          <Button variant="outline" size="sm" onClick={reload}>
            Load saved document
          </Button>
        </div>
      )}
      {dirty && !localRecoveryAvailable && (
        <div className="save-notice" role="alert">
          <AlertCircle size={17} />
          <span>
            This browser cannot keep a recovery copy. Keep this document open
            until it is saved, or download your draft.
          </span>
          <Button variant="outline" size="sm" onClick={download}>
            Download draft
          </Button>
        </div>
      )}
      {canEdit && (conflict || error || recovered) && (
        <div className="save-notice" role="alert">
          <AlertCircle size={17} />
          <span>
            {conflict
              ? "Someone saved a newer version. Your draft is still open; download it before loading the latest version."
              : error || "Recovered your unsaved draft from this browser."}
          </span>
          {conflict ? (
            <>
              <Button variant="outline" size="sm" onClick={download}>
                Download my draft
              </Button>
              <Button variant="outline" size="sm" onClick={reload}>
                Load latest
              </Button>
            </>
          ) : error ? (
            <Button size="sm" variant="outline" onClick={() => void save()}>
              Retry save
            </Button>
          ) : null}
        </div>
      )}
      <div className="document-stage">
        <article className="paper">
          <div className="paper-title-area">
            <p className="small-kicker">
              {doc.role === "owner"
                ? "YOUR DOCUMENT"
                : `SHARED BY ${doc.owner.name.toUpperCase()}`}
            </p>
            <DocumentTitle
              value={draft.title}
              readOnly={!canEdit}
              onChange={(title) => edit({ title })}
            />
            <p className="paper-byline">
              {canEdit
                ? "A little space to make your thinking clear."
                : "You have view-only access to this document."}
            </p>
          </div>
          <DocumentEditor
            syncKey={editorVersion}
            content={draft.content}
            editable={canEdit}
            onChange={(content) => edit({ content })}
          />
        </article>
      </div>
      <CommentsPanel
        userId={userId}
        onDraftGuardChange={registerCommentGuard}
        onDraftStateChange={onCommentDraftStateChange}
        initialDraft={initialCommentDraft}
        returnFocusRef={commentsTriggerRef}
        id={doc._id}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        role={doc.role}
      />
      <HistoryPanel
        returnFocusRef={actionsTriggerRef}
        id={doc._id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        role={doc.role}
        onRestore={restore}
        allowRestore={canEdit && !dirty && !saving && !conflict}
      />
      <ShareDialog
        returnFocusRef={shareTriggerRef}
        documentId={doc._id}
        title={draft.title}
        isOwner={doc.role === "owner"}
        open={share}
        onOpenChange={setShare}
      />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent returnFocusRef={actionsTriggerRef}>
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription>
              “{draft.title}” will be permanently deleted for you and everyone
              it is shared with. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep document
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void deleteDoc()}
            >
              {deleting ? "Deleting…" : "Delete document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
