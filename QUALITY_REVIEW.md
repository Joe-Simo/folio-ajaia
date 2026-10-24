# Quality review

This review covered source, fresh desktop/mobile browser flows, exported documents, and the walkthrough. It preserves Folio's warm editorial design while correcting observable defects.

| Area | Finding and correction |
| --- | --- |
| Save reliability | Navigation could abandon unsaved work when browser storage was unavailable. Navigation now attempts to flush the save and requires an explicit leave decision if it cannot complete. |
| Recovery race | A late acknowledgement from an older editor could erase a newer local draft. Storage updates now compare the draft they are acknowledging. |
| Security | Link attributes and code-block language labels could carry layout classes or override safe navigation attributes. Writes, restores, and legacy rendering now normalize them; supported URL schemes are consistent. |
| Typography and layout | Long document titles clipped, and narrow share dialogs allowed child overflow. Titles now grow to wrap; dialogs use a shrinkable grid track. |
| Accessibility | Secondary text and primary hover contrast were low. The warm palette now has darker text and hover colors. Controlled dialogs return focus; word counts are no longer live-announced on each edit. |
| Mobile interaction | Toolbar controls could be hidden in horizontal overflow. Small screens now show two rows; status text is larger and the sign-in form starts earlier. |
| Exports | Edge whitespace could break Markdown emphasis, and PDF code indentation could disappear. Both have targeted regression tests. |
| Browser hardening | Added frame isolation, MIME sniffing protection, limited device permissions, and a safer referrer policy. |
| Performance | Initial editor JSON was parsed repeatedly. It is now parsed once and replaced only when external content changes. PDF resources remain lazy-loaded. |
| Video | The prior action timing sometimes moved away before the corresponding narration. The release walkthrough now holds comments, history, exports, and permission states while they are explained. |

## Verification

- Source gates: lint, TypeScript, automated regression tests, and production build.
- Fresh browser checks: normal editing, blocked storage/offline navigation, permissions, comments, history, exports, keyboard focus, and responsive layouts at 320–1440px.
- Automated accessibility scans and manual keyboard checks cover the tested states; they are not a certification of every assistive-technology combination.
- Baseline cold sign-in measurement: 260ms DOMContentLoaded, 457ms load, about 360KB transferred, and no observed long tasks. These are one local browser sample, not universal performance guarantees.
- Known product boundaries remain documented in README: lightweight unverified-email accounts, TXT import, bounded history, no CRDT/live cursors, and PDF font coverage limits.

Final hosted verification and video export are recorded in SUBMISSION.md. The release passed lint, TypeScript, and 49 automated tests; the tested browser states had no axe violations, and the navigation/recovery and live authorization checks passed. Browser-security headers were verified on the public URL.

## Reviewed user flow

1. Sign-in and library: readable contrast, compact mobile entry, and responsive document lists.
2. Editor and navigation: complete title wrapping, visible formatting controls, guarded pending saves, and recoverable draft state.
3. Sharing, comments, and history: enforced access, bounded records, focus trapping and return, and reversible version restore.
4. Exports: actual Markdown/PDF downloads, safe text handling, font coverage checks, and retained formatting/indentation.
5. Delivery: real hosted walkthrough, public source package, and verified download contents.

## Second-pass corrections

- Unposted comments now survive document switches and refresh. Storage failure causes an explicit leave decision rather than silent loss; drafts are never posted automatically.
- Demotion and revocation preserve user-scoped in-memory drafts for copying or download. Re-granted access restores the local draft, and competing server edits still produce a conflict.
- Markdown links retain entity-like query strings and backslashes, and touching formatted runs preserve their text and formatting. Reference CommonMark parser regressions verify the output.
- Clean-install validation passes 49 tests. Additional browser checks cover comment drafts, access-loss recovery, and access restoration.

The second-pass recovery scenarios were also exercised on the public deployment with browser storage deliberately unavailable; the comment-draft and access-change checks reported no page errors.
