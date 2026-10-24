import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccess, optionalReadAccess } from "./documentAccess";
import { snapshotDocument, MAX_VERSIONS } from "./historyStorage";
import { validateContent } from "./documentValidation";

export const list = query({
  args: { id: v.id("documents") },
  returns: v.array(
    v.object({
      _id: v.id("versions"),
      revision: v.number(),
      title: v.string(),
      createdAt: v.number(),
      authorName: v.string(),
    }),
  ),
  handler: async (ctx, { id }) => {
    if (!(await optionalReadAccess(ctx, id))) return [];
    const versions = await ctx.db
      .query("versions")
      .withIndex("by_documentId", (q) => q.eq("documentId", id))
      .order("desc")
      .take(MAX_VERSIONS);
    return await Promise.all(
      versions.map(async (version) => {
        const author = version.authorId
          ? await ctx.db.get(version.authorId)
          : null;
        return {
          _id: version._id,
          revision: version.revision,
          title: version.title,
          createdAt: version.createdAt,
          authorName:
            author?.name ||
            author?.email?.split("@")[0] ||
            (version.authorId ? "Former member" : "Earlier version"),
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("documents"), versionId: v.id("versions") },
  returns: v.union(
    v.null(),
    v.object({ title: v.string(), content: v.string(), revision: v.number() }),
  ),
  handler: async (ctx, { id, versionId }) => {
    if (!(await optionalReadAccess(ctx, id))) return null;
    const version = await ctx.db.get(versionId);
    if (!version || version.documentId !== id) return null;
    const body = await ctx.db.get(version.bodyId);
    if (!body) return null;
    return {
      title: version.title,
      content: body.content,
      revision: version.revision,
    };
  },
});

export const restore = mutation({
  args: {
    id: v.id("documents"),
    versionId: v.id("versions"),
    expectedRevision: v.number(),
  },
  returns: v.object({ revision: v.number(), updatedAt: v.number() }),
  handler: async (ctx, { id, versionId, expectedRevision }) => {
    const { document, userId } = await requireAccess(ctx, id, "write");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw new ConvexError("Invalid document revision.");
    if (document.revision !== expectedRevision)
      throw new ConvexError({
        code: "CONFLICT",
        message:
          "This document changed in another session. Load the latest version before restoring.",
      });
    const version = await ctx.db.get(versionId);
    if (!version || version.documentId !== id)
      throw new ConvexError("Version not found.");
    const body = await ctx.db.get(version.bodyId);
    if (!body) throw new ConvexError("Version content is unavailable.");
    const restoredContent = validateContent(body.content);
    await snapshotDocument(ctx, document);
    const current = await ctx.db
      .query("documentBodies")
      .withIndex("by_documentId", (q) => q.eq("documentId", id))
      .unique();
    if (current) await ctx.db.patch(current._id, { content: restoredContent });
    else
      await ctx.db.insert("documentBodies", {
        documentId: id,
        content: restoredContent,
      });
    const revision = document.revision + 1;
    const updatedAt = Date.now();
    await ctx.db.patch(id, {
      title: version.title,
      revision,
      updatedAt,
      updatedBy: userId,
    });
    return { revision, updatedAt };
  },
});
