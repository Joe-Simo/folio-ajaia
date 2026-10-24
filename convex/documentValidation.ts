import { ConvexError } from "convex/values";

export const EMPTY_CONTENT = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});
export const MAX_CONTENT_BYTES = 200_000;
const nodeTypes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
]);
const blockTypes = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
]);
const markTypes = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeTitle(title: string) {
  const normalized = title.trim();
  if (!normalized || normalized.length > 160) {
    throw new ConvexError("A title must contain between 1 and 160 characters.");
  }
  return normalized;
}

/** Restricts stored editor JSON to the supported document format, never raw HTML. */
export function validateContent(content: string) {
  if (new TextEncoder().encode(content).length > MAX_CONTENT_BYTES) {
    throw new ConvexError("This document is too large. The limit is 200 KB.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ConvexError("Invalid document content.");
  }
  if (!isObject(parsed) || parsed.type !== "doc")
    throw new ConvexError("Invalid document format.");
  let nodes = 0;
  let normalized = false;
  const visit = (
    node: unknown,
    depth: number,
    parent: string | null = null,
  ) => {
    if (
      ++nodes > 20_000 ||
      depth > 32 ||
      !isObject(node) ||
      typeof node.type !== "string" ||
      !nodeTypes.has(node.type)
    ) {
      throw new ConvexError("Unsupported or deeply nested document content.");
    }
    if (parent !== null) {
      const permitted =
        parent === "doc" || parent === "blockquote" || parent === "listItem"
          ? blockTypes.has(node.type)
          : parent === "bulletList" || parent === "orderedList"
            ? node.type === "listItem"
            : parent === "codeBlock"
              ? node.type === "text"
              : parent === "paragraph" || parent === "heading"
                ? node.type === "text" || node.type === "hardBreak"
                : false;
      if (!permitted) throw new ConvexError("Invalid document structure.");
    }
    if (
      node.type === "text" &&
      (typeof node.text !== "string" || node.text.length === 0)
    )
      throw new ConvexError("Invalid text content.");
    if (
      ["doc", "blockquote", "listItem", "bulletList", "orderedList"].includes(
        node.type,
      ) &&
      (!Array.isArray(node.content) || node.content.length === 0)
    )
      throw new ConvexError("Invalid document structure.");
    if (
      node.type === "listItem" &&
      Array.isArray(node.content) &&
      (!isObject(node.content[0]) || node.content[0].type !== "paragraph")
    )
      throw new ConvexError("A list item must start with a paragraph.");
    if (node.text !== undefined && typeof node.text !== "string")
      throw new ConvexError("Invalid text content.");
    if (node.attrs !== undefined) {
      if (!isObject(node.attrs)) throw new ConvexError("Invalid formatting.");
      for (const [key, value] of Object.entries(node.attrs)) {
        if (
          key === "level" &&
          node.type === "heading" &&
          Number.isInteger(value) &&
          Number(value) >= 1 &&
          Number(value) <= 3
        )
          continue;
        if (
          key === "start" &&
          node.type === "orderedList" &&
          Number.isInteger(value) &&
          Number(value) >= 1 &&
          Number(value) <= 1_000_000
        )
          continue;
        if (
          key === "type" &&
          node.type === "orderedList" &&
          (value === null ||
            (typeof value === "string" &&
              ["1", "a", "A", "i", "I"].includes(value)))
        )
          continue;
        if (key === "language" && node.type === "codeBlock") {
          if (value === null) continue;
          if (typeof value === "string") {
            // Tiptap interpolates this value into a CSS class. Keep one safe
            // language token, never attacker-controlled additional classes.
            if (!/^[A-Za-z0-9_+-]{1,32}$/.test(value)) {
              node.attrs.language = null;
              normalized = true;
            }
            continue;
          }
        }
        throw new ConvexError("Unsupported formatting attribute.");
      }
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks))
        throw new ConvexError("Invalid text formatting.");
      for (const mark of node.marks) {
        if (
          !isObject(mark) ||
          typeof mark.type !== "string" ||
          !markTypes.has(mark.type)
        )
          throw new ConvexError("Unsupported text formatting.");
        if (mark.type === "link" && mark.attrs === undefined)
          throw new ConvexError("A link must include a web or email address.");
        if (mark.attrs !== undefined) {
          if (
            mark.type !== "link" ||
            !isObject(mark.attrs) ||
            typeof mark.attrs.href !== "string" ||
            !/^(https?:\/\/|mailto:)/i.test(mark.attrs.href)
          )
            throw new ConvexError("Only web and email links are allowed.");
          if (mark.attrs.href.length > 2048)
            throw new ConvexError("Link is too long.");
          for (const key of Object.keys(mark.attrs)) {
            if (!["href", "target", "rel", "class", "title"].includes(key))
              throw new ConvexError("Unsupported link attribute.");
            const value = mark.attrs[key];
            if (value !== null && typeof value !== "string")
              throw new ConvexError("Invalid link attribute.");
          }
          // Document content cannot set layout classes or weaken link isolation.
          // Tiptap merges these attributes into the rendered anchor element.
          if (mark.attrs.class !== undefined && mark.attrs.class !== null) {
            mark.attrs.class = null;
            normalized = true;
          }
          if (mark.attrs.target !== "_blank") {
            mark.attrs.target = "_blank";
            normalized = true;
          }
          const rel =
            typeof mark.attrs.rel === "string"
              ? mark.attrs.rel.split(/\s+/)
              : [];
          if (
            !rel.includes("noopener") ||
            !rel.includes("noreferrer") ||
            rel.some(
              (token) =>
                !["noopener", "noreferrer", "nofollow"].includes(token),
            )
          ) {
            mark.attrs.rel = "noopener noreferrer nofollow";
            normalized = true;
          }
        }
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content) || node.type === "text")
        throw new ConvexError("Invalid document structure.");
      for (const child of node.content) visit(child, depth + 1, node.type);
    }
  };
  visit(parsed, 0);
  const result = normalized ? JSON.stringify(parsed) : content;
  if (new TextEncoder().encode(result).length > MAX_CONTENT_BYTES)
    throw new ConvexError("This document is too large. The limit is 200 KB.");
  return result;
}
