import { describe, expect, test } from "vitest";
import {
  clearPostedCommentDraft,
  readCommentDraft,
  writeCommentDraft,
} from "./comment-draft-storage";
function memory(initial: string | null = null) {
  let raw = initial;
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
    removeItem: () => {
      raw = null;
    },
  };
}
describe("local comment drafts", () => {
  test("preserves multiline draft text until its matching post succeeds", () => {
    const storage = memory();
    expect(
      writeCommentDraft("draft", "First line\n\nA second thought.", storage),
    ).toBe(true);
    expect(readCommentDraft("draft", storage)).toBe(
      "First line\n\nA second thought.",
    );
    expect(
      clearPostedCommentDraft(
        "draft",
        "First line\n\nA second thought.",
        storage,
      ),
    ).toBe(true);
    expect(readCommentDraft("draft", storage)).toBeNull();
  });
  test("does not clear a newer draft when an old post completes", () => {
    const storage = memory();
    writeCommentDraft("draft", "Posted text", storage);
    writeCommentDraft("draft", "New unposted feedback", storage);
    expect(clearPostedCommentDraft("draft", "Posted text", storage)).toBe(
      false,
    );
    expect(readCommentDraft("draft", storage)).toBe("New unposted feedback");
  });
  test("rejects corrupt, unknown-version, and oversized stored data", () => {
    for (const raw of [
      "broken",
      "null",
      JSON.stringify({ version: 2, body: "text" }),
      JSON.stringify({ version: 1, body: 12 }),
      JSON.stringify({ version: 1, body: "text", padding: "x".repeat(20_000) }),
      JSON.stringify({ version: 1, body: "x".repeat(2001) }),
    ])
      expect(readCommentDraft("draft", memory(raw))).toBeNull();
    expect(writeCommentDraft("draft", "x".repeat(2001), memory())).toBe(false);
  });
  test("reports storage denial without throwing and removes empty drafts", () => {
    const fail = () => {
      throw new DOMException("Unavailable", "SecurityError");
    };
    const storage = { getItem: fail, setItem: fail, removeItem: fail };
    expect(readCommentDraft("draft", storage)).toBeNull();
    expect(writeCommentDraft("draft", "Feedback", storage)).toBe(false);
    expect(clearPostedCommentDraft("draft", "Feedback", storage)).toBe(false);
    const normal = memory();
    writeCommentDraft("draft", "Feedback", normal);
    writeCommentDraft("draft", " \n ", normal);
    expect(readCommentDraft("draft", normal)).toBeNull();
  });
});
