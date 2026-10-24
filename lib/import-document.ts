export const MAX_IMPORT_BYTES = 200_000;

export interface ImportedDocument {
  title: string;
  content: string;
}

/** Plain text is imported as text nodes, never interpreted as HTML. */
export async function parseTextFile(file: File): Promise<ImportedDocument> {
  if (!/\.txt$/i.test(file.name)) {
    throw new Error(
      "Choose a .txt file. Other file types are not supported yet.",
    );
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(
      "This file is too large. Choose a .txt file smaller than 200 KB.",
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "This file is not UTF-8 text. Save it as a UTF-8 .txt file and try again.",
    );
  }
  if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) {
    throw new Error(
      "This file contains binary data. Choose a plain-text .txt file.",
    );
  }
  text = text.replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n");
  const content = JSON.stringify({
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  });
  // The backend caps document JSON at 200 KB; escaping expands some input.
  if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
    throw new Error(
      "This text expands beyond the document limit. Import a smaller file.",
    );
  }
  const title =
    file.name
      .replace(/\.txt$/i, "")
      .trim()
      .slice(0, 120) || "Imported document";
  return { title, content };
}
