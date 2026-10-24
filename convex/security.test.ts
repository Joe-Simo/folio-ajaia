/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { validateContent } from "./documentValidation";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const linkedContent = (attrs?: Record<string, unknown>) =>
  JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Read the plan",
            marks: [{ type: "link", ...(attrs ? { attrs } : {}) }],
          },
        ],
      },
    ],
  });

describe("untrusted link presentation", () => {
  test("stored links cannot overlay the application or weaken external-link isolation", async () => {
    const t = convexTest(schema, modules);
    const user = await t.run((ctx) =>
      ctx.db.insert("users", { email: "owner@example.com" }),
    );
    const owner = t.withIdentity({ subject: user });
    const id = await owner.mutation(api.documents.create, {
      title: "Untrusted presentation",
      content: linkedContent({
        href: "https://example.com",
        class: "fixed inset-0 z-50",
        target: "_top",
        rel: "opener",
      }),
    });
    const doc = await owner.query(api.documents.get, { id });
    expect(doc).not.toBeNull();
    const parsed = JSON.parse(doc!.content);
    expect(parsed.content[0].content[0].marks[0].attrs).toEqual({
      href: "https://example.com",
      class: null,
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    });
  });

  test("only complete web/email link forms are accepted, matching editor and export support", () => {
    expect(() =>
      validateContent(linkedContent({ href: "https:example.com" })),
    ).toThrow("Only web");
    expect(() => validateContent(linkedContent())).toThrow("must include");
    expect(() =>
      validateContent(linkedContent({ href: "javascript:alert(1)" })),
    ).toThrow("Only web");
    expect(
      JSON.parse(
        validateContent(linkedContent({ href: "mailto:team@example.com" })),
      ).content[0].content[0].marks[0].attrs,
    ).toMatchObject({
      href: "mailto:team@example.com",
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    });
  });
});

describe("optional read subscriptions", () => {
  test("return no comments, history or presence after logout instead of exposing data or throwing", async () => {
    const t = convexTest(schema, modules);
    const user = await t.run((ctx) =>
      ctx.db.insert("users", { email: "owner@example.com" }),
    );
    const owner = t.withIdentity({ subject: user });
    const id = await owner.mutation(api.documents.create, { title: "Private" });
    await owner.mutation(api.comments.add, { id, body: "Private feedback" });
    await owner.mutation(api.documents.update, {
      id,
      title: "Changed",
      expectedRevision: 1,
    });
    const versionId = (await owner.query(api.history.list, { id }))[0]._id;
    expect(await t.query(api.comments.list, { id })).toEqual([]);
    expect(await t.query(api.history.list, { id })).toEqual([]);
    expect(await t.query(api.history.get, { id, versionId })).toBeNull();
    expect(await t.query(api.presence.list, { roomToken: id })).toEqual([]);
  });
});

test("restoring legacy history reapplies safe link presentation", async () => {
  const t = convexTest(schema, modules);
  const user = await t.run((ctx) =>
    ctx.db.insert("users", { email: "owner@example.com" }),
  );
  const owner = t.withIdentity({ subject: user });
  const id = await owner.mutation(api.documents.create, {
    title: "Legacy content",
  });
  await owner.mutation(api.documents.update, {
    id,
    title: "Current",
    expectedRevision: 1,
  });
  const versionId = (await owner.query(api.history.list, { id }))[0]._id;
  await t.run(async (ctx) => {
    const version = await ctx.db.get(versionId);
    await ctx.db.patch(version!.bodyId, {
      content: linkedContent({
        href: "https://example.com",
        class: "fixed inset-0",
        target: "_top",
        rel: "opener",
      }),
    });
  });
  await owner.mutation(api.history.restore, {
    id,
    versionId,
    expectedRevision: 2,
  });
  const restored = await owner.query(api.documents.get, { id });
  expect(
    JSON.parse(restored!.content).content[0].content[0].marks[0].attrs,
  ).toMatchObject({
    class: null,
    target: "_blank",
    rel: "noopener noreferrer nofollow",
  });
});

test("code language labels preserve safe tokens and cannot inject layout classes", async () => {
  const code = (language: string) =>
    JSON.stringify({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language },
          content: [{ type: "text", text: "example code" }],
        },
      ],
    });
  for (const language of ["c++", "typescript", "objective-c"]) {
    expect(validateContent(code(language))).toBe(code(language));
  }
  for (const language of [
    "js fixed inset-0 z-50",
    "js\nfixed",
    "",
    "x".repeat(33),
  ]) {
    expect(
      JSON.parse(validateContent(code(language))).content[0].attrs.language,
    ).toBeNull();
  }
  const t = convexTest(schema, modules);
  const user = await t.run((ctx) =>
    ctx.db.insert("users", { email: "owner@example.com" }),
  );
  const owner = t.withIdentity({ subject: user });
  const id = await owner.mutation(api.documents.create, {
    title: "Code sample",
    content: code("js fixed inset-0 z-50"),
  });
  const stored = await owner.query(api.documents.get, { id });
  expect(JSON.parse(stored!.content).content[0].attrs.language).toBeNull();
});
