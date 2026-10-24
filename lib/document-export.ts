import type { jsPDF } from "jspdf";

type NodeType =
  | "doc"
  | "paragraph"
  | "text"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "listItem"
  | "blockquote"
  | "codeBlock"
  | "hardBreak"
  | "horizontalRule";
type MarkType = "bold" | "italic" | "underline" | "strike" | "code" | "link";
type ExportMark = { type: MarkType; href?: string };
type ExportNode = {
  type: NodeType;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: ExportMark[];
  content?: ExportNode[];
};
type TextRun = { text: string; marks: ExportMark[] };
type Block = {
  kind: "paragraph" | "heading" | "code" | "rule";
  runs: TextRun[];
  level: number;
  indent: number;
  marker?: string;
  quote?: boolean;
};
export type PdfFontStyle = "normal" | "bold" | "italic" | "bolditalic";
export type PdfFonts = Record<PdfFontStyle, string>;
const nodeTypes = new Set<string>([
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
const markTypes = new Set<string>([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
]);
const safeHref = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(https?:\/\/|mailto:)/i.test(value) &&
  value.length <= 2048;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocument(content: string): ExportNode {
  if (new TextEncoder().encode(content).byteLength > 200_000)
    throw new Error("This document is too large to export.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("This document could not be read for export.");
  }
  let count = 0;
  function parse(value: unknown, depth: number): ExportNode {
    if (
      ++count > 20_000 ||
      depth > 32 ||
      !record(value) ||
      typeof value.type !== "string" ||
      !nodeTypes.has(value.type)
    )
      throw new Error("This document contains unsupported content.");
    const node: ExportNode = { type: value.type as NodeType };
    if (value.text !== undefined) {
      if (typeof value.text !== "string")
        throw new Error("This document contains invalid text.");
      node.text = value.text;
    }
    if (record(value.attrs)) node.attrs = value.attrs;
    if (value.content !== undefined) {
      if (!Array.isArray(value.content))
        throw new Error("This document contains invalid structure.");
      node.content = value.content.map((child) => parse(child, depth + 1));
    }
    if (value.marks !== undefined) {
      if (!Array.isArray(value.marks))
        throw new Error("This document contains invalid formatting.");
      node.marks = value.marks.map((mark) => {
        if (
          !record(mark) ||
          typeof mark.type !== "string" ||
          !markTypes.has(mark.type)
        )
          throw new Error("This document contains unsupported formatting.");
        if (mark.type === "link") {
          const href = record(mark.attrs) ? mark.attrs.href : undefined;
          if (!safeHref(href))
            throw new Error("This document contains an unsupported link.");
          return { type: "link", href };
        }
        return { type: mark.type as MarkType };
      });
    }
    return node;
  }
  const root = parse(parsed, 0);
  if (root.type !== "doc")
    throw new Error("This document could not be read for export.");
  return root;
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_[\]{}()#+.!~|\-]/g, "\\$&");
}
function codeSpan(value: string): string {
  const longest = Math.max(
    0,
    ...(value.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad =
    value.startsWith("`") ||
    value.endsWith("`") ||
    (/^ .* $/.test(value) && value.trim().length > 0)
      ? " "
      : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}
/** CommonMark emphasis delimiters cannot enclose leading or trailing whitespace. */
function emphasize(value: string, delimiter: string): string {
  const leading = value.match(/^\s*/u)?.[0] ?? "";
  const trailing = value.match(/\s*$/u)?.[0] ?? "";
  const core = value.slice(leading.length, value.length - trailing.length);
  return core ? `${leading}${delimiter}${core}${delimiter}${trailing}` : value;
}
function mergeInlineText(nodes: ExportNode[]): ExportNode[] {
  const merged: ExportNode[] = [];
  const markKey = (node: ExportNode) =>
    JSON.stringify(
      [...(node.marks ?? [])]
        .map((mark) => [mark.type, mark.href ?? ""])
        .sort((a, b) => a.join(":").localeCompare(b.join(":"))),
    );
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (
      node.type === "text" &&
      previous?.type === "text" &&
      markKey(previous) === markKey(node)
    ) {
      merged[merged.length - 1] = {
        ...previous,
        text: (previous.text ?? "") + (node.text ?? ""),
      };
    } else merged.push(node);
  }
  return merged;
}
function markdownDestination(href: string): string {
  return href
    .replace(/\\/g, "%5C")
    .replace(/&/g, "&amp;")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\s/g, (char) => encodeURIComponent(char));
}
function markdownInline(input: ExportNode[] = []): string {
  const nodes = mergeInlineText(input);
  return nodes
    .map((node, index) => {
      if (node.type === "hardBreak") return "  \n";
      if (node.type !== "text") return markdownInline(node.content);
      const marks = node.marks ?? [];
      const previous = nodes[index - 1],
        next = nodes[index + 1];
      // Delimiter runs can merge or fail flanking rules where formatted runs touch.
      // Allowlisted inline HTML preserves those boundaries without adding visible text.
      const touchesPrevious =
        previous?.type === "text" &&
        /\S$/u.test(previous.text ?? "") &&
        /^\S/u.test(node.text ?? "");
      const touchesNext =
        next?.type === "text" &&
        /\S$/u.test(node.text ?? "") &&
        /^\S/u.test(next.text ?? "");
      const htmlBoundary = touchesPrevious || touchesNext;
      let text = marks.some((mark) => mark.type === "code")
        ? codeSpan(node.text ?? "")
        : escapeMarkdown(node.text ?? "");
      for (const kind of ["bold", "italic", "strike", "underline"] as const) {
        if (!marks.some((mark) => mark.type === kind)) continue;
        if (kind === "underline") text = `<u>${text}</u>`;
        else if (htmlBoundary) {
          const tag =
            kind === "bold" ? "strong" : kind === "italic" ? "em" : "del";
          text = `<${tag}>${text}</${tag}>`;
        } else
          text = emphasize(
            text,
            kind === "bold" ? "**" : kind === "italic" ? "*" : "~~",
          );
      }
      const href = marks.find((mark) => mark.type === "link")?.href;
      if (href) text = `[${text}](<${markdownDestination(href)}>)`;
      return text;
    })
    .join("");
}

function numberAttr(node: ExportNode, key: string, fallback: number) {
  const value = node.attrs?.[key];
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : fallback;
}
function markdownBlock(node: ExportNode): string {
  switch (node.type) {
    case "paragraph":
      return markdownInline(node.content);
    case "heading":
      return `${"#".repeat(Math.min(6, Math.max(1, numberAttr(node, "level", 1)) + 1))} ${markdownInline(node.content)}`;
    case "horizontalRule":
      return "---";
    case "codeBlock": {
      const text = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("");
      const longest = Math.max(
        2,
        ...(text.match(/`+/g) ?? []).map((run) => run.length),
      );
      const fence = "`".repeat(longest + 1);
      const language =
        typeof node.attrs?.language === "string"
          ? node.attrs.language.replace(/[^\w+-]/g, "")
          : "";
      return `${fence}${language}\n${text}\n${fence}`;
    }
    case "blockquote":
      return (node.content ?? [])
        .map(markdownBlock)
        .join("\n\n")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "bulletList":
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => {
          const marker =
            node.type === "bulletList"
              ? "- "
              : `${Math.max(1, numberAttr(node, "start", 1)) + index}. `;
          const lines = (item.content ?? [])
            .map(markdownBlock)
            .join("\n\n")
            .split("\n");
          return lines
            .map(
              (line, i) =>
                (i === 0 ? marker : " ".repeat(marker.length)) + line,
            )
            .join("\n");
        })
        .join("\n");
    default:
      return (node.content ?? []).map(markdownBlock).join("\n\n");
  }
}
export function toMarkdown(title: string, content: string): string {
  const document = parseDocument(content);
  return `# ${escapeMarkdown(title.trim() || "Untitled document")}\n\n${(document.content ?? []).map(markdownBlock).join("\n\n")}\n`;
}
function filename(title: string) {
  return (
    title
      .trim()
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "document"
  );
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadMarkdown(title: string, content: string): void {
  saveBlob(
    new Blob([toMarkdown(title, content)], {
      type: "text/markdown;charset=utf-8",
    }),
    `${filename(title)}.md`,
  );
}

function runs(nodes: ExportNode[] = []): TextRun[] {
  return nodes.flatMap((node) =>
    node.type === "text"
      ? [{ text: node.text ?? "", marks: node.marks ?? [] }]
      : node.type === "hardBreak"
        ? [{ text: "\n", marks: [] }]
        : runs(node.content),
  );
}
function blocks(nodes: ExportNode[], indent = 0, quote = false): Block[] {
  return nodes.flatMap((node) => {
    if (node.type === "horizontalRule")
      return [{ kind: "rule" as const, runs: [], level: 0, indent, quote }];
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "codeBlock"
    )
      return [
        {
          kind: node.type === "codeBlock" ? ("code" as const) : node.type,
          runs: runs(node.content),
          level: numberAttr(node, "level", 1),
          indent,
          quote,
        },
      ];
    if (node.type === "blockquote")
      return blocks(node.content ?? [], indent + 1, true);
    if (node.type === "bulletList" || node.type === "orderedList")
      return (node.content ?? []).flatMap((item, index) => {
        const children = blocks(item.content ?? [], indent + 1, quote);
        if (children.length)
          children[0].marker =
            node.type === "bulletList"
              ? "•"
              : `${Math.max(1, numberAttr(node, "start", 1)) + index}.`;
        return children;
      });
    return blocks(node.content ?? [], indent, quote);
  });
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
let fontPromise: Promise<PdfFonts> | undefined;
async function loadFonts(): Promise<PdfFonts> {
  if (!fontPromise)
    fontPromise = (async () => {
      const styles = ["normal", "bold", "italic", "bolditalic"] as const;
      const names = ["Regular", "Bold", "Italic", "BoldItalic"];
      const values = await Promise.all(
        names.map(async (name) => {
          const response = await fetch(`/fonts/NotoSans-${name}.ttf`);
          if (!response.ok)
            throw new Error(
              "PDF fonts could not be loaded. Check your connection and try again.",
            );
          return base64(new Uint8Array(await response.arrayBuffer()));
        }),
      );
      return Object.fromEntries(
        styles.map((style, i) => [style, values[i]]),
      ) as PdfFonts;
    })().catch((error) => {
      fontPromise = undefined;
      throw error;
    });
  return fontPromise;
}
function styleFor(marks: ExportMark[], heading = false): PdfFontStyle {
  const bold = heading || marks.some((mark) => mark.type === "bold");
  const italic = marks.some((mark) => mark.type === "italic");
  return bold && italic
    ? "bolditalic"
    : bold
      ? "bold"
      : italic
        ? "italic"
        : "normal";
}

/** Produces a text-based, paginated PDF without running document HTML or loading remote links. */
export async function createDocumentPdf(
  title: string,
  content: string,
  fonts?: PdfFonts,
): Promise<jsPDF> {
  const parsed = parseDocument(content);
  const { jsPDF: Pdf } = await import("jspdf");
  const pdf = new Pdf({
    unit: "pt",
    format: "a4",
    putOnlyUsedFonts: true,
    compress: true,
  });
  const fontData = fonts ?? (await loadFonts());
  for (const style of ["normal", "bold", "italic", "bolditalic"] as const) {
    const file = `Folio-${style}.ttf`;
    pdf.addFileToVFS(file, fontData[style]);
    pdf.addFont(file, "FolioSans", style);
  }
  pdf.setProperties({
    title: title || "Untitled document",
    creator: "Folio",
    subject: "Document export",
  });
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight();
  const margin = 54,
    bottom = height - 54;
  let y = 70;
  function font(style: PdfFontStyle, size: number) {
    pdf.setFont("FolioSans", style);
    pdf.setFontSize(size);
  }
  function ensure(amount: number) {
    if (y + amount > bottom) {
      pdf.addPage();
      y = 58;
    }
  }
  const unsupported = new Set<string>();
  function verify(text: string, style: PdfFontStyle) {
    font(style, 11);
    const meta: unknown = pdf.getFont().metadata;
    if (!record(meta) || typeof meta.characterToGlyph !== "function")
      throw new Error("PDF font could not be initialized.");
    const glyph = meta.characterToGlyph as (code: number) => number;
    for (const char of text) {
      if (/\s/u.test(char)) continue;
      if (!glyph.call(meta, char.codePointAt(0) ?? 0)) unsupported.add(char);
    }
  }
  const documentBlocks: Block[] = [
    {
      kind: "heading",
      runs: [{ text: title.trim() || "Untitled document", marks: [] }],
      level: 0,
      indent: 0,
    },
    ...blocks(parsed.content ?? []),
  ];
  for (const block of documentBlocks)
    for (const run of block.runs)
      verify(run.text, styleFor(run.marks, block.kind === "heading"));
  if (unsupported.size) {
    const examples = [...unsupported]
      .slice(0, 3)
      .map(
        (char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
      )
      .join(", ");
    throw new Error(
      `PDF export cannot render some characters (${examples}) with its bundled fonts. Use Markdown export to preserve every character.`,
    );
  }
  for (const block of documentBlocks) {
    const x = margin + Math.min(block.indent, 8) * 19;
    if (block.kind === "rule") {
      ensure(20);
      pdf.setDrawColor(205, 199, 189);
      pdf.line(x, y, width - margin, y);
      y += 19;
      continue;
    }
    const size =
      block.kind === "heading"
        ? [24, 19, 16, 13][Math.min(3, Math.max(0, block.level))]
        : block.kind === "code"
          ? 10
          : 11;
    const lineHeight = size * 1.48;
    ensure(lineHeight * (block.kind === "heading" ? 2 : 1));
    if (block.kind === "heading" && block.level > 0) y += 7;
    let cursor = x;
    let lineHasText = false;
    if (block.marker) {
      font("normal", size);
      pdf.setTextColor(60, 54, 47);
      pdf.text(block.marker, x - 17, y);
    }
    const newLine = () => {
      y += lineHeight;
      ensure(lineHeight);
      cursor = x;
      lineHasText = false;
    };
    for (const run of block.runs) {
      const style = styleFor(run.marks, block.kind === "heading");
      const code =
        block.kind === "code" || run.marks.some((mark) => mark.type === "code");
      const link = run.marks.find((mark) => mark.type === "link")?.href;
      for (const token of run.text.replace(/\t/g, "    ").split(/(\s+)/u)) {
        if (!token) continue;
        if (token.includes("\n")) {
          for (const part of token.split(/(\n)/)) {
            if (part === "\n") newLine();
            else if (part) {
              font(style, size);
              cursor += pdf.getTextWidth(part);
            }
          }
          continue;
        }
        font(style, size);
        const available = width - margin - x;
        const tokenWidth = pdf.getTextWidth(token);
        if (cursor + tokenWidth > width - margin && lineHasText) newLine();
        if (!lineHasText && !code && /^\s+$/u.test(token)) continue;
        // A long URL or unbroken word is split by Unicode code point rather than clipped.
        let chunks = [token];
        if (tokenWidth > available) {
          chunks = [];
          let chunk = "";
          for (const char of token) {
            if (pdf.getTextWidth(chunk + char) > available && chunk) {
              chunks.push(chunk);
              chunk = char;
            } else chunk += char;
          }
          if (chunk) chunks.push(chunk);
        }
        for (let i = 0; i < chunks.length; i++) {
          if (i > 0) newLine();
          const chunk = chunks[i];
          font(style, size);
          const length = pdf.getTextWidth(chunk);
          if (block.quote) {
            pdf.setDrawColor(180, 110, 72);
            pdf.setLineWidth(1.5);
            pdf.line(x - 10, y - size, x - 10, y + 3);
          }
          if (code) {
            pdf.setFillColor(245, 242, 237);
            pdf.rect(cursor - 1, y - size, length + 2, lineHeight, "F");
          }
          const [red, green, blue] = link
            ? [166, 73, 39]
            : block.quote
              ? [108, 97, 83]
              : [46, 41, 35];
          pdf.setTextColor(red, green, blue);
          pdf.text(chunk, cursor, y);
          if (link)
            pdf.link(cursor, y - size, length, lineHeight, { url: link });
          pdf.setDrawColor(link ? 166 : 46, link ? 73 : 41, link ? 39 : 35);
          pdf.setLineWidth(0.5);
          if (link || run.marks.some((mark) => mark.type === "underline"))
            pdf.line(cursor, y + 1.5, cursor + length, y + 1.5);
          if (run.marks.some((mark) => mark.type === "strike"))
            pdf.line(cursor, y - size * 0.32, cursor + length, y - size * 0.32);
          cursor += length;
          lineHasText = lineHasText || chunk.trim().length > 0;
        }
      }
    }
    y += lineHeight + (block.kind === "heading" ? 10 : 7);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    font("normal", 8);
    pdf.setTextColor(130, 122, 112);
    pdf.text("Folio", margin, height - 27);
    pdf.text(`${page} / ${pages}`, width - margin, height - 27, {
      align: "right",
    });
  }
  return pdf;
}
export async function downloadPdf(
  title: string,
  content: string,
): Promise<void> {
  const pdf = await createDocumentPdf(title, content);
  pdf.save(`${filename(title)}.pdf`);
}
