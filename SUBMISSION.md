# Folio: submission inventory

**Candidate:** Joseph Simo · joesimo@mail.grokbot.com

**Live product:** https://folio-ajaia-tau.vercel.app

**Drive folder:** https://drive.google.com/drive/folders/1mynLsYNLNwmI1pBAl9-fJRWYXexTfogr

**Walkthrough:** https://drive.google.com/file/d/11FfRxIz8bIPCTXnMwASCFEeJ3T7jk3F2/view?usp=drivesdk

## Included materials

| Item | Purpose |
| --- | --- |
| `Folio-source.zip` | Application source, quality-review report, and pinned Bun lockfile; excludes secrets and generated dependencies/build output |
| `README.md` | Review accounts, local setup, checks, deployment guidance, and limits |
| `ARCHITECTURE.md` | Data flow, authorization, save conflicts, import validation, and decisions |
| `AI_WORKFLOW.md` | AI contributions, corrections, and verification approach |
| `SUBMISSION.md` | This inventory and final delivery status |
| `LIVE-URL.txt` | Live product link |
| `WALKTHROUGH-URL.txt` | Walkthrough link |
| `Folio-walkthrough.mp4` | 4:08 narrated walkthrough of the hosted core and optional features |
| `Folio-desktop.png` | Desktop document workspace with live participant indicators |
| `Folio-mobile.png` | Mobile editor with wrapped title and visible formatting controls |

## Review

Sign in as `alex@folio.demo` or `sam@folio.demo`, password `Folio-Review-2026!`. These accounts and their example documents are intentionally public. Please use a fresh document to avoid conflicts with other reviewers, and do not put private information into them.

Create a document, apply formatting, wait for **All changes saved**, and refresh. Import a UTF-8 `.txt` file. Share a document with the second account, then open that account in another browser session. Try viewer and editor access, followed by revocation by the owner.

## Verification at packaging

- Lint, TypeScript, and all 49 automated tests passed for the optional-feature source (9 original backend/validation, 8 import, 5 storage, 6 comments/history, 3 presence, 9 exports, 5 security, 4 comment-draft).
- Production build and deployment passed on Vercel, with the Convex production backend. The stable URL responds HTTP 200 without Vercel authentication.
- Nine independent hosted-browser workflows passed: real account creation; document creation/rename/format/save/reopen; TXT import; editor/viewer grants; editor changes visible to owner; viewer read-only access; live revocation; conflicting edits and draft recovery; deletion propagation. No page errors were reported.
- The final hosted build also passed 12 immediate heading changes, an immediate return to paragraph text, and exact-text inline formatting checks.
- Additional local browser checks passed for headings, italic, underline, both list types, initial word count, and offline draft recovery after browser restart.
- Responsive checks at 375px and 768px passed; the mobile drawer traps focus and Escape returns it to the trigger.
- A source credential-pattern scan found no matches; source packaging excludes environment files, provider configuration, dependencies, and build output.
- Walkthrough: 4:08, actual hosted core and optional flows with disclosed synthesized narration and captions; exported frames and audio checked before delivery.
- Nine additional hosted optional-feature workflows passed: live presence; comments and resolution; history restore; dirty-draft protection; actual Markdown/PDF downloads; viewer restrictions; mobile layout; and revocation across the added surfaces. No browser page errors were reported.

## Scope

Implemented source includes document creation/editing/rename/delete, rich-text formatting, cloud persistence, TXT import, owner-controlled viewer/editor sharing, revision conflicts, browser draft recovery, live participant indicators, document comments, the latest 50 previous versions with restore, and Markdown/PDF export. The core and optional behaviors above were verified on the public deployment.

Not included: character-level live collaboration, live cursors, inline anchored suggestions, email invitations/verification, password reset, DOCX/PDF/Markdown import, or unlimited document lists. PDF export rejects characters outside the bundled font coverage and offers Markdown instead. The next 2–4 hours would prioritize concurrent-browser coverage, account lifecycle improvements, and pagination.

## Final review

The final quality pass corrected draft-navigation safety, stale recovery acknowledgements, unsafe renderer attributes, low contrast, narrow-layout clipping, keyboard focus return, export whitespace, and video timing. See `QUALITY_REVIEW.md` inside the source archive for scope and evidence limits.

The second pass additionally verified unposted-comment persistence and unsaved local-text retention through access loss and restoration. Markdown link destinations and adjacent formatting are checked with the reference CommonMark parser.
