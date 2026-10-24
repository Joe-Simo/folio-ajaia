/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const content = (text: string) =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
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
  const owner = t.withIdentity({ subject: ids.owner });
  const editor = t.withIdentity({ subject: ids.editor });
  const viewer = t.withIdentity({ subject: ids.viewer });
  const stranger = t.withIdentity({ subject: ids.stranger });
  const id = await owner.mutation(api.documents.create, {
    title: "First",
    content: content("Original"),
  });
  await owner.mutation(api.documents.share, {
    id,
    email: "editor@example.com",
    role: "editor",
  });
  await owner.mutation(api.documents.share, {
    id,
    email: "viewer@example.com",
    role: "viewer",
  });
  return { t, ids, id, owner, editor, viewer, stranger };
}

describe("comments", () => {
  test("allows editor discussion and viewer reads but not viewer writes", async () => {
    const { id, owner, editor, viewer, stranger } = await setup();
    const commentId = await editor.mutation(api.comments.add, {
      id,
      body: "  Check this decision.  ",
    });
    expect(await viewer.query(api.comments.list, { id })).toMatchObject([
      {
        _id: commentId,
        body: "Check this decision.",
        authorName: "Editor",
        resolved: false,
        canRemove: false,
      },
    ]);
    await expect(
      viewer.mutation(api.comments.add, { id, body: "No permission" }),
    ).rejects.toThrow("access");
    await expect(
      viewer.mutation(api.comments.setResolved, {
        id,
        commentId,
        resolved: true,
      }),
    ).rejects.toThrow("access");
    await expect(
      viewer.mutation(api.comments.remove, { id, commentId }),
    ).rejects.toThrow("author");
    expect(await stranger.query(api.comments.list, { id })).toEqual([]);
    await owner.mutation(api.comments.setResolved, {
      id,
      commentId,
      resolved: true,
    });
    expect((await editor.query(api.comments.list, { id }))[0].resolved).toBe(
      true,
    );
    await editor.mutation(api.comments.remove, { id, commentId });
    expect(await owner.query(api.comments.list, { id })).toEqual([]);
  });

  test("validates limits and prevents cross-document comment mutation", async () => {
    const { id, owner, editor } = await setup();
    await expect(
      owner.mutation(api.comments.add, { id, body: "   " }),
    ).rejects.toThrow("2,000");
    await expect(
      owner.mutation(api.comments.add, { id, body: "x".repeat(2001) }),
    ).rejects.toThrow("2,000");
    const other = await owner.mutation(api.documents.create, {
      title: "Other",
    });
    const commentId = await owner.mutation(api.comments.add, {
      id: other,
      body: "Other document",
    });
    await expect(
      editor.mutation(api.comments.setResolved, {
        id,
        commentId,
        resolved: true,
      }),
    ).rejects.toThrow("not found");
    await expect(
      owner.mutation(api.comments.remove, { id, commentId }),
    ).rejects.toThrow("not found");
  });

  test("revoked users lose comment access and document deletion cleans discussion", async () => {
    const { id, ids, t, owner, editor } = await setup();
    await editor.mutation(api.comments.add, { id, body: "A comment" });
    await owner.mutation(api.documents.revoke, { id, userId: ids.editor });
    expect(await editor.query(api.comments.list, { id })).toEqual([]);
    await owner.mutation(api.documents.remove, { id });
    expect(await t.run((ctx) => ctx.db.query("comments").take(10))).toEqual([]);
  });
});

describe("version history", () => {
  test("snapshots previous states, preserves author, and restores as a new revision", async () => {
    const { id, owner, editor, viewer } = await setup();
    expect(await owner.query(api.history.list, { id })).toEqual([]);
    await editor.mutation(api.documents.update, {
      id,
      title: "Second",
      content: content("Edited"),
      expectedRevision: 1,
    });
    let history = await viewer.query(api.history.list, { id });
    expect(history).toMatchObject([
      { revision: 1, title: "First", authorName: "Owner" },
    ]);
    expect(
      await viewer.query(api.history.get, { id, versionId: history[0]._id }),
    ).toEqual({ title: "First", content: content("Original"), revision: 1 });
    await owner.mutation(api.documents.update, {
      id,
      title: "Third",
      expectedRevision: 2,
    });
    history = await owner.query(api.history.list, { id });
    expect(history[0]).toMatchObject({
      revision: 2,
      title: "Second",
      authorName: "Editor",
    });
    const first = history.find((version) => version.revision === 1)!;
    expect(
      await editor.mutation(api.history.restore, {
        id,
        versionId: first._id,
        expectedRevision: 3,
      }),
    ).toMatchObject({ revision: 4 });
    expect(await owner.query(api.documents.get, { id })).toMatchObject({
      title: "First",
      content: content("Original"),
      revision: 4,
    });
    expect(
      (await owner.query(api.history.list, { id })).map(
        (version) => version.revision,
      ),
    ).toEqual([3, 2, 1]);
  });

  test("rejects stale restores, viewers, unshared reads, and foreign versions", async () => {
    const { id, owner, viewer, stranger } = await setup();
    await owner.mutation(api.documents.update, {
      id,
      title: "Second",
      expectedRevision: 1,
    });
    const versionId = (await owner.query(api.history.list, { id }))[0]._id;
    await expect(
      owner.mutation(api.history.restore, {
        id,
        versionId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("CONFLICT");
    await expect(
      viewer.mutation(api.history.restore, {
        id,
        versionId,
        expectedRevision: 2,
      }),
    ).rejects.toThrow("access");
    expect(await stranger.query(api.history.get, { id, versionId })).toBeNull();
    const other = await owner.mutation(api.documents.create, {
      title: "Other",
    });
    expect(
      await owner.query(api.history.get, { id: other, versionId }),
    ).toBeNull();
    await expect(
      owner.mutation(api.history.restore, {
        id: other,
        versionId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("not found");
    expect(
      (await owner.query(api.documents.get, { id: other }))?.revision,
    ).toBe(1);
  });

  test("caps metadata and bodies at fifty snapshots and cleans them on document deletion", async () => {
    const { id, t, owner } = await setup();
    for (let revision = 1; revision <= 53; revision++) {
      await owner.mutation(api.documents.update, {
        id,
        title: `Revision ${revision + 1}`,
        expectedRevision: revision,
      });
    }
    const history = await owner.query(api.history.list, { id });
    expect(history).toHaveLength(50);
    expect(history.map((version) => version.revision)).toEqual(
      Array.from({ length: 50 }, (_, i) => 53 - i),
    );
    expect(
      await t.run((ctx) => ctx.db.query("versionBodies").take(100)),
    ).toHaveLength(50);
    const oldest = history[history.length - 1];
    await owner.mutation(api.history.restore, {
      id,
      versionId: oldest._id,
      expectedRevision: 54,
    });
    expect(await owner.query(api.documents.get, { id })).toMatchObject({
      title: oldest.title,
      revision: 55,
    });
    expect(
      await owner.query(api.history.get, { id, versionId: oldest._id }),
    ).toBeNull();
    expect(await owner.query(api.history.list, { id })).toHaveLength(50);
    await owner.mutation(api.documents.remove, { id });
    expect(await t.run((ctx) => ctx.db.query("versions").take(100))).toEqual(
      [],
    );
    expect(
      await t.run((ctx) => ctx.db.query("versionBodies").take(100)),
    ).toEqual([]);
  });
});
