import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  access,
  requireAccess,
  requireUser,
  type Role,
  type Ctx,
} from "./documentAccess";
import { snapshotDocument, deleteDocumentHistory } from "./historyStorage";
import type { Doc, Id } from "./_generated/dataModel";
import {
  EMPTY_CONTENT,
  normalizeTitle,
  validateContent,
} from "./documentValidation";

const roleValidator = v.union(
  v.literal("owner"),
  v.literal("editor"),
  v.literal("viewer"),
);
const shareRoleValidator = v.union(v.literal("editor"), v.literal("viewer"));
const ownerValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
});
const metadataFields = {
  _id: v.id("documents"),
  title: v.string(),
  updatedAt: v.number(),
  revision: v.number(),
  owner: ownerValidator,
  role: roleValidator,
};
async function metadata(ctx: Ctx, document: Doc<"documents">, role: Role) {
  const owner = await ctx.db.get(document.ownerId);
  return {
    _id: document._id,
    title: document.title,
    updatedAt: document.updatedAt,
    revision: document.revision,
    owner: {
      _id: document.ownerId,
      name: owner?.name || owner?.email?.split("@")[0] || "Writer",
      email: owner?.email || "",
    },
    role,
  };
}

export const list = query({
  args: {},
  returns: v.object({
    documents: v.array(v.object(metadataFields)),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const [owned, shares] = await Promise.all([
      ctx.db
        .query("documents")
        .withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", userId))
        .order("desc")
        .take(101),
      ctx.db
        .query("shares")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc")
        .take(101),
    ]);
    const documents = await Promise.all(
      owned.slice(0, 100).map((doc) => metadata(ctx, doc, "owner")),
    );
    for (const share of shares.slice(0, 100)) {
      const doc = await ctx.db.get(share.documentId);
      if (doc && doc.ownerId !== userId)
        documents.push(await metadata(ctx, doc, share.role));
    }
    documents.sort((a, b) => b.updatedAt - a.updatedAt);
    return { documents, truncated: owned.length > 100 || shares.length > 100 };
  },
});

export const get = query({
  args: { id: v.id("documents") },
  returns: v.union(
    v.null(),
    v.object({ ...metadataFields, content: v.string(), createdAt: v.number() }),
  ),
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const document = await ctx.db.get(id);
    if (!document) return null;
    const role = await access(ctx, document, userId);
    if (!role) return null;
    const body = await ctx.db
      .query("documentBodies")
      .withIndex("by_documentId", (q) => q.eq("documentId", id))
      .unique();
    return {
      ...(await metadata(ctx, document, role)),
      content: body?.content ?? document.content ?? EMPTY_CONTENT,
      createdAt: document.createdAt,
    };
  },
});

