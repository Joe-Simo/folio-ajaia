# Architecture and decisions

## The product slice

Folio focuses on a complete writing loop: create → format → save → reopen → share. The interface keeps navigation separate from a readable document page, uses a restrained warm palette, and gives saving and access states clear labels. The assessment's breadth is addressed through working persistence and access rules rather than simulated server behavior.

## Stack and data flow

- **Next.js 15.5.28 / React 19 / TypeScript** provide the application shell.
- **Tiptap 3** supplies the rich-text editor. Content is stored as validated editor JSON, not raw HTML.
- **Tailwind and shadcn/ui with Radix primitives** supply reusable controls, menus, and dialogs.
- **Convex** supplies cloud persistence, reactive queries, atomic mutations, and server-side validation.
- **Convex Auth's Password provider** supplies sessions and identifies the caller on the server.
- **The official Convex presence component** tracks document participants through authenticated heartbeat/list wrappers.
- **jsPDF and bundled Noto Sans fonts** provide client-side PDF export; the PDF code and fonts load only when requested.

The browser subscribes to document metadata and loads the selected body. An edit marks the local draft dirty; after a short pause, a mutation sends the content and expected revision. A successful mutation advances the revision and updates the visible save state. The cloud copy is the source of truth.

## Data model and authorization

`documents` stores ownership, title, revision, and timestamps. `documentBodies` stores the editor JSON separately, keeping the workspace list from loading every document's full contents. `shares` relates a document to a user and an `editor` or `viewer` role. Indexed lookups serve ownership, received shares, body lookup, and document/user access checks.

Every document endpoint derives the current user from the authenticated session. It does not trust a client-supplied owner ID. Owners can edit, share, revoke, and delete; editors can read and edit; viewers can read. Document bodies are returned only to authorized users. Role changes and revocation are checked again by subsequent backend requests.

Email addresses are normalized when accounts are created and when sharing resolves a recipient. Email ownership is not verified in this timeboxed version: the password login is genuine, but the email is an account identifier rather than a verified identity claim. This is unsuitable for sensitive organizational documents without stronger account lifecycle controls.

## Preventing lost work

Updates use compare-and-swap semantics: `expectedRevision` must match the stored revision. Convex executes the check and write in one transaction. A stale editor receives a conflict instead of silently replacing a newer document. The UI preserves its draft, offers JSON download, and lets the user load the latest server version.

Best-effort local storage supports recovery across refreshes. Storage failure is caught separately so it cannot turn a successful server save into a false failure. This is not CRDT collaboration, automated merge, or offline synchronization.

## Comments, history, and presence

Comments are associated with a document rather than text offsets. Owners and editors can post or resolve them; only the author or owner can remove a comment. Viewers can read comments. Each document is limited to 200 comments and each body to 2,000 characters. Reads and mutations recheck access, so a revoked user cannot keep using an open panel.

Each successful edit or restore snapshots the prior title/body in the same transaction. Version metadata and bodies are stored separately, retaining the most recent 50 previous versions. Restoring uses the current expected revision, saves the current document in history, and creates a new revision; it does not rewrite an old history entry. The UI requires the current draft to be saved before restoring. Legacy snapshots without a known editor are labeled without inventing attribution.

Presence uses the maintained Convex component for heartbeats and cleanup. Its server wrapper derives the user from the session and verifies document access. Participant reads recheck access and filter revoked users; the UI displays up to three avatars plus a count. It does not claim live cursor or character-level synchronization.

## Import and content safety

Import accepts only UTF-8 `.txt`. It checks extension, size, decoding, and binary control characters, then converts each line into a text paragraph. A second bound applies after JSON expansion. Both source file and stored body are limited to 200,000 bytes.

The backend validates allowed nodes, marks, nesting, attributes, link protocols, and content size. Imported strings such as HTML remain literal text. Document text is never executed as code or treated as instructions to an AI; the shipped app has no model integration. Secrets are held in provider configuration, not source or browser bundles.

## Export

Markdown serialization preserves the supported document structure and formatting, escapes literal markup, and does not execute document content. PDF export uses a lazy-loaded jsPDF implementation with paginated headings, lists, quotes, formatting, and safe links. Bundled open-license Noto Sans fonts support the covered Latin, Greek, and Cyrillic glyphs. Unsupported characters produce an explicit error and a Markdown alternative rather than replacement boxes. Exports use the current draft and do not require sending document contents to another conversion service.

## Deliberate limits

Reads and writes are bounded: 100 owned documents, 100 collaborators per document, and a list window of 100 received shares. A truncation signal is preferable to an unbounded query in this assessment; pagination is the next improvement if usage grows.

The current version omits live cursors, CRDT synchronization, inline anchored suggestions, DOCX import, email delivery, verified-email onboarding, and password reset. With another 2–4 hours, the priorities would be a stronger invitation/account lifecycle, list pagination, and broader failure-recovery coverage. Character-level collaboration would be a separate, larger design decision.

Unposted comment drafts are stored by user and document in browser storage and are never submitted automatically. Unsaved editor or comment text remains available from a user-scoped in-memory copy if document access changes; this does not bypass server authorization. Navigation and browser-close warnings protect copies that cannot be persisted locally.
