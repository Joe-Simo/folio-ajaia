# AI workflow

I used Codex as a coding and review partner, with parallel agents assigned bounded tasks. I retained responsibility for the product scope, tradeoffs, and evidence required before calling a feature complete.

## Where AI helped

- Decomposing the assignment into a core writing flow, backend access rules, import handling, verification, and delivery materials.
- Producing a visual concept with image generation, then translating its typography, spacing, and warm editorial direction into the interface.
- Implementing and reviewing typed Convex functions, editor integration, and focused tests in parallel.
- Extending the verified core with document comments, retained history, live presence, and PDF/Markdown export while keeping their access checks and failure states explicit.
- Inspecting failures and checking the implementation against the original requirements.

The delivered product has **no AI feature or model dependency**. TypeSafe/Jev guidance was considered during preparation, but a structured model call would not improve this document editor's core requirements, so none was added. This avoided unnecessary latency, credentials, and cost.

## Output I changed or rejected

- Replaced the starter's OAuth/email-provider assumptions with a simpler Password provider suitable for the assessment and its review accounts.
- Rejected simulated authentication in favor of real sessions and server-side owner/editor/viewer checks.
- Corrected save handling to detect stale revisions instead of silently overwriting another session's changes.
- A real-browser fast-typing test exposed lost characters caused by reapplying controlled editor content and focus changes. I separated local editor transactions from explicit external replacements and re-ran the typing/refresh checks.
- Separated optional browser recovery failures from successful server saves so blocked or full local storage would not report a false save failure.
- The recorded walkthrough exposed a separate heading-menu focus race. I replaced that menu with direct paragraph/heading controls and checked repeated style switches against exact text, rather than masking the issue with a delay.
- Kept plain-text import instead of claiming unsupported DOCX or Markdown import.
- Used the official presence component instead of a custom heartbeat store, but added per-document authorization around its participant reads.
- Rejected PDF output that would silently corrupt unsupported characters; bundled licensed fonts and made unsupported coverage an explicit error with a Markdown alternative.

## Verification approach

AI-produced code was checked through lint, TypeScript, a production build, and focused automated tests. The suite contains 49 tests covering backend access and validation, import boundaries, local recovery, comments and history, presence identity, and exports. It includes negative cases such as unauthorized edits, revoked access, stale saves, unsafe link protocols, malformed content, invalid UTF-8, and storage denial.

The actual assignment was the specification; a publicly available version was used only for pre-start preparation, not as a source of implementation code.

Browser and hosted checks are tracked separately from source checks. The final results are recorded in `SUBMISSION.md`; a passing build alone is not proof that a reviewer can sign in and complete the deployed flow.

External pages, repository content, and pasted document text were treated as untrusted material. Instructions embedded in such content were not allowed to change the task, request credentials, or authorize unrelated actions.

## Recorded walkthrough

The walkthrough records actual interactions with the hosted product. Its narration is synthesized with an installed macOS voice and explicitly disclosed; it is not presented as Joseph’s recorded voice.

The additional optional-feature browser checks and replacement walkthrough are tracked in the final verification record. They are not inferred from unit-test success alone.

## Final quality review

A separate code and browser audit found issues beyond the feature checklist. I corrected low-contrast secondary text, wrapping for long document titles, narrow-dialog sizing, small-screen toolbar access, and keyboard focus return. I also guarded navigation when a cloud save cannot finish, prevented late save acknowledgements from erasing newer recovery data, normalized untrusted link presentation attributes, and corrected Markdown emphasis and PDF code indentation. Word-count updates no longer announce every keystroke to screen readers.

A second independent pass caught comment-draft loss across navigation, unsaved text disappearing after permission changes, and Markdown parser boundary cases. I preserved local work without weakening server access checks and added parser-backed export tests rather than relying on string snapshots alone.
