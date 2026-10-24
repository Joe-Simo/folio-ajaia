import { describe, expect, test } from "vitest";
import {
  acknowledgeDraft,
  readDraft,
  removeDraft,
  writeDraft,
} from "./draft-storage";

const draft = {
  title: "Recovered",
  content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
  revision: 3,
};

function memoryStorage(raw: string | null = null) {
  let value = raw;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}

describe("optional browser recovery", () => {
  test("retains a valid draft and removes it after a successful save", () => {
    const storage = memoryStorage();
    expect(writeDraft("draft", draft, storage)).toBe(true);
    expect(readDraft("draft", storage)).toEqual(draft);
    expect(removeDraft("draft", storage)).toBe(true);
    expect(readDraft("draft", storage)).toBeNull();
  });

  test("storage denial or quota failures do not throw into server save handling", () => {
    const denied = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
    const storage = { getItem: denied, setItem: denied, removeItem: denied };
    expect(readDraft("draft", storage)).toBeNull();
    expect(writeDraft("draft", draft, storage)).toBe(false);
    expect(removeDraft("draft", storage)).toBe(false);
  });

  test("corrupt content and invalid revisions cannot be restored into the editor", () => {
    for (const raw of [
      "broken JSON",
      JSON.stringify({ ...draft, content: "not JSON" }),
      JSON.stringify({ ...draft, revision: 0 }),
      JSON.stringify({ ...draft, revision: 1.5 }),
      JSON.stringify({ ...draft, content: JSON.stringify({ type: "script" }) }),
      JSON.stringify({
        ...draft,
        content: JSON.stringify({
          type: "doc",
          content: [{ type: "unknown" }],
        }),
      }),
      JSON.stringify({
        ...draft,
        content: JSON.stringify({
          type: "doc",
          content: [{ type: "text", text: "invalid root child" }],
        }),
      }),
    ]) {
      expect(readDraft("draft", memoryStorage(raw))).toBeNull();
    }
  });
  test("a late save from an unmounted editor cannot erase a newer local draft", () => {
    const newer = { ...draft, title: "Newer unsaved title" };
    const storage = memoryStorage(JSON.stringify(newer));
    acknowledgeDraft("draft", draft, draft, 4, storage);
    expect(readDraft("draft", storage)).toEqual(newer);
    acknowledgeDraft(
      "draft",
      draft,
      { ...draft, title: "Earlier local edit" },
      4,
      storage,
    );
    expect(readDraft("draft", storage)).toEqual(newer);
  });

  test("a matching save removes its recovery copy or advances a newer edit's base revision", () => {
    const storage = memoryStorage(JSON.stringify(draft));
    acknowledgeDraft("draft", draft, draft, 4, storage);
    expect(readDraft("draft", storage)).toBeNull();
    const edited = { ...draft, title: "Typed during save" };
    writeDraft("draft", edited, storage);
    acknowledgeDraft("draft", draft, edited, 4, storage);
    expect(readDraft("draft", storage)).toEqual({ ...edited, revision: 4 });
  });
});
