import { validateContent } from "../../convex/documentValidation";

/** Browser recovery is optional: storage failures must never turn a successful server save into an error. */
export type Draft = { title: string; content: string; revision: number };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readDraft(key: string, storage?: DraftStorage): Draft | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("title" in value) ||
      !("content" in value) ||
      !("revision" in value)
    )
      return null;
    if (
      typeof value.title !== "string" ||
      value.title.length > 160 ||
      typeof value.content !== "string" ||
      new TextEncoder().encode(value.content).length > 200_000 ||
      typeof value.revision !== "number" ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1
    )
      return null;
    // Browser storage is untrusted too: reject malformed nested editor nodes.
    const content = validateContent(value.content);
    return {
      title: value.title,
      content,
      revision: value.revision,
    };
  } catch {
    return null;
  }
}

export function writeDraft(
  key: string,
  draft: Draft,
  storage?: DraftStorage,
): boolean {
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(key: string, storage?: DraftStorage): boolean {
  try {
    (storage ?? window.localStorage).removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** An acknowledgement from an older editor must not replace a newer local draft. */
export function acknowledgeDraft(
  key: string,
  submitted: Draft,
  latest: Draft,
  revision: number,
  storage?: DraftStorage,
): void {
  const stored = readDraft(key, storage);
  if (
    !stored ||
    stored.title !== latest.title ||
    stored.content !== latest.content ||
    stored.revision !== latest.revision
  )
    return;
  if (submitted.title === latest.title && submitted.content === latest.content)
    removeDraft(key, storage);
  else writeDraft(key, { ...latest, revision }, storage);
}
