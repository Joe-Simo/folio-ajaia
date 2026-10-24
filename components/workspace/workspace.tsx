"use client";
import { userMessage } from "@/lib/errors";
import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DocumentSession, type NavigationGuard } from "./document-session";
import { parseTextFile } from "@/lib/import-document";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Files,
  UserRound,
  UsersRound,
  FileText,
  Upload,
  ChevronDown,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  BookOpen,
} from "lucide-react";
type Filter = "all" | "owned" | "shared";
export function Workspace() {
  const user = useQuery(api.users.current);
  const result = useQuery(api.documents.list);
  const create = useMutation(api.documents.create);
  const { signOut } = useAuthActions();
  const [selected, setSelected] = useState<Id<"documents"> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigationGuard = useRef<NavigationGuard | null>(null);
  const navigationOrigin = useRef<HTMLElement | null>(null);
  const checkingNavigation = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    action: () => void | Promise<void>;
    recoveredLocally: boolean;
  } | null>(null);
  const registerNavigationGuard = useCallback(
    (guard: NavigationGuard | null) => {
      navigationGuard.current = guard;
    },
    [],
  );
  async function navigate(action: () => void | Promise<void>) {
    if (checkingNavigation.current) return;
    checkingNavigation.current = true;
    navigationOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    try {
      const result = await navigationGuard.current?.();
      if (result && !result.safe) {
        setPendingNavigation({
          action,
          recoveredLocally: result.recoveredLocally,
        });
        return;
      }
      await action();
    } catch (cause) {
      toast.error(
        userMessage(cause, "Could not finish saving. Please try again."),
      );
    } finally {
      checkingNavigation.current = false;
    }
  }
  const documents = result?.documents ?? [];
  const visible = documents.filter(
    (doc) =>
      (filter === "all" ||
        (filter === "owned" ? doc.role === "owner" : doc.role !== "owner")) &&
      doc.title.toLowerCase().includes(search.toLowerCase()),
  );
  async function newDocument() {
    await navigate(async () => {
      setBusy(true);
      try {
        const id = await create({ title: "Untitled document" });
        setSelected(id);
        setMobile(false);
      } catch (cause) {
        toast.error(
          userMessage(cause, "Could not create document. Please try again."),
        );
      } finally {
        setBusy(false);
      }
    });
  }
  async function importFile(file: File) {
    try {
      const parsed = await parseTextFile(file);
      await navigate(async () => {
        setBusy(true);
        try {
          const id = await create(parsed);
          setSelected(id);
          setMobile(false);
          toast.success("Text file imported");
        } finally {
          setBusy(false);
        }
      });
    } catch (cause) {
      toast.error(
        userMessage(cause, "Could not import this file. Please try again."),
      );
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  const sidebar = (
    <>
      <div className="sidebar-brand">
        <Brand />
        <Button
          size="icon"
          variant="ghost"
          className="mobile-close"
          aria-label="Close sidebar"
          onClick={() => setMobile(false)}
        >
          <X />
        </Button>
      </div>
      <Button
        className="new-document"
        onClick={() => void newDocument()}
        disabled={busy}
      >
        <Plus size={19} />
        New document
      </Button>
      <div className="search-field">
        <Search size={16} />
        <Input
          aria-label="Search documents"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <nav className="library-nav" aria-label="Document library">
        {(
          [
            { id: "all", label: "All documents", Icon: Files },
            { id: "owned", label: "Owned by me", Icon: UserRound },
            { id: "shared", label: "Shared with me", Icon: UsersRound },
          ] as const
        ).map(({ id, label, Icon }) => (
          <Button
            key={id}
            variant="ghost"
            className={filter === id ? "nav-item active" : "nav-item"}
            aria-pressed={filter === id}
            onClick={() =>
              void navigate(() => {
                setFilter(id);
                setSelected(null);
                setMobile(false);
              })
            }
          >
            <Icon size={18} />
            {label}
          </Button>
        ))}
      </nav>
      <div className="document-list-heading">
        <span>Documents</span>
        <span>{visible.length}</span>
      </div>
      <div className="document-list">
        {result === undefined ? (
          <p className="sidebar-empty">Loading your documents…</p>
        ) : visible.length === 0 ? (
          <p className="sidebar-empty">
            {search
              ? "No matching documents."
              : filter === "shared"
                ? "Documents shared with you will appear here."
                : "Your next idea starts here."}
          </p>
        ) : (
          visible.map((doc) => (
            <Button
              variant="ghost"
              key={doc._id}
              aria-pressed={selected === doc._id}
              className={
                "document-item " + (selected === doc._id ? "selected" : "")
              }
              onClick={() =>
                void navigate(() => {
                  setSelected(doc._id);
                  setMobile(false);
                })
              }
            >
              <FileText size={18} />
              <span>{doc.title}</span>
              {doc.role !== "owner" && (
                <UsersRound size={13} aria-label="Shared document" />
              )}
            </Button>
          ))
        )}
      </div>
      {result?.truncated && (
        <p className="sidebar-empty">
          Showing up to 100 owned and 100 shared documents.
        </p>
      )}
      <div className="sidebar-bottom">
        <Button
          variant="ghost"
          className="import-sidebar"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          <Upload size={17} />
          Import a text file<span>.txt</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="account-menu">
              <span className="avatar">{initials(user?.name ?? "Writer")}</span>
              <span className="account-name">
                {user?.name ?? "Your account"}
              </span>
              <ChevronDown size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <div className="px-2 py-2 text-xs text-muted-foreground break-all">
              {user?.email}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void navigate(() => signOut())}>
              <LogOut size={15} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
  return (
    <>
      <Dialog open={mobile} onOpenChange={setMobile}>
        <main className="workspace">
          <aside className="sidebar">{sidebar}</aside>
          <DialogContent className="mobile-sidebar-content">
            <DialogTitle className="sr-only">Document workspace</DialogTitle>
            <DialogDescription className="sr-only">
              Create, find, and open your documents, or manage your account.
            </DialogDescription>
            <div className="mobile-sidebar-body">{sidebar}</div>
          </DialogContent>
          <input
            ref={input}
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            aria-label="Import text file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
          <section className="workspace-main">
            {user?.email.endsWith("@folio.demo") && (
              <div className="demo-workspace-notice">
                Public demo workspace · Use example content only.
              </div>
            )}
            <div className="mobile-topbar">
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open sidebar">
                  <Menu />
                </Button>
              </DialogTrigger>
              <Brand />
            </div>
            {selected ? (
              <DocumentSession
                key={selected}
                id={selected}
                onDeleted={() => setSelected(null)}
                onImport={() => input.current?.click()}
                onNavigationGuardChange={registerNavigationGuard}
              />
            ) : (
              <>
                <header className="workspace-header">
                  <div>
                    <span className="breadcrumb">Workspace</span>
                    <span className="breadcrumb-slash">/</span>
                    <span>
                      {filter === "owned"
                        ? "Owned by me"
                        : filter === "shared"
                          ? "Shared with me"
                          : "All documents"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => input.current?.click()}
                    disabled={busy}
                  >
                    <Upload size={16} />
                    Import<span className="desktop-only"> .txt</span>
                  </Button>
                </header>
                <div className="library-page">
                  <div className="library-intro">
                    <div>
                      <p className="small-kicker">A LITTLE ROOM TO THINK</p>
                      <h1>
                        {filter === "shared"
                          ? "Better, together."
                          : filter === "owned"
                            ? "Your words. Your space."
                            : "Room for good ideas."}
                      </h1>
                      <p>
                        {filter === "shared"
                          ? "A shared page makes room for another perspective."
                          : "A thought, a plan, the start of something. Make it a document."}
                      </p>
                    </div>
                    <Button onClick={() => void newDocument()} disabled={busy}>
                      <Plus size={16} />
                      New document
                    </Button>
                  </div>
                  <div className="library-table">
                    <div className="library-table-head">
                      <span>Document</span>
                      <span>Owner</span>
                      <span>Last edited</span>
                      <span />
                    </div>
                    {result === undefined ? (
                      <div className="library-empty">
                        <p>Gathering your pages…</p>
                      </div>
                    ) : visible.length ? (
                      visible.map((doc) => (
                        <button
                          className="library-row"
                          key={doc._id}
                          onClick={() =>
                            void navigate(() => setSelected(doc._id))
                          }
                        >
                          <span className="library-document">
                            <span className="file-icon">
                              <FileText size={23} />
                            </span>
                            <span>
                              <strong>{doc.title}</strong>
                              <small>
                                {doc.role === "owner"
                                  ? "Owned by you"
                                  : doc.role === "editor"
                                    ? "Shared with you · Can edit"
                                    : "Shared with you · Can view"}
                              </small>
                            </span>
                          </span>
                          <span className="library-owner">
                            {doc.role === "owner" ? "You" : doc.owner.name}
                          </span>
                          <span className="library-date">
                            {new Intl.DateTimeFormat("en", {
                              month: "short",
                              day: "numeric",
                            }).format(doc.updatedAt)}
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))
                    ) : (
                      <div className="library-empty">
                        <BookOpen size={40} strokeWidth={1} />
                        <h2>
                          {search
                            ? "No pages found."
                            : "Every good idea starts somewhere."}
                        </h2>
                        <p>
                          {search
                            ? "Try another search."
                            : "Create a document, or bring in a .txt file."}
                        </p>
                        {!search && (
                          <Button
                            variant="outline"
                            onClick={() => void newDocument()}
                          >
                            Write your first page
                            <ArrowUpRight size={16} />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="library-note">
                    Made for focused writing and thoughtful collaboration.
                  </p>
                </div>
              </>
            )}
          </section>
        </main>
      </Dialog>
      <Dialog
        open={pendingNavigation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavigation(null);
        }}
      >
        <DialogContent returnFocusRef={navigationOrigin}>
          <DialogHeader>
            <DialogTitle>Your changes are not saved yet</DialogTitle>
            <DialogDescription>
              {pendingNavigation?.recoveredLocally
                ? "A recovery copy is stored in this browser. Stay to retry saving, or leave and recover it when you reopen this document."
                : "This browser cannot keep a recovery copy. Leaving now will discard your unsaved changes. Stay to retry, or copy your text before leaving."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingNavigation(null)}
            >
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const pending = pendingNavigation;
                setPendingNavigation(null);
                if (pending)
                  void Promise.resolve(pending.action()).catch((cause) =>
                    toast.error(
                      userMessage(cause, "Could not open that page."),
                    ),
                  );
              }}
            >
              Leave without cloud save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
