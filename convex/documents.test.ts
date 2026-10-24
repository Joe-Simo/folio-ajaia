/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { validateContent } from "./documentValidation";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const richText = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "A durable thought", marks: [{ type: "bold" }] },
      ],
    },
  ],
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    owner: await ctx.db.insert("users", {
      name: "Owner",
      email: "owner@example.com",
    }),
    editor: await ctx.db.insert("users", {
      name: "Editor",
      email: "editor@example.com",
    }),
    viewer: await ctx.db.insert("users", {
      name: "Viewer",
      email: "viewer@example.com",
    }),
    stranger: await ctx.db.insert("users", {
      name: "Stranger",
      email: "stranger@example.com",
    }),
  }));
  return {
    t,
    ids,
    owner: t.withIdentity({ subject: ids.owner }),
    editor: t.withIdentity({ subject: ids.editor }),
    viewer: t.withIdentity({ subject: ids.viewer }),
    stranger: t.withIdentity({ subject: ids.stranger }),
  };
}

describe("document persistence and access boundaries", () => {
  test("persists formatting, grants distinct roles, and rejects unshared reads", async () => {
    const { owner, editor, stranger } = await setup();
    const id = await owner.mutation(api.documents.create, {
      title: "A shared draft",
      content: richText,
    });
    expect((await owner.query(api.documents.get, { id }))?.content).toBe(
      richText,
    );
    expect(await stranger.query(api.documents.get, { id })).toBeNull();
    expect((await stranger.query(api.documents.list, {})).documents).toEqual(
      [],
    );
    await owner.mutation(api.documents.share, {
      id,
      email: " EDITOR@example.com ",
      role: "editor",
    });
    expect((await editor.query(api.documents.get, { id }))?.role).toBe(
      "editor",
    );
    expect(
      (await editor.query(api.documents.list, {})).documents[0].owner.email,
    ).toBe("owner@example.com");
    expect((await owner.query(api.documents.list, {})).documents[0].role).toBe(
      "owner",
    );
  });

  test("viewers cannot edit, share, revoke or delete; editors cannot change access", async () => {
    const { owner, viewer, editor, ids } = await setup();
    const id = await owner.mutation(api.documents.create, {
      title: "Read only",
    });
    await owner.mutation(api.documents.share, {
      id,
      email: "viewer@example.com",
      role: "viewer",
    });
    await owner.mutation(api.documents.share, {
      id,
      email: "editor@example.com",
      role: "editor",
    });
    await expect(
      viewer.mutation(api.documents.update, {
        id,
        title: "Hijacked",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("access");
    await expect(
      viewer.mutation(api.documents.share, {
        id,
        email: "stranger@example.com",
        role: "editor",
      }),
    ).rejects.toThrow("access");
    await expect(
      viewer.mutation(api.documents.revoke, { id, userId: ids.editor }),
    ).rejects.toThrow("access");
    await expect(viewer.mutation(api.documents.remove, { id })).rejects.toThrow(
      "access",
    );
    await expect(editor.mutation(api.documents.remove, { id })).rejects.toThrow(
      "access",
    );
    await expect(
      editor.mutation(api.documents.share, {
        id,
        email: "stranger@example.com",
        role: "viewer",
      }),
    ).rejects.toThrow("access");
  });

  test("stale saves cannot silently overwrite a newer revision", async () => {
    const { owner, editor } = await setup();
    const id = await owner.mutation(api.documents.create, {
      title: "Original",
      content: richText,
    });
    await owner.mutation(api.documents.share, {
      id,
      email: "editor@example.com",
      role: "editor",
    });
    expect(
      await editor.mutation(api.documents.update, {
        id,
        title: "Editor update",
        expectedRevision: 1,
      }),
    ).toMatchObject({ revision: 2 });
    await expect(
      owner.mutation(api.documents.update, {
        id,
        title: "Stale overwrite",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("CONFLICT");
    expect((await owner.query(api.documents.get, { id }))?.title).toBe(
      "Editor update",
    );
  });

  test("revocation immediately removes access and owner deletion removes shares", async () => {
    const { owner, editor, ids, t } = await setup();
    const id = await owner.mutation(api.documents.create, {
      title: "Private again",
    });
    await owner.mutation(api.documents.share, {
      id,
      email: "editor@example.com",
      role: "editor",
    });
    await owner.mutation(api.documents.revoke, { id, userId: ids.editor });
    expect(await editor.query(api.documents.get, { id })).toBeNull();
    await expect(
      editor.mutation(api.documents.update, {
        id,
        title: "Revoked edit",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("access");
    await owner.mutation(api.documents.share, {
      id,
      email: "editor@example.com",
      role: "editor",
    });
    await owner.mutation(api.documents.remove, { id });
    expect(await owner.query(api.documents.get, { id })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("shares").take(10))).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("documentBodies").take(10)),
    ).toEqual([]);
  });

  test("demotion blocks writes and a deleted user cannot use an old identity", async () => {
    const { owner, editor, ids, t } = await setup();
    const id = await owner.mutation(api.documents.create, {
      title: "Role changes",
    });
    await owner.mutation(api.documents.share, {
      id,
      email: "editor@example.com",
      role: "editor",
    });
    await owner.mutation(api.documents.share, {
      id,
      email: "editor@example.com",
      role: "viewer",
    });
    await expect(
      editor.mutation(api.documents.update, {
        id,
        title: "Unauthorized",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("access");
    await t.run((ctx) => ctx.db.delete(ids.editor));
    await expect(editor.query(api.documents.list, {})).rejects.toThrow(
      "sign in",
    );
  });

  test("stores content separately from list metadata and validates revision integers", async () => {
    const { owner, t } = await setup();
    const id = await owner.mutation(api.documents.create, {
      title: "Metadata stays lean",
      content: richText,
    });
    expect(await t.run((ctx) => ctx.db.get(id))).not.toHaveProperty("content");
    expect(
      await t.run((ctx) => ctx.db.query("documentBodies").take(1)),
    ).toHaveLength(1);
    await expect(
      owner.mutation(api.documents.update, {
        id,
        title: "Invalid revision",
        expectedRevision: 1.5,
      }),
    ).rejects.toThrow("Invalid document revision");
    expect((await owner.query(api.documents.get, { id }))?.revision).toBe(1);
  });

  test("anonymous requests cannot list, read or create documents", async () => {
    const { t, owner } = await setup();
    const id = await owner.mutation(api.documents.create, { title: "Private" });
    await expect(t.query(api.documents.list, {})).rejects.toThrow("sign in");
    await expect(t.query(api.documents.get, { id })).rejects.toThrow("sign in");
    await expect(
      t.mutation(api.documents.create, { title: "Anonymous" }),
    ).rejects.toThrow("sign in");
  });
});

describe("document validation", () => {
  test("accepts the actual Tiptap ordered-list and link attributes", () => {
    const value = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Link",
                      marks: [
                        {
                          type: "link",
                          attrs: {
                            href: "https://example.com",
                            title: null,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            class: null,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(validateContent(value)).toBe(value);
    expect(() =>
      validateContent(
        JSON.stringify({
          type: "doc",
          content: [{ type: "text", text: "No block" }],
        }),
      ),
    ).toThrow("Invalid document structure");
  });
  test("accepts supported formatting but rejects embedded HTML, unsafe URLs and invalid JSON", () => {
    expect(validateContent(richText)).toBe(richText);
    expect(() => validateContent("<script>alert(1)</script>")).toThrow(
      "Invalid document",
    );
    expect(() =>
      validateContent(
        JSON.stringify({ type: "doc", content: [{ type: "iframe" }] }),
      ),
    ).toThrow("Unsupported");
    expect(() =>
      validateContent(
        JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "click",
                  marks: [
                    { type: "link", attrs: { href: "javascript:alert(1)" } },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow("Only web");
    expect(() =>
      validateContent(
        JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "x".repeat(200_000) }],
            },
          ],
        }),
      ),
    ).toThrow("too large");
  });
});
