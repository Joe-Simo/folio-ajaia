import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, parseTextFile } from "./import-document";

describe("plain-text document import", () => {
  it("preserves literal HTML and JSON-sensitive characters as plain text", async () => {
    const text = '<script>alert("x")</script> & a \\ path';
    const imported = await parseTextFile(new File([text], "Notes.TXT"));
    expect(imported.title).toBe("Notes");
    expect(JSON.parse(imported.content)).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
  });

  it("normalizes line endings and keeps empty and trailing lines", async () => {
    const imported = await parseTextFile(
      new File(["\uFEFFFirst\r\n\r\nThird\r"], "notes.txt"),
    );
    expect(JSON.parse(imported.content).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Third" }] },
      { type: "paragraph" },
    ]);
  });

  it("accepts an empty text file as an editable blank paragraph", async () => {
    const imported = await parseTextFile(new File([], ".txt"));
    expect(imported.title).toBe("Imported document");
    expect(JSON.parse(imported.content).content).toEqual([
      { type: "paragraph" },
    ]);
  });

  it("rejects unsupported extensions even when their content is text", async () => {
    await expect(
      parseTextFile(new File(["hello"], "notes.docx")),
    ).rejects.toThrow("Choose a .txt file");
  });

  it("rejects invalid UTF-8 instead of silently replacing damaged bytes", async () => {
    const file = new File([new Uint8Array([0xc3, 0x28])], "damaged.txt");
    await expect(parseTextFile(file)).rejects.toThrow("not UTF-8 text");
  });

  it("rejects binary control characters but accepts tabs", async () => {
    await expect(
      parseTextFile(new File(["hello\u0000world"], "binary.txt")),
    ).rejects.toThrow("binary data");
    await expect(
      parseTextFile(new File(["one\ttwo"], "tabbed.txt")),
    ).resolves.toMatchObject({ title: "tabbed" });
  });

  it("rejects input exceeding the byte limit, including multibyte text", async () => {
    await expect(
      parseTextFile(new File(["x".repeat(MAX_IMPORT_BYTES + 1)], "large.txt")),
    ).rejects.toThrow("too large");
    await expect(
      parseTextFile(
        new File(["é".repeat(MAX_IMPORT_BYTES / 2 + 1)], "unicode.txt"),
      ),
    ).rejects.toThrow("too large");
  });

  it("also bounds the expanded document JSON instead of just the source file", async () => {
    // Every newline becomes a paragraph node, so small text can produce large JSON.
    const file = new File(["\n".repeat(10_000)], "many-lines.txt");
    expect(file.size).toBeLessThan(MAX_IMPORT_BYTES);
    await expect(parseTextFile(file)).rejects.toThrow(
      "expands beyond the document limit",
    );
  });
});
