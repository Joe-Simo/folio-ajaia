import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Parser, HtmlRenderer } from "commonmark";
import {
  createDocumentPdf,
  toMarkdown,
  type PdfFonts,
} from "./document-export";

const text = (
  value: string,
  marks?: { type: string; attrs?: Record<string, string> }[],
) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const p = (...content: ReturnType<typeof text>[]) => ({
  type: "paragraph",
  content,
});
const doc = (...content: object[]) => JSON.stringify({ type: "doc", content });
const fonts: PdfFonts = {
  normal: readFileSync(
    new URL("../public/fonts/NotoSans-Regular.ttf", import.meta.url),
  ).toString("base64"),
  bold: readFileSync(
    new URL("../public/fonts/NotoSans-Bold.ttf", import.meta.url),
  ).toString("base64"),
  italic: readFileSync(
    new URL("../public/fonts/NotoSans-Italic.ttf", import.meta.url),
  ).toString("base64"),
  bolditalic: readFileSync(
    new URL("../public/fonts/NotoSans-BoldItalic.ttf", import.meta.url),
  ).toString("base64"),
};

describe("Markdown export", () => {
  it("preserves formatting, numbered starts, nested lists, quotes and hard breaks", () => {
    const result = toMarkdown(
      "Launch plan",
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Next steps")] },
        p(
          text("Bold", [{ type: "bold" }]),
          text(" and "),
          text("italic", [{ type: "italic" }]),
          text(" underlined", [{ type: "underline" }]),
        ),
        {
          type: "orderedList",
          attrs: { start: 4 },
          content: [
            {
              type: "listItem",
              content: [
                p(text("Review")),
                {
                  type: "bulletList",
                  content: [
                    { type: "listItem", content: [p(text("Nested note"))] },
                  ],
                },
              ],
            },
          ],
        },
        { type: "blockquote", content: [p(text("Quoted"))] },
        {
          type: "paragraph",
          content: [text("First"), { type: "hardBreak" }, text("Second")],
        },
        { type: "horizontalRule" },
      ),
    );
    expect(result).toContain("# Launch plan\n");
    expect(result).toContain("### Next steps");
    expect(result).toContain("**Bold** and *italic*<u> underlined</u>");
    expect(result).toContain("4. Review\n   \n   - Nested note");
    expect(result).toContain("> Quoted");
    expect(result).toContain("First  \nSecond");
    expect(result).toContain("\n---\n");
  });

  it("escapes literal markup while preserving Unicode and safe link destinations", () => {
    const result = toMarkdown(
      "<script> & résumé",
      doc(
        p(
          text("<img src=x> [not a link] & Ω Привет"),
          text("visit", [
            {
              type: "link",
              attrs: { href: "https://example.com/a(b)?q=hello world" },
            },
          ]),
        ),
      ),
    );
    expect(result).toContain("&lt;script&gt; &amp; résumé");
    expect(result).toContain(
      "&lt;img src=x&gt; \\[not a link\\] &amp; Ω Привет",
    );
    expect(result).toContain(
      "[visit](<https://example.com/a(b)?q=hello%20world>)",
    );
    expect(result).not.toContain("<img");
  });

  it("keeps edge whitespace outside emphasis so Markdown renders the formatting", () => {
    const result = toMarkdown(
      "Spacing",
      doc(
        p(
          text(" bold ", [{ type: "bold" }]),
          text("italic ", [{ type: "italic" }]),
          text(" strike ", [{ type: "strike" }]),
          text(" ", [{ type: "bold" }]),
        ),
      ),
    );
    expect(result).toContain(" **bold** *italic*  ~~strike~~  ");
    expect(result).not.toContain("**bold **");
    expect(result).not.toContain("*italic *");
  });

  it("preserves hyperlink destinations through CommonMark parsing", () => {
    const cases = [
      ["https://example.com/?a=1&copy;", "https://example.com/?a=1&copy;"],
      ["https://example.com/?a=1&amp;", "https://example.com/?a=1&amp;"],
      ["https://example.com/?a=1&b=2", "https://example.com/?a=1&b=2"],
      ["https://example.com/path\\!", "https://example.com/path%5C!"],
    ];
    for (const [href, expected] of cases) {
      const markdown = toMarkdown(
        "Links",
        doc(p(text("visit", [{ type: "link", attrs: { href } }]))),
      );
      const walker = new Parser().parse(markdown).walker();
      const destinations: string[] = [];
      let event = walker.next();
      while (event) {
        if (
          event.entering &&
          event.node.type === "link" &&
          typeof event.node.destination === "string"
        )
          destinations.push(event.node.destination);
        event = walker.next();
      }
      expect(destinations).toEqual([expected]);
    }
  });

  it("renders touching formatted runs without adding delimiter characters", () => {
    const cases: [ReturnType<typeof text>[], string][] = [
      [
        [text("A", [{ type: "bold" }]), text("B", [{ type: "bold" }])],
        "<p><strong>AB</strong></p>",
      ],
      [
        [text("A", [{ type: "italic" }]), text("B", [{ type: "italic" }])],
        "<p><em>AB</em></p>",
      ],
      [
        [text("a.", [{ type: "bold" }]), text("b", [{ type: "italic" }])],
        "<p><strong>a.</strong><em>b</em></p>",
      ],
      [
        [text("a"), text("b", [{ type: "italic" }]), text("c")],
        "<p>a<em>b</em>c</p>",
      ],
      [
        [
          text("A", [{ type: "bold" }]),
          text("B", [{ type: "bold" }, { type: "italic" }]),
        ],
        "<p><strong>A</strong><em><strong>B</strong></em></p>",
      ],
    ];
    for (const [nodes, expected] of cases) {
      const rendered = new HtmlRenderer().render(
        new Parser().parse(toMarkdown("Marks", doc(p(...nodes)))),
      );
      expect(rendered).toContain(expected);
    }
  });

  it("uses safe fences when code contains backticks", () => {
    const result = toMarkdown(
      "Code",
      doc(p(text("a`b", [{ type: "code" }])), {
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [text("const fence = ` ``` `;")],
      }),
    );
    expect(result).toContain("``a`b``");
    expect(result).toContain("````typescript\nconst fence = ` ``` `;\n````");
  });

  it("refuses malformed content and unsafe links without executing or embedding them", () => {
    expect(() => toMarkdown("x", "bad JSON")).toThrow("could not be read");
    expect(() =>
      toMarkdown("x", doc({ type: "script", text: "evil()" })),
    ).toThrow("unsupported content");
    expect(() =>
      toMarkdown(
        "x",
        doc(
          p(
            text("bad", [
              { type: "link", attrs: { href: "javascript:alert(1)" } },
            ]),
          ),
        ),
      ),
    ).toThrow("unsupported link");
  });
});

