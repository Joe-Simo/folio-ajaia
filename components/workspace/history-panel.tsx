"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { userMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface HistoryPanelProps {
  id: Id<"documents">;
  open: boolean;
  returnFocusRef?: import("react").RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  role: "owner" | "editor" | "viewer";
  allowRestore: boolean;
  onRestore: (versionId: Id<"versions">) => Promise<void> | void;
}

/** A history preview is text only; saved document markup is never inserted as HTML. */
function previewText(content: string): string {
  function visit(value: unknown, depth = 0): string {
    if (!value || typeof value !== "object" || depth > 32) return "";
    const node = value as Record<string, unknown>;
    if (node.type === "text")
      return typeof node.text === "string" ? node.text : "";
    if (node.type === "hardBreak") return "\n";
    const text = Array.isArray(node.content)
      ? node.content.map((child) => visit(child, depth + 1)).join("")
      : "";
    return [
      "paragraph",
      "heading",
      "blockquote",
      "codeBlock",
      "listItem",
    ].includes(String(node.type))
      ? `${text}\n\n`
      : text;
  }
  try {
    return visit(JSON.parse(content)).trim();
  } catch {
    return "This version cannot be previewed.";
  }
}

export function HistoryPanel({
  id,
  open,
  onOpenChange,
  role,
  allowRestore,
  onRestore,
  returnFocusRef,
}: HistoryPanelProps) {
  const versions = useQuery(api.history.list, open ? { id } : "skip");
  const [selectedId, setSelectedId] = useState<Id<"versions"> | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const activeId = versions?.some((version) => version._id === selectedId)
    ? selectedId
    : (versions?.[0]?._id ?? null);
  const version = useQuery(
    api.history.get,
    open && activeId ? { id, versionId: activeId } : "skip",
  );
  const selectedMeta = versions?.find((entry) => entry._id === activeId);
  const text = useMemo(
    () => (version ? previewText(version.content) : ""),
    [version],
  );
  const canRestore = role !== "viewer";

  async function restore() {
    if (!activeId || restoring || !allowRestore || !canRestore) return;
    setRestoring(true);
    setError("");
    try {
      await onRestore(activeId);
      onOpenChange(false);
    } catch (cause) {
      setError(
        userMessage(cause, "Could not restore this version. Please try again."),
      );
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        returnFocusRef={returnFocusRef}
        className="gap-5 sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-5">
            <History className="h-5 w-5 text-primary" /> Version history
          </DialogTitle>
          <DialogDescription>
            Review up to 50 previous saved versions. Restoring creates a new
            version and keeps the current one in history.
          </DialogDescription>
        </DialogHeader>
        {versions === undefined ? (
          <p
            role="status"
            className="py-12 text-center text-sm text-muted-foreground"
          >
            Loading history…
          </p>
        ) : versions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-serif text-xl">A fresh page.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Previous versions appear here after your next save.
            </p>
          </div>
        ) : (
          <div className="grid min-h-0 gap-4 sm:grid-cols-[180px_1fr]">
            <nav
              aria-label="Previous versions"
              className="max-h-40 space-y-1 overflow-y-auto border-b pb-3 sm:max-h-[48dvh] sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
            >
              {versions.map((entry) => (
                <Button
                  key={entry._id}
                  variant="ghost"
                  disabled={restoring}
                  onClick={() => {
                    setSelectedId(entry._id);
                    setError("");
                  }}
                  aria-pressed={activeId === entry._id}
                  className={`h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-3 text-left font-normal ${activeId === entry._id ? "bg-accent text-accent-foreground" : ""}`}
                >
                  <span className="text-xs font-medium">
                    Version {entry.revision}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(entry.createdAt)}
                  </span>
                  <span className="max-w-full truncate text-[11px] text-muted-foreground">
                    {entry.authorName}
                  </span>
                </Button>
              ))}
            </nav>
            <section aria-label="Version preview" className="min-w-0">
              {version === undefined ? (
                <p role="status" className="p-5 text-sm text-muted-foreground">
                  Opening version…
                </p>
              ) : version === null ? (
                <p className="p-5 text-sm text-muted-foreground">
                  This version is no longer available.
                </p>
              ) : (
                <div className="max-h-[45dvh] overflow-y-auto rounded-lg border bg-white p-5 sm:max-h-[48dvh]">
                  <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Version {selectedMeta?.revision ?? version.revision} ·
                    Read-only preview
                  </p>
                  <h3 className="break-words font-serif text-2xl leading-tight">
                    {version.title}
                  </h3>
                  <p className="mt-5 whitespace-pre-wrap break-words font-serif text-sm leading-relaxed text-muted-foreground">
                    {text || "Empty document"}
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
        {canRestore && !allowRestore && versions && versions.length > 0 && (
          <p className="rounded-md bg-secondary p-3 text-xs leading-relaxed text-muted-foreground">
            Save your current changes or resolve the conflict before restoring a
            previous version.
          </p>
        )}
        {!canRestore && versions && versions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            You can review history with view-only access. An owner or editor can
            restore a version.
          </p>
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
            variant="outline"
            disabled={restoring}
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
          {canRestore && activeId && version && (
            <Button
              disabled={restoring || !allowRestore}
              onClick={() => void restore()}
            >
              {restoring ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              {restoring ? "Restoring…" : "Restore this version"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
