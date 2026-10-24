import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccess, optionalReadAccess } from "./documentAccess";

export const list = query({
  args: { id: v.id("documents") },
  returns: v.array(
    v.object({
      _id: v.id("comments"),
      userId: v.id("users"),
      authorName: v.string(),
      body: v.string(),
      createdAt: v.number(),
      resolved: v.boolean(),
      canRemove: v.boolean(),
    }),
  ),
  handler: async (ctx, { id }) => {
    const found = await optionalReadAccess(ctx, id);
    if (!found) return [];
    const { document, userId } = found;
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_documentId", (q) => q.eq("documentId", id))
      .take(200);
    return await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.userId);
        return {
          _id: comment._id,
          userId: comment.userId,
          authorName:
            author?.name || author?.email?.split("@")[0] || "Former member",
          body: comment.body,
          createdAt: comment.createdAt,
          resolved: comment.resolved,
          canRemove: userId === comment.userId || userId === document.ownerId,
        };
      }),
    );
  },
});

export const add = mutation({
  args: { id: v.id("documents"), body: v.string() },
  returns: v.id("comments"),
  handler: async (ctx, { id, body }) => {
    const { userId } = await requireAccess(ctx, id, "write");
    const text = body.trim();
    if (!text || text.length > 2000)
      throw new ConvexError(
        "A comment must contain between 1 and 2,000 characters.",
      );
    const current = await ctx.db
      .query("comments")
      .withIndex("by_documentId", (q) => q.eq("documentId", id))
      .take(200);
    if (current.length >= 200)
      throw new ConvexError(
        "This document has reached its 200-comment limit. Remove an old comment to add another.",
      );
    return await ctx.db.insert("comments", {
      documentId: id,
      userId,
      body: text,
      createdAt: Date.now(),
      resolved: false,
    });
  },
});

export const setResolved = mutation({
  args: {
    id: v.id("documents"),
    commentId: v.id("comments"),
    resolved: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { id, commentId, resolved }) => {
    await requireAccess(ctx, id, "write");
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.documentId !== id)
      throw new ConvexError("Comment not found.");
    await ctx.db.patch(commentId, { resolved });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("documents"), commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, { id, commentId }) => {
    const { document, userId } = await requireAccess(ctx, id, "read");
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.documentId !== id)
      throw new ConvexError("Comment not found.");
    if (comment.userId !== userId && document.ownerId !== userId)
      throw new ConvexError(
        "Only the author or document owner can remove a comment.",
      );
    await ctx.db.delete(commentId);
    return null;
  },
});
