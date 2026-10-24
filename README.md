# Folio

A focused document workspace: write with rich text, import plain-text notes, and share a document with another account without losing ownership or access boundaries.

**Live app:** https://folio-ajaia-tau.vercel.app

## Try the review workspace

| Account | Email | Password |
| --- | --- | --- |
| Alex Morgan | `alex@folio.demo` | `Folio-Review-2026!` |
| Sam Rivera | `sam@folio.demo` | `Folio-Review-2026!` |

These are intentionally public demonstration accounts. Do not enter private information into them. Create your own account for an isolated workspace.

1. Sign in as Alex and open **A better way to work**. Edit a sentence, apply formatting, and wait for **All changes saved** before refreshing.
2. Create or import a document. Use **Share** to give `sam@folio.demo` editor or viewer access.
3. Sign in as Sam in a different browser profile or private window. Open **Shared with me** and try the granted access level.
4. Open the same document in both sessions to see live collaborator indicators. Use **Comments** to post and resolve feedback.
5. After a few saves, use **Document actions → Version history** to preview and restore a previous version. Save any current draft first.
6. Use **Document actions → Export Markdown / Export PDF** to download the current document. As Alex, change or remove Sam's access; only owners can manage sharing or delete a document.

Alex also owns **Product principles**. Sam owns **Research notes**, which is shared with Alex as a viewer. Other reviewers can change this public demo state; creating a fresh document is the most reliable way to test.

## Features

- Create, rename, delete, and reopen documents.
- Rich text: bold, italic, underline, headings, lists, quotes, links, and code formatting.
- Automatic saving with visible status, manual save, and `⌘S` / `Ctrl+S`.
- Owner, editor, and viewer roles enforced by the backend.
- **All documents**, **Owned by me**, and **Shared with me** views with title search.
- Conflict detection instead of silently overwriting a newer save; optional browser draft recovery and JSON download.
- Live collaborator avatars and participant count, backed by the official Convex presence component.
- Document-level comments: owners and editors can post, resolve, and reopen feedback; the author or owner can remove a comment.
- Automatic history of the latest 50 previous saved versions, with read-only previews and restore as a new revision.
- Markdown and paginated PDF export of the current draft. Markdown preserves Unicode; PDF uses bundled open-license Noto Sans fonts and rejects unsupported glyphs explicitly instead of silently corrupting them. Choose Markdown for text outside the PDF font coverage, such as emoji or CJK.
- Import **UTF-8 `.txt` files only**, up to **200,000 bytes (200 KB)**. The resulting document JSON must also fit 200 KB, so many short lines can require a smaller file. Imports preserve text and line breaks, not Markdown or HTML formatting. Binary content, invalid UTF-8, and unsupported extensions are rejected.

## Run locally with your own backend

Prerequisites: Bun 1.3.4 or later, Node.js 24 LTS, and a Convex account. The checked-in lockfile pins the dependency graph. No paid dependency is required for review.

```sh
bun install --frozen-lockfile
bunx convex login
bunx convex dev --configure new --dev-deployment cloud --team YOUR_TEAM_SLUG --project YOUR_PROJECT_NAME --once
bunx @convex-dev/auth --skip-git-check --web-server-url http://localhost:3000
bunx convex dev --once
```

The Convex commands link **your** project and write `.env.local`, including `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`. The auth setup provisions the server-side signing configuration (`JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`) on your selected deployment. Do not copy the assessment deployment credentials or commit `.env.local`.

Run the backend watcher and frontend in separate terminals:

```sh
bun run dev:backend
```

```sh
bun run dev
```

Open http://localhost:3000. Sign up with a new email/password, or seed the two public review accounts **on your own deployment**:

```sh
bun scripts/seed-demo.ts https://YOUR-DEPLOYMENT.convex.cloud
```

The seed helper reuses existing accounts and avoids duplicating its named example documents. It is for demo data only; it does not overwrite an existing review document to reset another person's edits.

## Checks

```sh
bun run lint
bun run typecheck
bun run test
bun run build
```

The current suite has 49 tests: 9 original backend/validation, 8 import, 5 browser-recovery, 6 comments/history, 3 presence, 9 export, 5 security, and 4 comment-draft tests. They exercise access denial, role changes, revocation, stale-write conflicts, history retention and restore, comments permissions, presence identity, export formatting and pagination, invalid imports, and unavailable local storage. See `SUBMISSION.md` for the final verification record; test coverage does not replace hosted-flow checks.

## Deploy your copy

Use a separate Convex production deployment for a production copy. Deploy its functions with `bunx convex deploy`, then run `bunx @convex-dev/auth --prod --skip-git-check --web-server-url https://YOUR-HOST` to configure Convex Auth signing variables and `SITE_URL` for that deployment. These values do not automatically carry over from development. Set `NEXT_PUBLIC_CONVEX_URL` in the frontend hosting environment to that deployment's cloud URL. Deploy the Next.js app to a compatible host; `vercel.json` uses the frozen Bun install and `bun run build`.

The Convex cloud URL (`NEXT_PUBLIC_CONVEX_URL`) and site URL (`NEXT_PUBLIC_CONVEX_SITE_URL`, if configured) are public addresses, not secrets. Keep Convex deploy keys and auth signing keys on the server/provider; never prefix them with `NEXT_PUBLIC_`.

## Scope and limitations

- Password sign-in is real, but this assessment has no email verification, email invitations, or password reset. Sharing requires an account already registered with that email.
- This is shared document access with reactive updates, **not character-by-character multiplayer editing**. Concurrent saves use revision checks; users resolve conflicts explicitly. Live presence shows who is viewing the document, not their cursor or selection. There is no CRDT or automatic merge.
- The workspace supports 100 owned documents and 100 collaborators per document. The list shows at most 100 owned and 100 received shares, with a truncation notice instead of unbounded reads.
- Local recovery is best effort and depends on browser storage. It is not an offline sync service or a backup. Download an unsaved draft before loading a newer version.
- Only `.txt` import is supported. DOCX, PDF, and Markdown import/conversion are outside this version; Markdown and PDF **export** are available.
- Comments are document-level, not anchored inline suggestions. A document retains up to 200 comments (2,000 characters each) and the latest 50 previous saved versions.
- PDF font coverage includes Latin, Greek, and Cyrillic text supported by bundled Noto Sans. Unsupported characters receive an error with a Markdown alternative. The font license is included in `public/fonts/OFL-NotoSans.txt`.

See `ARCHITECTURE.md`, `AI_WORKFLOW.md`, and `SUBMISSION.md` for decisions, process, and the delivery inventory.

See `QUALITY_REVIEW.md` for the final design, accessibility, reliability, security, and export review.

Unposted comment drafts are kept locally by user and document, and are sent only when you choose **Post comment**. Unsaved local text remains available for copying or download if your access is removed; this uses text already in your browser, not a new read of the restricted document.
Markdown export uses safe inline HTML when required to preserve underline or ambiguous formatting boundaries.
