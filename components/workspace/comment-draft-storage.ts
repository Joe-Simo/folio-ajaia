type CommentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Comment drafts stay local until the user explicitly posts them. */
export function readCommentDraft(
  key: string,
  storage?: CommentStorage,
): string | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(key);
    if (!raw || raw.length > 13_000) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("body" in value) ||
      typeof value.body !== "string" ||
      value.body.length > 2000
    )
      return null;
    return value.body;
  } catch {
    return null;
  }
}

export function writeCommentDraft(
  key: string,
  body: string,
  storage?: CommentStorage,
): boolean {
  try {
    if (body.length > 2000) return false;
    const target = storage ?? window.localStorage;
    if (!body.trim()) target.removeItem(key);
    else target.setItem(key, JSON.stringify({ version: 1, body }));
    return true;
  } catch {
    return false;
  }
}

/** A completed post from an old panel must not clear a newer draft. */
export function clearPostedCommentDraft(
  key: string,
  postedBody: string,
  storage?: CommentStorage,
): boolean {
  try {
    const target = storage ?? window.localStorage;
    if (readCommentDraft(key, target) !== postedBody) return false;
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