export const create = mutation({
  args: { title: v.string(), content: v.optional(v.string()) },
  returns: v.id("documents"),
  handler: async (ctx, { title, content }) => {
    const ownerId = await requireUser(ctx);
    const count = await ctx.db
      .query("documents")
      .withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", ownerId))
      .take(101);
    if (count.length >= 100)
      throw new ConvexError(
        "This workspace supports up to 100 owned documents. Delete a document before creating another.",
      );
    const now = Date.now();
    const validContent = validateContent(content ?? EMPTY_CONTENT);
    const id = await ctx.db.insert("documents", {
      ownerId,
      updatedBy: ownerId,
      title: normalizeTitle(title),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("documentBodies", {
      documentId: id,
      content: validContent,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    expectedRevision: v.number(),
  },
  returns: v.object({ revision: v.number(), updatedAt: v.number() }),
  handler: async (ctx, { id, title, content, expectedRevision }) => {
    const { document, userId } = await requireAccess(ctx, id, "write");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw new ConvexError("Invalid document revision.");
    if (document.revision !== expectedRevision)
      throw new ConvexError({
        code: "CONFLICT",
        message:
          "This document changed in another session. Your draft is preserved; reload the latest version before saving.",
      });
    await snapshotDocument(ctx, document);
    const revision = document.revision + 1;
    const updatedAt = Date.now();
    const nextTitle =
      title === undefined ? document.title : normalizeTitle(title);
    if (content !== undefined) {
      const validContent = validateContent(content);
      const body = await ctx.db
        .query("documentBodies")
        .withIndex("by_documentId", (q) => q.eq("documentId", id))
        .unique();
      if (body) await ctx.db.patch(body._id, { content: validContent });
      else
        await ctx.db.insert("documentBodies", {
          documentId: id,
          content: validContent,
        });
    }
    await ctx.db.patch(id, {
      title: nextTitle,
      revision,
      updatedAt,
      updatedBy: userId,
    });
    return { revision, updatedAt };
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireAccess(ctx, id, "owner");
    const shares = await ctx.db
      .query("shares")
      .withIndex("by_documentId_and_userId", (q) => q.eq("documentId", id))
      .take(101);
    for (const share of shares) await ctx.db.delete(share._id);
    const body = await ctx.db
      .query("documentBodies")
      .withIndex("by_documentId", (q) => q.eq("documentId", id))
      .unique();
    if (body) await ctx.db.delete(body._id);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_documentId", (q) => q.eq("documentId", id))
      .take(200);
    for (const comment of comments) await ctx.db.delete(comment._id);
    await deleteDocumentHistory(ctx, id);
    await ctx.db.delete(id);
    return null;
  },
});

export const share = mutation({
  args: { id: v.id("documents"), email: v.string(), role: shareRoleValidator },
  returns: v.null(),
  handler: async (ctx, { id, email, role }) => {
    const { document } = await requireAccess(ctx, id, "owner");
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254)
      throw new ConvexError("Enter a valid email address.");
    const target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .unique();
    if (!target)
      throw new ConvexError(
        "That person needs to create a Folio account first.",
      );
    if (target._id === document.ownerId)
      throw new ConvexError("The owner already has full access.");
    const existing = await ctx.db
      .query("shares")
      .withIndex("by_documentId_and_userId", (q) =>
        q.eq("documentId", id).eq("userId", target._id),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { role });
    else {
      const shares = await ctx.db
        .query("shares")
        .withIndex("by_documentId_and_userId", (q) => q.eq("documentId", id))
        .take(101);
      if (shares.length >= 100)
        throw new ConvexError("A document supports up to 100 collaborators.");
      await ctx.db.insert("shares", {
        documentId: id,
        userId: target._id,
        role,
      });
    }
    return null;
  },
});

export const revoke = mutation({
  args: { id: v.id("documents"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { id, userId }) => {
    await requireAccess(ctx, id, "owner");
    const existing = await ctx.db
      .query("shares")
      .withIndex("by_documentId_and_userId", (q) =>
        q.eq("documentId", id).eq("userId", userId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const members = query({
  args: { id: v.id("documents") },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      email: v.string(),
      role: roleValidator,
    }),
  ),
  handler: async (ctx, { id }) => {
    const { document } = await requireAccess(ctx, id, "read");
    const owner = await ctx.db.get(document.ownerId);
    const shares = await ctx.db
      .query("shares")
      .withIndex("by_documentId_and_userId", (q) => q.eq("documentId", id))
      .take(100);
    const members: {
      userId: Id<"users">;
      name: string;
      email: string;
      role: Role;
    }[] = [
      {
        userId: document.ownerId,
        name: owner?.name || "Owner",
        email: owner?.email || "",
        role: "owner",
      },
    ];
    for (const share of shares) {
      const user = await ctx.db.get(share.userId);
      if (user)
        members.push({
          userId: user._id,
          name: user.name || user.email?.split("@")[0] || "Writer",
          email: user.email || "",
          role: share.role,
        });
    }
    return members;
  },
});
