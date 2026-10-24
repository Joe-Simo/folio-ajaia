"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ChevronDown, Loader2, LockKeyhole, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccessRole = "viewer" | "editor";

interface ShareDialogProps {
  documentId: Id<"documents">;
  title: string;
  isOwner: boolean;
  open: boolean;
  returnFocusRef?: import("react").RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
}

function sharingError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string")
    return error.data;
  return "We couldn’t update access. Check your connection and try again.";
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function ShareDialog({
  documentId,
  title,
  isOwner,
  open,
  onOpenChange,
  returnFocusRef,
}: ShareDialogProps) {
  const members = useQuery(
    api.documents.members,
    open ? { id: documentId } : "skip",
  );
  const share = useMutation(api.documents.share);
  const revoke = useMutation(api.documents.revoke);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccessRole>("editor");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function grantAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOwner || busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await share({ id: documentId, email: email.trim().toLowerCase(), role });
      setEmail("");
      toast.success("Document access updated");
    } catch (cause) {
      setError(sharingError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function removeAccess(userId: Id<"users">) {
    setRemoving(userId);
    setError(null);
    try {
      await revoke({ id: documentId, userId });
      toast.success("Access removed");
    } catch (cause) {
      setError(sharingError(cause));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent returnFocusRef={returnFocusRef}>
        <DialogHeader>
          <DialogTitle className="pr-5">Share document</DialogTitle>
          <DialogDescription className="break-words">
            {title || "Untitled document"}
          </DialogDescription>
        </DialogHeader>

        {isOwner ? (
          <form onSubmit={grantAccess} className="space-y-3">
            <Label htmlFor="share-email">Add someone by email</Label>
            <div className="flex gap-2">
              <Input
                id="share-email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                disabled={busy}
                className="min-w-0 flex-1"
                aria-describedby="share-help"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    aria-label={`Access role: ${role}`}
                  >
                    {role === "editor" ? "Can edit" : "Can view"}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={role}
                    onValueChange={(value) => {
                      if (value === "viewer" || value === "editor")
                        setRole(value);
                    }}
                  >
                    <DropdownMenuRadioItem value="editor">
                      Can edit
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="viewer">
                      Can view
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p
              id="share-help"
              className="text-xs leading-relaxed text-muted-foreground"
            >
              They need a Folio account with this email. Access changes
              immediately; no invitation email is sent.
            </p>
            <Button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full"
            >
              {busy ? <Loader2 className="animate-spin" /> : <UserRoundPlus />}
              {busy ? "Updating access…" : "Grant access"}
            </Button>
          </form>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Only the document owner can change who has access.
          </p>
        )}

        <section aria-labelledby="access-heading" className="space-y-3">
          <h3 id="access-heading" className="text-sm font-medium">
            People with access
          </h3>
          {members === undefined ? (
            <p role="status" className="py-2 text-sm text-muted-foreground">
              Loading access…
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 py-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground"
                  >
                    {initials(member.name || member.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.name || member.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  {isOwner && member.role !== "owner" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removing !== null || busy}
                          aria-label={`Manage ${member.email}: ${member.role}`}
                        >
                          {removing === member.userId ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <>
                              {member.role === "editor"
                                ? "Can edit"
                                : "Can view"}
                              <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup
                          value={member.role}
                          onValueChange={async (value) => {
                            if (value !== "viewer" && value !== "editor")
                              return;
                            setBusy(true);
                            setError(null);
                            try {
                              await share({
                                id: documentId,
                                email: member.email,
                                role: value,
                              });
                              toast.success("Access updated");
                            } catch (cause) {
                              setError(sharingError(cause));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <DropdownMenuRadioItem value="editor">
                            Can edit
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="viewer">
                            Can view
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuItem
                          className="mt-1 text-destructive focus:text-destructive"
                          onSelect={() => void removeAccess(member.userId)}
                        >
                          Remove access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {member.role === "owner"
                        ? "Owner"
                        : member.role === "editor"
                          ? "Can edit"
                          : "Can view"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Restricted to the people listed here. Having the document link does
            not grant access.
          </span>
        </div>
        <DialogFooter>
          <Button
            type="button"
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