describe("PDF export", () => {
  it("embeds Unicode fonts and paginates long structured documents", async () => {
    const content = doc(
      {
        type: "heading",
        attrs: { level: 1 },
        content: [text("Résumé — Ω Привет")],
      },
      p(
        text("Bold and italic", [{ type: "bold" }, { type: "italic" }]),
        text(" underlined", [{ type: "underline" }]),
      ),
      ...Array.from({ length: 70 }, (_, i) =>
        p(
          text(
            `Paragraph ${i + 1}: ${"A readable paragraph with enough text to require multiple lines. ".repeat(5)}`,
          ),
        ),
      ),
      p(text("A final line that must not disappear.")),
    );
    const pdf = await createDocumentPdf("An exported document", content, fonts);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(3);
    expect(pdf.getFontList().FolioSans).toEqual(
      expect.arrayContaining(["normal", "bold", "italic", "bolditalic"]),
    );
    const buffer = pdf.output("arraybuffer");
    expect(new TextDecoder().decode(buffer.slice(0, 8))).toMatch(/^%PDF-/);
    expect(buffer.byteLength).toBeGreaterThan(20_000);
  });

  it("wraps an unbroken long string and refuses unsupported glyphs explicitly", async () => {
    const pdf = await createDocumentPdf(
      "Long token",
      doc(p(text("w".repeat(8_000)))),
      fonts,
    );
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    await expect(
      createDocumentPdf("Emoji", doc(p(text("Hello 😀"))), fonts),
    ).rejects.toThrow("Use Markdown export");
    await expect(
      createDocumentPdf("CJK", doc(p(text("你好"))), fonts),
    ).rejects.toThrow("Use Markdown export");
  });
});
